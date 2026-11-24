import type { TracepadDatabase } from './db'
import { decideVersionCut, normalizeNoteText, type NoteText } from '../domain/versioning'
import type { Draft, IsoTimestamp, Note, NoteVersion, OutboxRow, Uuid } from '../domain/types'

export type ListedNote = {
  note: Note
  version: NoteVersion
}

export type CommitResult =
  | { kind: 'discard' }
  | { kind: 'unchanged' }
  | { kind: 'cut'; versionId: Uuid }

const deviceIdLocks = new Map<string, Promise<Uuid>>()
const recoveryLocks = new Map<string, Promise<void>>()

function nowStamp(now?: IsoTimestamp): IsoTimestamp {
  return now ?? new Date().toISOString()
}

/** Await the writes and the commit. A failed write still settles `done`, so an abort is not left unhandled. */
async function finishTransaction(writing: Promise<void>, done: Promise<void>): Promise<void> {
  const settled = done.then(
    () => undefined,
    () => undefined,
  )
  try {
    await writing
    await done
  } catch (error) {
    await settled
    throw error
  }
}

function pendingRow(
  entityType: OutboxRow['entityType'],
  entityId: Uuid,
  op: OutboxRow['op'],
  payload: unknown,
  createdAt: IsoTimestamp,
  userId: Uuid | null,
): OutboxRow {
  return {
    id: crypto.randomUUID(),
    userId,
    entityType,
    entityId,
    op,
    payload,
    createdAt,
    status: 'pending',
    attempts: 0,
    lastError: null,
  }
}

/** This device's id, stored in local sync state. Created on first use, including while signed out. */
export function ensureDeviceId(db: TracepadDatabase): Promise<Uuid> {
  const inFlight = deviceIdLocks.get(db.name)
  if (inFlight) return inFlight

  const created = (async () => {
    const rows = await db.getAll('localSyncState')
    if (rows.length > 0) return rows[0].deviceId
    const deviceId = crypto.randomUUID()
    await db.put('localSyncState', { deviceId, userId: null, bookmark: 0, lastSyncAt: null })
    return deviceId
  })()

  deviceIdLocks.set(db.name, created)
  void created.then(
    () => deviceIdLocks.delete(db.name),
    () => deviceIdLocks.delete(db.name),
  )
  return created
}

/** Newest edited first. Notes without a current version are skipped. */
export async function listNotes(db: TracepadDatabase): Promise<ListedNote[]> {
  const notes = await db.getAllFromIndex('notes', 'byUpdatedAt')
  const listed: ListedNote[] = []
  for (const note of notes.reverse()) {
    if (!note.currentVersionId) continue
    const version = await db.get('noteVersions', note.currentVersionId)
    if (version) listed.push({ note, version })
  }
  return listed
}

/** The note and its current text, or null when either row is missing. */
export async function getListedNote(db: TracepadDatabase, noteId: Uuid): Promise<ListedNote | null> {
  const note = await db.get('notes', noteId)
  if (!note?.currentVersionId) return null
  const version = await db.get('noteVersions', note.currentVersionId)
  if (!version) return null
  return { note, version }
}

export type BoardSort = 'edited' | 'created'

export type BoardView =
  | { kind: 'notes' }
  | { kind: 'reminders' }
  | { kind: 'archive' }
  | { kind: 'trash' }
  | { kind: 'label'; labelId: Uuid }

export type BoardCard = ListedNote & {
  /** Days left out of 30. Set only on the trash view. */
  daysLeft: number | null
}

export type BoardQuery = {
  view: BoardView
  sort: BoardSort
  /** Used for trash days left. Defaults to the current time. */
  now?: IsoTimestamp
}

const DAY_MS = 24 * 60 * 60 * 1000
const TRASH_WINDOW_DAYS = 30

/** A note trashed at this moment has 30 days left. The count drops after each full day. */
function daysLeftInTrash(trashedAt: IsoTimestamp, now: IsoTimestamp): number {
  const elapsed = Date.parse(now) - Date.parse(trashedAt)
  if (!Number.isFinite(elapsed) || elapsed <= 0) return TRASH_WINDOW_DAYS
  return Math.max(0, TRASH_WINDOW_DAYS - Math.floor(elapsed / DAY_MS))
}

function compareBoard(a: Note, b: Note, sort: BoardSort): number {
  if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
  const aKey = sort === 'created' ? a.createdAt : a.updatedAt
  const bKey = sort === 'created' ? b.createdAt : b.updatedAt
  if (aKey !== bKey) return aKey < bKey ? 1 : -1
  if (a.id === b.id) return 0
  return a.id < b.id ? -1 : 1
}

