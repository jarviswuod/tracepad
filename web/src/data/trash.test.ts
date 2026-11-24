import { deleteDB } from 'idb'
import { afterEach, describe, expect, it } from 'vitest'
import type {
  ChecklistTick,
  Conflict,
  Draft,
  HistoryEvent,
  Note,
  NoteLabel,
  NoteVersion,
  OutboxRow,
  Reminder,
} from '../domain/types'
import { openTracepadDb, type TracepadDatabase } from './db'
import { ensureDeviceId, listBoard, recoverLeftoverDrafts, saveDraft, startupLocalCleanup } from './notes'
import {
  deleteNoteForever,
  emptyTrash,
  moveToTrash,
  purgeExpiredTrash,
  restoreFromTrash,
} from './trash'

let counter = 0
const opened: TracepadDatabase[] = []
const names: string[] = []

function freshName() {
  const name = `tracepad-trash-${++counter}-${crypto.randomUUID()}`
  names.push(name)
  return name
}

async function open() {
  const db = await openTracepadDb(freshName())
  opened.push(db)
  return db
}

afterEach(async () => {
  opened.forEach((db) => db.close())
  opened.length = 0
  await Promise.all(names.splice(0).map((name) => deleteDB(name)))
})

const noteId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const otherId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const deviceId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const at = '2026-11-24T12:00:00.000Z'
const later = '2026-11-24T12:05:00.000Z'
const DAY_MS = 24 * 60 * 60 * 1000
const nowMs = Date.parse(at)

function iso(deltaMs: number): string {
  return new Date(nowMs + deltaMs).toISOString()
}

function note(id: string, overrides: Partial<Note> = {}): Note {
  return {
    id,
    userId: null,
    currentVersionId: `${id}-v`,
    isPinned: true,
    isArchived: true,
    color: 'yellow',
    trashedAt: null,
    createdAt: at,
    updatedAt: at,
    serverUpdatedAt: null,
    ...overrides,
  }
}

function version(row: Note, body = 'Milk'): NoteVersion {
  return {
    id: row.currentVersionId ?? `${row.id}-v`,
    noteId: row.id,
    parentVersionId: null,
    deviceId,
    kind: 'text',
    title: 'Shopping',
    body,
    checklistItems: null,
    createdAt: row.createdAt,
    receivedAt: null,
  }
}

async function outbox(db: TracepadDatabase): Promise<OutboxRow[]> {
  const rows = await db.getAll('outbox')
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}

function abortOnOutboxPut(db: TracepadDatabase) {
  const original = db.transaction.bind(db)
  db.transaction = ((...args: Parameters<TracepadDatabase['transaction']>) => {
    const tx = original(...args)
    void tx.done.then(
      () => undefined,
      () => undefined,
    )
    const objectStore = tx.objectStore.bind(tx)
    tx.objectStore = ((name: Parameters<typeof tx.objectStore>[0]) => {
      const store = objectStore(name)
      if (name === 'outbox') {
        store.put = function (this: IDBObjectStore) {
          this.transaction.abort()
          throw new DOMException('AbortError', 'AbortError')
        } as typeof store.put
      }
      return store
    }) as typeof tx.objectStore
    return tx
  }) as typeof db.transaction
}

