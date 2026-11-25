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

function openNoteMenu(dialog: HTMLElement, item: string) {
  const more = within(dialog).getByRole('button', { name: 'More' })
  if (more.getAttribute('aria-expanded') === 'true') fireEvent.click(more)
  fireEvent.click(more)
  fireEvent.click(within(dialog).getByRole('menuitem', { name: item }))
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

    openNoteMenu(dialog, 'Colors')
    fireEvent.click(within(dialog).getByRole('button', { name: /^Yellow color$/ }))
    await waitFor(async () => expect((await db.get('notes', noteId))?.color).toBe('#fff475'))
    expect(await historyCounts(db)).toEqual({ pinned: 1, unpinned: 1 })
    expect(await db.count('noteVersions')).toBe(1)

    openNoteMenu(dialog, 'Change labels')
    fireEvent.change(within(dialog).getByLabelText('Enter label name'), { target: { value: 'Work' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create "Work"' }))
    await waitFor(() => expect(within(dialog).getByRole('checkbox', { name: 'Work' })).toBeChecked())
    expect(card()).toHaveTextContent('Work')

    fireEvent.click(within(dialog).getByRole('button', { name: /^Close$/ }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Edit labels' }))
    const labelsDialog = await screen.findByRole('dialog', { name: 'Edit labels' })
    fireEvent.click(within(labelsDialog).getByRole('button', { name: 'Work' }))
    fireEvent.change(within(labelsDialog).getByLabelText('Rename Work'), { target: { value: 'Job' } })
    fireEvent.keyDown(within(labelsDialog).getByLabelText('Rename Work'), { key: 'Enter' })
    await waitFor(() => expect(within(labelsDialog).getByRole('button', { name: 'Job' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Shopping, Milk' })).toHaveTextContent('Job')
    expect(await historyCounts(db)).toEqual({ pinned: 1, unpinned: 1, label_added: 1 })
    fireEvent.click(within(labelsDialog).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Shopping, Milk' }))
    const renamed = await screen.findByRole('dialog', { name: 'Note' })
    openNoteMenu(renamed, 'Change labels')
    await waitFor(() => expect(within(renamed).getByRole('checkbox', { name: 'Job' })).toBeChecked())
    fireEvent.click(within(renamed).getByRole('checkbox', { name: 'Job' }))
    await waitFor(() => expect(within(renamed).getByRole('checkbox', { name: 'Job' })).not.toBeChecked())
    await waitFor(() => expect(card()).not.toHaveTextContent('Job'))
    fireEvent.click(within(renamed).getByRole('button', { name: /^Close$/ }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Edit labels' }))
    const deleting = await screen.findByRole('dialog', { name: 'Edit labels' })
    fireEvent.click(within(deleting).getByRole('button', { name: 'Delete Job', hidden: true }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Delete label?' })).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Job$/ })).not.toBeInTheDocument())
    fireEvent.click(within(deleting).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Shopping, Milk' })).toBeInTheDocument()
    expect(await db.count('notes')).toBe(1)
    expect(await db.count('noteVersions')).toBe(1)
    expect(await historyCounts(db)).toEqual({ pinned: 1, unpinned: 1, label_added: 1, label_removed: 1 })

    fireEvent.click(screen.getByRole('button', { name: 'Shopping, Milk' }))
    const again = await screen.findByRole('dialog', { name: 'Note' })
    openNoteMenu(again, 'Archive')
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Shopping, Milk', hidden: true })).not.toBeInTheDocument(),
    )
    fireEvent.click(within(again).getByRole('button', { name: /^Close$/ }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /^Archive$/ }))
    expect(await screen.findByRole('button', { name: 'Shopping, Milk' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Shopping, Milk' }))
    const archived = await screen.findByRole('dialog', { name: 'Note' })
    openNoteMenu(archived, 'Unarchive')
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

function labelNames(dialog: HTMLElement): string[] {
  return [...dialog.querySelectorAll('.edit-label-name')].map((node) => node.textContent ?? '')
}

describe('edit labels', () => {
  it('shows label names and Edit labels, with no create form or per-label buttons', async () => {
    const db = await open()
    await db.put('labels', { id: 'work', userId: null, name: 'Work', updatedAt: now })
    await renderHome(db)

    const nav = screen.getByRole('navigation', { name: 'Views' })
    expect(within(nav).queryByRole('heading', { name: 'Labels' })).not.toBeInTheDocument()
    expect(within(nav).queryByLabelText('New label')).not.toBeInTheDocument()
    expect(within(nav).queryByRole('button', { name: 'Create label' })).not.toBeInTheDocument()
    expect(within(nav).queryByRole('button', { name: /^Rename / })).not.toBeInTheDocument()
    expect(within(nav).queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'Work' })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'Edit labels' })).toBeInTheDocument()
  })

  it('creates, renames and deletes from the dialog, and closes on Esc, the backdrop and Done', async () => {
    const db = await open()
    await db.put('noteVersions', version(note()))
    await db.put('notes', note())
    await renderHome(db)

    fireEvent.click(screen.getByRole('button', { name: 'Edit labels' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit labels' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(document.documentElement.style.overflow).toBe('hidden')
    expect(within(dialog).getByLabelText('Create new label')).toHaveFocus()

    const input = within(dialog).getByLabelText('Create new label')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(input).toHaveValue('   ')
    expect(dialog.querySelectorAll('.edit-label-name')).toHaveLength(0)

    fireEvent.change(input, { target: { value: 'Temp' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(input).toHaveValue('')
    expect(within(dialog).queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()

    fireEvent.change(input, { target: { value: 'Work' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(labelNames(dialog)).toEqual(['Work']))
    expect(input).toHaveValue('')

    fireEvent.change(input, { target: { value: 'work' } })
    fireEvent.submit(input.closest('form') as HTMLFormElement)
    fireEvent.change(input, { target: { value: 'Home' } })
    fireEvent.submit(input.closest('form') as HTMLFormElement)
    await waitFor(() => expect(labelNames(dialog)).toEqual(['Home', 'Work']))

    fireEvent.click(within(dialog).getByRole('button', { name: 'Work' }))
    const rename = within(dialog).getByLabelText('Rename Work')
    fireEvent.change(rename, { target: { value: 'Nope' } })
    fireEvent.keyDown(rename, { key: 'Escape' })
    expect(screen.getByRole('dialog', { name: 'Edit labels' })).toBeInTheDocument()
    expect(labelNames(dialog)).toEqual(['Home', 'Work'])

    fireEvent.click(within(dialog).getByRole('button', { name: 'Work' }))
    fireEvent.change(within(dialog).getByLabelText('Rename Work'), { target: { value: 'Job' } })
    fireEvent.blur(within(dialog).getByLabelText('Rename Work'))
    await waitFor(() => expect(labelNames(dialog)).toEqual(['Home', 'Job']))
    const side = within(screen.getByRole('navigation', { name: 'Views' })).getByRole('list', { name: 'Labels' })
    expect(within(side).getByRole('button', { name: 'Job' })).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete Job', hidden: true }))
    const confirm = await screen.findByRole('dialog', { name: 'Delete label?' })
    expect(confirm).toHaveTextContent(
      "We'll delete this label and remove it from all of your notes. Your notes won't be deleted.",
    )
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Delete label?' })).not.toBeInTheDocument()
    expect(labelNames(dialog)).toEqual(['Home', 'Job'])

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete Job', hidden: true }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Delete label?' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Edit labels' })).toBeInTheDocument()
    expect(labelNames(dialog)).toEqual(['Home', 'Job'])

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete Job', hidden: true }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Delete label?' })).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(labelNames(dialog)).toEqual(['Home']))
    expect(screen.getByRole('button', { name: 'Shopping, Milk' })).toBeInTheDocument()
    expect(await db.count('notes')).toBe(1)

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(document.documentElement.style.overflow).toBe('')

    fireEvent.click(screen.getByRole('button', { name: 'Edit labels' }))
    const again = await screen.findByRole('dialog', { name: 'Edit labels' })
    fireEvent.click(screen.getByTestId('note-modal-backdrop'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Edit labels' }))
    const done = await screen.findByRole('dialog', { name: 'Edit labels' })
    fireEvent.click(within(done).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(again).not.toBeInTheDocument()
  })

  it('uses the same order in the side list and the note label picker', async () => {
    const db = await open()
    await db.put('noteVersions', version(note()))
    await db.put('notes', note())
    await db.put('labels', { id: 'c', userId: null, name: 'banana', updatedAt: now })
    await db.put('labels', { id: 'a', userId: null, name: '1. 10', updatedAt: now })
    await db.put('labels', { id: 'b', userId: null, name: '1. 9', updatedAt: now })
    await renderHome(db)

    const nav = screen.getByRole('navigation', { name: 'Views' })
    const side = within(await within(nav).findByRole('list', { name: 'Labels' }))
      .getAllByRole('button')
      .map((button) => button.textContent)
    expect(side).toEqual(['1. 9', '1. 10', 'banana', 'Edit labels'])

    fireEvent.click(screen.getByRole('button', { name: 'Shopping, Milk' }))
    const noteDialog = await screen.findByRole('dialog', { name: 'Note' })
    openNoteMenu(noteDialog, 'Change labels')
    expect(
      within(noteDialog)
        .getAllByRole('checkbox')
        .map((box) => box.closest('label')?.textContent?.trim()),
    ).toEqual(['1. 9', '1. 10', 'banana'])
  })
})