function inView(
  note: Note,
  view: BoardView,
  labelNoteIds: Set<Uuid> | null,
  reminderNoteIds: Set<Uuid> | null,
): boolean {
  const trashed = note.trashedAt != null
  switch (view.kind) {
    case 'notes':
      return !trashed && !note.isArchived
    case 'archive':
      return !trashed && note.isArchived
    case 'trash':
      return trashed
    case 'label':
      // Archived notes stay on their label. Trashed notes stay in Trash.
      return !trashed && (labelNoteIds?.has(note.id) ?? false)
    case 'reminders':
      // An archived reminder still fires. A trashed one is paused.
      return !trashed && (reminderNoteIds?.has(note.id) ?? false)
    default: {
      const unreachable: never = view
      return unreachable
    }
  }
}

function notesForView(db: TracepadDatabase, view: BoardView, sort: BoardSort): Promise<Note[]> {
  if (view.kind === 'trash') return db.getAllFromIndex('notes', 'byTrashedAt')
  if (sort === 'created') return db.getAllFromIndex('notes', 'byCreatedAt')
  return db.getAllFromIndex('notes', 'byUpdatedAt')
}

/**
 * Pinned notes first, then recently edited or newest created.
 * Notes and Archive hide trash. Archive is archived only.
 * A label includes archived notes. Trash is trashed notes, with days left out of 30.
 */
export async function listBoard(db: TracepadDatabase, query: BoardQuery): Promise<BoardCard[]> {
  const now = query.now ?? new Date().toISOString()
  const notes = await notesForView(db, query.view, query.sort)

  let labelNoteIds: Set<Uuid> | null = null
  if (query.view.kind === 'label') {
    const links = await db.getAllFromIndex('noteLabels', 'byLabelId', query.view.labelId)
    labelNoteIds = new Set(links.filter((link) => !link.isRemoved).map((link) => link.noteId))
  }

  let reminderNoteIds: Set<Uuid> | null = null
  if (query.view.kind === 'reminders') {
    const reminders = await db.getAll('reminders')
    reminderNoteIds = new Set(reminders.map((reminder) => reminder.noteId))
  }

  const matching = notes.filter((note) => inView(note, query.view, labelNoteIds, reminderNoteIds))
  matching.sort((a, b) => compareBoard(a, b, query.sort))

  const cards: BoardCard[] = []
  for (const note of matching) {
    if (!note.currentVersionId) continue
    const version = await db.get('noteVersions', note.currentVersionId)
    if (!version) continue
    cards.push({
      note,
      version,
      daysLeft: query.view.kind === 'trash' && note.trashedAt ? daysLeftInTrash(note.trashedAt, now) : null,
    })
  }
  return cards
}

/**
 * Upsert this device's draft and queue one outbox row.
 * A draft may exist before the note row: the note is created only when a version is cut.
 * An identical draft does not queue another row.
 */
export async function saveDraft(
  db: TracepadDatabase,
  input: {
    noteId: Uuid
    deviceId: Uuid
    baseVersionId: Uuid | null
    title: string | null
    body: string | null
    now?: IsoTimestamp
  },
): Promise<void> {
  const text = normalizeNoteText({ title: input.title, body: input.body })
  const tx = db.transaction(['drafts', 'outbox'], 'readwrite')
  const drafts = tx.objectStore('drafts')
  const outbox = tx.objectStore('outbox')
  const writing = (async () => {
    const existing = await drafts.get([input.noteId, input.deviceId])
    if (
      existing &&
      existing.baseVersionId === input.baseVersionId &&
      existing.title === text.title &&
      existing.body === text.body &&
      existing.kind === 'text'
    ) {
      return
    }
    const draft: Draft = {
      noteId: input.noteId,
      deviceId: input.deviceId,
      baseVersionId: input.baseVersionId,
      kind: 'text',
      title: text.title,
      body: text.body,
      checklistItems: null,
      updatedAt: nowStamp(input.now),
    }
    await drafts.put(draft)
    await outbox.put(
      pendingRow('draft', input.noteId, existing ? 'update' : 'create', draft, draft.updatedAt, null),
    )
  })()
  await finishTransaction(writing, tx.done)
}

/** Remove this device's draft. Queues one outbox row only when a draft was actually removed. */
export async function clearDraft(
  db: TracepadDatabase,
  noteId: Uuid,
  deviceId: Uuid,
  now?: IsoTimestamp,
): Promise<void> {
  const tx = db.transaction(['drafts', 'outbox'], 'readwrite')
  const drafts = tx.objectStore('drafts')
  const outbox = tx.objectStore('outbox')
  const writing = (async () => {
    const existing = await drafts.get([noteId, deviceId])
    if (!existing) return
    await drafts.delete([noteId, deviceId])
    await outbox.put(
      pendingRow(
        'draft',
        noteId,
        'delete',
        { noteId, deviceId },
        nowStamp(now),
        null,
      ),
    )
  })()
  await finishTransaction(writing, tx.done)
}

/**
 * Leave the note or press Ctrl+S.
 * Discard, keep, or cut a version. A cut writes the version, the note's current pointer,
 * and one outbox row in the same transaction, and drops this device's draft.
 */