describe('moveToTrash', () => {
  it('keeps pin, archive and color, hides the note, and writes one history entry and one outbox row', async () => {
    const db = await open()
    const original = note(noteId)
    await db.put('noteVersions', version(original))
    await db.put('notes', original)
    await db.put('labels', { id: 'work', userId: null, name: 'Work', updatedAt: at })
    await db.put('noteLabels', { noteId, labelId: 'work', isRemoved: false, updatedAt: at })
    await db.put('reminders', {
      noteId,
      userId: null,
      fireAt: at,
      repeatInterval: null,
      lastFiredAt: null,
      dismissedAt: null,
      pushSentAt: null,
      updatedAt: at,
    })

    const calls: string[][] = []
    const originalTx = db.transaction.bind(db)
    db.transaction = ((...args: Parameters<TracepadDatabase['transaction']>) => {
      const [storeNames] = args
      calls.push(Array.isArray(storeNames) ? [...storeNames] : [storeNames])
      return originalTx(...args)
    }) as typeof db.transaction

    expect(await moveToTrash(db, { noteId, deviceId, now: later })).toBe(true)

    expect(calls).toEqual([['notes', 'historyEvents', 'outbox']])
    expect(await db.get('notes', noteId)).toEqual({ ...original, trashedAt: later })
    expect(await db.get('noteVersions', `${noteId}-v`)).toEqual(version(original))
    expect(await db.count('noteVersions')).toBe(1)

    const events = await db.getAll('historyEvents')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      noteId,
      deviceId,
      type: 'trashed',
      payload: null,
      occurredAt: later,
    })

    const rows = await outbox(db)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      userId: null,
      entityType: 'note',
      entityId: noteId,
      op: 'update',
      payload: { ...original, trashedAt: later },
      createdAt: later,
      status: 'pending',
      attempts: 0,
      lastError: null,
    })

    const query = { now: later }
    expect((await listBoard(db, { view: { kind: 'notes' }, sort: 'edited', ...query })).map((card) => card.note.id)).toEqual(
      [],
    )
    expect((await listBoard(db, { view: { kind: 'archive' }, sort: 'edited', ...query })).map((card) => card.note.id)).toEqual(
      [],
    )
    expect((await listBoard(db, { view: { kind: 'label', labelId: 'work' }, sort: 'edited', ...query })).map((card) => card.note.id)).toEqual(
      [],
    )
    expect((await listBoard(db, { view: { kind: 'reminders' }, sort: 'edited', ...query })).map((card) => card.note.id)).toEqual(
      [],
    )
    const trash = await listBoard(db, { view: { kind: 'trash' }, sort: 'edited', ...query })
    expect(trash.map((card) => [card.note.id, card.daysLeft, card.note.isPinned, card.note.color])).toEqual([
      [noteId, 30, true, 'yellow'],
    ])

    expect(await moveToTrash(db, { noteId, deviceId, now: later })).toBe(false)
    expect(await db.count('historyEvents')).toBe(1)
    expect(await db.count('outbox')).toBe(1)
    expect(await moveToTrash(db, { noteId: 'missing', deviceId, now: later })).toBe(false)
  })

  it('rolls back the note, the history entry and the outbox row together', async () => {
    const db = await open()
    const original = note(noteId)
    await db.put('notes', original)
    abortOnOutboxPut(db)

    await expect(moveToTrash(db, { noteId, deviceId, now: later })).rejects.toThrow()
    expect(await db.get('notes', noteId)).toEqual(original)
    expect(await db.count('historyEvents')).toBe(0)
    expect(await db.count('outbox')).toBe(0)
  })
})

describe('restoreFromTrash', () => {
  it('puts the note back where it was, archived, pinned and the same color', async () => {
    const db = await open()
    const original = note(noteId)
    await db.put('noteVersions', version(original))
    await db.put('notes', original)
    await db.put('labels', { id: 'work', userId: null, name: 'Work', updatedAt: at })
    await db.put('noteLabels', { noteId, labelId: 'work', isRemoved: false, updatedAt: at })
    await db.put('reminders', {
      noteId,
      userId: null,
      fireAt: at,
      repeatInterval: null,
      lastFiredAt: null,
      dismissedAt: null,
      pushSentAt: null,
      updatedAt: at,
    })
    expect(await moveToTrash(db, { noteId, deviceId, now: at })).toBe(true)

    expect(await restoreFromTrash(db, { noteId, deviceId, now: later })).toBe(true)

    expect(await db.get('notes', noteId)).toEqual(original)
    expect(await db.count('noteVersions')).toBe(1)

    const events = (await db.getAll('historyEvents')).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    expect(events.map((entry) => entry.type)).toEqual(['trashed', 'restored'])
    expect(events[1]).toMatchObject({ noteId, deviceId, type: 'restored', payload: null, occurredAt: later })

    const rows = await outbox(db)
    expect(rows).toHaveLength(2)
    expect(rows[1]).toMatchObject({
      entityType: 'note',
      entityId: noteId,
      op: 'update',
      payload: original,
      createdAt: later,
    })

    expect((await listBoard(db, { view: { kind: 'notes' }, sort: 'edited' })).map((card) => card.note.id)).toEqual([])
    expect((await listBoard(db, { view: { kind: 'archive' }, sort: 'edited' })).map((card) => card.note.id)).toEqual([
      noteId,
    ])
    expect((await listBoard(db, { view: { kind: 'label', labelId: 'work' }, sort: 'edited' })).map((card) => card.note.id)).toEqual([
      noteId,
    ])
    expect((await listBoard(db, { view: { kind: 'reminders' }, sort: 'edited' })).map((card) => card.note.id)).toEqual([
      noteId,
    ])
    expect(await listBoard(db, { view: { kind: 'trash' }, sort: 'edited' })).toEqual([])

    expect(await restoreFromTrash(db, { noteId, deviceId, now: later })).toBe(false)
    expect(await db.count('historyEvents')).toBe(2)
    expect(await db.count('outbox')).toBe(2)
  })

  it('returns an unarchived note to the board, still pinned', async () => {
    const db = await open()
    const pinned = note(noteId, { isArchived: false, color: 'yellow' })
    const other = note(otherId, {
      isPinned: false,
      isArchived: false,
      color: null,
      updatedAt: later,
    })
    await db.put('noteVersions', version(pinned))
    await db.put('noteVersions', version(other, 'Other'))
    await db.put('notes', pinned)
    await db.put('notes', other)
    await moveToTrash(db, { noteId, deviceId, now: at })

    await restoreFromTrash(db, { noteId, deviceId, now: later })

    const board = await listBoard(db, { view: { kind: 'notes' }, sort: 'edited' })
    expect(board.map((card) => [card.note.id, card.note.isPinned, card.note.color])).toEqual([
      [noteId, true, 'yellow'],
      [otherId, false, null],
    ])
  })
})

