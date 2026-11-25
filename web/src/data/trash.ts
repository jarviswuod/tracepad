import type { IDBPTransaction } from 'idb'
import type { HistoryEvent, IsoTimestamp, Note, Uuid } from '../domain/types'
import { isTrashExpired } from '../domain/trash'
import type { TracepadDB, TracepadDatabase } from './db'
import { queueOutbox } from './outbox'
import { remindersChanged } from './reminders'

type RemovalTx = IDBPTransaction<
  TracepadDB,
  [
    'notes',
    'noteVersions',
    'checklistTicks',
    'drafts',
    'conflicts',
    'historyEvents',
    'noteLabels',
    'reminders',
    'outbox',
  ],
  'readwrite'
>

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

function noteRange(noteId: Uuid): IDBKeyRange {
  return IDBKeyRange.bound([noteId, ''], [noteId, '\uffff'])
}

function event(
  noteId: Uuid,
  deviceId: Uuid,
  type: 'trashed' | 'restored',
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
 * Set `trashedAt`. Pin, archive, color and the current version stay as they are.
 * One history entry and one note outbox row, in the same transaction.
 * Already-trashed and missing notes are left alone.
 */
export async function moveToTrash(
  db: TracepadDatabase,
  input: { noteId: Uuid; deviceId: Uuid; now?: IsoTimestamp },
): Promise<boolean> {
  const now = nowStamp(input.now)
  const tx = db.transaction(['notes', 'historyEvents', 'outbox'], 'readwrite')
  let moved = false
  const writing = (async () => {
    const existing = await tx.objectStore('notes').get(input.noteId)
    if (!existing || existing.trashedAt != null) return
    const note: Note = { ...existing, trashedAt: now }
    await tx.objectStore('notes').put(note)
    await tx.objectStore('historyEvents').put(event(note.id, input.deviceId, 'trashed', now))
    await queueOutbox(tx.objectStore('outbox'), {
      entityType: 'note',
      entityId: note.id,
      op: 'update',
      payload: note,
      createdAt: now,
      userId: note.userId,
    })
    moved = true
  })()
  await finishTransaction(writing, tx.done)
  if (moved) remindersChanged()
  return moved
}

/**
 * Clear `trashedAt`. The note returns archived or not, pinned or not, with the same color.
 * One history entry and one note outbox row. A note that is not in the trash is left alone.
 */
export async function restoreFromTrash(
  db: TracepadDatabase,
  input: { noteId: Uuid; deviceId: Uuid; now?: IsoTimestamp },
): Promise<boolean> {
  const now = nowStamp(input.now)
  const tx = db.transaction(['notes', 'historyEvents', 'outbox'], 'readwrite')
  let restored = false
  const writing = (async () => {
    const existing = await tx.objectStore('notes').get(input.noteId)
    if (!existing || existing.trashedAt == null) return
    const note: Note = { ...existing, trashedAt: null }
    await tx.objectStore('notes').put(note)
    await tx.objectStore('historyEvents').put(event(note.id, input.deviceId, 'restored', now))
    await queueOutbox(tx.objectStore('outbox'), {
      entityType: 'note',
      entityId: note.id,
      op: 'update',
      payload: note,
      createdAt: now,
      userId: note.userId,
    })
    restored = true
  })()
  await finishTransaction(writing, tx.done)
  if (restored) remindersChanged()
  return restored
}

/** Delete one trashed note and its related rows. Asks are the screen's job. An active note is kept. */
export async function deleteNoteForever(
  db: TracepadDatabase,
  input: { noteId: Uuid; now?: IsoTimestamp },
): Promise<boolean> {
  const existing = await db.get('notes', input.noteId)
  if (existing?.trashedAt == null) return false
  const removed = await removeTrashed(db, nowStamp(input.now), (note) => note.id === input.noteId)
  return removed === 1
}

/** Same removal as delete forever, for every note currently in the trash. */
export async function emptyTrash(db: TracepadDatabase, now?: IsoTimestamp): Promise<number> {
  const trashed = await db.getAllFromIndex('notes', 'byTrashedAt')
  if (trashed.length === 0) return 0
  return removeTrashed(db, nowStamp(now), () => true)
}

/**
 * Startup: notes trashed more than 30 days ago are removed on this device. The outbox tells the server later.
 * Nothing due means no write, so opening the app does not start a transaction on drafts.
 */
export async function purgeExpiredTrash(db: TracepadDatabase, now?: IsoTimestamp): Promise<number> {
  const at = nowStamp(now)
  const trashed = await db.getAllFromIndex('notes', 'byTrashedAt')
  if (!trashed.some((note) => note.trashedAt != null && isTrashExpired(note.trashedAt, at))) return 0
  return removeTrashed(db, at, (note) => note.trashedAt != null && isTrashExpired(note.trashedAt, at))
}

async function removeTrashed(
  db: TracepadDatabase,
  now: IsoTimestamp,
  include: (note: Note) => boolean,
): Promise<number> {
  const tx = db.transaction(
    [
      'notes',
      'noteVersions',
      'checklistTicks',
      'drafts',
      'conflicts',
      'historyEvents',
      'noteLabels',
      'reminders',
      'outbox',
    ],
    'readwrite',
  )
  let removed = 0
  const writing = (async () => {
    const trashed = await tx.objectStore('notes').index('byTrashedAt').getAll()
    for (const note of trashed) {
      if (note.trashedAt == null || !include(note)) continue
      await removeNote(tx, note, now)
      removed += 1
    }
  })()
  await finishTransaction(writing, tx.done)
  if (removed > 0) remindersChanged()
  return removed
}

/** The note row goes, and so do its versions, drafts, ticks, history, conflicts, label links and reminder. */
async function removeNote(tx: RemovalTx, note: Note, now: IsoTimestamp): Promise<void> {
  const noteId = note.id
  const range = noteRange(noteId)

  const versions = await tx.objectStore('noteVersions').index('byNoteCreatedAt').getAll(range)
  for (const version of versions) await tx.objectStore('noteVersions').delete(version.id)

  const ticks = await tx.objectStore('checklistTicks').getAll()
  for (const tick of ticks) {
    if (tick.noteId === noteId) await tx.objectStore('checklistTicks').delete([tick.noteId, tick.itemId])
  }

  const drafts = await tx.objectStore('drafts').getAll()
  for (const draft of drafts) {
    if (draft.noteId === noteId) await tx.objectStore('drafts').delete([draft.noteId, draft.deviceId])
  }

  const conflicts = await tx.objectStore('conflicts').index('byNoteId').getAll(noteId)
  for (const conflict of conflicts) await tx.objectStore('conflicts').delete(conflict.id)

  const events = await tx.objectStore('historyEvents').index('byNoteOccurredAt').getAll(range)
  for (const entry of events) await tx.objectStore('historyEvents').delete(entry.id)

  const links = await tx.objectStore('noteLabels').getAll()
  for (const link of links) {
    if (link.noteId === noteId) await tx.objectStore('noteLabels').delete([link.noteId, link.labelId])
  }

  await tx.objectStore('reminders').delete(noteId)
  await tx.objectStore('notes').delete(noteId)
  await queueOutbox(tx.objectStore('outbox'), {
    entityType: 'note',
    entityId: noteId,
    op: 'purge',
    payload: { id: noteId },
    createdAt: now,
    userId: note.userId,
  })
}
