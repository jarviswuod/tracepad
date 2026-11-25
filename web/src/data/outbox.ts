import type { ChangeOp, EntityType, IsoTimestamp, OutboxRow, Uuid } from '../domain/types'
import type { TracepadDatabase } from './db'

function noteIdFromPayload(payload: unknown): Uuid | null {
  if (typeof payload !== 'object' || payload == null || !('noteId' in payload)) return null
  const noteId = payload.noteId
  return typeof noteId === 'string' ? noteId : null
}

/** A pending row belongs to a note when its id or its payload points at that note. */
export function outboxRowTargetsNote(row: OutboxRow, noteId: Uuid): boolean {
  if (row.status !== 'pending') return false
  if (row.entityId === noteId) return true
  return noteIdFromPayload(row.payload) === noteId
}

/** Pending rows on the status + created_at index, oldest first. */
const pendingCreatedAt = IDBKeyRange.bound(['pending', ''], ['pending', '\uffff'])

/** Pending rows only, oldest first. Sent rows stay in the store and are left out. */
export function listPendingOutbox(db: TracepadDatabase): Promise<OutboxRow[]> {
  return db.getAllFromIndex('outbox', 'byStatusCreatedAt', pendingCreatedAt)
}

/** How many changes are still waiting to be accepted. */
export function countPendingOutbox(db: TracepadDatabase): Promise<number> {
  return db.countFromIndex('outbox', 'byStatusCreatedAt', pendingCreatedAt)
}

/** True when this note still has rows the server has not accepted. */
export async function noteHasPendingOutbox(db: TracepadDatabase, noteId: Uuid): Promise<boolean> {
  const rows = await listPendingOutbox(db)
  return rows.some((row) => outboxRowTargetsNote(row, noteId))
}

export type OutboxChange = {
  entityType: EntityType
  entityId: Uuid
  op: ChangeOp
  payload: unknown
  createdAt: IsoTimestamp
  userId: Uuid | null
}

/**
 * Queue one pending row on the outbox store of the caller's readwrite transaction.
 * The row commits with that change and disappears with it if the transaction aborts.
 */
export async function queueOutbox(
  outbox: { put(row: OutboxRow): Promise<unknown> },
  change: OutboxChange,
): Promise<OutboxRow> {
  const row: OutboxRow = {
    id: crypto.randomUUID(),
    userId: change.userId,
    entityType: change.entityType,
    entityId: change.entityId,
    op: change.op,
    payload: change.payload,
    createdAt: change.createdAt,
    status: 'pending',
    attempts: 0,
    lastError: null,
  }
  await outbox.put(row)
  return row
}

/**
 * Mark accepted rows sent. An id that is missing, or a row already sent, is left as it is.
 * Rows not in this list stay pending so a partial push can retry.
 */
export async function markOutboxSent(db: TracepadDatabase, ids: readonly Uuid[]): Promise<void> {
  if (ids.length === 0) return
  const tx = db.transaction('outbox', 'readwrite')
  const store = tx.store
  const writing = (async () => {
    for (const id of ids) {
      const row = await store.get(id)
      if (!row || row.status === 'sent') continue
      await store.put({ ...row, status: 'sent' })
    }
  })()
  await finishTransaction(writing, tx.done)
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
