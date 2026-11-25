import { deleteDB, openDB } from 'idb'
import { afterEach, describe, expect, it } from 'vitest'
import type { Note, NoteVersion, OutboxRow } from '../domain/types'
import { DB_NAME, DB_VERSION, openTracepadDb, type TracepadDatabase } from './db'

let counter = 0
let opened: TracepadDatabase[] = []
let names: string[] = []

function freshName() {
  const name = `tracepad-test-${++counter}`
  names.push(name)
  return name
}

async function open(name: string) {
  const db = await openTracepadDb(name)
  opened.push(db)
  return db
}

afterEach(async () => {
  opened.forEach((db) => db.close())
  await Promise.all(names.map((name) => deleteDB(name)))
  opened = []
  names = []
})

const expectedStores: Record<string, { keyPath: string | string[]; indexes: Record<string, string | string[]> }> = {
  notes: {
    keyPath: 'id',
    indexes: { byUpdatedAt: 'updatedAt', byCreatedAt: 'createdAt', byTrashedAt: 'trashedAt' },
  },
  noteVersions: { keyPath: 'id', indexes: { byNoteCreatedAt: ['noteId', 'createdAt'] } },
  checklistTicks: { keyPath: ['noteId', 'itemId'], indexes: {} },
  drafts: { keyPath: ['noteId', 'deviceId'], indexes: { byDeviceId: 'deviceId' } },
  conflicts: { keyPath: 'id', indexes: { byNoteId: 'noteId' } },
  historyEvents: { keyPath: 'id', indexes: { byNoteOccurredAt: ['noteId', 'occurredAt'] } },
  labels: { keyPath: 'id', indexes: {} },
  noteLabels: { keyPath: ['noteId', 'labelId'], indexes: { byLabelId: 'labelId' } },
  reminders: { keyPath: 'noteId', indexes: { byFireAt: 'fireAt' } },
  outbox: { keyPath: 'id', indexes: { byStatusCreatedAt: ['status', 'createdAt'] } },
  localSyncState: { keyPath: 'deviceId', indexes: {} },
}

function note(id: string, overrides: Partial<Note> = {}): Note {
  return {
    id,
    userId: null,
    currentVersionId: null,
    isPinned: false,
    isArchived: false,
    color: null,
    trashedAt: null,
    createdAt: '2026-11-24T08:00:00.000Z',
    updatedAt: '2026-11-24T08:00:00.000Z',
    sortPosition: null,
    serverUpdatedAt: null,
    ...overrides,
  }
}

function version(id: string, noteId: string, createdAt: string): NoteVersion {
  return {
    id,
    noteId,
    parentVersionId: null,
    deviceId: 'device-1',
    kind: 'text',
    title: null,
    body: 'hello',
    checklistItems: null,
    createdAt,
    receivedAt: null,
  }
}

function outboxRow(id: string, status: OutboxRow['status'], createdAt: string): OutboxRow {
  return {
    id,
    userId: null,
    entityType: 'note',
    entityId: 'note-1',
    op: 'create',
    payload: {},
    createdAt,
    status,
    attempts: 0,
    lastError: null,
  }
}

describe('openTracepadDb', () => {
  it('opens the tracepad database at the current version', async () => {
    const db = await openTracepadDb()
    opened.push(db)
    names.push(DB_NAME)
    expect(db.name).toBe('tracepad')
    expect(db.version).toBe(DB_VERSION)
  })

  it('creates every store with its key and indexes', async () => {
    const db = await open(freshName())
    expect([...db.objectStoreNames].sort()).toEqual(Object.keys(expectedStores).sort())

    const tx = db.transaction([...db.objectStoreNames], 'readonly')
    for (const [storeName, expected] of Object.entries(expectedStores)) {
      const store = tx.objectStore(storeName as never)
      expect(store.keyPath, storeName).toEqual(expected.keyPath)
      expect([...store.indexNames].sort(), storeName).toEqual(Object.keys(expected.indexes).sort())
      for (const [indexName, keyPath] of Object.entries(expected.indexes)) {
        expect(store.index(indexName as never).keyPath, `${storeName}.${indexName}`).toEqual(keyPath)
      }
    }
    await tx.done
  })

  it('runs every upgrade step on a device with no database yet', async () => {
    const name = freshName()
    expect((await indexedDB.databases()).map((info) => info.name)).not.toContain(name)

    const db = await open(name)
    expect(db.version).toBe(DB_VERSION)
    expect(db.objectStoreNames.length).toBe(Object.keys(expectedStores).length)

    db.close()
    const reopened = await openDB(name)
    opened.push(reopened as unknown as TracepadDatabase)
    expect(reopened.version).toBe(DB_VERSION)
  })

  it('keeps data when opened again', async () => {
    const name = freshName()
    const first = await openTracepadDb(name)
    await first.put('notes', note('note-1'))
    await first.put('localSyncState', {
      deviceId: 'device-1',
      userId: null,
      bookmark: 0,
      lastSyncAt: null,
    })
    first.close()

    const second = await open(name)
    expect(await second.get('notes', 'note-1')).toEqual(note('note-1'))
    expect((await second.get('localSyncState', 'device-1'))?.bookmark).toBe(0)
  })

  it('gives existing notes a null sort position when the database is upgraded', async () => {
    const name = freshName()
    const first = await openDB(name, 1, {
      upgrade(db) {
        const notes = db.createObjectStore('notes', { keyPath: 'id' })
        notes.createIndex('byUpdatedAt', 'updatedAt')
        notes.createIndex('byCreatedAt', 'createdAt')
        notes.createIndex('byTrashedAt', 'trashedAt')
      },
    })
    const stored = note('note-1')
    const { sortPosition: _sortPosition, ...withoutPosition } = stored
    await first.put('notes', withoutPosition)
    first.close()

    const upgraded = await open(name)
    expect(upgraded.version).toBe(DB_VERSION)
    expect(await upgraded.get('notes', 'note-1')).toEqual(stored)
  })
})

