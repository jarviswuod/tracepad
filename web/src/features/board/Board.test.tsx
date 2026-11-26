import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { deleteDB } from 'idb'
import { afterEach, describe, expect, it } from 'vitest'
import type { Note, NoteVersion, Reminder } from '../../domain/types'
import { openTracepadDb, type TracepadDatabase } from '../../data/db'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../../app/AppRoutes'

const opened: TracepadDatabase[] = []
const names: string[] = []

async function open() {
  const name = `tracepad-board-ui-${crypto.randomUUID()}`
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

const now = '2026-11-24T12:00:00.000Z'

function note(id: string, overrides: Partial<Note> = {}): Note {
  return {
    id,
    userId: null,
    currentVersionId: `${id}-v`,
    isPinned: false,
    isArchived: false,
    color: null,
    trashedAt: null,
    createdAt: now,
    updatedAt: now,
    sortPosition: null,
    serverUpdatedAt: null,
    ...overrides,
  }
}

function version(row: Note, text: { title: string; body: string }): NoteVersion {
  return {
    id: row.currentVersionId ?? `${row.id}-v`,
    noteId: row.id,
    parentVersionId: null,
    deviceId: 'device-1',
    kind: 'text',
    title: text.title,
    body: text.body,
    checklistItems: null,
    createdAt: row.updatedAt,
    receivedAt: null,
  }
}

async function store(db: TracepadDatabase, row: Note, text: { title: string; body: string }) {
  await db.put('noteVersions', version(row, text))
  await db.put('notes', row)
}

function reminder(noteId: string): Reminder {
  return {
    noteId,
    userId: null,
    fireAt: new Date().toISOString(),
    repeatInterval: null,
    lastFiredAt: null,
    dismissedAt: null,
    pushSentAt: null,
    updatedAt: new Date().toISOString(),
  }
}

async function renderHome(db: TracepadDatabase) {
  render(
    <MemoryRouter>
      <h1>Tracepad</h1>
      <AppRoutes db={db} />
    </MemoryRouter>,
  )
  await waitFor(() => expect(screen.getByRole('button', { name: 'Take a note' })).toBeEnabled())
}

function boardLabels(): string[] {
  return within(screen.getByRole('list', { name: 'Board' }))
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label') ?? '')
}

describe('board', () => {
  it('shows the side list, the take-a-note bar, and an empty state', async () => {
    const db = await open()
    await renderHome(db)

    const nav = screen.getByRole('navigation', { name: 'Views' })
    expect(within(nav).getByRole('button', { name: 'Notes' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('button', { name: 'Reminders' })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'Edit labels' })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'Archive' })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'Trash' })).toBeInTheDocument()
    expect(await screen.findByText('Take a note', { selector: '.empty-state' })).toBeInTheDocument()
    expect(screen.getByLabelText('Sort')).toHaveValue('edited')
    expect(screen.getByRole('button', { name: 'Grid' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('list', { name: 'Board' })).toHaveAttribute('data-layout', 'grid')

    fireEvent.click(within(nav).getByRole('button', { name: 'Reminders' }))
    await waitFor(() =>
      expect(within(nav).getByRole('button', { name: 'Reminders' })).toHaveAttribute('aria-current', 'page'),
    )
    expect(await screen.findByText('Take a note', { selector: '.empty-state' })).toBeInTheDocument()
  })

  it('pins first, switches sort and layout, shows color, and opens the editor', async () => {
    const db = await open()
    await store(
      db,
      note('pin', {
        isPinned: true,
        color: 'yellow',
        createdAt: '2026-11-24T08:00:00.000Z',
        updatedAt: '2026-11-24T08:00:00.000Z',
      }),
      { title: 'Pin', body: 'one' },
    )
    await store(
      db,
      note('edited', {
        createdAt: '2026-11-24T07:00:00.000Z',
        updatedAt: '2026-11-24T10:00:00.000Z',
      }),
      { title: 'Edited', body: 'two' },
    )
    await store(
      db,
      note('made', {
        createdAt: '2026-11-24T11:00:00.000Z',
        updatedAt: '2026-11-24T09:00:00.000Z',
      }),
      { title: 'Made', body: 'three' },
    )

    await renderHome(db)
    await screen.findByRole('button', { name: 'Made, three' })
    expect(boardLabels()).toEqual(['Pin, one', 'Edited, two', 'Made, three'])
    expect(screen.getByRole('heading', { name: 'Pinned' })).toBeInTheDocument()
    const pin = screen.getByRole('button', { name: 'Pin, one' })
    const edited = screen.getByRole('button', { name: 'Edited, two' })
    expect(pin.style.backgroundColor).toBe('yellow')
    expect(pin).toHaveAttribute('data-color', 'yellow')
    expect(edited).toHaveAttribute('data-color', 'default')
    expect(edited.style.backgroundColor).toBe('rgb(255, 255, 255)')
    expect(screen.getByRole('button', { name: 'Pin, one' })).toHaveTextContent('one')

    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'created' } })
    await waitFor(() => expect(boardLabels()).toEqual(['Pin, one', 'Made, three', 'Edited, two']))

    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    expect(screen.getByRole('list', { name: 'Board' })).toHaveAttribute('data-layout', 'list')
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Grid' }))
    expect(screen.getByRole('list', { name: 'Board' })).toHaveAttribute('data-layout', 'grid')

    fireEvent.click(screen.getByRole('button', { name: 'Pin, one' }))
    expect(await screen.findByLabelText('Title')).toHaveValue('Pin')
    expect(screen.getByLabelText('Body')).toHaveValue('one')
  })

  it('shows archive, trash days left, reminders, and archived notes on a label', async () => {
    const db = await open()
    const trashedAt = new Date().toISOString()
    await store(db, note('shown', { updatedAt: '2026-11-24T11:00:00.000Z' }), { title: 'Shown', body: 'a' })
    await store(
      db,
      note('old', { isArchived: true, updatedAt: '2026-11-24T10:00:00.000Z' }),
      { title: 'Old', body: 'b' },
    )
    await store(
      db,
      note('gone', { isPinned: true, trashedAt, updatedAt: '2026-11-24T09:00:00.000Z' }),
      { title: 'Gone', body: 'c' },
    )
    await db.put('labels', { id: 'work', userId: null, name: 'Work', updatedAt: now })
    await db.put('noteLabels', { noteId: 'old', labelId: 'work', isRemoved: false, updatedAt: now })
    await db.put('noteLabels', { noteId: 'gone', labelId: 'work', isRemoved: false, updatedAt: now })
    await db.put('reminders', reminder('shown'))
    await db.put('reminders', reminder('old'))
    await db.put('reminders', reminder('gone'))

    await renderHome(db)
    await screen.findByRole('button', { name: 'Shown, a' })
    expect(screen.queryByRole('button', { name: 'Old, b' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gone, c' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    await screen.findByRole('button', { name: 'Old, b' })
    expect(screen.queryByRole('button', { name: 'Shown, a' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gone, c' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Trash' }))
    await screen.findByRole('button', { name: 'Gone, c' })
    expect(screen.getByText('30 days left')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restore Gone, c' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete Gone, c forever' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete Shown, a forever' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Pinned' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Old, b' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Work$/ }))
    await screen.findByRole('button', { name: 'Old, b' })
    expect(screen.queryByRole('button', { name: 'Gone, c' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Shown, a' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reminders' }))
    await screen.findByRole('button', { name: 'Shown, a' })
    expect(screen.getByRole('button', { name: 'Old, b' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gone, c' })).not.toBeInTheDocument()
  })

  it('reveals card actions on hover or focus, and Pin does not open the note', async () => {
    const db = await open()
    await store(db, note('hover'), { title: 'Hover', body: 'me' })
    await renderHome(db)

    const card = await screen.findByRole('button', { name: 'Hover, me' })
    const frame = card.closest('.note-card-frame')
    expect(frame).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Pin' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remind me' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument()

    fireEvent.mouseEnter(frame!)
    expect(screen.getByRole('button', { name: 'Pin' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remind me' })).toBeInTheDocument()
    const more = screen.getByRole('button', { name: 'More' })
    fireEvent.click(more)
    expect(within(screen.getByRole('menu', { name: 'More' })).getAllByRole('menuitem').map((item) => item.getAttribute('aria-label'))).toEqual([
      'Archive',
      'Change labels',
      'Colors',
      'Version history',
      'Delete note',
    ])
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })

    fireEvent.mouseLeave(frame!)
    expect(screen.queryByRole('button', { name: 'Pin' })).not.toBeInTheDocument()

    fireEvent.focus(card)
    expect(screen.getByRole('button', { name: 'Pin' })).toBeInTheDocument()
    fireEvent.blur(card)
    expect(screen.queryByRole('button', { name: 'Pin' })).not.toBeInTheDocument()

    fireEvent.mouseEnter(frame!)
    fireEvent.click(screen.getByRole('button', { name: 'Pin' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Hover, me' })).toHaveAttribute('data-pinned', 'true'))
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Pinned' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Hover, me' }))
    expect(await screen.findByLabelText('Title')).toHaveValue('Hover')
  })
})
