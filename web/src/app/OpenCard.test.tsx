import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { deleteDB } from 'idb'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { openTracepadDb, type TracepadDatabase } from '../data/db'
import type { Note, NoteVersion } from '../domain/types'
import { AppRoutes } from './AppRoutes'

const opened: TracepadDatabase[] = []
const names: string[] = []

async function open() {
  const name = `tracepad-open-card-${crypto.randomUUID()}`
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

const at = '2026-11-24T12:00:00.000Z'
const noteId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const otherId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function note(id: string, overrides: Partial<Note> = {}): Note {
  return {
    id,
    userId: null,
    currentVersionId: `${id}-v`,
    isPinned: false,
    isArchived: false,
    color: null,
    trashedAt: null,
    createdAt: at,
    updatedAt: at,
    serverUpdatedAt: null,
    ...overrides,
  }
}

function version(row: Note, title: string, body: string): NoteVersion {
  return {
    id: row.currentVersionId ?? `${row.id}-v`,
    noteId: row.id,
    parentVersionId: null,
    deviceId: 'device-1',
    kind: 'text',
    title,
    body,
    checklistItems: null,
    createdAt: at,
    receivedAt: null,
  }
}

async function store(db: TracepadDatabase, row: Note, title: string, body: string) {
  await db.put('noteVersions', version(row, title, body))
  await db.put('notes', row)
}

async function renderAt(db: TracepadDatabase, path = '/') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <h1>Tracepad</h1>
      <AppRoutes db={db} />
    </MemoryRouter>,
  )
  if (path === '/') {
    await waitFor(() => expect(screen.getByRole('button', { name: 'Take a note' })).toBeEnabled())
  }
}

async function openCard(name: string) {
  const card = await screen.findByRole('button', { name })
  card.focus()
  fireEvent.click(card)
  const dialog = await screen.findByRole('dialog', { name: 'Note' })
  await within(dialog).findByLabelText('Body')
  return { card, dialog }
}

function cardSlot(id: string): HTMLElement {
  const card = document.querySelector<HTMLElement>(`.note-card[data-note-id="${id}"]`)
  if (!card?.parentElement) throw new Error(`no card ${id}`)
  return card.parentElement
}

