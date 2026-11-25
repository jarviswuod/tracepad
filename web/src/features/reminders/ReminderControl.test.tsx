import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { deleteDB } from 'idb'
import { afterEach, describe, expect, it } from 'vitest'
import type { Note, NoteVersion } from '../../domain/types'
import { openTracepadDb, type TracepadDatabase } from '../../data/db'
import { datetimeLocalToIso, isoToDatetimeLocal, ReminderControl } from './ReminderControl'

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
})
