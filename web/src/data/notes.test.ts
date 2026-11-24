import { deleteDB } from 'idb'
import { afterEach, describe, expect, it } from 'vitest'
import type { Note, OutboxRow } from '../domain/types'
import { openTracepadDb, type TracepadDatabase } from './db'
import { clearDraft, commitNoteText, ensureDeviceId, listNotes, saveDraft } from './notes'

let counter = 0
const opened: TracepadDatabase[] = []
const names: string[] = []

function freshName() {
  const name = `tracepad-notes-${++counter}-${crypto.randomUUID()}`
  names.push(name)
  return name
}

async function open() {
  const db = await openTracepadDb(freshName())
  opened.push(db)
  return db
}

afterEach(async () => {
  opened.forEach((db) => db.close())
  opened.length = 0
  await Promise.all(names.splice(0).map((name) => deleteDB(name)))
})

const noteId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const deviceId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const at = '2026-11-24T12:00:00.000Z'
const later = '2026-11-24T12:05:00.000Z'

function commitBase(overrides: Partial<Parameters<typeof commitNoteText>[1]> = {}) {
  return {
    noteId,
    deviceId,
    openedVersionId: null as string | null,
    opened: { title: null, body: null },
    next: { title: 'Shopping', body: 'Milk' },
    now: at,
    ...overrides,
  }
}

async function outbox(db: TracepadDatabase): Promise<OutboxRow[]> {
  const rows = await db.getAll('outbox')
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}

describe('ensureDeviceId', () => {
  it('creates one device id and returns it again', async () => {
    const db = await open()
    const first = await ensureDeviceId(db)
    const second = await ensureDeviceId(db)
    expect(first).toBe(second)
    expect(await db.count('localSyncState')).toBe(1)
    expect((await db.get('localSyncState', first))?.userId).toBeNull()
  })
})

