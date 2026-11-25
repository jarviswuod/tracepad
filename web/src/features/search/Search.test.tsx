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

async function renderHome(db: TracepadDatabase) {
  render(
    <MemoryRouter>
      <h1>Tracepad</h1>
      <AppRoutes db={db} />
    </MemoryRouter>,
  )
  await waitFor(() => expect(screen.getByRole('button', { name: 'Take a note' })).toBeEnabled())
}

function typeQuery(value: string) {
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search' }), { target: { value } })
}

describe('search', () => {
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
})
