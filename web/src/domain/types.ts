// Data shapes stored on the device. Field names, types and allowed values
// follow docs/Tracepad-Schema.md. Nullable columns are `| null`.

export type Uuid = string

/** ISO 8601 timestamp, e.g. "2026-11-24T10:46:00.000Z". */
export type IsoTimestamp = string

export type NoteKind = 'text' | 'checklist'

/** Rows on the device have no user while signed out; it is filled in at first sign-in. */
export type Note = {
  id: Uuid
  userId: Uuid | null
  currentVersionId: Uuid | null
  isPinned: boolean
  isArchived: boolean
  color: string | null
  trashedAt: IsoTimestamp | null
  /** Custom drag order (`notes.sort_position`). Null keeps the previous order. */
  sortPosition: number | null
  createdAt: IsoTimestamp
  updatedAt: IsoTimestamp
  /** Server receive time; null until the server has accepted the note. */
  serverUpdatedAt: IsoTimestamp | null
}

export type ChecklistItem = {
  id: Uuid
  text: string
  position: number
}

/** Never changed after it is written. */
export type NoteVersion = {
  id: Uuid
  noteId: Uuid
  parentVersionId: Uuid | null
  deviceId: Uuid
  kind: NoteKind
  title: string | null
  body: string | null
  checklistItems: ChecklistItem[] | null
  createdAt: IsoTimestamp
  /** Server receive time; null until the server has accepted the version. */
  receivedAt: IsoTimestamp | null
}

/** Keyed by (noteId, itemId). */
export type ChecklistTick = {
  noteId: Uuid
  itemId: Uuid
  ticked: boolean
  updatedAt: IsoTimestamp
}

/** Keyed by (noteId, deviceId): one draft per note per device. */
export type Draft = {
  noteId: Uuid
  deviceId: Uuid
  baseVersionId: Uuid | null
  kind: NoteKind
  title: string | null
  body: string | null
  checklistItems: ChecklistItem[] | null
  updatedAt: IsoTimestamp
}

export type Conflict = {
  id: Uuid
  noteId: Uuid
  mergedVersionId: Uuid
  conflictingVersionId: Uuid
  detectedAt: IsoTimestamp
  resolvedAt: IsoTimestamp | null
  chosenVersionId: Uuid | null
}

export type HistoryEventType =
  | 'pinned'
  | 'unpinned'
  | 'label_added'
  | 'label_removed'
  | 'archived'
  | 'unarchived'
  | 'auto_archived'
  | 'trashed'
  | 'restored'
  | 'ticked'
  | 'unticked'
  | 'reminder_set'
  | 'reminder_changed'
  | 'reminder_removed'
  | 'conflict_resolved'

export type HistoryEventPayload = {
  labelId?: Uuid
  itemId?: Uuid
  fireAt?: IsoTimestamp
}

export type HistoryEvent = {
  id: Uuid
  noteId: Uuid
  /** Null for server jobs such as auto-archive. */
  deviceId: Uuid | null
  type: HistoryEventType
  payload: HistoryEventPayload | null
  occurredAt: IsoTimestamp
}

export type Label = {
  id: Uuid
  userId: Uuid | null
  name: string
  updatedAt: IsoTimestamp
}

/** Keyed by (noteId, labelId). Removal is a flag so it can follow "later wins". */
export type NoteLabel = {
  noteId: Uuid
  labelId: Uuid
  isRemoved: boolean
  updatedAt: IsoTimestamp
}

/** At most one per note, keyed by noteId. */
export type Reminder = {
  noteId: Uuid
  userId: Uuid | null
  fireAt: IsoTimestamp
  /** Postgres interval; null means one-time. */
  repeatInterval: string | null
  lastFiredAt: IsoTimestamp | null
  dismissedAt: IsoTimestamp | null
  pushSentAt: IsoTimestamp | null
  updatedAt: IsoTimestamp
}

export type EntityType =
  | 'note'
  | 'version'
  | 'draft'
  | 'tick'
  | 'conflict'
  | 'history'
  | 'label'
  | 'note_label'
  | 'reminder'

export type ChangeOp = 'create' | 'update' | 'delete' | 'purge'

export type OutboxStatus = 'pending' | 'sent'

export type OutboxRow = {
  /** Becomes change_log.row_id on the server. */
  id: Uuid
  userId: Uuid | null
  entityType: EntityType
  entityId: Uuid
  op: ChangeOp
  payload: unknown
  createdAt: IsoTimestamp
  status: OutboxStatus
  attempts: number
  lastError: string | null
}

export type LocalSyncState = {
  deviceId: Uuid
  userId: Uuid | null
  /** Last change_log.seq pulled. */
  bookmark: number
  lastSyncAt: IsoTimestamp | null
}
