import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { deleteDB } from 'idb'
import { afterEach, describe, expect, it } from 'vitest'
import type { HistoryEvent, Note, NoteVersion } from '../../domain/types'
import { openTracepadDb, type TracepadDatabase } from '../../data/db'
import { NotesHome } from '../editor/NotesHome'
import { formatHistoryTime } from './timeline'

const opened: TracepadDatabase[] = []
const names: string[] = []

async function open() {
  const name = `tracepad-history-ui-${crypto.randomUUID()}`
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

const deviceId = 'device-1'
const noteId = 'note-1'
const olderAt = '2026-11-24T10:00:00.000Z'
const eventAt = '2026-11-24T11:00:00.000Z'
const newerAt = '2026-11-24T12:00:00.000Z'
const color = '#f28b82'

function version(id: string, createdAt: string, body: string, parentVersionId: string | null): NoteVersion {
  return {
    id,
    noteId,
    parentVersionId,
    deviceId,
    kind: 'text',
    title: 'Groceries',
    body,
    checklistItems: null,
    createdAt,
    receivedAt: null,
  }
}

function note(currentVersionId: string): Note {
  return {
    id: noteId,
    userId: null,
    currentVersionId,
    isPinned: false,
    isArchived: false,
    color,
    trashedAt: null,
    createdAt: olderAt,
    updatedAt: newerAt,
    serverUpdatedAt: null,
  }
}

function pinnedEvent(): HistoryEvent {
  return {
    id: 'e-pin',
    noteId,
    deviceId: 'phone-device',
    type: 'pinned',
    payload: null,
    occurredAt: eventAt,
  }
}

async function renderNote() {
  const db = await open()
  await db.put('localSyncState', { deviceId, userId: null, bookmark: 0, lastSyncAt: null })
  await db.put('noteVersions', version('v-old', olderAt, 'alpha', null))
  await db.put('noteVersions', version('v-new', newerAt, 'beta', 'v-old'))
  await db.put('historyEvents', pinnedEvent())
  await db.put('notes', note('v-new'))
  render(
    <>
      <h1>Tracepad</h1>
      <NotesHome db={db} />
    </>,
  )
  fireEvent.click(await screen.findByRole('button', { name: 'Groceries, beta' }))
  fireEvent.click(await screen.findByRole('button', { name: 'History' }))
  return db
}

describe('history screen', () => {
  it('shows a mixed timeline newest first, with time and device, and no color', async () => {
    await renderNote()

    const list = await screen.findByRole('list', { name: 'History' })
    const items = within(list).getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('beta'),
      expect.stringContaining('Pinned'),
      expect.stringContaining('alpha'),
    ])
    expect(items[0]).toHaveTextContent(formatHistoryTime(newerAt))
    expect(items[0]).toHaveTextContent('This device')
    expect(items[1]).toHaveTextContent('phone-device')
    expect(items[1]).toHaveTextContent(formatHistoryTime(eventAt))
    expect(list).not.toHaveTextContent(/color/i)
    expect(list).not.toHaveTextContent(color)
    expect(screen.getByRole('button', { name: 'Compare' })).toBeDisabled()
  })

  it('opens an old version read-only and compares two versions', async () => {
    await renderNote()
    await screen.findByRole('list', { name: 'History' })

    fireEvent.click(screen.getByRole('button', { name: 'Open Groceries: alpha' }))
    const old = screen.getByRole('article', { name: 'Old version' })
    expect(old).toHaveTextContent('Read-only')
    expect(within(old).getByLabelText('Title')).toHaveValue('Groceries')
    expect(within(old).getByLabelText('Title')).toHaveAttribute('readonly')
    expect(within(old).getByLabelText('Body')).toHaveValue('alpha')
    expect(within(old).getByLabelText('Body')).toHaveAttribute('readonly')
    expect(old).not.toHaveTextContent(color)

    fireEvent.click(screen.getByRole('button', { name: 'Back to history' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Groceries: beta' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Groceries: alpha' }))
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }))

    const older = screen.getByRole('region', { name: 'Older version' })
    const newer = screen.getByRole('region', { name: 'Newer version' })
    expect(older.querySelector('.diff-removed')).toHaveTextContent('alpha')
    expect(newer.querySelector('.diff-added')).toHaveTextContent('beta')
    expect(older.querySelector('.diff-added')).toBeNull()
    expect(newer.querySelector('.diff-removed')).toBeNull()
    expect(older).not.toHaveTextContent(color)
    expect(newer).not.toHaveTextContent(color)
  })
})
