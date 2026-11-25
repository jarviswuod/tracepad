import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { StrictMode, useLayoutEffect, useState, type ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { deleteDB } from 'idb'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter, Router, UNSAFE_createMemoryHistory, useLocation } from 'react-router-dom'
import { AppHeader } from '../../app/AppShell'
import { AppRoutes } from '../../app/AppRoutes'
import { openTracepadDb, type TracepadDatabase } from '../../data/db'
import type { Note, NoteVersion, Reminder } from '../../domain/types'

const opened: TracepadDatabase[] = []
const names: string[] = []

async function open() {
  const name = `tracepad-search-ui-${crypto.randomUUID()}`
  names.push(name)
  const db = await openTracepadDb(name)
  opened.push(db)
  return db
}

afterEach(async () => {
  cleanup()
  document.getElementById('tracepad-board-css')?.remove()
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

async function renderHome(db: TracepadDatabase, path = '/home') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppHeader />
      <AppRoutes db={db} />
    </MemoryRouter>,
  )
  await waitFor(() => expect(screen.getByRole('button', { name: 'Take a note' })).toBeEnabled())
}

type MemoryHistory = ReturnType<typeof UNSAFE_createMemoryHistory>

function HistoryHarness({ history, children }: { history: MemoryHistory; children: ReactNode }) {
  const [state, setState] = useState({ action: history.action, location: history.location })
  useLayoutEffect(
    () =>
      history.listen((update) => {
        setState({ action: update.action, location: update.location })
      }),
    [history],
  )
  return (
    <Router location={state.location} navigationType={state.action} navigator={history}>
      {children}
    </Router>
  )
}

function PathProbe() {
  const location = useLocation()
  return <div data-testid="path">{`${location.pathname}${location.search}`}</div>
}

function reminder(noteId: string): Reminder {
  return {
    noteId,
    userId: null,
    fireAt: now,
    repeatInterval: null,
    lastFiredAt: null,
    dismissedAt: null,
    pushSentAt: null,
    updatedAt: now,
  }
}

function typeQuery(value: string) {
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search' }), { target: { value } })
}

// Stylesheet imports are not applied in this test runtime, so the width check loads the real files.
const boardCssText = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../board/board.css'),
  'utf8',
)
const modalCssText = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../ui/note-modal.css'), 'utf8')

function installBoardCss() {
  if (document.getElementById('tracepad-board-css')) return
  const style = document.createElement('style')
  style.id = 'tracepad-board-css'
  style.textContent = `${boardCssText}\n${modalCssText}`
  document.head.appendChild(style)
}

function expectArchivedBar(parent: HTMLElement) {
  installBoardCss()
  const bar = parent.querySelector<HTMLElement>(':scope > .note-archived-bar')
  expect(bar).not.toBeNull()
  expect(parent.firstElementChild).toBe(bar)
  const style = getComputedStyle(bar!)
  expect(style.backgroundColor).toBe('rgb(26, 115, 232)')
  expect(style.height).toBe('3px')
  const barBox = bar!.getBoundingClientRect()
  const parentBox = parent.getBoundingClientRect()
  if (parentBox.width > 0) {
    expect(barBox.width).toBeCloseTo(parentBox.width, 0)
    expect(barBox.left).toBeCloseTo(parentBox.left, 0)
    expect(barBox.top).toBeCloseTo(parentBox.top, 0)
  }
  if (parent.classList.contains('note-modal')) {
    // No padding or border, and the bar is 100% wide, so it matches the modal.
    expect(style.width).toBe('100%')
    expect(style.boxSizing).toBe('border-box')
    const parentStyle = getComputedStyle(parent)
    expect(parentStyle.paddingLeft).toBe('0px')
    expect(parentStyle.paddingRight).toBe('0px')
    expect(parentStyle.borderLeftWidth).toBe('0px')
    expect(parentStyle.borderRightWidth).toBe('0px')
  } else {
    // The card border is 1px. Negative insets put the bar on the card's outer edge.
    expect(style.position).toBe('absolute')
    expect(style.left).toBe('-1px')
    expect(style.right).toBe('-1px')
    expect(style.top).toBe('-1px')
    const parentStyle = getComputedStyle(parent)
    expect(parentStyle.borderLeftWidth).toBe('1px')
    expect(parentStyle.borderRightWidth).toBe('1px')
    expect(parentStyle.boxSizing).toBe('border-box')
  }
}

