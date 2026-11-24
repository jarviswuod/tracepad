import type { OutboxRow, Uuid } from '../domain/types'
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

/** True when this note still has rows the server has not accepted. */
export async function noteHasPendingOutbox(db: TracepadDatabase, noteId: Uuid): Promise<boolean> {
  const pending = IDBKeyRange.bound(['pending', ''], ['pending', '\uffff'])
  const rows = await db.getAllFromIndex('outbox', 'byStatusCreatedAt', pending)
  return rows.some((row) => outboxRowTargetsNote(row, noteId))
}
