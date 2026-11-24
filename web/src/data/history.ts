import type { HistoryEvent, NoteVersion, Uuid } from '../domain/types'
import type { TracepadDatabase } from './db'

function noteRange(noteId: Uuid): IDBKeyRange {
  return IDBKeyRange.bound([noteId, ''], [noteId, '\uffff'])
}

/** Versions and history events for one note. Other notes are left out. */
export async function listNoteHistory(
  db: TracepadDatabase,
  noteId: Uuid,
): Promise<{ versions: NoteVersion[]; events: HistoryEvent[] }> {
  const tx = db.transaction(['noteVersions', 'historyEvents'], 'readonly')
  const range = noteRange(noteId)
  const versions = await tx.objectStore('noteVersions').index('byNoteCreatedAt').getAll(range)
  const events = await tx.objectStore('historyEvents').index('byNoteOccurredAt').getAll(range)
  await tx.done
  return { versions, events }
}