describe('commitNoteText', () => {
  it('writes the version, the note pointer and one outbox row in one transaction', async () => {
    const db = await open()
    const calls: string[][] = []
    const original = db.transaction.bind(db)
    db.transaction = ((...args: Parameters<TracepadDatabase['transaction']>) => {
      const [storeNames] = args
      const names = Array.isArray(storeNames) ? [...storeNames] : [storeNames]
      calls.push(names)
      return original(...args)
    }) as typeof db.transaction

    const result = await commitNoteText(db, commitBase())

    expect(result.kind).toBe('cut')
    expect(calls).toEqual([['notes', 'noteVersions', 'drafts', 'outbox']])

    if (result.kind !== 'cut') return
    const version = await db.get('noteVersions', result.versionId)
    const note = await db.get('notes', noteId)
    const rows = await outbox(db)

    expect(version).toMatchObject({
      id: result.versionId,
      noteId,
      parentVersionId: null,
      deviceId,
      kind: 'text',
      title: 'Shopping',
      body: 'Milk',
      checklistItems: null,
      createdAt: at,
      receivedAt: null,
    })
    expect(note).toMatchObject({
      id: noteId,
      userId: null,
      currentVersionId: result.versionId,
      isPinned: false,
      isArchived: false,
      color: null,
      trashedAt: null,
      createdAt: at,
      updatedAt: at,
      serverUpdatedAt: null,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      userId: null,
      entityType: 'version',
      entityId: result.versionId,
      op: 'create',
      payload: version,
      createdAt: at,
      status: 'pending',
      attempts: 0,
      lastError: null,
    })
    expect(await db.count('drafts')).toBe(0)
  })

  it('rolls back the version, the note and the outbox row together', async () => {
    const db = await open()
    const original = db.transaction.bind(db)
    db.transaction = ((...args: Parameters<TracepadDatabase['transaction']>) => {
      const tx = original(...args)
      // Returning this already-wrapped transaction makes idb wrap it again, which
      // attaches a second done promise to the same abort. Settle that one here.
      void tx.done.then(
        () => undefined,
        () => undefined,
      )
      const objectStore = tx.objectStore.bind(tx)
      tx.objectStore = ((name: Parameters<typeof tx.objectStore>[0]) => {
        const store = objectStore(name)
        if (name === 'outbox') {
          store.put = function (this: IDBObjectStore) {
            this.transaction.abort()
            throw new DOMException('AbortError', 'AbortError')
          } as typeof store.put
        }
        return store
      }) as typeof tx.objectStore
      return tx
    }) as typeof db.transaction

    await expect(commitNoteText(db, commitBase())).rejects.toThrow()
    expect(await db.count('notes')).toBe(0)
    expect(await db.count('noteVersions')).toBe(0)
    expect(await db.count('outbox')).toBe(0)
    expect(await db.count('drafts')).toBe(0)
  })

  it("points an edit's version at the opened version and moves the note pointer", async () => {
    const db = await open()
    const first = await commitNoteText(db, commitBase())
    if (first.kind !== 'cut') throw new Error('expected a first version')

    const second = await commitNoteText(
      db,
      commitBase({
        openedVersionId: first.versionId,
        opened: { title: 'Shopping', body: 'Milk' },
        next: { title: 'Shopping', body: 'Milk and bread' },
        now: later,
      }),
    )
    if (second.kind !== 'cut') throw new Error('expected a second version')

    const version = await db.get('noteVersions', second.versionId)
    const note = await db.get('notes', noteId)
    expect(version?.parentVersionId).toBe(first.versionId)
    expect(note?.currentVersionId).toBe(second.versionId)
    expect(note?.createdAt).toBe(at)
    expect(note?.updatedAt).toBe(later)
    expect(await db.count('noteVersions')).toBe(2)
    expect(await db.count('outbox')).toBe(2)
  })

  it('keeps pin and the other note fields when the text changes', async () => {
    const db = await open()
    const first = await commitNoteText(db, commitBase())
    if (first.kind !== 'cut') throw new Error('expected a version')
    const created = await db.get('notes', noteId)
    if (!created) throw new Error('expected a note')
    const pinned: Note = { ...created, isPinned: true, color: 'yellow', userId: 'user-1' }
    await db.put('notes', pinned)

    await commitNoteText(
      db,
      commitBase({
        openedVersionId: first.versionId,
        opened: { title: 'Shopping', body: 'Milk' },
        next: { title: 'Errands', body: 'Milk' },
        now: later,
      }),
    )

    const note = await db.get('notes', noteId)
    expect(note?.isPinned).toBe(true)
    expect(note?.color).toBe('yellow')
    expect(note?.userId).toBe('user-1')
    const rows = await outbox(db)
    expect(rows[rows.length - 1]?.userId).toBe('user-1')
  })

  it('writes nothing when the text is unchanged', async () => {
    const db = await open()
    const first = await commitNoteText(db, commitBase())
    if (first.kind !== 'cut') throw new Error('expected a version')

    const again = await commitNoteText(
      db,
      commitBase({
        openedVersionId: first.versionId,
        opened: { title: 'Shopping', body: 'Milk' },
        next: { title: 'Shopping', body: 'Milk' },
        now: later,
      }),
    )

    expect(again).toEqual({ kind: 'unchanged' })
    expect(await db.count('noteVersions')).toBe(1)
    expect((await db.get('notes', noteId))?.updatedAt).toBe(at)
    expect(await db.count('outbox')).toBe(1)
  })

  it('discards an empty new note and leaves no rows', async () => {
    const db = await open()
    const result = await commitNoteText(
      db,
      commitBase({ next: { title: '', body: null }, now: at }),
    )
    expect(result).toEqual({ kind: 'discard' })
    expect(await db.count('notes')).toBe(0)
    expect(await db.count('noteVersions')).toBe(0)
    expect(await db.count('outbox')).toBe(0)
  })

  it('drops a draft and its pending outbox rows when the new note is discarded', async () => {
    const db = await open()
    await saveDraft(db, {
      noteId,
      deviceId,
      baseVersionId: null,
      title: 'Shopping',
      body: 'Milk',
      now: at,
    })
    expect(await db.count('drafts')).toBe(1)

    const result = await commitNoteText(db, commitBase({ next: { title: '', body: '' }, now: later }))
    expect(result).toEqual({ kind: 'discard' })
    expect(await db.count('drafts')).toBe(0)
    expect(await db.count('notes')).toBe(0)
    expect(await db.count('outbox')).toBe(0)
  })
})

