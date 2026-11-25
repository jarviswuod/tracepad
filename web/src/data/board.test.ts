import { deleteDB } from 'idb'
import { afterEach, describe, expect, it } from 'vitest'
import type { Label, Note, NoteVersion, Reminder } from '../domain/types'
import { openTracepadDb, type TracepadDatabase } from './db'
import { compareLabelNames, listLabels } from './labels'
import { listBoard, type BoardCard, type BoardQuery } from './notes'

let counter = 0
const opened: TracepadDatabase[] = []
const names: string[] = []

function freshName() {
  const name = `tracepad-board-${++counter}-${crypto.randomUUID()}`
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

const now = '2026-11-24T12:00:00.000Z'
const day = 24 * 60 * 60 * 1000

function at(offsetMs: number): string {
  return new Date(Date.parse(now) + offsetMs).toISOString()
}

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

function version(row: Note, overrides: Partial<NoteVersion> = {}): NoteVersion {
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
    ...overrides,
  }
}

async function store(db: TracepadDatabase, row: Note, text: Partial<NoteVersion> = {}) {
  await db.put('noteVersions', version(row, text))
  await db.put('notes', row)
}

async function link(db: TracepadDatabase, noteId: string, labelId: string, isRemoved = false) {
  await db.put('noteLabels', { noteId, labelId, isRemoved, updatedAt: now })
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

function ids(cards: BoardCard[]): string[] {
  return cards.map((card) => card.note.id)
}

function query(view: BoardQuery['view'], sort: BoardQuery['sort']): BoardQuery {
  return { view, sort, now }
}

describe('listBoard', () => {
  it('keeps pinned notes first for recently edited and newest created', async () => {
    const db = await open()
    await store(
      db,
      note('pin', {
        isPinned: true,
        color: 'yellow',
        createdAt: '2026-11-24T08:00:00.000Z',
        updatedAt: '2026-11-24T08:00:00.000Z',
      }),
      { title: 'Pinned', body: 'Keep' },
    )
    await store(
      db,
      note('edited', {
        createdAt: '2026-11-24T07:00:00.000Z',
        updatedAt: '2026-11-24T10:00:00.000Z',
      }),
      { title: 'Edited' },
    )
    await store(
      db,
      note('made', {
        createdAt: '2026-11-24T11:00:00.000Z',
        updatedAt: '2026-11-24T09:00:00.000Z',
      }),
      { title: 'Created' },
    )
    await store(
      db,
      note('tie-b', { createdAt: '2026-11-24T06:00:00.000Z', updatedAt: '2026-11-24T09:00:00.000Z' }),
      { title: 'TieB' },
    )
    await store(
      db,
      note('tie-a', { createdAt: '2026-11-24T06:00:00.000Z', updatedAt: '2026-11-24T09:00:00.000Z' }),
      { title: 'TieA' },
    )

    const edited = await listBoard(db, query({ kind: 'notes' }, 'edited'))
    expect(ids(edited)).toEqual(['pin', 'edited', 'made', 'tie-a', 'tie-b'])
    expect(edited[0].note.color).toBe('yellow')
    expect(edited[0].version.body).toBe('Keep')
    expect(edited.every((card) => card.daysLeft == null)).toBe(true)

    const created = await listBoard(db, query({ kind: 'notes' }, 'created'))
    expect(ids(created)).toEqual(['pin', 'made', 'edited', 'tie-a', 'tie-b'])
  })

  it('filters notes, archive, trash, labels and reminders', async () => {
    const db = await open()
    await store(db, note('pin', { isPinned: true, updatedAt: '2026-11-24T08:00:00.000Z' }))
    await store(db, note('edited', { updatedAt: '2026-11-24T11:00:00.000Z' }))
    await store(db, note('made', { updatedAt: '2026-11-24T09:00:00.000Z' }))
    await store(db, note('home', { updatedAt: '2026-11-24T09:30:00.000Z' }))
    await store(db, note('removed', { updatedAt: '2026-11-24T08:30:00.000Z' }))
    await store(
      db,
      note('archived', { isArchived: true, updatedAt: '2026-11-24T10:00:00.000Z' }),
    )
    await store(
      db,
      note('archived-pin', {
        isPinned: true,
        isArchived: true,
        updatedAt: '2026-11-24T06:00:00.000Z',
      }),
    )
    await store(
      db,
      note('archived-bin', {
        isArchived: true,
        trashedAt: '2026-11-24T12:00:00.000Z',
        updatedAt: '2026-11-24T12:00:00.000Z',
      }),
    )
    await store(
      db,
      note('binned', {
        isPinned: true,
        trashedAt: '2026-11-24T11:00:00.000Z',
        updatedAt: '2026-11-24T07:00:00.000Z',
      }),
    )
    await db.put('notes', note('blank', { currentVersionId: null, updatedAt: '2026-11-24T13:00:00.000Z' }))
    await db.put('notes', note('ghost', { currentVersionId: 'missing', updatedAt: '2026-11-24T13:00:00.000Z' }))

    await link(db, 'edited', 'work')
    await link(db, 'archived-pin', 'work')
    await link(db, 'binned', 'work')
    await link(db, 'removed', 'work', true)
    await link(db, 'home', 'home')
    await db.put('reminders', reminder('made'))
    await db.put('reminders', reminder('archived-pin'))
    await db.put('reminders', reminder('binned'))

    const notes = await listBoard(db, query({ kind: 'notes' }, 'edited'))
    expect(ids(notes)).toEqual(['pin', 'edited', 'home', 'made', 'removed'])
    expect(notes.every((card) => card.daysLeft == null)).toBe(true)

    const archive = await listBoard(db, query({ kind: 'archive' }, 'edited'))
    expect(ids(archive)).toEqual(['archived-pin', 'archived'])

    const trash = await listBoard(db, query({ kind: 'trash' }, 'edited'))
    expect(trash.map((card) => [card.note.id, card.daysLeft])).toEqual([
      ['binned', 30],
      ['archived-bin', 30],
    ])

    expect(ids(await listBoard(db, query({ kind: 'label', labelId: 'work' }, 'edited')))).toEqual([
      'archived-pin',
      'edited',
    ])
    expect(ids(await listBoard(db, query({ kind: 'label', labelId: 'home' }, 'edited')))).toEqual([
      'home',
    ])
    expect(ids(await listBoard(db, query({ kind: 'label', labelId: 'missing' }, 'edited')))).toEqual(
      [],
    )

    expect(ids(await listBoard(db, query({ kind: 'reminders' }, 'edited')))).toEqual([
      'archived-pin',
      'made',
    ])
  })

  it('counts days left out of 30 from when the note was trashed', async () => {
    const db = await open()
    const samples: Array<[string, string]> = [
      ['future', at(day)],
      ['now', now],
      ['just', at(-1)],
      ['almost-day', at(-day + 1)],
      ['one-day', at(-day)],
      ['ten-days', at(-10 * day)],
      ['almost-gone', at(-(30 * day - 1))],
      ['gone', at(-30 * day)],
      ['over', at(-31 * day)],
    ]
    for (const [id, trashedAt] of samples) {
      await store(db, note(id, { trashedAt, updatedAt: trashedAt, createdAt: trashedAt }))
    }

    const trash = await listBoard(db, query({ kind: 'trash' }, 'edited'))
    expect(Object.fromEntries(trash.map((card) => [card.note.id, card.daysLeft]))).toEqual({
      future: 30,
      now: 30,
      just: 30,
      'almost-day': 30,
      'one-day': 29,
      'ten-days': 20,
      'almost-gone': 1,
      gone: 0,
      over: 0,
    })
  })
})

describe('compareLabelNames', () => {
  it('puts figures before letters, compares numbers naturally, and ignores case', () => {
    const names = ['banana', '1. 10', 'Apple', '1. 9', '10', '2']
    expect([...names].sort(compareLabelNames)).toEqual(['1. 9', '1. 10', '2', '10', 'Apple', 'banana'])
    expect(compareLabelNames('Work', 'work')).toBe(0)
    expect(compareLabelNames('9', 'Fig')).toBeLessThan(0)
  })
})

describe('listLabels', () => {
  it('returns nothing, then labels by name', async () => {
    const db = await open()
    expect(await listLabels(db)).toEqual([])

    const workB: Label = { id: 'b', userId: null, name: 'Work', updatedAt: now }
    const workA: Label = { id: 'a', userId: null, name: 'Work', updatedAt: now }
    const home: Label = { id: 'h', userId: null, name: 'Home', updatedAt: now }
    await db.put('labels', workB)
    await db.put('labels', workA)
    await db.put('labels', home)

    expect(await listLabels(db)).toEqual([home, workA, workB])
  })

  it('orders digits before letters and numbers naturally', async () => {
    const db = await open()
    const rows: Label[] = [
      { id: 'ban', userId: null, name: 'banana', updatedAt: now },
      { id: 'ten', userId: null, name: '1. 10', updatedAt: now },
      { id: 'app', userId: null, name: 'Apple', updatedAt: now },
      { id: 'nine', userId: null, name: '1. 9', updatedAt: now },
    ]
    for (const row of rows) await db.put('labels', row)
    expect((await listLabels(db)).map((label) => label.name)).toEqual(['1. 9', '1. 10', 'Apple', 'banana'])
  })
})
