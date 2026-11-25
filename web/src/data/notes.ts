import type { TracepadDatabase } from './db'
import { isTrashed, TRASH_RETENTION_DAYS } from '../domain/trash'
import {
  decideContentCut,
  normalizeChecklistItems,
  normalizeField,
  normalizeNoteText,
  sameChecklistItems,
  type NoteContent,
} from '../domain/versioning'
import type {
  ChecklistItem,
  ChecklistTick,
  Draft,
  HistoryEvent,
  IsoTimestamp,
  Label,
  Note,
  NoteKind,
  NoteLabel,
  NoteVersion,
  OutboxRow,
  Uuid,
} from '../domain/types'
import { purgeExpiredTrash } from './trash'

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

export type CardLabel = {
  id: Uuid
  name: string
}

export type BoardCard = ListedNote & {
  /** Days left out of 30. Set only on the trash view. */
  daysLeft: number | null
  /** Active labels on this note, by name. A removed label is left off. */
  labels: CardLabel[]
}

export type BoardQuery = {
  view: BoardView
  sort: BoardSort
  /** Used for trash days left. Defaults to the current time. */
  now?: IsoTimestamp
}

const DAY_MS = 24 * 60 * 60 * 1000

/** A note trashed at this moment has 30 days left. The count drops after each full day. */
function daysLeftInTrash(trashedAt: IsoTimestamp, now: IsoTimestamp): number {
  const elapsed = Date.parse(now) - Date.parse(trashedAt)
  if (!Number.isFinite(elapsed) || elapsed <= 0) return TRASH_RETENTION_DAYS
  return Math.max(0, TRASH_RETENTION_DAYS - Math.floor(elapsed / DAY_MS))
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
  const trashed = isTrashed(note)
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

function chipsByNote(storedLabels: Label[], links: NoteLabel[]): Map<Uuid, CardLabel[]> {
  const names = new Map(storedLabels.map((label) => [label.id, label.name]))
  const byNote = new Map<Uuid, CardLabel[]>()
  for (const link of links) {
    if (link.isRemoved) continue
    const name = names.get(link.labelId)
    if (name == null) continue
    const chip: CardLabel = { id: link.labelId, name }
    const list = byNote.get(link.noteId)
    if (list) list.push(chip)
    else byNote.set(link.noteId, [chip])
  }
  for (const list of byNote.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  }
  return byNote
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
 * Each card carries its active label chips.
 */
export async function listBoard(db: TracepadDatabase, query: BoardQuery): Promise<BoardCard[]> {
  const now = query.now ?? new Date().toISOString()
  const notes = await notesForView(db, query.view, query.sort)
  const storedLabels = await db.getAll('labels')
  const links = await db.getAll('noteLabels')
  const chips = chipsByNote(storedLabels, links)

  let labelNoteIds: Set<Uuid> | null = null
  if (query.view.kind === 'label') {
    const labelId = query.view.labelId
    labelNoteIds = new Set(
      links.filter((link) => link.labelId === labelId && !link.isRemoved).map((link) => link.noteId),
    )
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
      labels: chips.get(note.id) ?? [],
    })
  }
  return cards
}

type SaveDraftInput = {
  noteId: Uuid
  deviceId: Uuid
  baseVersionId: Uuid | null
  title: string | null
  now?: IsoTimestamp
} & (
  | { kind?: 'text'; body: string | null }
  | { kind: 'checklist'; checklistItems: ChecklistItem[] }
)

function sameStoredItems(a: ChecklistItem[] | null, b: ChecklistItem[] | null): boolean {
  if (a == null && b == null) return true
  return sameChecklistItems(a ?? [], b ?? [])
}

function draftFields(input: SaveDraftInput): {
  kind: NoteKind
  title: string | null
  body: string | null
  checklistItems: ChecklistItem[] | null
} {
  const title = normalizeField(input.title)
  if (input.kind === 'checklist') {
    return {
      kind: 'checklist',
      title,
      body: null,
      checklistItems: normalizeChecklistItems(input.checklistItems),
    }
  }
  return { kind: 'text', title, body: normalizeField(input.body), checklistItems: null }
}

/**
 * Upsert this device's draft and queue one outbox row.
 * A draft may exist before the note row: the note is created only when a version is cut.
 * An identical draft does not queue another row.
 */