describe('deleteNoteForever', () => {
  it('removes the note, its versions, history, ticks, label links and reminder, and writes one outbox row', async () => {
    const db = await open()
    const trashed = note(noteId, { trashedAt: at })
    const kept = note(otherId, { isPinned: false, isArchived: false, color: null })
    const secondVersion: NoteVersion = {
      ...version(trashed, 'Bread'),
      id: `${noteId}-v2`,
      parentVersionId: `${noteId}-v`,
    }
    const tick: ChecklistTick = { noteId, itemId: 'item-1', ticked: true, updatedAt: at }
    const keptTick: ChecklistTick = { noteId: otherId, itemId: 'item-2', ticked: false, updatedAt: at }
    const draft: Draft = {
      noteId,
      deviceId,
      baseVersionId: `${noteId}-v`,
      kind: 'text',
      title: 'Shopping',
      body: 'Draft',
      checklistItems: null,
      updatedAt: at,
    }
    const conflict: Conflict = {
      id: 'conflict-1',
      noteId,
      mergedVersionId: `${noteId}-v`,
      conflictingVersionId: `${noteId}-v2`,
      detectedAt: at,
      resolvedAt: null,
      chosenVersionId: null,
    }
    const keptConflict: Conflict = { ...conflict, id: 'conflict-2', noteId: otherId }
    const history: HistoryEvent = {
      id: 'event-1',
      noteId,
      deviceId,
      type: 'pinned',
      payload: null,
      occurredAt: at,
    }
    const keptHistory: HistoryEvent = { ...history, id: 'event-2', noteId: otherId }
    const link: NoteLabel = { noteId, labelId: 'work', isRemoved: false, updatedAt: at }
    const removedLink: NoteLabel = { noteId, labelId: 'home', isRemoved: true, updatedAt: at }
    const keptLink: NoteLabel = { noteId: otherId, labelId: 'work', isRemoved: false, updatedAt: at }
    const reminder: Reminder = {
      noteId,
      userId: 'user-1',
      fireAt: at,
      repeatInterval: null,
      lastFiredAt: null,
      dismissedAt: null,
      pushSentAt: null,
      updatedAt: at,
    }
    const keptReminder: Reminder = { ...reminder, noteId: otherId }

    await db.put('noteVersions', version(trashed))
    await db.put('noteVersions', secondVersion)
    await db.put('noteVersions', version(kept, 'Stay'))
    await db.put('notes', { ...trashed, userId: 'user-1' })
    await db.put('notes', kept)
    await db.put('checklistTicks', tick)
    await db.put('checklistTicks', keptTick)
    await db.put('drafts', draft)
    await db.put('conflicts', conflict)
    await db.put('conflicts', keptConflict)
    await db.put('historyEvents', history)
    await db.put('historyEvents', keptHistory)
    await db.put('labels', { id: 'work', userId: null, name: 'Work', updatedAt: at })
    await db.put('labels', { id: 'home', userId: null, name: 'Home', updatedAt: at })
    await db.put('noteLabels', link)
    await db.put('noteLabels', removedLink)
    await db.put('noteLabels', keptLink)
    await db.put('reminders', reminder)
    await db.put('reminders', keptReminder)

    expect(await deleteNoteForever(db, { noteId, now: later })).toBe(true)

    expect(await db.get('notes', noteId)).toBeUndefined()
    expect(await db.get('notes', otherId)).toEqual(kept)
    expect((await db.getAll('noteVersions')).map((row) => row.id)).toEqual([`${otherId}-v`])
    expect(await db.getAll('checklistTicks')).toEqual([keptTick])
    expect(await db.count('drafts')).toBe(0)
    expect((await db.getAll('conflicts')).map((row) => row.id)).toEqual(['conflict-2'])
    expect((await db.getAll('historyEvents')).map((row) => row.id)).toEqual(['event-2'])
    expect((await db.getAll('labels')).map((row) => row.id).sort()).toEqual(['home', 'work'])
    expect(await db.getAll('noteLabels')).toEqual([keptLink])
    expect((await db.getAll('reminders')).map((row) => row.noteId)).toEqual([otherId])

    const rows = await outbox(db)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      userId: 'user-1',
      entityType: 'note',
      entityId: noteId,
      op: 'purge',
      payload: { id: noteId },
      createdAt: later,
      status: 'pending',
      attempts: 0,
      lastError: null,
    })

    expect(await deleteNoteForever(db, { noteId, now: later })).toBe(false)
    expect(await deleteNoteForever(db, { noteId: otherId, now: later })).toBe(false)
    expect(await db.get('notes', otherId)).toEqual(kept)
    expect(await db.count('outbox')).toBe(1)
  })

  it('rolls back every related row when the outbox write fails', async () => {
    const db = await open()
    const trashed = note(noteId, { trashedAt: at })
    await db.put('noteVersions', version(trashed))
    await db.put('notes', trashed)
    await db.put('historyEvents', {
      id: 'event-1',
      noteId,
      deviceId,
      type: 'trashed',
      payload: null,
      occurredAt: at,
    })
    abortOnOutboxPut(db)

    await expect(deleteNoteForever(db, { noteId, now: later })).rejects.toThrow()
    expect(await db.get('notes', noteId)).toEqual(trashed)
    expect(await db.count('noteVersions')).toBe(1)
    expect(await db.count('historyEvents')).toBe(1)
    expect(await db.count('outbox')).toBe(0)
  })
})

