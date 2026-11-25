import { StrictMode, useLayoutEffect, useState, type ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { deleteDB } from 'idb'
import { useLocation, MemoryRouter, Router, UNSAFE_createMemoryHistory } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import type { Note, NoteVersion } from '../domain/types'
import { openTracepadDb, type TracepadDatabase } from '../data/db'
import { labelNameFromPath, labelPath, viewFromPath, UNKNOWN_LABEL_ID } from '../features/board/viewPath'
import { AppRoutes } from './AppRoutes'

const opened: TracepadDatabase[] = []
const names: string[] = []

async function open() {
  const name = `tracepad-view-routes-${crypto.randomUUID()}`
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
const noteId = 'note-1'

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

function version(row: Note, title = 'Groceries', body = 'beta'): NoteVersion {
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

function PathProbe() {
  const location = useLocation()
  return <div data-testid="path">{`${location.pathname}${location.search}${location.hash}`}</div>
}

function renderAt(db: TracepadDatabase, path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <PathProbe />
      <AppRoutes db={db} />
    </MemoryRouter>,
  )
}

function pathName(): string {
  return screen.getByTestId('path').textContent ?? ''
}

function views() {
  return screen.getByRole('navigation', { name: 'Views' })
}

async function expectCurrent(name: string) {
  await waitFor(() => expect(within(views()).getByRole('button', { name })).toHaveAttribute('aria-current', 'page'))
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

describe('view paths', () => {
  const work = { id: 'work', name: 'Work' }

  it('maps each path, encodes a label name, and keeps home and trash labels off the fixed paths', () => {
    expect(viewFromPath('/home', [work])).toEqual({ kind: 'notes' })
    expect(viewFromPath('/archive', [work])).toEqual({ kind: 'archive' })
    expect(viewFromPath('/trash', [work])).toEqual({ kind: 'trash' })
    expect(viewFromPath('/reminders', [work])).toEqual({ kind: 'reminders' })
    expect(viewFromPath('/history/note-1', [work])).toBeNull()

    const encoded = labelPath('Q&A / home')
    expect(encoded).toBe(`/label/${encodeURIComponent('Q&A / home')}`)
    expect(labelNameFromPath(encoded)).toBe('Q&A / home')
    expect(viewFromPath(encoded, [{ id: 'qa', name: 'Q&A / home' }])).toEqual({ kind: 'label', labelId: 'qa' })

    expect(labelPath('trash')).toBe('/label/trash')
    expect(labelPath('home')).toBe('/label/home')
    expect(viewFromPath('/label/trash', [{ id: 'bin', name: 'trash' }])).toEqual({ kind: 'label', labelId: 'bin' })
    expect(viewFromPath('/label/home', [{ id: 'house', name: 'home' }])).toEqual({ kind: 'label', labelId: 'house' })
    expect(viewFromPath('/label/Missing', [work])).toEqual({ kind: 'label', labelId: UNKNOWN_LABEL_ID })
  })
})

describe('view routes', () => {
  it('sends / to /home and maps each path to its view', async () => {
    const db = await open()
    await db.put('labels', { id: 'work', userId: null, name: 'Work', updatedAt: now })
    renderAt(db, '/')

    await waitFor(() => expect(pathName()).toBe('/home'))
    await expectCurrent('Notes')
    expect(await within(views()).findByRole('button', { name: 'Work' })).not.toHaveAttribute('aria-current')

    fireEvent.click(within(views()).getByRole('button', { name: 'Archive' }))
    await waitFor(() => expect(pathName()).toBe('/archive'))
    await expectCurrent('Archive')

    fireEvent.click(within(views()).getByRole('button', { name: 'Trash' }))
    await waitFor(() => expect(pathName()).toBe('/trash'))
    await expectCurrent('Trash')

    fireEvent.click(within(views()).getByRole('button', { name: 'Reminders' }))
    await waitFor(() => expect(pathName()).toBe('/reminders'))
    await expectCurrent('Reminders')

    fireEvent.click(within(views()).getByRole('button', { name: 'Work' }))
    await waitFor(() => expect(pathName()).toBe('/label/Work'))
    await expectCurrent('Work')
    expect(within(views()).getByRole('button', { name: 'Notes' })).not.toHaveAttribute('aria-current')

    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'created' } })
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    expect(pathName()).toBe('/label/Work')
    expect(screen.getByLabelText('Sort')).toHaveValue('created')
    expect(screen.getByRole('list', { name: 'Board' })).toHaveAttribute('data-layout', 'list')
  })

  it('encodes a label name and opens that label from the encoded address', async () => {
    const db = await open()
    const name = 'Q&A / home'
    await db.put('labels', { id: 'qa', userId: null, name, updatedAt: now })
    renderAt(db, '/home')
    await expectCurrent('Notes')

    fireEvent.click(await within(views()).findByRole('button', { name }))
    await waitFor(() => expect(pathName()).toBe(labelPath(name)))
    await expectCurrent(name)
    expect(within(views()).getByRole('button', { name: 'Notes' })).not.toHaveAttribute('aria-current')

    cleanup()
    renderAt(db, labelPath(name))
    await expectCurrent(name)
    expect(pathName()).toBe(labelPath(name))
    expect(await screen.findByText('Take a note', { selector: '.empty-state' })).toBeInTheDocument()
  })

  it('uses /label/ for a label named trash or home, and shows an unknown name as an empty label', async () => {
    const db = await open()
    const row = note({ trashedAt: now })
    await db.put('noteVersions', version(row, 'Gone', 'c'))
    await db.put('notes', row)
    await db.put('noteVersions', version(note({ id: 'kept', currentVersionId: 'kept-v' }), 'Kept', 'a'))
    await db.put('notes', note({ id: 'kept', currentVersionId: 'kept-v' }))
    await db.put('labels', { id: 'bin', userId: null, name: 'trash', updatedAt: now })
    await db.put('labels', { id: 'house', userId: null, name: 'home', updatedAt: now })
    await db.put('noteLabels', { noteId: 'kept', labelId: 'bin', isRemoved: false, updatedAt: now })

    renderAt(db, '/trash')
    await expectCurrent('Trash')
    expect(await screen.findByRole('button', { name: 'Gone, c' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Kept, a' })).not.toBeInTheDocument()

    fireEvent.click(within(views()).getByRole('button', { name: 'trash' }))
    await waitFor(() => expect(pathName()).toBe('/label/trash'))
    await expectCurrent('trash')
    expect(within(views()).getByRole('button', { name: 'Trash' })).not.toHaveAttribute('aria-current')
    expect(await screen.findByRole('button', { name: 'Kept, a' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gone, c' })).not.toBeInTheDocument()

    cleanup()
    renderAt(db, '/label/home')
    await expectCurrent('home')
    expect(within(views()).getByRole('button', { name: 'Notes' })).not.toHaveAttribute('aria-current')
    expect(await screen.findByText('Take a note', { selector: '.empty-state' })).toBeInTheDocument()

    cleanup()
    renderAt(db, '/label/Missing')
    await waitFor(() => expect(screen.getByRole('list', { name: 'Board' })).toBeInTheDocument())
    expect(pathName()).toBe('/label/Missing')
    expect(within(views()).getByRole('button', { name: 'Notes' })).not.toHaveAttribute('aria-current')
    expect(within(views()).getByRole('button', { name: 'Trash' })).not.toHaveAttribute('aria-current')
    expect(await screen.findByText('Take a note', { selector: '.empty-state' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Kept, a' })).not.toBeInTheDocument()
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument()
  })

  it('updates the URL when the open label is renamed, and deleting it returns home', async () => {
    const db = await open()
    await db.put('labels', { id: 'work', userId: null, name: 'Work', updatedAt: now })
    await db.put('labels', { id: 'other', userId: null, name: 'Other', updatedAt: now })
    renderAt(db, '/label/Work')
    await expectCurrent('Work')

    fireEvent.click(within(views()).getByRole('button', { name: 'Edit labels' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit labels' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Other' }))
    fireEvent.change(within(dialog).getByLabelText('Rename Other'), { target: { value: 'Else' } })
    fireEvent.blur(within(dialog).getByLabelText('Rename Other'))
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Else' })).toBeInTheDocument())
    expect(pathName()).toBe('/label/Work')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Work' }))
    fireEvent.change(within(dialog).getByLabelText('Rename Work'), { target: { value: 'Job' } })
    fireEvent.blur(within(dialog).getByLabelText('Rename Work'))
    await waitFor(() => expect(pathName()).toBe('/label/Job'))
    await expectCurrent('Job')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete Job', hidden: true }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Delete label?' })).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(pathName()).toBe('/home'))
    await expectCurrent('Notes')
    await waitFor(() => expect(within(views()).queryByRole('button', { name: 'Job' })).not.toBeInTheDocument())
  })

  it('side list on history opens the board path', async () => {
    const db = await open()
    const row = note()
    await db.put('noteVersions', version(row))
    await db.put('notes', row)
    await db.put('labels', { id: 'qa', userId: null, name: 'Q&A', updatedAt: now })
    renderAt(db, `/history/${noteId}`)
    const nav = views()
    await within(nav).findByRole('button', { name: 'Q&A' })

    fireEvent.click(within(nav).getByRole('button', { name: 'Q&A' }))
    await waitFor(() => expect(pathName()).toBe('/label/Q%26A'))
    await expectCurrent('Q&A')
    expect(screen.getByRole('list', { name: 'Board' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'History' })).not.toBeInTheDocument()
  })

  it('returns Back to note to the view history was opened from, and a reload does not reopen it', async () => {
    const db = await open()
    const row = note({ isArchived: true })
    await db.put('noteVersions', version(row))
    await db.put('notes', row)
    await db.put('localSyncState', { deviceId: 'device-1', userId: null, bookmark: 0, lastSyncAt: null })
    const history = UNSAFE_createMemoryHistory({ initialEntries: ['/archive'], v5Compat: true })

    function mount() {
      return render(
        <StrictMode>
          <HistoryHarness history={history}>
            <PathProbe />
            <AppRoutes db={db} />
          </HistoryHarness>
        </StrictMode>,
      )
    }

    const first = mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Groceries, beta' }))
    fireEvent.click(await screen.findByRole('button', { name: 'More' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Version history' }))
    await screen.findByRole('list', { name: 'History' })
    expect(history.location.pathname).toBe(`/history/${noteId}`)

    fireEvent.click(screen.getByRole('button', { name: 'Back to note' }))
    const dialog = await screen.findByRole('dialog', { name: 'Note' })
    expect(within(dialog).getByLabelText('Title')).toHaveValue('Groceries')
    await waitFor(() => expect(history.location.state).toBeNull())
    expect(history.location.pathname).toBe('/archive')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    first.unmount()
    mount()
    await waitFor(() => {
      expect({
        open: screen.queryByRole('dialog', { name: 'Note' }) != null,
        state: history.location.state,
        path: history.location.pathname,
      }).toEqual({ open: false, state: null, path: '/archive' })
    })
    expect(await screen.findByRole('button', { name: 'Groceries, beta' })).toBeVisible()
  })
})