export async function commitNoteText(
  db: TracepadDatabase,
  input: {
    noteId: Uuid
    deviceId: Uuid
    openedVersionId: Uuid | null
    opened: NoteText
    next: NoteText
    now?: IsoTimestamp
  },
): Promise<CommitResult> {
  const decision = decideVersionCut({
    openedVersionId: input.openedVersionId,
    opened: input.opened,
    next: input.next,
  })

  if (decision.kind === 'discard') {
    await discardUnsaved(db, input.noteId, input.deviceId)
    return { kind: 'discard' }
  }
  if (decision.kind === 'unchanged') {
    await clearDraft(db, input.noteId, input.deviceId, input.now)
    return { kind: 'unchanged' }
  }

  const versionId = await cutVersion(db, {
    noteId: input.noteId,
    deviceId: input.deviceId,
    parentVersionId: decision.parentVersionId,
    text: normalizeNoteText(input.next),
    now: nowStamp(input.now),
    versionId: crypto.randomUUID(),
  })
  return { kind: 'cut', versionId }
}

/**
 * Startup recovery, before the board shows. Each of this device's leftover drafts
 * is committed the same way as leaving the note (empty, unchanged, parent, outbox),
 * which removes the draft. Drafts from other devices stay.
 * Overlapping calls share one run so a second startup cannot cut the draft twice.
 */
export function recoverLeftoverDrafts(db: TracepadDatabase): Promise<void> {
  const inFlight = recoveryLocks.get(db.name)
  if (inFlight) return inFlight

  const run = commitLeftoverDrafts(db).finally(() => {
    recoveryLocks.delete(db.name)
  })
  recoveryLocks.set(db.name, run)
  return run
}

async function commitLeftoverDrafts(db: TracepadDatabase): Promise<void> {
  const deviceId = await ensureDeviceId(db)
  const drafts = await db.getAllFromIndex('drafts', 'byDeviceId', deviceId)
  for (const draft of drafts) {
    const opened = await openedText(db, draft.baseVersionId)
    await commitNoteText(db, {
      noteId: draft.noteId,
      deviceId,
      openedVersionId: draft.baseVersionId,
      opened,
      next: { title: draft.title, body: draft.body },
    })
  }
}

/** The version the draft started from. A new note has none, so the opened text is empty. */
async function openedText(db: TracepadDatabase, versionId: Uuid | null): Promise<NoteText> {
  if (versionId == null) return { title: null, body: null }
  const version = await db.get('noteVersions', versionId)
  if (!version) return { title: null, body: null }
  return { title: version.title, body: version.body }
}

async function discardUnsaved(db: TracepadDatabase, noteId: Uuid, deviceId: Uuid): Promise<void> {
  const tx = db.transaction(['drafts', 'outbox'], 'readwrite')
  const drafts = tx.objectStore('drafts')
  const outbox = tx.objectStore('outbox')
  const writing = (async () => {
    await drafts.delete([noteId, deviceId])
    const rows = await outbox.getAll()
    for (const row of rows) {
      if (row.status === 'pending' && row.entityType === 'draft' && row.entityId === noteId) {
        await outbox.delete(row.id)
      }
    }
  })()
  await finishTransaction(writing, tx.done)
}

/**
 * Write the version, point the note at it, remove this device's draft, and queue one version row.
 * The draft delete is local: the version row is the outbox record for this save.
 */
async function cutVersion(
  db: TracepadDatabase,
  input: {
    noteId: Uuid
    deviceId: Uuid
    parentVersionId: Uuid | null
    text: NoteText
    now: IsoTimestamp
    versionId: Uuid
  },
): Promise<Uuid> {
  const tx = db.transaction(['notes', 'noteVersions', 'drafts', 'outbox'], 'readwrite')
  const notes = tx.objectStore('notes')
  const versions = tx.objectStore('noteVersions')
  const drafts = tx.objectStore('drafts')
  const outbox = tx.objectStore('outbox')

  const writing = (async () => {
    const existing = await notes.get(input.noteId)
    const version: NoteVersion = {
      id: input.versionId,
      noteId: input.noteId,
      parentVersionId: input.parentVersionId,
      deviceId: input.deviceId,
      kind: 'text',
      title: input.text.title,
      body: input.text.body,
      checklistItems: null,
      createdAt: input.now,
      receivedAt: null,
    }
    const note: Note = existing
      ? { ...existing, currentVersionId: version.id, updatedAt: input.now }
      : {
          id: input.noteId,
          userId: null,
          currentVersionId: version.id,
          isPinned: false,
          isArchived: false,
          color: null,
          trashedAt: null,
          createdAt: input.now,
          updatedAt: input.now,
          serverUpdatedAt: null,
        }

    await versions.put(version)
    await notes.put(note)
    await drafts.delete([input.noteId, input.deviceId])
    await outbox.put(pendingRow('version', version.id, 'create', version, input.now, note.userId))
  })()

  await finishTransaction(writing, tx.done)
  return input.versionId
}