describe('emptyTrash', () => {
  it('removes every trashed note and leaves the others', async () => {
    const db = await open()
    const active = note(otherId, { isPinned: false, isArchived: false, color: null })
    const first = note(noteId, { trashedAt: at, isArchived: false })
    const second = note('dddddddd-dddd-4ddd-8ddd-dddddddddddd', {
      trashedAt: iso(-DAY_MS),
      isPinned: false,
      color: null,
    })
    await db.put('noteVersions', version(active, 'Stay'))
    await db.put('noteVersions', version(first))
    await db.put('noteVersions', version(second, 'Gone'))
    await db.put('notes', active)
    await db.put('notes', first)
    await db.put('notes', second)

    expect(await emptyTrash(db, later)).toBe(2)

    expect(await db.get('notes', otherId)).toEqual(active)
    expect(await db.count('notes')).toBe(1)
    expect((await db.getAll('noteVersions')).map((row) => row.noteId)).toEqual([otherId])
    const rows = await outbox(db)
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => [row.entityType, row.op, row.entityId]).sort()).toEqual([
      ['note', 'purge', noteId],
      ['note', 'purge', second.id],
    ])

    expect(await emptyTrash(db, later)).toBe(0)
    expect(await db.count('outbox')).toBe(2)
  })
})

