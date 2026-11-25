import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type {
  ChecklistTick,
  Conflict,
  Draft,
  HistoryEvent,
  IsoTimestamp,
  Label,
  LocalSyncState,
  Note,
  NoteLabel,
  NoteVersion,
  OutboxRow,
  OutboxStatus,
  Reminder,
  Uuid,
} from '../domain/types'

export const DB_NAME = 'tracepad'
export const DB_VERSION = 2

// IndexedDB leaves a row out of an index when any part of its key is null, and
// booleans are not valid keys. So the schema's (user_id, ...) indexes drop user_id
// (guest rows have none, and a device holds one user's rows), and pinned, archived,
// removed and resolved filters run in code over the index results.
export interface TracepadDB extends DBSchema {
  notes: {
    key: Uuid
    value: Note
    indexes: {
      // Board and archive views, newest edit first.
      byUpdatedAt: IsoTimestamp
      // "Date created" sort.
      byCreatedAt: IsoTimestamp
      // Trash view and 30-day purge; untrashed notes (null) are not in this index.
      byTrashedAt: IsoTimestamp
    }
  }
  noteVersions: {
    key: Uuid
    value: NoteVersion
    indexes: { byNoteCreatedAt: [Uuid, IsoTimestamp] }
  }
  checklistTicks: {
    key: [Uuid, Uuid]
    value: ChecklistTick
  }
  drafts: {
    key: [Uuid, Uuid]
    value: Draft
    indexes: { byDeviceId: Uuid }
  }
  conflicts: {
    key: Uuid
    value: Conflict
    indexes: { byNoteId: Uuid }
  }
  historyEvents: {
    key: Uuid
    value: HistoryEvent
    indexes: { byNoteOccurredAt: [Uuid, IsoTimestamp] }
  }
  labels: {
    key: Uuid
    value: Label
  }
  noteLabels: {
    key: [Uuid, Uuid]
    value: NoteLabel
    indexes: { byLabelId: Uuid }
  }
  reminders: {
    key: Uuid
    value: Reminder
    indexes: { byFireAt: IsoTimestamp }
  }
  outbox: {
    key: Uuid
    value: OutboxRow
    indexes: { byStatusCreatedAt: [OutboxStatus, IsoTimestamp] }
  }
  localSyncState: {
    key: Uuid
    value: LocalSyncState
  }
}

export type TracepadDatabase = IDBPDatabase<TracepadDB>

export function openTracepadDb(name: string = DB_NAME): Promise<TracepadDatabase> {
  return openDB<TracepadDB>(name, DB_VERSION, {
    async upgrade(db, oldVersion, _newVersion, transaction) {
      // Each step runs once, in order, from the version the device is on.
      // Add later steps as `if (oldVersion < 3) { ... }` below; never edit a past step.
      if (oldVersion < 1) {
        const notes = db.createObjectStore('notes', { keyPath: 'id' })
        notes.createIndex('byUpdatedAt', 'updatedAt')
        notes.createIndex('byCreatedAt', 'createdAt')
        notes.createIndex('byTrashedAt', 'trashedAt')

        const versions = db.createObjectStore('noteVersions', { keyPath: 'id' })
        versions.createIndex('byNoteCreatedAt', ['noteId', 'createdAt'])

        db.createObjectStore('checklistTicks', { keyPath: ['noteId', 'itemId'] })

        const drafts = db.createObjectStore('drafts', { keyPath: ['noteId', 'deviceId'] })
        drafts.createIndex('byDeviceId', 'deviceId')

        const conflicts = db.createObjectStore('conflicts', { keyPath: 'id' })
        conflicts.createIndex('byNoteId', 'noteId')

        const history = db.createObjectStore('historyEvents', { keyPath: 'id' })
        history.createIndex('byNoteOccurredAt', ['noteId', 'occurredAt'])

        db.createObjectStore('labels', { keyPath: 'id' })

        const noteLabels = db.createObjectStore('noteLabels', { keyPath: ['noteId', 'labelId'] })
        noteLabels.createIndex('byLabelId', 'labelId')

        const reminders = db.createObjectStore('reminders', { keyPath: 'noteId' })
        reminders.createIndex('byFireAt', 'fireAt')

        const outbox = db.createObjectStore('outbox', { keyPath: 'id' })
        outbox.createIndex('byStatusCreatedAt', ['status', 'createdAt'])

        db.createObjectStore('localSyncState', { keyPath: 'deviceId' })
      }
      // Notes saved before custom order have no sortPosition. Null keeps their previous order.
      if (oldVersion < 2 && transaction.objectStoreNames.contains('notes')) {
        const store = transaction.objectStore('notes')
        let cursor = await store.openCursor()
        while (cursor) {
          if (cursor.value.sortPosition == null) {
            await cursor.update({ ...cursor.value, sortPosition: null })
          }
          cursor = await cursor.continue()
        }
      }
    },
  })
}
