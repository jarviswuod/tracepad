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
  const name = `tracepad-note-layout-${crypto.randomUUID()}`
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

function todayAt(hours: number, minutes: number): string {
  const date = new Date()
  date.setHours(hours, minutes, 0, 0)
  return date.toISOString()
}

function note(overrides: Partial<Note> = {}): Note {
  const updatedAt = todayAt(15, 4)
  return {
    id: noteId,
    userId: null,
    currentVersionId: `${noteId}-v`,
    isPinned: false,
    isArchived: false,
    color: null,
    trashedAt: null,
    createdAt: updatedAt,
    updatedAt,
    serverUpdatedAt: null,
    ...overrides,
  }
}

function version(row: Note, title = 'Shopping', body = 'Milk'): NoteVersion {
  return {
    id: row.currentVersionId ?? `${row.id}-v`,
    noteId: row.id,
    parentVersionId: null,
    deviceId: 'device-1',
    kind: 'text',
    title,
    body,
    checklistItems: null,
    createdAt: row.updatedAt,
    receivedAt: null,
  }
}

async function renderHome(db: TracepadDatabase) {
  render(
    <MemoryRouter>
      <AppRoutes db={db} />
    </MemoryRouter>,
  )
  await waitFor(() => expect(screen.getByRole('button', { name: 'Take a note' })).toBeEnabled())
}

function openMenu(dialog: HTMLElement, item: string) {
  const more = within(dialog).getByRole('button', { name: 'More' })
  if (more.getAttribute('aria-expanded') === 'true') fireEvent.click(more)
  fireEvent.click(more)
  fireEvent.click(within(dialog).getByRole('menuitem', { name: item }))
}

function toolbar(dialog: HTMLElement): HTMLElement {
  const bar = dialog.querySelector('.note-modal-actions')
  expect(bar).not.toBeNull()
  return bar as HTMLElement
}

