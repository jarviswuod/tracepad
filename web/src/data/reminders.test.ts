import { deleteDB } from 'idb'
import { afterEach, describe, expect, it } from 'vitest'
import type { HistoryEvent, Note, NoteVersion, OutboxRow, Reminder } from '../domain/types'
import { openTracepadDb, type TracepadDatabase } from './db'
import { listReminderWatches, markReminderFired, removeReminder, setReminder } from './reminders'

let counter = 0
const opened: TracepadDatabase[] = []
const names: string[] = []

function freshName() {
  const name = `tracepad-reminders-${++counter}-${crypto.randomUUID()}`
  names.push(name)
  return name
}

async function open() {
  const db = await openTracepadDb(freshName())
  opened.push(db)
  return db
}

afterEach(async () => {
  opened.splice(0).forEach((db) => db.close())
  await Promise.all(names.splice(0).map((name) => deleteDB(name)))
})

const noteId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const deviceId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const userId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const at = '2026-11-25T12:00:00.000Z'
const future = '2026-11-25T12:05:00.000Z'
const later = '2026-11-25T13:00:00.000Z'
const past = '2026-11-25T11:00:00.000Z'

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: noteId,
    userId,
    currentVersionId: `${noteId}-v`,
    isPinned: false,
    isArchived: false,
    color: null,
    trashedAt: null,
    createdAt: at,
    updatedAt: at,
    sortPosition: null,
    serverUpdatedAt: null,
    ...overrides,
  }
}

function version(row: Note): NoteVersion {
  return {
    id: row.currentVersionId ?? `${row.id}-v`,
    noteId: row.id,
    parentVersionId: null,
    deviceId,
    kind: 'text',
    title: 'Shopping',
    body: 'Milk',
    checklistItems: null,
    createdAt: row.createdAt,
    receivedAt: null,
  }
}

function reminder(fireAt: string, overrides: Partial<Reminder> = {}): Reminder {
  return {
    noteId,
    userId,
    fireAt,
    repeatInterval: null,
    lastFiredAt: null,
    dismissedAt: null,
    pushSentAt: null,
    updatedAt: at,
    ...overrides,
  }
}

async function seed(db: TracepadDatabase, row: Note = note()) {
  await db.put('noteVersions', version(row))
  await db.put('notes', row)
}

async function outbox(db: TracepadDatabase): Promise<OutboxRow[]> {
  const rows = await db.getAll('outbox')
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}

async function events(db: TracepadDatabase): Promise<HistoryEvent[]> {
  const rows = await db.getAll('historyEvents')
  return rows.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id))
}

function watchStores(db: TracepadDatabase): string[][] {
  const calls: string[][] = []
  const original = db.transaction.bind(db)
  db.transaction = ((...args: Parameters<TracepadDatabase['transaction']>) => {
    const [storeNames] = args
    calls.push(Array.isArray(storeNames) ? [...storeNames] : [storeNames])
    return original(...args)
  }) as typeof db.transaction
  return calls
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

describe('setReminder', () => {
  it('refuses a past time before writing', async () => {
    const db = await open()
    await seed(db)
    const calls = watchStores(db)

    expect(await setReminder(db, { noteId, fireAt: past, deviceId, now: at })).toEqual({
      ok: false,
      message: 'Pick a future time.',
    })
    expect(await setReminder(db, { noteId, fireAt: at, deviceId, now: at })).toEqual({
      ok: false,
      message: 'Pick a future time.',
    })

    expect(calls).toEqual([])
    expect(await db.count('reminders')).toBe(0)
    expect(await db.count('historyEvents')).toBe(0)
    expect(await db.count('outbox')).toBe(0)
    expect(await db.count('noteVersions')).toBe(1)
  })

  it('stores one reminder, a history entry, and an outbox row, and cuts no version', async () => {
    const db = await open()
    const original = note({ isArchived: true, color: '#fff475' })
    await seed(db, original)
    const calls = watchStores(db)

    expect(await setReminder(db, { noteId, fireAt: future, deviceId, now: at })).toEqual({
      ok: true,
      changed: true,
    })

    expect(calls).toEqual([['notes', 'reminders', 'historyEvents', 'outbox']])
    expect(await db.get('notes', noteId)).toEqual(original)
    expect(await db.count('noteVersions')).toBe(1)
    expect(await db.get('reminders', noteId)).toEqual(reminder(future))
    const history = await events(db)
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({
      noteId,
      deviceId,
      type: 'reminder_set',
      payload: { fireAt: future },
      occurredAt: at,
    })
    const rows = await outbox(db)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      userId,
      entityType: 'reminder',
      entityId: noteId,
      op: 'create',
      payload: reminder(future),
      createdAt: at,
      status: 'pending',
      attempts: 0,
      lastError: null,
    })
  })

  it('changes the time in place and leaves a second set of the same time alone', async () => {
    const db = await open()
    await seed(db)
    await setReminder(db, { noteId, fireAt: future, deviceId, now: at })

    expect(await setReminder(db, { noteId, fireAt: later, deviceId, now: future })).toEqual({
      ok: true,
      changed: true,
    })
    expect(await setReminder(db, { noteId, fireAt: later, deviceId, now: future })).toEqual({
      ok: true,
      changed: false,
    })

    expect(await db.count('reminders')).toBe(1)
    expect(await db.get('reminders', noteId)).toEqual(reminder(later, { updatedAt: future }))
    const history = await events(db)
    expect(history.map((event) => event.type)).toEqual(['reminder_set', 'reminder_changed'])
    expect(history[1]).toMatchObject({ payload: { fireAt: later }, occurredAt: future })
    const rows = await outbox(db)
    expect(rows.map((row) => row.op)).toEqual(['create', 'update'])
    expect(rows[1]).toMatchObject({
      entityType: 'reminder',
      entityId: noteId,
      payload: reminder(later, { updatedAt: future }),
    })
  })

  it('does nothing for a missing note', async () => {
    const db = await open()
    expect(await setReminder(db, { noteId, fireAt: future, deviceId, now: at })).toEqual({
      ok: false,
      message: null,
    })
    expect(await db.count('reminders')).toBe(0)
    expect(await db.count('historyEvents')).toBe(0)
    expect(await db.count('outbox')).toBe(0)
  })

  it('rolls the reminder, the history entry, and the outbox row back together', async () => {
    const db = await open()
    await seed(db)
    abortOnOutboxPut(db)

    await expect(setReminder(db, { noteId, fireAt: future, deviceId, now: at })).rejects.toThrow()

    expect(await db.count('reminders')).toBe(0)
    expect(await db.count('historyEvents')).toBe(0)
    expect(await db.count('outbox')).toBe(0)
    expect(await db.count('noteVersions')).toBe(1)
  })
})

