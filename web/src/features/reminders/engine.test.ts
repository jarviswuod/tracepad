import { deleteDB } from 'idb'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Note, NoteVersion, Reminder } from '../../domain/types'
import { openTracepadDb, type TracepadDatabase } from '../../data/db'
import { remindersChanged, removeReminder, setReminder } from '../../data/reminders'
import { setArchived } from '../../data/notes'
import { moveToTrash, restoreFromTrash } from '../../data/trash'
import { startReminderEngine, type ReminderEngine } from './engine'

let counter = 0
const opened: TracepadDatabase[] = []
const names: string[] = []
const stops: Array<() => void> = []

function freshName() {
  const name = `tracepad-reminder-engine-${++counter}-${crypto.randomUUID()}`
  names.push(name)
  return name
}

async function open() {
  const db = await openTracepadDb(freshName())
  opened.push(db)
  return db
}

afterEach(async () => {
  stops.splice(0).forEach((stop) => stop())
  vi.useRealTimers()
  opened.splice(0).forEach((db) => db.close())
  await Promise.all(names.splice(0).map((name) => deleteDB(name)))
})

const noteId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const deviceId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const start = Date.parse('2026-11-25T12:00:00.000Z')

function at(ms: number): string {
  return new Date(ms).toISOString()
}

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: noteId,
    userId: null,
    currentVersionId: `${noteId}-v`,
    isPinned: false,
    isArchived: false,
    color: null,
    trashedAt: null,
    createdAt: at(start),
    updatedAt: at(start),
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

async function seed(db: TracepadDatabase, row: Note = note()) {
  await db.put('noteVersions', version(row))
  await db.put('notes', row)
}

function remember(engine: ReminderEngine) {
  stops.push(engine.stop)
  return engine
}

describe('reminder engine', () => {
  let now = start
  const delivered: { kind: 'fired' | 'missed'; noteId: string }[] = []

  async function advance(ms: number) {
    now += ms
    await vi.advanceTimersByTimeAsync(ms)
  }

  function attach(db: TracepadDatabase) {
    delivered.length = 0
    now = start
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    return remember(
      startReminderEngine(db, {
        now: () => now,
        timers: {
          setTimeout: (fn, ms) => setTimeout(fn, ms),
          clearTimeout: (handle) => clearTimeout(handle),
        },
        onFired: (watch) => delivered.push({ kind: 'fired', noteId: watch.noteId }),
        onMissed: (watch) => delivered.push({ kind: 'missed', noteId: watch.noteId }),
      }),
    )
  }

  it('fires on time', async () => {
    const db = await open()
    await seed(db)
    await setReminder(db, { noteId, fireAt: at(start + 4000), deviceId, now: at(start) })
    const engine = attach(db)

    await engine.settled()
    await advance(3999)
    await engine.settled()
    expect(delivered).toEqual([])

    await advance(1)
    await engine.settled()
    expect(delivered).toEqual([{ kind: 'fired', noteId }])
    expect((await db.get('reminders', noteId))?.lastFiredAt).toBe(at(start + 4000))
    const history = await db.getAll('historyEvents')
    expect(history.map((event) => event.type)).toEqual(['reminder_set'])
  })

  it('refuses a past time', async () => {
    const db = await open()
    await seed(db)
    attach(db)

    expect(await setReminder(db, { noteId, fireAt: at(start), deviceId, now: at(start) })).toEqual({
      ok: false,
      message: 'Pick a future time.',
    })
    expect(await db.count('reminders')).toBe(0)
    expect(await db.count('historyEvents')).toBe(0)
    expect(await db.count('outbox')).toBe(0)
    expect(delivered).toEqual([])
  })

  it('re-arms when the time changes', async () => {
    const db = await open()
    await seed(db)
    await setReminder(db, { noteId, fireAt: at(start + 5000), deviceId, now: at(start) })
    const engine = attach(db)
    await engine.settled()

    expect(await setReminder(db, { noteId, fireAt: at(start + 9000), deviceId, now: at(start) })).toEqual({
      ok: true,
      changed: true,
    })
    await engine.settled()
    await advance(5000)
    await engine.settled()
    expect(delivered).toEqual([])

    await advance(4000)
    await engine.settled()
    expect(delivered).toEqual([{ kind: 'fired', noteId }])
    const history = await db.getAll('historyEvents')
    expect(history.map((event) => event.type).sort()).toEqual(['reminder_changed', 'reminder_set'])
  })

  it('cancels when the reminder is removed', async () => {
    const db = await open()
    await seed(db)
    await setReminder(db, { noteId, fireAt: at(start + 3000), deviceId, now: at(start) })
    const engine = attach(db)
    await engine.settled()

    expect(await removeReminder(db, { noteId, deviceId, now: at(start) })).toBe(true)
    await engine.settled()
    await advance(3000)
    await engine.settled()

    expect(delivered).toEqual([])
    expect(await db.count('reminders')).toBe(0)
    const history = await db.getAll('historyEvents')
    expect(history.map((event) => event.type).sort()).toEqual(['reminder_removed', 'reminder_set'])
  })

  it('pauses while the note is trashed and shows the reminder as missed after restore', async () => {
    const db = await open()
    await seed(db)
    await setReminder(db, { noteId, fireAt: at(start + 4000), deviceId, now: at(start) })
    const engine = attach(db)
    await engine.settled()

    expect(await moveToTrash(db, { noteId, deviceId, now: at(start) })).toBe(true)
    await engine.settled()
    await advance(4000)
    await engine.settled()
    expect(delivered).toEqual([])

    expect(await restoreFromTrash(db, { noteId, deviceId, now: at(start + 4000) })).toBe(true)
    await engine.settled()
    expect(delivered).toEqual([{ kind: 'missed', noteId }])
  })

  it('still fires when the note is archived', async () => {
    const db = await open()
    await seed(db)
    await setReminder(db, { noteId, fireAt: at(start + 3000), deviceId, now: at(start) })
    const engine = attach(db)
    await engine.settled()

    expect(await setArchived(db, { noteId, archived: true, deviceId, now: at(start) })).toBe(true)
    await advance(3000)
    await engine.settled()
    expect(delivered).toEqual([{ kind: 'fired', noteId }])
  })

  it('shows a missed reminder on startup and does not show it again', async () => {
    const db = await open()
    await seed(db)
    const stored: Reminder = {
      noteId,
      userId: null,
      fireAt: at(start - 60_000),
      repeatInterval: null,
      lastFiredAt: null,
      dismissedAt: null,
      pushSentAt: null,
      updatedAt: at(start - 120_000),
    }
    await db.put('reminders', stored)
    const engine = attach(db)

    await engine.settled()
    expect(delivered).toEqual([{ kind: 'missed', noteId }])
    expect((await db.get('reminders', noteId))?.lastFiredAt).toBe(at(start))

    remindersChanged()
    await engine.settled()
    expect(delivered).toEqual([{ kind: 'missed', noteId }])
  })
})