describe('saveDraft', () => {
  it('stores a draft and one outbox row, and does not cut a version', async () => {
    const db = await open()
    await saveDraft(db, {
      noteId,
      deviceId,
      baseVersionId: null,
      title: 'Shopping',
      body: '',
      now: at,
    })

    expect(await db.get('drafts', [noteId, deviceId])).toMatchObject({
      noteId,
      deviceId,
      baseVersionId: null,
      kind: 'text',
      title: 'Shopping',
      body: null,
      checklistItems: null,
      updatedAt: at,
    })
    expect(await db.count('notes')).toBe(0)
    expect(await db.count('noteVersions')).toBe(0)
    const rows = await outbox(db)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      entityType: 'draft',
      entityId: noteId,
      op: 'create',
      status: 'pending',
    })
  })

  it('does not queue another row when the draft text is the same', async () => {
    const db = await open()
    const input = {
      noteId,
      deviceId,
      baseVersionId: null,
      title: 'Shopping',
      body: 'Milk',
      now: at,
    }
    await saveDraft(db, input)
    await saveDraft(db, { ...input, now: later })
    expect(await db.count('outbox')).toBe(1)
    expect((await db.get('drafts', [noteId, deviceId]))?.updatedAt).toBe(at)
  })

  it('is removed when a version is cut, leaving the version outbox row', async () => {
    const db = await open()
    await saveDraft(db, {
      noteId,
      deviceId,
      baseVersionId: null,
      title: 'Shopping',
      body: 'Milk',
      now: at,
    })

    const result = await commitNoteText(db, commitBase({ now: later }))
    if (result.kind !== 'cut') throw new Error('expected a version')

    expect(await db.count('drafts')).toBe(0)
    expect(await db.get('notes', noteId)).toMatchObject({ currentVersionId: result.versionId })
    const rows = await outbox(db)
    expect(rows.map((row) => row.entityType)).toEqual(['draft', 'version'])
  })

  it('queues one delete when an unchanged leave clears a draft', async () => {
    const db = await open()
    const first = await commitNoteText(db, commitBase())
    if (first.kind !== 'cut') throw new Error('expected a version')
    await saveDraft(db, {
      noteId,
      deviceId,
      baseVersionId: first.versionId,
      title: 'Shopping',
      body: 'Milk and bread',
      now: later,
    })

    await clearDraft(db, noteId, deviceId, '2026-11-24T12:06:00.000Z')
    expect(await db.count('drafts')).toBe(0)
    const rows = await outbox(db)
    expect(rows.map((row) => `${row.entityType}:${row.op}`)).toEqual([
      'version:create',
      'draft:create',
      'draft:delete',
    ])
    expect(await db.count('noteVersions')).toBe(1)
  })
})

describe('listNotes', () => {
  it('lists notes newest edited first with their current text', async () => {
    const db = await open()
    await commitNoteText(db, commitBase({ noteId: 'note-old', now: at }))
    await commitNoteText(
      db,
      commitBase({ noteId: 'note-new', next: { title: 'Newer', body: null }, now: later }),
    )

    const listed = await listNotes(db)
    expect(listed.map((item) => item.note.id)).toEqual(['note-new', 'note-old'])
    expect(listed[0].version.title).toBe('Newer')
    expect(listed[1].version.body).toBe('Milk')
  })
})
