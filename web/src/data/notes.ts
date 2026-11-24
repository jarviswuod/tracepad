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
