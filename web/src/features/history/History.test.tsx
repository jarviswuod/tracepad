import { StrictMode, useLayoutEffect, useState, type ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { deleteDB } from 'idb'
import { MemoryRouter, Router, UNSAFE_createMemoryHistory } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { AppRoutes } from '../../app/AppRoutes'
import type { HistoryEvent, Label, Note, NoteVersion } from '../../domain/types'
import { openTracepadDb, type TracepadDatabase } from '../../data/db'
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

function version(
  id: string,
  createdAt: string,
  body: string,
  parentVersionId: string | null,
  title = 'Groceries',
): NoteVersion {
  return {
    id,
    noteId,
    parentVersionId,
    deviceId,
    kind: 'text',
    title,
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

const workLabel: Label = {
  id: 'label-work',
  userId: null,
  name: 'Work',
  updatedAt: olderAt,
}

async function seed(newerTitle = 'Groceries') {
  const db = await open()
  await db.put('localSyncState', { deviceId, userId: null, bookmark: 0, lastSyncAt: null })
  await db.put('noteVersions', version('v-old', olderAt, 'alpha', null))
  await db.put('noteVersions', version('v-new', newerAt, 'beta', 'v-old', newerTitle))
  await db.put('historyEvents', pinnedEvent())
  await db.put('notes', note('v-new'))
  await db.put('labels', workLabel)
  return db
}

function renderAt(db: TracepadDatabase, path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <h1>Tracepad</h1>
      <AppRoutes db={db} />
    </MemoryRouter>,
  )
}

type MemoryHistory = ReturnType<typeof UNSAFE_createMemoryHistory>

/** Keeps one memory history alive so a remount behaves like a browser refresh. */
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

async function historyList() {
  return screen.findByRole('list', { name: 'History' })
}

function entryTexts(list: HTMLElement): string[] {
  return within(list)
    .getAllByRole('listitem')
    .map((item) => item.textContent ?? '')
}

describe('history page', () => {
  it('opens from the editor in the board’s place, keeping the side list and putting the title in the take-a-note spot', async () => {
    const db = await seed()
    renderAt(db, '/')
    fireEvent.click(await screen.findByRole('button', { name: 'Groceries, beta' }))
    fireEvent.change(await screen.findByLabelText('Body'), { target: { value: 'gamma' } })
    fireEvent.click(screen.getByRole('button', { name: 'History' }))

    const list = await historyList()
    // Leaving the editor for history cuts the typed text as a version first.
    expect(within(list).getByRole('button', { name: 'Groceries, gamma' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Note' })).toBeNull()

    const nav = screen.getByRole('navigation', { name: 'Views' })
    for (const name of ['Notes', 'Reminders', 'Archive', 'Trash', 'Work']) {
      expect(within(nav).getByRole('button', { name })).toBeInTheDocument()
    }
    expect(within(nav).getByRole('list', { name: 'Labels' })).toBeInTheDocument()

    expect(screen.queryByRole('button', { name: 'Take a note' })).toBeNull()
    const title = screen.getByRole('heading', { name: 'Groceries' })
    expect(title).toHaveClass('take-note')
    expect(title.parentElement).toHaveClass('board-column')
    expect(title.parentElement?.firstElementChild).toBe(title)
  })

  it('falls back like a board card when the current title is empty', async () => {
    const db = await seed('')
    renderAt(db, `/history/${noteId}`)
    await historyList()
    expect(document.querySelector('.history-title')).toHaveTextContent('beta')
  })

  it('shows versions as board cards with small entries between them, newest first, then oldest first', async () => {
    const db = await seed()
    renderAt(db, `/history/${noteId}`)
    const list = await historyList()

    expect(list).toHaveClass('board-cards')
    expect(screen.getByLabelText('Sort')).toHaveValue('newest')
    expect(entryTexts(list)).toEqual([
      expect.stringContaining('beta'),
      expect.stringContaining('Pinned'),
      expect.stringContaining('alpha'),
    ])

    const newest = within(list).getByRole('button', { name: 'Groceries, beta' })
    expect(newest).toHaveClass('note-card')
    expect(newest).toHaveStyle({ backgroundColor: color })
    expect(within(newest).getByText('Groceries')).toHaveClass('note-title')
    expect(within(newest).getByText('beta')).toHaveClass('note-preview')

    const items = within(list).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent(formatHistoryTime(newerAt))
    expect(items[0]).toHaveTextContent('This device')
    expect(items[1]).toHaveClass('history-event')
    expect(items[1]).toHaveTextContent('phone-device')
    expect(items[1]).toHaveTextContent(formatHistoryTime(eventAt))
    expect(within(items[1]).queryByRole('button')).toBeNull()

    expect(list).not.toHaveTextContent(/color/i)
    expect(list).not.toHaveTextContent(color)
    expect(screen.queryByRole('button', { name: /^Open/ })).toBeNull()
    expect(screen.queryByText(/Read-only/i)).toBeNull()
    expect(screen.getByRole('button', { name: 'Compare' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'oldest' } })
    expect(entryTexts(list)).toEqual([
      expect.stringContaining('alpha'),
      expect.stringContaining('Pinned'),
      expect.stringContaining('beta'),
    ])
  })

  it('opens in the board’s current layout and toggles grid and list', async () => {
    const db = await seed()
    renderAt(db, '/')
    fireEvent.click(await screen.findByRole('button', { name: 'List' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Groceries, beta' }))
    fireEvent.click(await screen.findByRole('button', { name: 'History' }))

    const list = await historyList()
    expect(list).toHaveAttribute('data-layout', 'list')
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Grid' }))
    expect(list).toHaveAttribute('data-layout', 'grid')
    expect(screen.getByRole('button', { name: 'Grid' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('opens a version by clicking its card, as plain text in the note modal, then goes back', async () => {
    const db = await seed()
    renderAt(db, `/history/${noteId}`)
    const list = await historyList()

    fireEvent.click(within(list).getByRole('button', { name: 'Groceries, alpha' }))
    const old = await screen.findByRole('article', { name: 'Old version' })
    expect(old).toHaveClass('editor')
    expect(screen.getByRole('dialog', { name: 'Version' })).toContainElement(old)
    const [title, body] = Array.from(old.querySelectorAll('p'))
    expect(title).toHaveTextContent('Groceries')
    expect(body).toHaveTextContent('alpha')
    expect(within(old).queryByRole('textbox')).toBeNull()
    expect(old.querySelector('[contenteditable="true"]')).toBeNull()
    expect(old).not.toHaveTextContent(/Read-only/i)
    expect(old).not.toHaveTextContent(color)
    expect(screen.getByRole('heading', { name: 'Groceries' })).toBeInTheDocument()

    fireEvent.click(within(old).getByRole('button', { name: 'Back to history' }))
    await waitFor(() => expect(screen.queryByRole('article', { name: 'Old version' })).toBeNull())
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Groceries' })).toBeInTheDocument()
  })

  it('opens an old version straight from its address', async () => {
    const db = await seed()
    renderAt(db, `/history/${noteId}/v-old`)
    const old = await screen.findByRole('article', { name: 'Old version' })
    expect(old).toHaveTextContent('alpha')
    expect(within(old).queryByRole('textbox')).toBeNull()
    expect(await historyList()).toBeInTheDocument()
  })

  it('compares two versions in green and red', async () => {
    const db = await seed()
    renderAt(db, `/history/${noteId}`)
    await historyList()

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
    expect(screen.getByRole('navigation', { name: 'Views' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Back to history' }))
    expect(await historyList()).toBeInTheDocument()
  })

  it('side list links return to the board views', async () => {
    const db = await seed()
    renderAt(db, `/history/${noteId}`)
    await historyList()

    const nav = screen.getByRole('navigation', { name: 'Views' })
    fireEvent.click(within(nav).getByRole('button', { name: 'Archive' }))
    await waitFor(() =>
      expect(within(screen.getByRole('navigation', { name: 'Views' })).getByRole('button', { name: 'Archive' })).toHaveAttribute(
        'aria-current',
        'page',
      ),
    )
    expect(screen.getByRole('list', { name: 'Board' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'History' })).toBeNull()
  })

  it('"Back to note" reopens the note in the editor', async () => {
    const db = await seed()
    renderAt(db, `/history/${noteId}`)
    await historyList()

    fireEvent.click(screen.getByRole('button', { name: 'Back to note' }))
    expect(await screen.findByLabelText('Title')).toHaveValue('Groceries')
    expect(screen.getByLabelText('Body')).toHaveValue('beta')
  })

  it('opens the note from "Back to note" once, and a reload of that history entry does not', async () => {
    const db = await seed()
    const history = UNSAFE_createMemoryHistory({
      initialEntries: [`/history/${noteId}`],
      v5Compat: true,
    })
    function mount() {
      return render(
        <StrictMode>
          <HistoryHarness history={history}>
            <h1>Tracepad</h1>
            <AppRoutes db={db} />
          </HistoryHarness>
        </StrictMode>,
      )
    }

    const first = mount()
    await historyList()
    fireEvent.click(screen.getByRole('button', { name: 'Back to note' }))
    const dialog = await screen.findByRole('dialog', { name: 'Note' })
    expect(within(dialog).getByLabelText('Title')).toHaveValue('Groceries')
    expect(within(dialog).getByLabelText('Body')).toHaveValue('beta')
    // The browser keeps this entry across a refresh. Once the board has used it, the state must be gone.
    await waitFor(() => expect(history.location.state).toBeNull())
    expect(history.location.pathname).toBe('/')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    first.unmount()
    mount()
    await waitFor(() => {
      expect({
        open: screen.queryByRole('dialog', { name: 'Note' }) != null,
        state: history.location.state,
      }).toEqual({ open: false, state: null })
    })
    expect(await screen.findByRole('button', { name: 'Groceries, beta' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Groceries, beta' }))
    fireEvent.click(await screen.findByRole('button', { name: 'History' }))
    await historyList()
    fireEvent.click(screen.getByRole('button', { name: 'Back to note' }))
    expect(await screen.findByRole('dialog', { name: 'Note' })).toBeInTheDocument()
    expect(screen.getByLabelText('Body')).toHaveValue('beta')
  })
})
