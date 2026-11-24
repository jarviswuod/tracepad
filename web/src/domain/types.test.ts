// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as typesModule from './types'
import type {
  ChangeOp,
  ChecklistItem,
  ChecklistTick,
  Conflict,
  Draft,
  EntityType,
  HistoryEvent,
  HistoryEventType,
  Label,
  LocalSyncState,
  Note,
  NoteKind,
  NoteLabel,
  NoteVersion,
  OutboxRow,
  OutboxStatus,
  Reminder,
} from './types'

const schema = readFileSync(new URL('../../../docs/Tracepad-Schema.md', import.meta.url), 'utf8')
const typesSource = readFileSync(new URL('./types.ts', import.meta.url), 'utf8')

const id = '0b8f6f0e-3c1a-4e5b-9a57-2f1d6c4e8a10'
const at = '2026-11-24T10:46:00.000Z'

const note = {
  id,
  userId: null,
  currentVersionId: id,
  isPinned: false,
  isArchived: false,
  color: null,
  trashedAt: null,
  createdAt: at,
  updatedAt: at,
  serverUpdatedAt: null,
} satisfies Note

const item = { id, text: 'Milk', position: 0 } satisfies ChecklistItem

const version = {
  id,
  noteId: id,
  parentVersionId: null,
  deviceId: id,
  kind: 'checklist',
  title: 'Shopping',
  body: null,
  checklistItems: [item],
  createdAt: at,
  receivedAt: null,
} satisfies NoteVersion

const tick = { noteId: id, itemId: id, ticked: true, updatedAt: at } satisfies ChecklistTick

const draft = {
  noteId: id,
  deviceId: id,
  baseVersionId: id,
  kind: 'text',
  title: null,
  body: 'Hello',
  checklistItems: null,
  updatedAt: at,
} satisfies Draft

const conflict = {
  id,
  noteId: id,
  mergedVersionId: id,
  conflictingVersionId: id,
  detectedAt: at,
  resolvedAt: null,
  chosenVersionId: null,
} satisfies Conflict

const historyEvent = {
  id,
  noteId: id,
  deviceId: null,
  type: 'label_added',
  payload: { labelId: id },
  occurredAt: at,
} satisfies HistoryEvent

const label = { id, userId: id, name: 'Work', updatedAt: at } satisfies Label

const noteLabel = { noteId: id, labelId: id, isRemoved: false, updatedAt: at } satisfies NoteLabel

const reminder = {
  noteId: id,
  userId: null,
  fireAt: at,
  repeatInterval: null,
  lastFiredAt: null,
  dismissedAt: null,
  pushSentAt: null,
  updatedAt: at,
} satisfies Reminder

const outboxRow = {
  id,
  userId: null,
  entityType: 'note',
  entityId: id,
  op: 'create',
  payload: { isPinned: true },
  createdAt: at,
  status: 'pending',
  attempts: 0,
  lastError: null,
} satisfies OutboxRow

const localSyncState = { deviceId: id, userId: null, bookmark: 0, lastSyncAt: null } satisfies LocalSyncState

// Exhaustive lists: adding or removing a union member breaks the type-check.
const noteKinds: Record<NoteKind, true> = { text: true, checklist: true }
const historyEventTypes: Record<HistoryEventType, true> = {
  pinned: true,
  unpinned: true,
  label_added: true,
  label_removed: true,
  archived: true,
  unarchived: true,
  auto_archived: true,
  trashed: true,
  restored: true,
  ticked: true,
  unticked: true,
  reminder_set: true,
  reminder_changed: true,
  reminder_removed: true,
  conflict_resolved: true,
}
const entityTypes: Record<EntityType, true> = {
  note: true,
  version: true,
  draft: true,
  tick: true,
  conflict: true,
  history: true,
  label: true,
  note_label: true,
  reminder: true,
}
const changeOps: Record<ChangeOp, true> = { create: true, update: true, delete: true, purge: true }
const outboxStatuses: Record<OutboxStatus, true> = { pending: true, sent: true }