describe('purgeExpiredTrash', () => {
  it('does not write when nothing is past 30 days', async () => {
    const db = await open()
    await db.put('notes', note(noteId, { trashedAt: iso(-30 * DAY_MS), isPinned: false, isArchived: false }))
    const writes: string[][] = []
    const original = db.transaction.bind(db)
    db.transaction = ((...args: Parameters<TracepadDatabase['transaction']>) => {
      const [storeNames, mode] = args
      if (mode === 'readwrite') writes.push(Array.isArray(storeNames) ? [...storeNames] : [storeNames])
      return original(...args)
    }) as typeof db.transaction

    expect(await purgeExpiredTrash(db, at)).toBe(0)
    expect(writes).toEqual([])
    expect(await db.get('notes', noteId)).toMatchObject({ trashedAt: iso(-30 * DAY_MS) })
  })

  it('removes notes trashed more than 30 days ago and keeps the rest', async () => {
    const db = await open()
    const samples: Array<[string, string | null]> = [
      ['active', null],
      ['within', iso(-29 * DAY_MS)],
      ['edge', iso(-30 * DAY_MS)],
      ['just-over', iso(-30 * DAY_MS - 1)],
      ['old', iso(-31 * DAY_MS)],
    ]
    for (const [id, trashedAt] of samples) {
      const row = note(id, { trashedAt, isPinned: false, isArchived: false, color: null, createdAt: at, updatedAt: at })
      await db.put('noteVersions', version(row, id))
      await db.put('notes', row)
    }
    await db.put('reminders', {
      noteId: 'old',
      userId: null,
      fireAt: at,
      repeatInterval: null,
      lastFiredAt: null,
      dismissedAt: null,
      pushSentAt: null,
      updatedAt: at,
    })
    await db.put('reminders', {
      noteId: 'edge',
      userId: null,
      fireAt: at,
      repeatInterval: null,
      lastFiredAt: null,
      dismissedAt: null,
      pushSentAt: null,
      updatedAt: at,
    })

    expect(await purgeExpiredTrash(db, at)).toBe(2)

    expect((await db.getAll('notes')).map((row) => row.id).sort()).toEqual(['active', 'edge', 'within'])
    expect((await db.getAll('reminders')).map((row) => row.noteId)).toEqual(['edge'])
    expect((await db.getAll('noteVersions')).map((row) => row.noteId).sort()).toEqual(['active', 'edge', 'within'])
    const rows = await outbox(db)
    expect(rows.map((row) => [row.op, row.entityId]).sort()).toEqual([
      ['purge', 'just-over'],
      ['purge', 'old'],
    ])
  })

  it('drops a leftover draft of an expired note so startup cannot recreate it', async () => {
    const db = await open()
    const expired = note(noteId, { trashedAt: iso(-31 * DAY_MS), isPinned: false, isArchived: false })
    await db.put('noteVersions', version(expired))
    await db.put('notes', expired)
    const localDevice = await ensureDeviceId(db)
    await saveDraft(db, {
      noteId,
      deviceId: localDevice,
      baseVersionId: `${noteId}-v`,
      title: 'Shopping',
      body: 'Brought back',
      now: at,
    })

    await startupLocalCleanup(db, at)

    expect(await db.count('notes')).toBe(0)
    expect(await db.count('drafts')).toBe(0)
    expect(await db.count('noteVersions')).toBe(0)
    await recoverLeftoverDrafts(db)
    expect(await db.count('notes')).toBe(0)
  })

  it('keeps a note still inside 30 days, including text recovered from a draft', async () => {
    const db = await open()
    const row = note(noteId, { trashedAt: iso(-29 * DAY_MS), isPinned: false, isArchived: false, color: 'yellow' })
    await db.put('noteVersions', version(row))
    await db.put('notes', row)
    const localDevice = await ensureDeviceId(db)
    await saveDraft(db, {
      noteId,
      deviceId: localDevice,
      baseVersionId: `${noteId}-v`,
      title: 'Shopping',
      body: 'Brought back',
      now: at,
    })

    await startupLocalCleanup(db, at)

    const stored = await db.get('notes', noteId)
    expect(stored?.trashedAt).toBe(row.trashedAt)
    expect(stored?.isPinned).toBe(false)
    expect(stored?.color).toBe('yellow')
    expect(await db.count('drafts')).toBe(0)
    expect((await db.getAll('noteVersions')).map((item) => item.body).sort()).toEqual(['Brought back', 'Milk'])
  })
})
