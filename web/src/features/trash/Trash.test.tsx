import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { deleteDB } from 'idb'
import { useCallback, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../../app/AppRoutes'
import { openTracepadDb, type TracepadDatabase } from '../../data/db'
import type { Note, NoteVersion } from '../../domain/types'
import { UNDO_SNACKBAR_MS, useUndoWindow } from './TrashUi'

const opened: TracepadDatabase[] = []
const names: string[] = []

async function open() {
  const name = `tracepad-trash-ui-${crypto.randomUUID()}`
  names.push(name)
  const db = await openTracepadDb(name)
  opened.push(db)
  return db
}

afterEach(async () => {
  cleanup()
  vi.useRealTimers()
  opened.splice(0).forEach((db) => db.close())
  await Promise.all(names.splice(0).map((name) => deleteDB(name)))
})

const now = '2026-11-24T12:00:00.000Z'
const noteId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

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

async function renderHome(db: TracepadDatabase) {
  render(
    <MemoryRouter>
      <h1>Tracepad</h1>
      <AppRoutes db={db} />
    </MemoryRouter>,
  )
  await waitFor(() => expect(screen.getByRole('button', { name: 'Take a note' })).toBeEnabled())
}

async function trashOpenNote() {
  const dialog = await screen.findByRole('dialog', { name: 'Note' })
  fireEvent.click(within(dialog).getByRole('button', { name: 'More' }))
  fireEvent.click(within(dialog).getByRole('menuitem', { name: 'Delete note' }))
}

function Probe() {
  const [open, setOpen] = useState(true)
  const expire = useCallback(() => setOpen(false), [])
  useUndoWindow(open ? 'note' : null, expire)
  return <div>{open ? 'open' : 'expired'}</div>
}

describe('trash screen', () => {
  it('undoes a trash, restores pin and color, and asks before deleting forever', async () => {
    const db = await open()
    await store(db, note(noteId, { isPinned: true, color: 'yellow' }), { title: 'Shopping', body: 'Milk' })
    await renderHome(db)

    fireEvent.click(await screen.findByRole('button', { name: 'Shopping, Milk' }))
    fireEvent.change(await screen.findByLabelText('Body'), { target: { value: 'Milk and bread' } })
    await trashOpenNote()

    expect(await screen.findByRole('button', { name: 'Undo' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('button', { name: /Shopping/ })).not.toBeInTheDocument())
    const trashed = await db.get('notes', noteId)
    expect(trashed?.trashedAt).not.toBeNull()
    expect(trashed?.isPinned).toBe(true)
    expect(trashed?.color).toBe('yellow')
    expect((await db.getAll('noteVersions')).map((row) => row.body).sort()).toEqual(['Milk', 'Milk and bread'])

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    const card = await screen.findByRole('button', { name: 'Shopping, Milk and bread' })
    expect(screen.getByRole('heading', { name: 'Pinned' })).toBeInTheDocument()
    expect(card.style.backgroundColor).toBe('yellow')
    expect((await db.get('notes', noteId))?.trashedAt).toBeNull()

    fireEvent.click(card)
    await trashOpenNote()
    await screen.findByRole('button', { name: 'Undo' })
    fireEvent.click(screen.getByRole('button', { name: 'Trash' }))
    expect(await screen.findByText('30 days left')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Pinned' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Restore Shopping, Milk and bread' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Restore Shopping, Milk and bread' })).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Notes' }))
    expect(await screen.findByRole('button', { name: 'Shopping, Milk and bread' })).toHaveAttribute(
      'data-color',
      'yellow',
    )
    expect(await db.count('noteVersions')).toBe(2)

    fireEvent.click(screen.getByRole('button', { name: 'Shopping, Milk and bread' }))
    await trashOpenNote()
    await screen.findByRole('button', { name: 'Undo' })
    fireEvent.click(screen.getByRole('button', { name: 'Trash' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Shopping, Milk and bread forever' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Delete forever?')
    expect(await db.get('notes', noteId)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await db.get('notes', noteId)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Delete Shopping, Milk and bread forever' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete forever' }))
    await waitFor(() => expect(screen.queryByText('30 days left')).not.toBeInTheDocument())
    expect(await db.get('notes', noteId)).toBeUndefined()
    expect(await db.count('noteVersions')).toBe(0)
    expect(await db.count('historyEvents')).toBe(0)
  })

  it('asks before emptying the trash and leaves notes that are not trashed', async () => {
    const db = await open()
    const trashedAt = new Date().toISOString()
    await store(db, note('keep'), { title: 'Keep', body: 'Stay' })
    await store(db, note('one', { trashedAt }), { title: 'One', body: 'A' })
    await store(db, note('two', { trashedAt }), { title: 'Two', body: 'B' })
    await renderHome(db)

    fireEvent.click(screen.getByRole('button', { name: 'Trash' }))
    expect(await screen.findByRole('button', { name: 'One, A' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Two, B' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Empty trash' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Empty trash?')
    expect(await db.count('notes')).toBe(3)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'One, A' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Empty trash' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Empty trash' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'One, A' })).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Two, B' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Notes' }))
    expect(await screen.findByRole('button', { name: 'Keep, Stay' })).toBeInTheDocument()
    expect(await db.count('notes')).toBe(1)
  })

  it('drops an empty note without an undo snackbar', async () => {
    const db = await open()
    await renderHome(db)
    fireEvent.click(screen.getByRole('button', { name: 'Take a note' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Move to trash' }))
    expect(await screen.findByRole('button', { name: 'Take a note' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
    expect(await db.count('notes')).toBe(0)
  })

  it('hides undo after a few seconds', async () => {
    expect(UNDO_SNACKBAR_MS).toBe(5000)
    vi.useFakeTimers()
    render(<Probe />)
    expect(screen.getByText('open')).toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UNDO_SNACKBAR_MS - 1)
    })
    expect(screen.getByText('open')).toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(screen.getByText('expired')).toBeInTheDocument()
  })
})
