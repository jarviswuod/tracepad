import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { deleteDB } from 'idb'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../app/AppRoutes'
import { openTracepadDb, type TracepadDatabase } from '../data/db'
import type { Note, NoteVersion } from '../domain/types'
import { ReminderControl } from '../features/reminders/ReminderControl'

const opened: TracepadDatabase[] = []
const names: string[] = []

async function open() {
  const name = `tracepad-icons-${crypto.randomUUID()}`
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
    sortPosition: null,
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
      <h1>Tracepad</h1>
      <AppRoutes db={db} />
    </MemoryRouter>,
  )
  await waitFor(() => expect(screen.getByRole('button', { name: 'Take a note' })).toBeEnabled())
}

/** The button keeps its name, shows a 24px currentColor icon, and no visible word. */
function expectIconOnly(element: HTMLElement, name: string) {
  expect(element).toHaveAccessibleName(name)
  expect(element).toHaveAttribute('title', name)
  const svg = element.querySelector('svg')
  expect(svg).not.toBeNull()
  expect(element.querySelectorAll('svg')).toHaveLength(1)
  expect(svg).toHaveAttribute('width', '24')
  expect(svg).toHaveAttribute('height', '24')
  expect(svg?.querySelector('path')).toHaveAttribute('fill', 'currentColor')
  expect(element.textContent?.trim() ?? '').toBe('')
}

/** A side-list row keeps its name, shows a 24px icon, and shows that name beside the icon. */
function expectSideLink(element: HTMLElement, name: string) {
  expect(element).toHaveAccessibleName(name)
  expect(element).toHaveAttribute('title', name)
  expect(element).toHaveClass('side-link')
  const svg = element.querySelector('svg')
  expect(svg).not.toBeNull()
  expect(element.querySelectorAll('svg')).toHaveLength(1)
  expect(svg).toHaveAttribute('width', '24')
  expect(svg).toHaveAttribute('height', '24')
  expect(svg?.querySelector('path')).toHaveAttribute('fill', 'currentColor')
  expect(element.querySelector('.side-link-name')).toHaveTextContent(name)
}

