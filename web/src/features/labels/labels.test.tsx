import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { deleteDB } from 'idb'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../../app/AppRoutes'
import { openTracepadDb, type TracepadDatabase } from '../../data/db'
import type { Note, NoteVersion } from '../../domain/types'

const opened: TracepadDatabase[] = []
const names: string[] = []

async function open() {
  const name = `tracepad-labels-ui-${crypto.randomUUID()}`
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
const now = '2026-11-24T12:00:00.000Z'

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: noteId,
    userId: null,
    currentVersionId: `${noteId}-v`,
    isPinned: false,
    isArchived: false,
    color: null,
    trashedAt: null,
    createdAt: now,
    updatedAt: now,
    serverUpdatedAt: null,
    ...overrides,
  }
}

function version(row: Note): NoteVersion {
  return {
    id: row.currentVersionId ?? `${row.id}-v`,
    noteId: row.id,
    parentVersionId: null,
    deviceId: 'device-1',
    kind: 'text',
    title: 'Shopping',
    body: 'Milk',
    checklistItems: null,
    createdAt: row.updatedAt,
    receivedAt: null,
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

/** The open card is visibility:hidden, so its accessible name is empty. The slot is still in the board. */
function card(): HTMLElement {
  const node = document.querySelector<HTMLElement>('.note-card')
  expect(node).not.toBeNull()
  return node as HTMLElement
}

async function historyCounts(db: TracepadDatabase): Promise<Record<string, number>> {
  const rows = await db.getAll('historyEvents')
  const counts: Record<string, number> = {}
  for (const row of rows) counts[row.type] = (counts[row.type] ?? 0) + 1
  return counts
}

describe('pin, archive, color and labels', () => {
  it('changes the note from the card and never cuts a version for those actions', async () => {
    const db = await open()
    await db.put('noteVersions', version(note()))
    await db.put('notes', note())
    await renderHome(db)

    fireEvent.click(screen.getByRole('button', { name: 'Take a note' }))
    expect(screen.queryByRole('button', { name: /^Pin$/ })).not.toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole('heading', { name: 'Tracepad' }))
    await screen.findByRole('button', { name: 'Shopping, Milk' })

    fireEvent.click(screen.getByRole('button', { name: 'Shopping, Milk' }))
    const dialog = await screen.findByRole('dialog', { name: 'Note' })
    fireEvent.click(within(dialog).getByRole('button', { name: /^Pin$/ }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Pinned' })).toBeInTheDocument())
    expect((await db.get('notes', noteId))?.isPinned).toBe(true)
    expect(await db.count('noteVersions')).toBe(1)

    fireEvent.click(within(dialog).getByRole('button', { name: /^Unpin$/ }))
    await waitFor(async () => expect((await db.get('notes', noteId))?.isPinned).toBe(false))

    fireEvent.click(within(dialog).getByRole('button', { name: /^Yellow color$/ }))
    await waitFor(async () => expect((await db.get('notes', noteId))?.color).toBe('#fff475'))
    expect(await historyCounts(db)).toEqual({ pinned: 1, unpinned: 1 })
    expect(await db.count('noteVersions')).toBe(1)

    fireEvent.change(within(dialog).getByLabelText('Label name'), { target: { value: 'Work' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /^Add label$/ }))
    await waitFor(() => expect(within(dialog).getByRole('checkbox', { name: 'Work' })).toBeChecked())
    expect(card()).toHaveTextContent('Work')

    fireEvent.click(within(dialog).getByRole('button', { name: /^Close$/ }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /^Rename Work$/ }))
    fireEvent.change(screen.getByLabelText('Rename Work'), { target: { value: 'Job' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: /^Job$/ })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Shopping, Milk' })).toHaveTextContent('Job')
    expect(await historyCounts(db)).toEqual({ pinned: 1, unpinned: 1, label_added: 1 })

    fireEvent.click(screen.getByRole('button', { name: 'Shopping, Milk' }))
    const renamed = await screen.findByRole('dialog', { name: 'Note' })
    await waitFor(() => expect(within(renamed).getByRole('checkbox', { name: 'Job' })).toBeChecked())
    fireEvent.click(within(renamed).getByRole('checkbox', { name: 'Job' }))
    await waitFor(() => expect(within(renamed).getByRole('checkbox', { name: 'Job' })).not.toBeChecked())
    await waitFor(() => expect(card()).not.toHaveTextContent('Job'))
    fireEvent.click(within(renamed).getByRole('button', { name: /^Close$/ }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /^Delete Job$/ }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Job$/ })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Shopping, Milk' })).toBeInTheDocument()
    expect(await db.count('notes')).toBe(1)
    expect(await db.count('noteVersions')).toBe(1)
    expect(await historyCounts(db)).toEqual({ pinned: 1, unpinned: 1, label_added: 1, label_removed: 1 })

    fireEvent.click(screen.getByRole('button', { name: 'Shopping, Milk' }))
    const again = await screen.findByRole('dialog', { name: 'Note' })
    fireEvent.click(within(again).getByRole('button', { name: /^Archive note$/ }))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Shopping, Milk', hidden: true })).not.toBeInTheDocument(),
    )
    fireEvent.click(within(again).getByRole('button', { name: /^Close$/ }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /^Archive$/ }))
    expect(await screen.findByRole('button', { name: 'Shopping, Milk' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Shopping, Milk' }))
    const archived = await screen.findByRole('dialog', { name: 'Note' })
    fireEvent.click(within(archived).getByRole('button', { name: /^Unarchive note$/ }))
    await waitFor(async () => expect((await db.get('notes', noteId))?.isArchived).toBe(false))
    fireEvent.click(within(archived).getByRole('button', { name: /^Close$/ }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /^Notes$/ }))
    expect(await screen.findByRole('button', { name: 'Shopping, Milk' })).toBeInTheDocument()
    expect((await db.get('notes', noteId))?.color).toBe('#fff475')
    expect(await db.count('noteVersions')).toBe(1)
    expect(await historyCounts(db)).toEqual({
      pinned: 1,
      unpinned: 1,
      label_added: 1,
      label_removed: 1,
      archived: 1,
      unarchived: 1,
    })
  })
})