describe('open note layout', () => {
  it('puts Pin on the title line, chips and the date after the body, and Remind me, Archive, More, Close in the toolbar', async () => {
    const db = await open()
    const row = note()
    await db.put('noteVersions', version(row))
    await db.put('notes', row)
    await db.put('labels', { id: 'work', userId: null, name: 'Work', updatedAt: row.updatedAt })
    await db.put('noteLabels', { noteId, labelId: 'work', isRemoved: false, updatedAt: row.updatedAt })
    await renderHome(db)

    fireEvent.click(await screen.findByRole('button', { name: 'Shopping, Milk' }))
    const dialog = await screen.findByRole('dialog', { name: 'Note' })
    const title = within(dialog).getByLabelText('Title')
    const rowEl = title.parentElement
    expect(rowEl).toHaveClass('editor-title-row')
    expect(within(rowEl as HTMLElement).getByRole('button', { name: 'Pin' })).toBeInTheDocument()

    const body = within(dialog).getByLabelText('Body')
    const chip = await within(dialog).findByText('Work')
    const edited = within(dialog).getByText('Edited 3:04 PM')
    expect(chip).toHaveClass('note-open-chip')
    expect(body.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(chip.compareDocumentPosition(edited) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const scroller = dialog.querySelector('.note-modal-body')
    const bar = toolbar(dialog)
    expect(scroller).toContainElement(title)
    expect(scroller).toContainElement(body)
    expect(scroller).toContainElement(chip)
    expect(scroller).toContainElement(edited)
    expect(scroller?.contains(bar)).toBe(false)
    expect([...bar.querySelectorAll('button')].map((button) => button.textContent)).toEqual([
      'Remind me',
      'Archive',
      'More',
      'Close',
    ])
    expect(within(dialog).queryByRole('button', { name: 'Archive note' })).not.toBeInTheDocument()
    expect(within(dialog).queryByLabelText('Label name')).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Add label' })).not.toBeInTheDocument()
  })

  it('filters, ticks and creates labels, changes color with no history entry, and Esc closes only the menu', async () => {
    const db = await open()
    const row = note()
    await db.put('noteVersions', version(row))
    await db.put('notes', row)
    await db.put('labels', { id: 'b', userId: null, name: 'banana', updatedAt: row.updatedAt })
    await db.put('labels', { id: 'w', userId: null, name: 'Work', updatedAt: row.updatedAt })
    await renderHome(db)

    fireEvent.click(await screen.findByRole('button', { name: 'Shopping, Milk' }))
    const dialog = await screen.findByRole('dialog', { name: 'Note' })

    fireEvent.click(within(dialog).getByRole('button', { name: 'More' }))
    const menu = within(dialog).getByRole('menu', { name: 'More' })
    expect(within(menu).getByRole('menuitem', { name: 'Change labels' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Colors' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Version history' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Delete note' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(within(dialog).queryByRole('menu', { name: 'More' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Note' })).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'More' }))
    fireEvent.click(screen.getByTestId('note-modal-backdrop'))
    expect(within(dialog).queryByRole('menu', { name: 'More' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Note' })).toBeInTheDocument()

    openMenu(dialog, 'Change labels')
    const panel = within(dialog).getByRole('group', { name: 'Label note' })
    expect(within(panel).getByText('Label note')).toBeInTheDocument()
    fireEvent.change(within(panel).getByLabelText('Enter label name'), { target: { value: 'ban' } })
    expect(within(panel).getByRole('checkbox', { name: 'banana' })).toBeInTheDocument()
    expect(within(panel).queryByRole('checkbox', { name: 'Work' })).not.toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: /Create/ })).not.toBeInTheDocument()

    fireEvent.change(within(panel).getByLabelText('Enter label name'), { target: { value: 'zzz' } })
    expect(within(panel).queryByRole('checkbox')).not.toBeInTheDocument()
    fireEvent.click(within(panel).getByRole('button', { name: 'Create "zzz"' }))
    await waitFor(() => expect(within(dialog).getByRole('checkbox', { name: 'zzz' })).toBeChecked())
    expect(dialog.querySelector('.note-open-chip')).toHaveTextContent('zzz')

    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'banana' }))
    await waitFor(() => expect(within(dialog).getByRole('checkbox', { name: 'banana' })).toBeChecked())
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'banana' }))
    await waitFor(() => expect(within(dialog).getByRole('checkbox', { name: 'banana' })).not.toBeChecked())

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(within(dialog).queryByRole('group', { name: 'Label note' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Note' })).toBeInTheDocument()

    const beforeColor = await db.count('historyEvents')
    openMenu(dialog, 'Colors')
    const yellow = within(dialog).getByRole('button', { name: 'Yellow color' })
    expect(yellow).toHaveAttribute('title', 'Yellow')
    fireEvent.click(yellow)
    await waitFor(() => expect(dialog.style.backgroundColor).toBe('rgb(255, 244, 117)'))
    expect(await db.count('historyEvents')).toBe(beforeColor)
    expect((await db.get('notes', noteId))?.color).toBe('#fff475')
    expect((await db.getAll('historyEvents')).map((event) => event.type).sort()).toEqual([
      'label_added',
      'label_added',
      'label_removed',
    ])

    fireEvent.pointerDown(within(dialog).getByLabelText('Title'))
    expect(within(dialog).queryByRole('group', { name: 'Colors' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Note' })).toBeInTheDocument()
  })

  it('shows Restore and Delete forever on a trashed note, and asks before deleting forever', async () => {
    const db = await open()
    const row = note({ trashedAt: new Date().toISOString() })
    await db.put('noteVersions', version(row, 'Gone', 'Soon'))
    await db.put('notes', row)
    await renderHome(db)

    fireEvent.click(screen.getByRole('button', { name: 'Trash' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Gone, Soon' }))
    const dialog = await screen.findByRole('dialog', { name: 'Note' })
    const bar = toolbar(dialog)
    expect([...bar.querySelectorAll('button')].map((button) => button.textContent)).toEqual([
      'Restore',
      'Delete forever',
      'Close',
    ])
    expect(within(dialog).queryByRole('button', { name: 'More' })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument()

    fireEvent.click(within(bar).getByRole('button', { name: 'Delete forever' }))
    const confirm = await screen.findByRole('dialog', { name: 'Delete forever?' })
    expect(confirm).toHaveTextContent('This note will be removed.')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Delete forever?' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Note' })).toBeInTheDocument()
    expect(await db.get('notes', noteId)).toBeTruthy()

    fireEvent.click(within(bar).getByRole('button', { name: 'Delete forever' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Delete forever?' })).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('dialog', { name: 'Note' })).toBeInTheDocument()

    fireEvent.click(within(toolbar(dialog)).getByRole('button', { name: 'Delete forever' }))
    fireEvent.click(
      within(await screen.findByRole('dialog', { name: 'Delete forever?' })).getByRole('button', { name: 'Delete forever' }),
    )
    await waitFor(async () => expect(await db.get('notes', noteId)).toBeUndefined())
    expect(screen.queryByRole('dialog', { name: 'Note' })).not.toBeInTheDocument()
  })

  it('keeps Take a note inline, with Move to trash and History', async () => {
    const db = await open()
    await renderHome(db)
    fireEvent.click(screen.getByRole('button', { name: 'Take a note' }))
    const noteGroup = await screen.findByRole('group', { name: 'Note' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(noteGroup.closest('.board-column')).not.toBeNull()
    expect(within(noteGroup).getByRole('button', { name: 'Move to trash' })).toBeInTheDocument()
    expect(within(noteGroup).getByRole('button', { name: 'History' })).toBeInTheDocument()
    expect(within(noteGroup).queryByRole('button', { name: 'More' })).not.toBeInTheDocument()
    expect(within(noteGroup).queryByRole('button', { name: 'Pin' })).not.toBeInTheDocument()
  })
})