describe('Keep icons', () => {
  it('draws the side list, layout toggle, and edit-labels delete as icons', async () => {
    const db = await open()
    const row = note()
    await db.put('labels', { id: 'work', userId: null, name: 'Work', updatedAt: row.updatedAt })
    await renderHome(db)

    const nav = screen.getByRole('navigation', { name: 'Views' })
    expectSideLink(within(nav).getByRole('button', { name: 'Notes' }), 'Notes')
    expectSideLink(within(nav).getByRole('button', { name: 'Reminders' }), 'Reminders')
    expectSideLink(within(nav).getByRole('button', { name: 'Archive' }), 'Archive')
    expectSideLink(within(nav).getByRole('button', { name: 'Trash' }), 'Trash')
    expectSideLink(within(nav).getByRole('button', { name: 'Work' }), 'Work')
    expectSideLink(within(nav).getByRole('button', { name: 'Edit labels' }), 'Edit labels')
    expect(within(nav).getByRole('button', { name: 'Notes' })).toHaveAttribute('aria-current', 'page')

    expectIconOnly(screen.getByRole('button', { name: 'Grid' }), 'Grid')
    expectIconOnly(screen.getByRole('button', { name: 'List' }), 'List')
    expect(screen.getByRole('button', { name: 'Grid' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(within(nav).getByRole('button', { name: 'Edit labels' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit labels' })
    const remove = within(dialog).getByRole('button', { name: 'Delete Work', hidden: true })
    expectIconOnly(remove, 'Delete Work')
    const done = within(dialog).getByRole('button', { name: 'Done' })
    expect(done.querySelector('svg')).toBeNull()
    expect(done).toHaveTextContent('Done')
  })

  it('draws pin, remind, archive, more, and the other note actions as icons', async () => {
    const db = await open()
    await renderHome(db)

    fireEvent.click(screen.getByRole('button', { name: 'Take a note' }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Shopping' } })
    fireEvent.change(screen.getByLabelText('Body'), { target: { value: 'Milk\nBread' } })

    const show = screen.getByRole('button', { name: 'Show checkboxes' })
    expectIconOnly(show, 'Show checkboxes')
    fireEvent.click(show)

    await screen.findByRole('checkbox', { name: 'Tick Milk' })
    expectIconOnly(screen.getByRole('button', { name: 'Hide checkboxes' }), 'Hide checkboxes')
    expectIconOnly(screen.getByRole('button', { name: 'Add item' }), 'Add item')
    expectIconOnly(screen.getByRole('button', { name: 'Move Milk up' }), 'Move Milk up')
    expectIconOnly(screen.getByRole('button', { name: 'Move Bread up' }), 'Move Bread up')
    expectIconOnly(screen.getByRole('button', { name: 'Move Milk down' }), 'Move Milk down')
    expectIconOnly(screen.getByRole('button', { name: 'Move Bread down' }), 'Move Bread down')
    expectIconOnly(screen.getByRole('button', { name: 'Remove Milk' }), 'Remove Milk')
    expectIconOnly(screen.getByRole('button', { name: 'Remove Bread' }), 'Remove Bread')
    const checklist = screen.getByRole('list', { name: 'Checklist' })
    expect(checklist.textContent ?? '').not.toMatch(/\bUp\b/)
    expect(checklist.textContent ?? '').not.toMatch(/\bDown\b/)

    fireEvent.click(screen.getByRole('button', { name: 'Move Bread up' }))
    expect(screen.getAllByRole('checkbox').map((box) => box.getAttribute('aria-label'))).toEqual([
      'Tick Bread',
      'Tick Milk',
    ])

    expectIconOnly(screen.getByRole('button', { name: 'More' }), 'More')
    expectIconOnly(screen.getByRole('button', { name: 'Move to trash' }), 'Move to trash')
    expectIconOnly(screen.getByRole('button', { name: 'History' }), 'History')

    fireEvent.pointerDown(screen.getByRole('heading', { name: 'Tracepad' }))
    fireEvent.click(await screen.findByRole('button', { name: /Shopping/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Note' })

    expectIconOnly(within(dialog).getByRole('button', { name: 'Pin' }), 'Pin')
    expectIconOnly(within(dialog).getByRole('button', { name: 'More' }), 'More')
    expectIconOnly(within(dialog).getByRole('button', { name: 'Close' }), 'Close')
    expectIconOnly(within(dialog).getByRole('button', { name: 'Move Bread up' }), 'Move Bread up')

    fireEvent.click(within(dialog).getByRole('button', { name: 'More' }))
    const menu = within(dialog).getByRole('menu', { name: 'More' })
    expectIconOnly(within(menu).getByRole('menuitem', { name: 'Remind me' }), 'Remind me')
    expectIconOnly(within(menu).getByRole('menuitem', { name: 'Archive' }), 'Archive')
    expectIconOnly(within(menu).getByRole('menuitem', { name: 'Change labels' }), 'Change labels')
    expectIconOnly(within(menu).getByRole('menuitem', { name: 'Colors' }), 'Colors')
    expectIconOnly(within(menu).getByRole('menuitem', { name: 'Version history' }), 'Version history')
    expectIconOnly(within(menu).getByRole('menuitem', { name: 'Delete note' }), 'Delete note')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Pin' }))
    await waitFor(() => expectIconOnly(within(dialog).getByRole('button', { name: 'Unpin' }), 'Unpin'))

    fireEvent.click(within(dialog).getByRole('button', { name: 'More' }))
    fireEvent.click(within(dialog).getByRole('menuitem', { name: 'Archive' }))
    await waitFor(() => expect(within(dialog).queryByRole('menu', { name: 'More' })).not.toBeInTheDocument())
    fireEvent.click(within(dialog).getByRole('button', { name: 'More' }))
    await waitFor(() =>
      expectIconOnly(within(dialog).getByRole('menuitem', { name: 'Unarchive' }), 'Unarchive'),
    )
  })

  it('draws restore and delete forever as icons on a trashed note', async () => {
    const db = await open()
    const row = note({ trashedAt: new Date().toISOString() })
    await db.put('noteVersions', version(row, 'Gone', 'Soon'))
    await db.put('notes', row)
    await renderHome(db)

    fireEvent.click(screen.getByRole('button', { name: 'Trash' }))
    expectIconOnly(await screen.findByRole('button', { name: 'Restore Gone, Soon' }), 'Restore Gone, Soon')
    expectIconOnly(screen.getByRole('button', { name: 'Delete Gone, Soon forever' }), 'Delete Gone, Soon forever')

    fireEvent.click(screen.getByRole('button', { name: 'Gone, Soon' }))
    const dialog = await screen.findByRole('dialog', { name: 'Note' })
    expectIconOnly(within(dialog).getByRole('button', { name: 'Restore' }), 'Restore')
    expectIconOnly(within(dialog).getByRole('button', { name: 'Delete forever' }), 'Delete forever')
    expectIconOnly(within(dialog).getByRole('button', { name: 'Close' }), 'Close')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete forever' }))
    const confirm = await screen.findByRole('dialog', { name: 'Delete forever?' })
    const confirmDelete = within(confirm).getByRole('button', { name: 'Delete forever' })
    expect(confirmDelete.querySelector('svg')).toBeNull()
    expect(confirmDelete).toHaveTextContent('Delete forever')
  })

  it('draws the remind button as an icon', async () => {
    const db = await open()
    render(<ReminderControl db={db} noteId={noteId} deviceId="device-1" onChanged={() => undefined} />)
    expectIconOnly(screen.getByRole('button', { name: 'Remind me' }), 'Remind me')
  })
})
