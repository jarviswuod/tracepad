import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { deleteDB } from 'idb'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Note, NoteVersion, Reminder } from '../../domain/types'
import { openTracepadDb, type TracepadDatabase } from '../../data/db'
import { datetimeLocalToIso, isoToDatetimeLocal, ReminderControl } from './ReminderControl'
import { resetReminderAudio } from './tone'

const opened: TracepadDatabase[] = []
const names: string[] = []

async function open() {
  const name = `tracepad-reminder-control-${crypto.randomUUID()}`
  names.push(name)
  const db = await openTracepadDb(name)
  opened.push(db)
  return db
}

afterEach(async () => {
  cleanup()
  resetReminderAudio()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  opened.splice(0).forEach((db) => db.close())
  await Promise.all(names.splice(0).map((name) => deleteDB(name)))
})

const noteId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const deviceId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function note(): Note {
  return {
    id: noteId,
    userId: null,
    currentVersionId: `${noteId}-v`,
    isPinned: false,
    isArchived: false,
    color: null,
    trashedAt: null,
    createdAt: '2026-11-25T12:00:00.000Z',
    updatedAt: '2026-11-25T12:00:00.000Z',
    sortPosition: null,
    serverUpdatedAt: null,
  }
}

function version(row: Note): NoteVersion {
  return {
    id: `${row.id}-v`,
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

async function renderControl(db: TracepadDatabase) {
  const row = note()
  await db.put('noteVersions', version(row))
  await db.put('notes', row)
  render(<ReminderControl db={db} noteId={noteId} deviceId={deviceId} onChanged={() => undefined} />)
}

describe('ReminderControl', () => {
  it('refuses a past time with Pick a future time', async () => {
    const db = await open()
    await renderControl(db)

    fireEvent.click(screen.getByRole('button', { name: 'Remind me' }))
    fireEvent.change(screen.getByLabelText('Date and time'), { target: { value: '2000-01-01T00:00:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Pick a future time.')
    expect(await db.count('reminders')).toBe(0)
    expect(await db.count('outbox')).toBe(0)
  })

  it('saves a future time on the note', async () => {
    const db = await open()
    await renderControl(db)
    const soon = new Date(Date.now() + 60_000).toISOString()

    fireEvent.click(screen.getByRole('button', { name: 'Remind me' }))
    fireEvent.change(screen.getByLabelText('Date and time'), { target: { value: isoToDatetimeLocal(soon) } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('button', { name: 'Change reminder' })).toBeInTheDocument()
    const stored = await db.get('reminders', noteId)
    expect(stored?.fireAt).toBe(datetimeLocalToIso(isoToDatetimeLocal(soon)))
    expect(await db.count('historyEvents')).toBe(1)
    expect(await db.count('outbox')).toBe(1)
  })

  it('prefills three hours ahead with no seconds and stores a whole minute', async () => {
    const now = new Date(2026, 10, 25, 22, 15, 45, 500)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(now)
    const constructed: Array<{ state: AudioContextState }> = []
    class FakeAudioContext {
      state: AudioContextState = 'suspended'
      resume = () => {
        this.state = 'running'
        return Promise.resolve()
      }
      constructor() {
        constructed.push(this)
      }
    }
    vi.stubGlobal('AudioContext', FakeAudioContext)

    const db = await open()
    await renderControl(db)
    fireEvent.click(screen.getByRole('button', { name: 'Remind me' }))
    const input = screen.getByLabelText('Date and time')
    expect(input).toHaveAttribute('step', '60')
    expect(input).toHaveValue('2026-11-26T01:15')
    expect((input as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    expect(constructed).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('button', { name: 'Change reminder' })).toBeInTheDocument()
    expect(constructed).toHaveLength(1)
    expect(constructed[0]?.state).toBe('running')

    const stored = await db.get('reminders', noteId)
    const fire = new Date(stored?.fireAt ?? '')
    expect(fire.getFullYear()).toBe(2026)
    expect(fire.getMonth()).toBe(10)
    expect(fire.getDate()).toBe(26)
    expect(fire.getHours()).toBe(1)
    expect(fire.getMinutes()).toBe(15)
    expect(fire.getSeconds()).toBe(0)
    expect(fire.getMilliseconds()).toBe(0)
    expect(stored?.fireAt).toMatch(/T\d{2}:\d{2}:00\.000Z$/)
  })

  it('shows a saved reminder instead of the three-hour default', async () => {
    const now = new Date(2026, 10, 25, 22, 15, 45, 500)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(now)
    const db = await open()
    const row = note()
    await db.put('noteVersions', version(row))
    await db.put('notes', row)
    const saved = new Date(2026, 10, 26, 8, 30, 45, 250)
    const reminder: Reminder = {
      noteId,
      userId: null,
      fireAt: saved.toISOString(),
      repeatInterval: null,
      lastFiredAt: null,
      dismissedAt: null,
      pushSentAt: null,
      updatedAt: saved.toISOString(),
    }
    await db.put('reminders', reminder)
    render(<ReminderControl db={db} noteId={noteId} deviceId={deviceId} onChanged={() => undefined} />)

    expect(await screen.findByRole('button', { name: 'Change reminder' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Change reminder' }))
    const input = screen.getByLabelText('Date and time')
    expect(input).toHaveValue('2026-11-26T08:30')
    expect(input).toHaveAttribute('step', '60')
  })

  it('prefills the embedded Remind me form from the saved time or the default', async () => {
    const now = new Date(2026, 10, 25, 9, 4, 59, 900)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(now)
    const db = await open()
    const row = note()
    await db.put('noteVersions', version(row))
    await db.put('notes', row)
    const { unmount } = render(
      <ReminderControl mode="form" db={db} noteId={noteId} deviceId={deviceId} onChanged={() => undefined} />,
    )

    await waitFor(() => expect(screen.getByLabelText('Date and time')).toHaveValue('2026-11-25T12:04'))
    expect(screen.getByLabelText('Date and time')).toHaveAttribute('step', '60')
    unmount()

    const saved = new Date(2026, 11, 1, 7, 5, 12, 0)
    await db.put('reminders', {
      noteId,
      userId: null,
      fireAt: saved.toISOString(),
      repeatInterval: null,
      lastFiredAt: null,
      dismissedAt: null,
      pushSentAt: null,
      updatedAt: saved.toISOString(),
    })
    render(<ReminderControl mode="form" db={db} noteId={noteId} deviceId={deviceId} onChanged={() => undefined} />)
    await waitFor(() => expect(screen.getByLabelText('Date and time')).toHaveValue('2026-12-01T07:05'))
  })
})