export async function saveDraft(db: TracepadDatabase, input: SaveDraftInput): Promise<void> {
  const stored = draftFields(input)
  const tx = db.transaction(['drafts', 'outbox'], 'readwrite')
  const drafts = tx.objectStore('drafts')
  const outbox = tx.objectStore('outbox')
  const writing = (async () => {
    const existing = await drafts.get([input.noteId, input.deviceId])
    if (
      existing &&
      existing.baseVersionId === input.baseVersionId &&
      existing.kind === stored.kind &&
      existing.title === stored.title &&
      existing.body === stored.body &&
      sameStoredItems(existing.checklistItems, stored.checklistItems)
    ) {
      return
    }
    const draft: Draft = {
      noteId: input.noteId,
      deviceId: input.deviceId,
      baseVersionId: input.baseVersionId,
      kind: stored.kind,
      title: stored.title,
      body: stored.body,
      checklistItems: stored.checklistItems,
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
export function commitNoteText(
  db: TracepadDatabase,
  input: {
    noteId: Uuid
    deviceId: Uuid
    openedVersionId: Uuid | null
    opened: { title: string | null; body: string | null }
    next: { title: string | null; body: string | null }
    now?: IsoTimestamp
  },
): Promise<CommitResult> {
  return commitNoteContent(db, {
    noteId: input.noteId,
    deviceId: input.deviceId,
    openedVersionId: input.openedVersionId,
    opened: { kind: 'text', title: input.opened.title, body: input.opened.body },
    next: { kind: 'text', title: input.next.title, body: input.next.body },
    now: input.now,
  })
}

/**
 * Leave the note, press Ctrl+S, or convert between text and a checklist.
 * A kind change cuts a version. Item edits cut one only when this is called.
 */
export async function commitNoteContent(
  db: TracepadDatabase,
  input: {
    noteId: Uuid
    deviceId: Uuid
    openedVersionId: Uuid | null
    opened: NoteContent
    next: NoteContent
    now?: IsoTimestamp
  },
): Promise<CommitResult> {
  const decision = decideContentCut({
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
    content: input.next,
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

/**
 * Startup, before the board shows. Expired trash goes first so a leftover draft
 * cannot recreate a note that is already past 30 days.
 */
export async function startupLocalCleanup(db: TracepadDatabase, now?: IsoTimestamp): Promise<void> {
  await purgeExpiredTrash(db, now)
  await recoverLeftoverDrafts(db)
}

async function commitLeftoverDrafts(db: TracepadDatabase): Promise<void> {
  const deviceId = await ensureDeviceId(db)
  const drafts = await db.getAllFromIndex('drafts', 'byDeviceId', deviceId)
  for (const draft of drafts) {
    const opened = await openedContent(db, draft.baseVersionId)
    await commitNoteContent(db, {
      noteId: draft.noteId,
      deviceId,
      openedVersionId: draft.baseVersionId,
      opened,
      next: contentOfDraft(draft),
    })
  }
}

/** The version the draft started from. A new note has none, so the opened text is empty. */
async function openedContent(db: TracepadDatabase, versionId: Uuid | null): Promise<NoteContent> {
  if (versionId == null) return { kind: 'text', title: null, body: null }
  const version = await db.get('noteVersions', versionId)
  return contentOfVersion(version)
}

function contentOfVersion(version: NoteVersion | undefined): NoteContent {
  if (!version) return { kind: 'text', title: null, body: null }
  if (version.kind === 'checklist') {
    return { kind: 'checklist', title: version.title, items: version.checklistItems ?? [] }
  }
  return { kind: 'text', title: version.title, body: version.body }
}

function contentOfDraft(draft: Draft): NoteContent {
  if (draft.kind === 'checklist') {
    return { kind: 'checklist', title: draft.title, items: draft.checklistItems ?? [] }
  }
  return { kind: 'text', title: draft.title, body: draft.body }
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

function storedContent(content: NoteContent): Pick<NoteVersion, 'kind' | 'title' | 'body' | 'checklistItems'> {
  if (content.kind === 'checklist') {
    return {
      kind: 'checklist',
      title: normalizeField(content.title),
      body: null,
      checklistItems: normalizeChecklistItems(content.items),
    }
  }
  const text = normalizeNoteText(content)
  return { kind: 'text', title: text.title, body: text.body, checklistItems: null }
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
    content: NoteContent
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
    const stored = storedContent(input.content)
    const version: NoteVersion = {
      id: input.versionId,
      noteId: input.noteId,
      parentVersionId: input.parentVersionId,
      deviceId: input.deviceId,
      kind: stored.kind,
      title: stored.title,
      body: stored.body,
      checklistItems: stored.checklistItems,
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

type NoteFlag = 'pinned' | 'unpinned' | 'archived' | 'unarchived'

function historyEvent(
  noteId: Uuid,
  deviceId: Uuid,
  type: NoteFlag,
  occurredAt: IsoTimestamp,
): HistoryEvent {
  return {
    id: crypto.randomUUID(),
    noteId,
    deviceId,
    type,
    payload: null,
    occurredAt,
  }
}

/**
 * Change one flag on the note. Same transaction: the note, one history entry, one note outbox row.
 * Already in that state, or a missing note, is left alone. The current version is not touched.
 */
async function setNoteFlag(
  db: TracepadDatabase,
  input: {
    noteId: Uuid
    deviceId: Uuid
    now?: IsoTimestamp
    type: NoteFlag
    apply: (note: Note) => Note | null
  },
): Promise<boolean> {
  const now = nowStamp(input.now)
  const tx = db.transaction(['notes', 'historyEvents', 'outbox'], 'readwrite')
  let changed = false
  const writing = (async () => {
    const existing = await tx.objectStore('notes').get(input.noteId)
    if (!existing) return
    const note = input.apply(existing)
    if (!note) return
    await tx.objectStore('notes').put(note)
    await tx.objectStore('historyEvents').put(historyEvent(note.id, input.deviceId, input.type, now))
    await tx.objectStore('outbox').put(pendingRow('note', note.id, 'update', note, now, note.userId))
    changed = true
  })()
  await finishTransaction(writing, tx.done)
  return changed
}

/** Pin or unpin. The note moves to or from the top of the board. No version is cut. */
export function setPinned(
  db: TracepadDatabase,
  input: { noteId: Uuid; pinned: boolean; deviceId: Uuid; now?: IsoTimestamp },
): Promise<boolean> {
  return setNoteFlag(db, {
    noteId: input.noteId,
    deviceId: input.deviceId,
    now: input.now,
    type: input.pinned ? 'pinned' : 'unpinned',
    apply: (note) => (note.isPinned === input.pinned ? null : { ...note, isPinned: input.pinned }),
  })
}

/** Archive or unarchive. Archived notes leave the board and stay in their label views. No version is cut. */
export function setArchived(
  db: TracepadDatabase,
  input: { noteId: Uuid; archived: boolean; deviceId: Uuid; now?: IsoTimestamp },
): Promise<boolean> {
  return setNoteFlag(db, {
    noteId: input.noteId,
    deviceId: input.deviceId,
    now: input.now,
    type: input.archived ? 'archived' : 'unarchived',
    apply: (note) => (note.isArchived === input.archived ? null : { ...note, isArchived: input.archived }),
  })
}

/**
 * Change the card color and queue the note. Color is not a history event, and it cuts no version.
 * The same color, or a missing note, is left alone.
 */
export async function setNoteColor(
  db: TracepadDatabase,
  input: { noteId: Uuid; color: string | null; now?: IsoTimestamp },
): Promise<boolean> {
  const now = nowStamp(input.now)
  const tx = db.transaction(['notes', 'outbox'], 'readwrite')
  let changed = false
  const writing = (async () => {
    const existing = await tx.objectStore('notes').get(input.noteId)
    if (!existing || existing.color === input.color) return
    const note: Note = { ...existing, color: input.color }
    await tx.objectStore('notes').put(note)
    await tx.objectStore('outbox').put(pendingRow('note', note.id, 'update', note, now, note.userId))
    changed = true
  })()
  await finishTransaction(writing, tx.done)
  return changed
}

/** Ticks for one note. A missing row means the item is unticked. */
export async function listChecklistTicks(db: TracepadDatabase, noteId: Uuid): Promise<ChecklistTick[]> {
  return db.getAll('checklistTicks', IDBKeyRange.bound([noteId, ''], [noteId, '\uffff']))
}

/**
 * Tick or untick one item. The tick lives on the note, so this cuts no version.
 * Same transaction: the tick, one history entry, and one tick outbox row.
 * A tick has no single id. The outbox entity id is the note, and the payload carries both ids.
 * Already in that state, or a missing note, is left alone.
 */
export async function setChecklistTick(
  db: TracepadDatabase,
  input: {
    noteId: Uuid
    itemId: Uuid
    ticked: boolean
    deviceId: Uuid
    now?: IsoTimestamp
  },
): Promise<boolean> {
  const now = nowStamp(input.now)
  const tx = db.transaction(['notes', 'checklistTicks', 'historyEvents', 'outbox'], 'readwrite')
  let changed = false
  const writing = (async () => {
    const note = await tx.objectStore('notes').get(input.noteId)
    if (!note) return
    const existing = await tx.objectStore('checklistTicks').get([input.noteId, input.itemId])
    if (existing ? existing.ticked === input.ticked : !input.ticked) return
    const tick: ChecklistTick = {
      noteId: input.noteId,
      itemId: input.itemId,
      ticked: input.ticked,
      updatedAt: now,
    }
    const event: HistoryEvent = {
      id: crypto.randomUUID(),
      noteId: note.id,
      deviceId: input.deviceId,
      type: input.ticked ? 'ticked' : 'unticked',
      payload: { itemId: input.itemId },
      occurredAt: now,
    }
    await tx.objectStore('checklistTicks').put(tick)
    await tx.objectStore('historyEvents').put(event)
    await tx.objectStore('outbox').put(
      pendingRow('tick', note.id, existing ? 'update' : 'create', tick, now, note.userId),
    )
    changed = true
  })()
  await finishTransaction(writing, tx.done)
  return changed
}
