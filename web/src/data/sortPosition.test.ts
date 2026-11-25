import { deleteDB } from 'idb'
import { afterEach, describe, expect, it } from 'vitest'
import { orderNotes, sortPositionForDrag } from '../domain/boardOrder'
import type { Note, NoteVersion } from '../domain/types'
import { openTracepadDb, type TracepadDatabase } from './db'
import { listBoard, setSortPosition } from './notes'

let counter = 0
const opened: TracepadDatabase[] = []
const names: string[] = []

function freshName() {
  const name = `tracepad-sort-${++counter}-${crypto.randomUUID()}`
  names.push(name)
  return name
}

async function open() {
  const db = await openTracepadDb(freshName())
  opened.push(db)
  return db
}

afterEach(async () => {
  opened.splice(0).forEach((db) => db.close())
  await Promise.all(names.splice(0).map((name) => deleteDB(name)))
})

function note(id: string, overrides: Partial<Note> = {}): Note {
  return {
    id,
    userId: null,
    currentVersionId: `${id}-v`,
    isPinned: false,
    isArchived: false,
    color: null,
    trashedAt: null,
    sortPosition: null,
    createdAt: '2026-11-24T08:00:00.000Z',
    updatedAt: '2026-11-24T08:00:00.000Z',
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
    title: row.id,
    body: null,
    checklistItems: null,
    createdAt: row.updatedAt,
    receivedAt: null,
  }
}

async function store(db: TracepadDatabase, row: Note) {
  await db.put('noteVersions', version(row))
  await db.put('notes', row)
}

describe('custom order', () => {
  it('follows sortPosition and leaves nulls in the previous order', () => {
    const late = note('late', { updatedAt: '2026-11-24T12:00:00.000Z', createdAt: '2026-11-24T01:00:00.000Z' })
    const mid = note('mid', { updatedAt: '2026-11-24T11:00:00.000Z', createdAt: '2026-11-24T03:00:00.000Z' })
    const early = note('early', {
      updatedAt: '2026-11-24T10:00:00.000Z',
      createdAt: '2026-11-24T02:00:00.000Z',
      sortPosition: 0.5,
    })
    const pinned = note('pinned', {
      isPinned: true,
      sortPosition: 50,
      updatedAt: '2026-11-24T09:00:00.000Z',
    })

    expect(orderNotes([early, late, mid], 'edited').map((item) => item.id)).toEqual(['late', 'mid', 'early'])
    expect(orderNotes([mid, early, late], 'custom', 'edited').map((item) => item.id)).toEqual([
      'late',
      'early',
      'mid',
    ])
    expect(orderNotes([late, mid, early], 'created').map((item) => item.id)).toEqual(['mid', 'early', 'late'])
    expect(orderNotes([pinned, early, late], 'custom').map((item) => item.id)).toEqual([
      'pinned',
      'late',
      'early',
    ])
    expect(orderNotes([early, late, mid, pinned], 'edited').map((item) => item.id)).toEqual([
      'pinned',
      'late',
      'mid',
      'early',
    ])
  })

  it('keeps nulls in the created order when that was the previous sort', () => {
    const first = note('first', {
      createdAt: '2026-11-24T01:00:00.000Z',
      updatedAt: '2026-11-24T09:00:00.000Z',
      sortPosition: 0.5,
    })
    const second = note('second', { createdAt: '2026-11-24T02:00:00.000Z', updatedAt: '2026-11-24T08:00:00.000Z' })
    const third = note('third', { createdAt: '2026-11-24T03:00:00.000Z', updatedAt: '2026-11-24T07:00:00.000Z' })
    // Newest created is third, second, first. first's 0.5 sits between third and second.
    expect(orderNotes([first, second, third], 'custom', 'created').map((item) => item.id)).toEqual([
      'third',
      'first',
      'second',
    ])
    expect(orderNotes([first, second, third], 'created').map((item) => item.id)).toEqual(['third', 'second', 'first'])
  })
})

describe('setSortPosition', () => {
  it('a drag writes one outbox row, no version, and no history entry', async () => {
    const db = await open()
    const late = note('late', { updatedAt: '2026-11-24T12:00:00.000Z', createdAt: '2026-11-24T12:00:00.000Z' })
    const mid = note('mid', { updatedAt: '2026-11-24T11:00:00.000Z', createdAt: '2026-11-24T11:00:00.000Z' })
    const early = note('early', { updatedAt: '2026-11-24T10:00:00.000Z', createdAt: '2026-11-24T10:00:00.000Z' })
    await store(db, late)
    await store(db, mid)
    await store(db, early)
    const versionsBefore = await db.count('noteVersions')
    const updatedAt = early.updatedAt

    expect(sortPositionForDrag([late, mid, early], 'early', ['late', 'mid', 'early'], 'edited')).toBeNull()
    const position = sortPositionForDrag([late, mid, early], 'early', ['late', 'early', 'mid'], 'edited')
    expect(position).toBe(0.5)
    expect(
      orderNotes([{ ...early, sortPosition: position ?? 0 }, late, mid], 'custom').map((item) => item.id),
    ).toEqual(['late', 'early', 'mid'])

    const changed = await setSortPosition(db, { noteId: 'early', sortPosition: position ?? 0, now: '2026-11-25T00:00:00.000Z' })
    expect(changed).toBe(true)

    const stored = await db.get('notes', 'early')
    expect(stored?.sortPosition).toBe(0.5)
    expect(stored?.updatedAt).toBe(updatedAt)
    expect(await db.count('noteVersions')).toBe(versionsBefore)
    expect(await db.count('historyEvents')).toBe(0)
    const rows = await db.getAll('outbox')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      entityType: 'note',
      entityId: 'early',
      op: 'update',
      createdAt: '2026-11-25T00:00:00.000Z',
      status: 'pending',
    })
    expect(rows[0].payload).toMatchObject({ id: 'early', sortPosition: 0.5, updatedAt })

    expect((await listBoard(db, { view: { kind: 'notes' }, sort: 'custom' })).map((card) => card.note.id)).toEqual([
      'late',
      'early',
      'mid',
    ])
    expect((await listBoard(db, { view: { kind: 'notes' }, sort: 'edited' })).map((card) => card.note.id)).toEqual([
      'late',
      'mid',
      'early',
    ])
    expect((await listBoard(db, { view: { kind: 'notes' }, sort: 'created' })).map((card) => card.note.id)).toEqual([
      'late',
      'mid',
      'early',
    ])

    expect(await setSortPosition(db, { noteId: 'early', sortPosition: 0.5 })).toBe(false)
    expect(await db.count('outbox')).toBe(1)
    expect(await setSortPosition(db, { noteId: 'missing', sortPosition: 1 })).toBe(false)
    expect(await db.count('outbox')).toBe(1)
  })
})
