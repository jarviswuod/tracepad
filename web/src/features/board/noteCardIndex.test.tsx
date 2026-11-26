import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { deleteDB } from 'idb'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../../app/AppRoutes'
import { openTracepadDb, type TracepadDatabase } from '../../data/db'
import type { Note, NoteVersion } from '../../domain/types'
import { noteCardElement } from './noteCardIndex'

type FakeItem = { getElement: () => HTMLElement }

type FakeGrid = {
  host: HTMLElement
  handlers: Map<string, (item: FakeItem) => void>
  order: HTMLElement[] | null
  destroyed: boolean
  getItems: () => FakeItem[]
}

const registry = vi.hoisted(() => ({ grids: [] as FakeGrid[] }))

vi.mock('muuri', () => {
  class Grid {
    host: HTMLElement
    handlers = new Map<string, (item: FakeItem) => void>()
    order: HTMLElement[] | null = null
    destroyed = false

    constructor(host: HTMLElement) {
      this.host = host
      registry.grids.push(this)
    }

    getItems(): FakeItem[] {
      const elements = this.order ?? [...this.host.querySelectorAll<HTMLElement>(':scope > .board-item')]
      return elements.map((element) => ({ getElement: () => element }))
    }

    on(event: string, handler: (item: FakeItem) => void) {
      this.handlers.set(event, handler)
    }

    remove() {}

    add() {}

    sort() {}

    refreshItems() {
      return this
    }

    layout() {}

    destroy() {
      this.destroyed = true
    }
  }

  return { default: Grid }
})

const opened: TracepadDatabase[] = []
const names: string[] = []

const alphaId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const betaId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const at = '2026-11-24T10:00:00.000Z'
const later = '2026-11-24T12:00:00.000Z'

async function open() {
  const name = `tracepad-note-ids-${crypto.randomUUID()}`
  names.push(name)
  const db = await openTracepadDb(name)
  opened.push(db)
  return db
}

afterEach(async () => {
  cleanup()
  registry.grids.length = 0
  opened.splice(0).forEach((db) => db.close())
  await Promise.all(names.splice(0).map((name) => deleteDB(name)))
})

function note(id: string, updatedAt: string): Note {
  return {
    id,
    userId: null,
    currentVersionId: `${id}-v`,
    isPinned: false,
    isArchived: false,
    color: null,
    trashedAt: null,
    createdAt: updatedAt,
    updatedAt,
    sortPosition: null,
    serverUpdatedAt: null,
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
    createdAt: row.updatedAt,
    receivedAt: null,
  }
}

async function store(db: TracepadDatabase, row: Note, title: string, body: string) {
  await db.put('noteVersions', version(row, title, body))
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

function expectBoardHides(...ids: string[]) {
  const board = screen.getByRole('list', { name: 'Board' })
  const html = board.innerHTML
  for (const id of ids) expect(html).not.toContain(id)
  expect(board.querySelector('[data-note-id]')).toBeNull()
}

function boardItem(name: string): HTMLElement {
  const button = screen.getByRole('button', { name })
  const item = button.closest('.board-item')
  if (!(item instanceof HTMLElement)) throw new Error(`no board item for ${name}`)
  return item
}

describe('note ids stay off the page', () => {
  it('renders the board without a note id in the HTML', async () => {
    const db = await open()
    await store(db, note(alphaId, at), 'Alpha', 'one')
    await store(db, note(betaId, later), 'Beta', 'two')
    await renderHome(db)
    await screen.findByRole('button', { name: 'Alpha, one' })

    expectBoardHides(alphaId, betaId)
    expect(noteCardElement(alphaId)).toBeInstanceOf(HTMLElement)
    expect(noteCardElement(betaId)).toBeInstanceOf(HTMLElement)

    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    expect(screen.getByRole('list', { name: 'Board' })).toHaveAttribute('data-layout', 'list')
    expectBoardHides(alphaId, betaId)
    expect(noteCardElement(alphaId)?.querySelector('.note-card')).toHaveAccessibleName('Alpha, one')
  })

  it('reports the dragged note and returns focus to the card that was opened', async () => {
    const db = await open()
    await store(db, note(alphaId, at), 'Alpha', 'one')
    await store(db, note(betaId, later), 'Beta', 'two')
    await renderHome(db)
    await screen.findByRole('button', { name: 'Alpha, one' })
    await screen.findByRole('button', { name: 'Beta, two' })

    const alphaItem = boardItem('Alpha, one')
    const betaItem = boardItem('Beta, two')
    const grid = registry.grids.find((entry) => !entry.destroyed && entry.host.contains(betaItem))
    if (!grid) throw new Error('missing pack')
    const dragEnd = grid.handlers.get('dragEnd')
    if (!dragEnd) throw new Error('missing drag end')
    // Newer beta is first. Drop it after alpha.
    grid.order = [alphaItem, betaItem]
    dragEnd({ getElement: () => betaItem })
    grid.order = null

    await waitFor(async () => expect((await db.get('notes', betaId))?.sortPosition).toBe(2))
    expect((await db.get('notes', alphaId))?.sortPosition).toBeNull()

    const alpha = screen.getByRole('button', { name: 'Alpha, one' })
    alpha.focus()
    fireEvent.click(alpha)
    const dialog = await screen.findByRole('dialog', { name: 'Note' })
    expect(within(dialog).getByLabelText('Title')).toHaveValue('Alpha')
    expect(within(dialog).getByLabelText('Body')).toHaveValue('one')
    await waitFor(() => expect(noteCardElement(alphaId)?.style.visibility).toBe('hidden'))
    expect(noteCardElement(betaId)?.style.visibility).toBe('')
    expectBoardHides(alphaId, betaId)

    fireEvent.change(within(dialog).getByLabelText('Body'), { target: { value: 'one more' } })
    fireEvent.keyDown(within(dialog).getByLabelText('Body'), { key: 'Escape' })

    const reopened = await screen.findByRole('button', { name: 'Alpha, one more' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(reopened).toHaveFocus()
    expect(noteCardElement(alphaId)).toBe(reopened.closest('li'))

    fireEvent.click(screen.getByRole('button', { name: 'Take a note' }))
    await screen.findByLabelText('Title')
    fireEvent.click(screen.getByRole('button', { name: 'Beta, two' }))
    const next = await screen.findByRole('dialog', { name: 'Note' })
    expect(within(next).getByLabelText('Title')).toHaveValue('Beta')
    expect(within(next).getByLabelText('Body')).toHaveValue('two')
  })
})