describe('removeReminder', () => {
  it('deletes the reminder and writes a history entry and an outbox row', async () => {
    const db = await open()
    await seed(db)
    await setReminder(db, { noteId, fireAt: future, deviceId, now: at })

    expect(await removeReminder(db, { noteId, deviceId, now: later })).toBe(true)
    expect(await removeReminder(db, { noteId, deviceId, now: later })).toBe(false)

    expect(await db.count('reminders')).toBe(0)
    expect(await db.count('noteVersions')).toBe(1)
    const history = await events(db)
    expect(history.map((event) => event.type)).toEqual(['reminder_set', 'reminder_removed'])
    expect(history[1]).toMatchObject({
      noteId,
      deviceId,
      payload: { fireAt: future },
      occurredAt: later,
    })
    const rows = await outbox(db)
    expect(rows.map((row) => row.op)).toEqual(['create', 'delete'])
    expect(rows[1]).toMatchObject({
      entityType: 'reminder',
      entityId: noteId,
      payload: { noteId },
      createdAt: later,
    })
  })

  it('rolls the delete back with the history entry and the outbox row', async () => {
    const db = await open()
    await seed(db)
    await setReminder(db, { noteId, fireAt: future, deviceId, now: at })
    abortOnOutboxPut(db)

    await expect(removeReminder(db, { noteId, deviceId, now: later })).rejects.toThrow()

    expect(await db.get('reminders', noteId)).toEqual(reminder(future))
    expect(await events(db)).toHaveLength(1)
    expect(await outbox(db)).toHaveLength(1)
  })
})

describe('markReminderFired', () => {
  it('records the delivery and an outbox row, without a history entry', async () => {
    const db = await open()
    await seed(db)
    await setReminder(db, { noteId, fireAt: future, deviceId, now: at })

    expect(await markReminderFired(db, { noteId, fireAt: future, now: future })).toBe(true)
    expect(await markReminderFired(db, { noteId, fireAt: future, now: later })).toBe(false)
    expect(await markReminderFired(db, { noteId, fireAt: later, now: later })).toBe(false)

    expect(await db.get('reminders', noteId)).toMatchObject({ fireAt: future, lastFiredAt: future })
    expect(await events(db)).toHaveLength(1)
    const rows = await outbox(db)
    expect(rows).toHaveLength(2)
    expect(rows[1]).toMatchObject({ entityType: 'reminder', op: 'update', createdAt: future })
  })
})

describe('listReminderWatches', () => {
  it('keeps an archived reminder and pauses a trashed one', async () => {
    const db = await open()
    const archivedId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    const trashedId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
    const archived = note({ id: archivedId, isArchived: true, currentVersionId: `${archivedId}-v` })
    const trashed = note({ id: trashedId, trashedAt: at, currentVersionId: `${trashedId}-v` })
    await seed(db, archived)
    await seed(db, trashed)
    await db.put('reminders', reminder(future, { noteId: archivedId }))
    await db.put('reminders', reminder(later, { noteId: trashedId }))

    expect(await listReminderWatches(db, at)).toEqual([
      { noteId: archivedId, fireAt: future, title: 'Shopping', paused: false, missed: false },
      { noteId: trashedId, fireAt: later, title: 'Shopping', paused: true, missed: false },
    ])
  })
})
