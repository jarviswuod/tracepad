import { StrictMode, useLayoutEffect, useState, type ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { deleteDB } from 'idb'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter, Router, UNSAFE_createMemoryHistory, useLocation } from 'react-router-dom'
import { AppHeader } from '../../app/AppShell'
import { AppRoutes } from '../../app/AppRoutes'
import { openTracepadDb, type TracepadDatabase } from '../../data/db'
import type { Note, NoteVersion } from '../../domain/types'

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

function typeQuery(value: string) {
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search' }), { target: { value } })
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

  it('covers every other note from Archive and Trash, and still leaves trash out', async () => {
    const db = await open()
    await store(db, note('market'), { title: 'Market', body: 'Fresh apples' })
    await store(db, note('kitchen'), { title: 'Kitchen', body: 'Berries' })
    await store(db, note('bin', { trashedAt: now }), { title: 'Bin', body: 'Rotten apples' })

    await renderHome(db)
    const nav = screen.getByRole('navigation', { name: 'Views' })
    fireEvent.click(within(nav).getByRole('button', { name: 'Archive' }))
    await screen.findByText('Take a note', { selector: '.empty-state' })

    typeQuery('berries')
    expect(await screen.findByRole('button', { name: 'Kitchen, Berries' })).toBeInTheDocument()

    fireEvent.click(within(nav).getByRole('button', { name: 'Trash' }))
    typeQuery('apples')
    expect(await screen.findByRole('button', { name: 'Market, Fresh apples' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Bin, Rotten apples' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Restore Bin, Rotten apples' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Empty trash' })).not.toBeInTheDocument()
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
    expect(history.location.search).toBe('?text=ap')
    expect(history.index).toBe(1)

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
})