describe('indexes', () => {
  it('lists guest notes by update time, and only trashed notes in the trash index', async () => {
    const db = await open(freshName())
    await db.put('notes', note('old', { updatedAt: '2026-11-24T08:00:00.000Z' }))
    await db.put('notes', note('new', { updatedAt: '2026-11-24T09:00:00.000Z' }))
    await db.put('notes', note('binned', {
      updatedAt: '2026-11-24T08:30:00.000Z',
      trashedAt: '2026-11-24T10:00:00.000Z',
    }))

    const byUpdated = await db.getAllFromIndex('notes', 'byUpdatedAt')
    expect(byUpdated.map((n) => n.id)).toEqual(['old', 'binned', 'new'])

    const trashed = await db.getAllFromIndex('notes', 'byTrashedAt')
    expect(trashed.map((n) => n.id)).toEqual(['binned'])
  })

  it("finds one note's versions in time order", async () => {
    const db = await open(freshName())
    await db.put('noteVersions', version('v2', 'note-1', '2026-11-24T09:00:00.000Z'))
    await db.put('noteVersions', version('v1', 'note-1', '2026-11-24T08:00:00.000Z'))
    await db.put('noteVersions', version('other', 'note-2', '2026-11-24T08:30:00.000Z'))

    const range = IDBKeyRange.bound(['note-1', ''], ['note-1', '\uffff'])
    const versions = await db.getAllFromIndex('noteVersions', 'byNoteCreatedAt', range)
    expect(versions.map((v) => v.id)).toEqual(['v1', 'v2'])
  })

  it('finds pending outbox rows oldest first', async () => {
    const db = await open(freshName())
    await db.put('outbox', outboxRow('b', 'pending', '2026-11-24T09:00:00.000Z'))
    await db.put('outbox', outboxRow('a', 'pending', '2026-11-24T08:00:00.000Z'))
    await db.put('outbox', outboxRow('sent', 'sent', '2026-11-24T07:00:00.000Z'))

    const range = IDBKeyRange.bound(['pending', ''], ['pending', '\uffff'])
    const pending = await db.getAllFromIndex('outbox', 'byStatusCreatedAt', range)
    expect(pending.map((row) => row.id)).toEqual(['a', 'b'])
  })

  it('keys drafts per note and device, and note labels per note and label', async () => {
    const db = await open(freshName())
    const draft = {
      noteId: 'note-1',
      baseVersionId: null,
      kind: 'text' as const,
      title: null,
      body: 'typing',
      checklistItems: null,
      updatedAt: '2026-11-24T08:00:00.000Z',
    }
    await db.put('drafts', { ...draft, deviceId: 'laptop' })
    await db.put('drafts', { ...draft, deviceId: 'phone' })
    expect(await db.count('drafts')).toBe(2)
    expect((await db.getAllFromIndex('drafts', 'byDeviceId', 'phone')).length).toBe(1)

    const link = { noteId: 'note-1', labelId: 'work', isRemoved: false, updatedAt: '2026-11-24T08:00:00.000Z' }
    await db.put('noteLabels', link)
    await db.put('noteLabels', { ...link, isRemoved: true })
    expect(await db.count('noteLabels')).toBe(1)
    expect((await db.getAllFromIndex('noteLabels', 'byLabelId', 'work'))[0].isRemoved).toBe(true)
  })
})