describe('opening a card', () => {
  it('opens a saved note in the modal, hides its card in place, and keeps "Take a note"', async () => {
    const db = await open()
    await store(db, note(noteId, { color: '#fff475' }), 'Shopping', 'Milk')
    await store(db, note(otherId), 'Other', 'Stays')
    await renderAt(db)

    const { dialog } = await openCard('Shopping, Milk')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog.style.backgroundColor).toBe('rgb(255, 244, 117)')
    expect(within(dialog).getByLabelText('Title')).toHaveValue('Shopping')
    expect(within(dialog).getByLabelText('Body')).toHaveValue('Milk')
    expect(within(dialog).getByLabelText('Title')).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Take a note' })).toBeInTheDocument()
    expect(cardSlot(noteId).style.visibility).toBe('hidden')
    expect(cardSlot(otherId).style.visibility).toBe('')
  })

  it('cuts one version when an edited note is closed with Esc, and returns focus to the card', async () => {
    const db = await open()
    await store(db, note(noteId), 'Shopping', 'Milk')
    await renderAt(db)

    const { dialog } = await openCard('Shopping, Milk')
    fireEvent.change(within(dialog).getByLabelText('Body'), { target: { value: 'Milk and bread' } })
    fireEvent.keyDown(within(dialog).getByLabelText('Body'), { key: 'Escape' })

    const card = await screen.findByRole('button', { name: 'Shopping, Milk and bread' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await db.count('noteVersions')).toBe(2)
    expect(card).toHaveFocus()
    expect(cardSlot(noteId).style.visibility).toBe('')
  })

  it('cuts no version when an unchanged note is closed with the Close button', async () => {
    const db = await open()
    await store(db, note(noteId), 'Shopping', 'Milk')
    await renderAt(db)

    const { dialog } = await openCard('Shopping, Milk')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await db.count('noteVersions')).toBe(1)
    expect(await db.count('drafts')).toBe(0)
  })

  it('closes on a backdrop click as leaving the note', async () => {
    const db = await open()
    await store(db, note(noteId), 'Shopping', 'Milk')
    await renderAt(db)

    const { dialog } = await openCard('Shopping, Milk')
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Shop' } })
    const backdrop = screen.getByTestId('note-modal-backdrop')
    fireEvent.pointerDown(backdrop)
    fireEvent.mouseDown(backdrop)
    fireEvent.click(backdrop)
    expect(await screen.findByRole('button', { name: 'Shop, Milk' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await db.count('noteVersions')).toBe(2)
  })

  it('does not close on a press inside the modal, and Ctrl+S still cuts a version there', async () => {
    const db = await open()
    await store(db, note(noteId), 'Shopping', 'Milk')
    await renderAt(db)

    const { dialog } = await openCard('Shopping, Milk')
    fireEvent.change(within(dialog).getByLabelText('Body'), { target: { value: 'Milk, eggs' } })
    fireEvent.pointerDown(within(dialog).getByRole('button', { name: 'Close' }).parentElement!)
    fireEvent.pointerDown(dialog)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }))

    await waitFor(async () => expect(await db.count('noteVersions')).toBe(2))
    expect(screen.getByRole('dialog', { name: 'Note' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Body')).toHaveValue('Milk, eggs')
  })

  it('keeps "Take a note" inline with no modal', async () => {
    const db = await open()
    await renderAt(db)
    fireEvent.click(screen.getByRole('button', { name: 'Take a note' }))
    const note = await screen.findByRole('group', { name: 'Note' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(note.closest('.board-column')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Take a note' })).not.toBeInTheDocument()
  })

  it('opens an archived note in the modal from Archive', async () => {
    const db = await open()
    await store(db, note(noteId, { isArchived: true }), 'Old', 'Box')
    await renderAt(db)
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    const { dialog } = await openCard('Old, Box')
    expect(within(dialog).getByLabelText('Body')).toHaveValue('Box')
  })

  it('opens a trashed note in the modal from Trash', async () => {
    const db = await open()
    await store(db, note(noteId, { trashedAt: new Date().toISOString() }), 'Gone', 'Soon')
    await renderAt(db)
    fireEvent.click(screen.getByRole('button', { name: 'Trash' }))
    const { dialog } = await openCard('Gone, Soon')
    expect(within(dialog).getByLabelText('Title')).toHaveValue('Gone')
    expect(cardSlot(noteId).style.visibility).toBe('hidden')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Gone, Soon' })).toBeInTheDocument()
  })

  it('keeps delete inside More on an active note', async () => {
    const db = await open()
    await store(db, note(noteId), 'Shopping', 'Milk')
    await renderAt(db)

    const { dialog } = await openCard('Shopping, Milk')
    expect(within(dialog).queryByRole('button', { name: 'Move to trash' })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'More' }))
    expect(within(dialog).getByRole('menuitem', { name: 'Delete note' })).toBeInTheDocument()
    expect(within(dialog).getByRole('menuitem', { name: 'Version history' })).toBeInTheDocument()
  })

  it('restores an open trashed note, clears a matching undo, and keeps pin and color', async () => {
    const db = await open()
    await store(db, note(noteId, { isPinned: true, color: '#fff475' }), 'Shopping', 'Milk')
    await renderAt(db)

    const { dialog } = await openCard('Shopping, Milk')
    fireEvent.click(within(dialog).getByRole('button', { name: 'More' }))
    fireEvent.click(within(dialog).getByRole('menuitem', { name: 'Delete note' }))
    expect(await screen.findByRole('button', { name: 'Undo' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Trash' }))
    const opened = await openCard('Shopping, Milk')
    expect(within(opened.dialog).queryByRole('button', { name: 'Move to trash' })).not.toBeInTheDocument()
    fireEvent.click(within(opened.dialog).getByRole('button', { name: 'Restore' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
    expect(await db.get('notes', noteId)).toMatchObject({
      trashedAt: null,
      isPinned: true,
      color: '#fff475',
    })
    expect((await db.getAll('historyEvents')).map((event) => event.type).sort()).toEqual(['restored', 'trashed'])

    fireEvent.click(screen.getByRole('button', { name: 'Notes' }))
    const card = await screen.findByRole('button', { name: 'Shopping, Milk' })
    expect(screen.getByRole('heading', { name: 'Pinned' })).toBeInTheDocument()
    expect(card).toHaveAttribute('data-color', '#fff475')
  })

  it('opens a history version in the modal and closes it with Esc', async () => {
    const db = await open()
    await store(db, note(noteId, { color: '#ccff90' }), 'Shopping', 'Milk')
    await renderAt(db, `/history/${noteId}/${noteId}-v`)

    const dialog = await screen.findByRole('dialog', { name: 'Version' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog.style.backgroundColor).toBe('rgb(204, 255, 144)')
    expect(within(dialog).getByRole('article', { name: 'Old version' })).toHaveTextContent('Milk')
    expect(screen.getByRole('heading', { name: 'Shopping' })).toBeInTheDocument()

    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByRole('list', { name: 'History' })).toBeInTheDocument()
  })
})