// Values outside the schema's allowed sets must not type-check.
// @ts-expect-error 'image' is not a note kind
const badKind: NoteKind = 'image'
// @ts-expect-error color changes have no history entry
const badHistoryType: HistoryEventType = 'color_changed'
// @ts-expect-error 'user' is not an entity type
const badEntityType: EntityType = 'user'
// @ts-expect-error 'failed' is not an outbox status
const badStatus: OutboxStatus = 'failed'
// @ts-expect-error a note needs every field
const missingField: Note = { id }
void [badKind, badHistoryType, badEntityType, badStatus, missingField]

const toCamel = (name: string) => name.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())

function sqlColumns(table: string): string[] {
  const block = schema.match(new RegExp(`CREATE TABLE ${table} \\(([\\s\\S]*?)\\n\\);`))
  if (!block) throw new Error(`table ${table} not found in schema`)
  return block[1]
    .split('\n')
    .filter((line) => !/^\s*(--|PRIMARY KEY|$)/.test(line))
    .filter((line) => !/--\s*v2\b/.test(line))
    .filter((line) => /^\s+[a-z_]+\s+[a-z]/.test(line))
    .map((line) => toCamel(line.trim().split(/\s+/)[0]))
}

function deviceTableFields(heading: string): string[] {
  const block = schema.match(new RegExp(`### \`${heading}\`\\s+\`\`\`text\\n([\\s\\S]*?)\`\`\``))
  if (!block) throw new Error(`device table ${heading} not found in schema`)
  return block[1]
    .split('\n')
    .filter((line) => /^[a-z_]+(\s|$)/.test(line))
    .map((line) => toCamel(line.split(/\s+/)[0]))
}

function checkValues(column: string): string[] {
  const block = schema.match(new RegExp(`${column}\\s[^\\n]*CHECK \\(${column} IN \\(([^)]*)\\)`))
  if (!block) throw new Error(`check on ${column} not found in schema`)
  return [...block[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
}

const sorted = (values: string[]) => [...values].sort()
const keys = (row: object) => sorted(Object.keys(row))

describe('domain types', () => {
  it.each([
    ['notes', note],
    ['note_versions', version],
    ['checklist_ticks', tick],
    ['drafts', draft],
    ['conflicts', conflict],
    ['history_events', historyEvent],
    ['labels', label],
    ['note_labels', noteLabel],
    ['reminders', reminder],
  ])('has one field per v1 column of %s', (table, row) => {
    expect(keys(row)).toEqual(sorted(sqlColumns(table)))
  })

  it('matches the device-only outbox table', () => {
    expect(keys(outboxRow)).toEqual(sorted(deviceTableFields('outbox')))
  })

  it('matches the device-only local_sync_state table', () => {
    expect(keys(localSyncState)).toEqual(sorted(deviceTableFields('local_sync_state')))
  })

  it('matches checklist_items as {id, text, position}', () => {
    expect(schema).toMatch(/checklist_items\s+jsonb,\s+-- checklists: \[\{id, text, position\}\]/)
    expect(keys(item)).toEqual(['id', 'position', 'text'])
  })

  it('uses the schema allowed values for every union', () => {
    expect(sorted(Object.keys(noteKinds))).toEqual(sorted(checkValues('kind')))
    expect(sorted(Object.keys(historyEventTypes))).toEqual(sorted(checkValues('type')))
    expect(sorted(Object.keys(entityTypes))).toEqual(sorted(checkValues('entity_type')))
    expect(sorted(Object.keys(changeOps))).toEqual(sorted(checkValues('op')))
    expect(schema).toMatch(/^status\s+text\s+pending \| sent$/m)
    expect(sorted(Object.keys(outboxStatuses))).toEqual(['pending', 'sent'])
  })

  it('has no imports and no runtime code', () => {
    expect(typesSource).not.toMatch(/^\s*import\b/m)
    expect(typesSource).not.toMatch(/\bexport\s+(const|let|var|function|class|enum|default)\b/)
    expect(Object.keys(typesModule)).toEqual([])
  })
})