describe('search', () => {
  it('renders the search box and switch beside Tracepad, and the board has neither', async () => {
    const db = await open()
    await renderHome(db)

    const title = screen.getByRole('heading', { level: 1, name: 'Tracepad' })
    const search = screen.getByRole('searchbox', { name: 'Search' })
    const archived = screen.getByRole('switch', { name: 'Include archived' })
    expect(title.parentElement).toContainElement(search)
    expect(title.nextElementSibling).toContainElement(search)
    expect(title.nextElementSibling).toContainElement(archived)

    const board = document.querySelector('.notes-home')
    expect(board).not.toBeNull()
    expect(within(board as HTMLElement).queryByRole('searchbox', { name: 'Search' })).not.toBeInTheDocument()
    expect(within(board as HTMLElement).queryByRole('switch', { name: 'Include archived' })).not.toBeInTheDocument()
  })

  it('matches current text, skips trash and old versions, and marks archived notes when the switch is on', async () => {
    const db = await open()
    await store(db, note('market'), { title: 'Market', body: 'Fresh apples' })
    await store(db, note('orchard', { isArchived: true }), { title: 'Orchard', body: 'Old apples' })
    await store(
      db,
      note('bin', { trashedAt: now }),
      { title: 'Bin', body: 'Rotten apples' },
    )
    await db.put('noteVersions', {
      id: 'shop-old',
      noteId: 'shop',
      parentVersionId: null,
      deviceId: 'device-1',
      kind: 'text',
      title: 'Shopping',
      body: 'secret',
      checklistItems: null,
      createdAt: '2026-11-24T08:00:00.000Z',
      receivedAt: null,
    })
    await db.put('noteVersions', {
      id: 'shop-v',
      noteId: 'shop',
      parentVersionId: 'shop-old',
      deviceId: 'device-1',
      kind: 'checklist',
      title: 'Shopping',
      body: null,
      checklistItems: [{ id: 'milk', text: 'Milk', position: 0 }],
      createdAt: now,
      receivedAt: null,
    })
    await db.put('notes', note('shop', { currentVersionId: 'shop-v' }))

    await renderHome(db)
    await screen.findByRole('button', { name: 'Market, Fresh apples' })

    typeQuery('APPLES')
    expect(screen.getByRole('button', { name: 'Market, Fresh apples' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Orchard, Old apples' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Bin, Rotten apples' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Market, Fresh apples' })).not.toHaveTextContent('Archived')

    fireEvent.click(screen.getByRole('switch', { name: 'Include archived' }))
    expect(screen.getByRole('button', { name: 'Orchard, Old apples' })).toHaveTextContent('Archived')
    expect(screen.queryByRole('button', { name: 'Bin, Rotten apples' })).not.toBeInTheDocument()

    typeQuery('secret')
    expect(await screen.findByText('No notes match', { selector: '.empty-state' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Shopping, Milk' })).not.toBeInTheDocument()

    typeQuery('milk')
    expect(await screen.findByRole('button', { name: 'Shopping, Milk' })).toBeInTheDocument()
    expect(screen.queryByText('No notes match', { selector: '.empty-state' })).not.toBeInTheDocument()
  })

  it('searches only the open label, including an archived note only when the switch is on', async () => {
    const db = await open()
    await store(db, note('market'), { title: 'Market', body: 'Fresh apples' })
    await store(db, note('kitchen'), { title: 'Kitchen', body: 'Berries' })
    await store(db, note('desk'), { title: 'Desk', body: 'Pencils' })
    await store(db, note('pantry', { isArchived: true }), { title: 'Pantry', body: 'Dried apples' })
    await db.put('labels', { id: 'home', userId: null, name: 'Home', updatedAt: now })
    await db.put('noteLabels', { noteId: 'kitchen', labelId: 'home', isRemoved: false, updatedAt: now })
    await db.put('noteLabels', { noteId: 'pantry', labelId: 'home', isRemoved: false, updatedAt: now })
    await db.put('noteLabels', { noteId: 'desk', labelId: 'home', isRemoved: true, updatedAt: now })

    await renderHome(db)
    await screen.findByRole('button', { name: 'Desk, Pencils' })
    const nav = screen.getByRole('navigation', { name: 'Views' })
    fireEvent.click(within(nav).getByRole('button', { name: 'Home' }))
    await screen.findByRole('button', { name: 'Kitchen, Berries' })

    typeQuery('pencils')
    expect(await screen.findByText('No notes match', { selector: '.empty-state' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Desk, Pencils' })).not.toBeInTheDocument()

    typeQuery('apples')
    expect(screen.queryByRole('button', { name: 'Market, Fresh apples' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pantry, Dried apples' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('switch', { name: 'Include archived' }))
    expect(await screen.findByRole('button', { name: 'Pantry, Dried apples' })).toHaveTextContent('Archived')
    expect(screen.queryByRole('button', { name: 'Market, Fresh apples' })).not.toBeInTheDocument()

    typeQuery('berries')
    expect(await screen.findByRole('button', { name: 'Kitchen, Berries' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Desk, Pencils' })).not.toBeInTheDocument()
  })

  it('searches only the notes on the open page', async () => {
    const db = await open()
    await store(db, note('market'), { title: 'Market', body: 'Fresh apples' })
    await store(db, note('kitchen'), { title: 'Kitchen', body: 'Berries' })
    await store(db, note('orchard', { isArchived: true }), { title: 'Orchard', body: 'Dried apples' })
    await store(db, note('bin', { trashedAt: now }), { title: 'Bin', body: 'Rotten apples' })
    await store(db, note('alarm'), { title: 'Alarm', body: 'Apple timer' })
    await db.put('reminders', reminder('alarm'))
    await db.put('reminders', reminder('orchard'))
    await db.put('reminders', reminder('bin'))

    await renderHome(db)
    await screen.findByRole('button', { name: 'Market, Fresh apples' })
    const nav = screen.getByRole('navigation', { name: 'Views' })

    typeQuery('apples')
    expect(screen.getByRole('button', { name: 'Market, Fresh apples' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Orchard, Dried apples' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Bin, Rotten apples' })).not.toBeInTheDocument()

    fireEvent.click(within(nav).getByRole('button', { name: 'Archive' }))
    expect(await screen.findByRole('searchbox', { name: 'Search' })).toHaveValue('')
    typeQuery('apples')
    const archived = await screen.findByRole('button', { name: 'Orchard, Dried apples' })
    expect(screen.queryByRole('button', { name: 'Market, Fresh apples' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Bin, Rotten apples' })).not.toBeInTheDocument()
    expect(archived.querySelector('.note-archived-bar')).toBeNull()
    expect(archived).not.toHaveTextContent('Archived')

    fireEvent.click(within(nav).getByRole('button', { name: 'Trash' }))
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('')
    typeQuery('apples')
    expect(await screen.findByRole('button', { name: 'Bin, Rotten apples' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Market, Fresh apples' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Orchard, Dried apples' })).not.toBeInTheDocument()

    fireEvent.click(within(nav).getByRole('button', { name: 'Reminders' }))
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('')
    typeQuery('apple')
    expect(await screen.findByRole('button', { name: 'Alarm, Apple timer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Orchard, Dried apples' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Market, Fresh apples' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Bin, Rotten apples' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Orchard, Dried apples' }).querySelector('.note-archived-bar')).toBeNull()
  })

  it('keeps each keystroke on the current page, and keeps the switch in the same address', async () => {
    const db = await open()
    await store(db, note('market'), { title: 'Market', body: 'Fresh apples' })
    const history = UNSAFE_createMemoryHistory({ initialEntries: ['/home'], v5Compat: true })
    render(
      <HistoryHarness history={history}>
        <PathProbe />
        <AppHeader />
        <AppRoutes db={db} />
      </HistoryHarness>,
    )
    await screen.findByRole('button', { name: 'Market, Fresh apples' })

    const search = screen.getByRole('searchbox', { name: 'Search' })
    fireEvent.change(search, { target: { value: 'a' } })
    fireEvent.change(search, { target: { value: 'ap' } })
    expect(history.index).toBe(0)
    expect(history.location.pathname).toBe('/home')
    expect(history.location.search).toBe('?text=ap')
    expect(search).toHaveValue('ap')
    expect(screen.getByRole('button', { name: 'Market, Fresh apples' })).toBeInTheDocument()
    expect(screen.queryByText('No notes match', { selector: '.empty-state' })).not.toBeInTheDocument()

    fireEvent.click(within(screen.getByRole('navigation', { name: 'Views' })).getByRole('button', { name: 'Archive' }))
    await waitFor(() => expect(history.location.pathname).toBe('/archive'))
    expect(history.location.search).toBe('')
    expect(history.index).toBe(1)
    expect(search).toHaveValue('')
    expect(screen.getByRole('switch', { name: 'Include archived' })).not.toBeChecked()

    fireEvent.change(search, { target: { value: 'ap' } })
    expect(history.location.pathname).toBe('/archive')
    expect(history.location.search).toBe('?text=ap')
    expect(history.index).toBe(1)
    expect(search).toHaveValue('ap')

    fireEvent.click(screen.getByRole('switch', { name: 'Include archived' }))
    expect(history.location.search).toBe('?text=ap&archived=1')
    expect(history.index).toBe(1)
    expect(screen.getByRole('switch', { name: 'Include archived' })).toBeChecked()

    fireEvent.change(search, { target: { value: '' } })
    expect(history.location.pathname).toBe('/archive')
    expect(history.location.search).toBe('?archived=1')
    expect(history.index).toBe(1)
    expect(search).toHaveValue('')

    fireEvent.click(screen.getByRole('switch', { name: 'Include archived' }))
    expect(history.location.search).toBe('')
    expect(history.location.pathname).toBe('/archive')
    expect(history.index).toBe(1)
    expect(screen.getByRole('switch', { name: 'Include archived' })).not.toBeChecked()
  })

  it('reads text and the switch from the address, and stays inside that label', async () => {
    const db = await open()
    await store(db, note('market'), { title: 'Market', body: 'Fresh apples' })
    await store(db, note('pantry', { isArchived: true }), { title: 'Pantry', body: 'Dried apples' })
    await store(db, note('desk'), { title: 'Desk', body: 'Pencils' })
    await db.put('labels', { id: 'work', userId: null, name: 'Work', updatedAt: now })
    await db.put('noteLabels', { noteId: 'pantry', labelId: 'work', isRemoved: false, updatedAt: now })

    render(
      <MemoryRouter initialEntries={['/label/Work?text=apples&archived=1']}>
        <AppHeader />
        <AppRoutes db={db} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('apples')
    expect(screen.getByRole('switch', { name: 'Include archived' })).toBeChecked()
    expect(await screen.findByRole('button', { name: 'Pantry, Dried apples' })).toHaveTextContent('Archived')
    expect(screen.queryByRole('button', { name: 'Market, Fresh apples' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Desk, Pencils' })).not.toBeInTheDocument()
  })

  it('opens Notes when you type on a history page, and further letters replace that entry', async () => {
    const db = await open()
    await store(db, note('market'), { title: 'Market', body: 'Fresh apples' })
    const history = UNSAFE_createMemoryHistory({ initialEntries: ['/history/market'], v5Compat: true })
    render(
      <StrictMode>
        <HistoryHarness history={history}>
          <AppHeader />
          <AppRoutes db={db} />
        </HistoryHarness>
      </StrictMode>,
    )
    expect(screen.getByRole('searchbox', { name: 'Search' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Tracepad' })).toBeInTheDocument()

    const search = screen.getByRole('searchbox', { name: 'Search' })
    fireEvent.change(search, { target: { value: 'a' } })
    expect(history.location.pathname).toBe('/home')
    expect(history.location.search).toBe('?text=a')
    expect(history.index).toBe(1)

    fireEvent.change(search, { target: { value: 'apples' } })
    expect(history.location.pathname).toBe('/home')
    expect(history.location.search).toBe('?text=apples')
    expect(history.index).toBe(1)
    expect(search).toHaveValue('apples')
    expect(await screen.findByRole('button', { name: 'Market, Fresh apples' })).toBeInTheDocument()
  })

  it('drops the search when opening Archive, Trash, a label, or Reminders', async () => {
    const db = await open()
    await db.put('labels', { id: 'work', userId: null, name: 'Work', updatedAt: now })
    const history = UNSAFE_createMemoryHistory({
      initialEntries: ['/home?text=apple&archived=1'],
      v5Compat: true,
    })
    render(
      <HistoryHarness history={history}>
        <AppHeader />
        <AppRoutes db={db} />
      </HistoryHarness>,
    )
    await screen.findByRole('button', { name: 'Take a note' })
    await screen.findByRole('button', { name: 'Work' })
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('apple')
    expect(screen.getByRole('switch', { name: 'Include archived' })).toBeChecked()

    const nav = screen.getByRole('navigation', { name: 'Views' })
    const pages = [
      ['Archive', '/archive'],
      ['Trash', '/trash'],
      ['Work', '/label/Work'],
      ['Reminders', '/reminders'],
    ] as const
    for (const [name, pathname] of pages) {
      history.push('/home?text=apple&archived=1')
      await waitFor(() => expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('apple'))
      expect(screen.getByRole('switch', { name: 'Include archived' })).toBeChecked()
      fireEvent.click(within(nav).getByRole('button', { name }))
      await waitFor(() => expect(history.location.pathname).toBe(pathname))
      expect(history.location.search).toBe('')
      expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('')
      expect(screen.getByRole('switch', { name: 'Include archived' })).not.toBeChecked()
    }
  })

  it('puts a blue bar across an archived search result and its open modal', async () => {
    const db = await open()
    await store(db, note('market'), { title: 'Market', body: 'Fresh apples' })
    await store(db, note('orchard', { isArchived: true }), { title: 'Orchard', body: 'Dried apples' })
    await renderHome(db)
    await screen.findByRole('button', { name: 'Market, Fresh apples' })

    typeQuery('apples')
    fireEvent.click(screen.getByRole('switch', { name: 'Include archived' }))
    const archived = await screen.findByRole('button', { name: 'Orchard, Dried apples' })
    const normal = screen.getByRole('button', { name: 'Market, Fresh apples' })
    expect(archived).toHaveTextContent('Archived')
    expect(screen.getByRole('list', { name: 'Board' })).toHaveAttribute('data-layout', 'grid')
    expectArchivedBar(archived)
    expect(normal.querySelector('.note-archived-bar')).toBeNull()
    expect(normal).not.toHaveTextContent('Archived')

    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    expect(screen.getByRole('list', { name: 'Board' })).toHaveAttribute('data-layout', 'list')
    expectArchivedBar(screen.getByRole('button', { name: 'Orchard, Dried apples' }))
    expect(screen.getByRole('button', { name: 'Market, Fresh apples' }).querySelector('.note-archived-bar')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Orchard, Dried apples' }))
    const dialog = await screen.findByRole('dialog', { name: 'Note' })
    expectArchivedBar(dialog)
  })
})
