import { deleteDB } from 'idb'
import { afterEach, describe, expect, it } from 'vitest'
import type { HistoryEvent, Note, NoteVersion, OutboxRow } from '../domain/types'
import { openTracepadDb, type TracepadDatabase } from './db'
import {
  addLabelToNote,
  createLabel,
  deleteLabel,
  removeLabelFromNote,
  renameLabel,
} from './labels'
import { listBoard, setArchived, setNoteColor, setPinned } from './notes'

let counter = 0
const opened: TracepadDatabase[] = []
const names: string[] = []

function freshName() {
  const name = `tracepad-meta-${++counter}-${crypto.randomUUID()}`
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

const noteId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const otherId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const deviceId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const at = '2026-11-24T12:00:00.000Z'
const later = '2026-11-24T12:05:00.000Z'

function note(id: string, overrides: Partial<Note> = {}): Note {
  return {
    id,
    userId: null,
    currentVersionId: `${id}-v`,
    isPinned: false,
    isArchived: false,
    color: null,
    trashedAt: null,
    createdAt: at,
    updatedAt: at,
    sortPosition: null,
    serverUpdatedAt: null,
    ...overrides,
  }
}

function version(row: Note, body = 'Milk'): NoteVersion {
  return {
    id: row.currentVersionId ?? `${row.id}-v`,
    noteId: row.id,
    parentVersionId: null,
    deviceId,
    kind: 'text',
    title: 'Shopping',
    body,
    checklistItems: null,
    createdAt: row.createdAt,
    receivedAt: null,
  }
}

async function seed(db: TracepadDatabase, row: Note = note(noteId), body = 'Milk') {
  await db.put('noteVersions', version(row, body))
  await db.put('notes', row)
}

async function outbox(db: TracepadDatabase): Promise<OutboxRow[]> {
  const rows = await db.getAll('outbox')
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}

async function events(db: TracepadDatabase): Promise<HistoryEvent[]> {
  const rows = await db.getAll('historyEvents')
  return rows.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.noteId.localeCompare(b.noteId))
}

function watchStores(db: TracepadDatabase): string[][] {
  const calls: string[][] = []
  const original = db.transaction.bind(db)
  db.transaction = ((...args: Parameters<TracepadDatabase['transaction']>) => {
    const [storeNames] = args
    calls.push(Array.isArray(storeNames) ? [...storeNames] : [storeNames])
    return original(...args)
  }) as typeof db.transaction
  return calls
}

function abortOnOutboxPut(db: TracepadDatabase) {
  const original = db.transaction.bind(db)
  db.transaction = ((...args: Parameters<TracepadDatabase['transaction']>) => {
    const tx = original(...args)
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
}

async function expectSameVersion(db: TracepadDatabase, row: Note, body = 'Milk') {
  expect(await db.count('noteVersions')).toBe(1)
  expect(await db.get('noteVersions', `${row.id}-v`)).toEqual(version(row, body))
  const stored = await db.get('notes', row.id)
  expect(stored?.currentVersionId).toBe(row.currentVersionId)
  expect(stored?.updatedAt).toBe(row.updatedAt)
  expect(stored?.createdAt).toBe(row.createdAt)
}

describe('setPinned', () => {
  it('pins the note, writes one history entry and one outbox row, and cuts no version', async () => {
    const db = await open()
    const original = note(noteId, { color: 'yellow', isArchived: true })
    await seed(db, original)
    const calls = watchStores(db)

    expect(await setPinned(db, { noteId, pinned: true, deviceId, now: later })).toBe(true)

    expect(calls).toEqual([['notes', 'historyEvents', 'outbox']])
    expect(await db.get('notes', noteId)).toEqual({ ...original, isPinned: true })
    await expectSameVersion(db, original)
    const history = await events(db)
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({
      noteId,
      deviceId,
      type: 'pinned',
      payload: null,
      occurredAt: later,
    })
    const rows = await outbox(db)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      userId: null,
      entityType: 'note',
      entityId: noteId,
      op: 'update',
      payload: { ...original, isPinned: true },
      createdAt: later,
      status: 'pending',
      attempts: 0,
      lastError: null,
    })
    const board = await listBoard(db, { view: { kind: 'notes' }, sort: 'edited', now: later })
    expect(board.map((card) => card.note.id)).toEqual([])
    const archive = await listBoard(db, { view: { kind: 'archive' }, sort: 'edited', now: later })
    expect(archive.map((card) => [card.note.id, card.note.isPinned])).toEqual([[noteId, true]])
  })

  it('unpins, and a second pin or a missing note writes nothing', async () => {
    const db = await open()
    const original = note(noteId, { isPinned: true })
    await seed(db, original)

    expect(await setPinned(db, { noteId, pinned: false, deviceId, now: later })).toBe(true)
    expect(await db.get('notes', noteId)).toEqual({ ...original, isPinned: false })
    expect((await events(db)).map((event) => event.type)).toEqual(['unpinned'])
    await expectSameVersion(db, original)

    expect(await setPinned(db, { noteId, pinned: false, deviceId, now: later })).toBe(false)
    expect(await setPinned(db, { noteId: 'missing', pinned: true, deviceId, now: later })).toBe(false)
    expect(await events(db)).toHaveLength(1)
    expect(await outbox(db)).toHaveLength(1)
    expect(await db.count('noteVersions')).toBe(1)
  })

  it('rolls back the note, the history entry and the outbox row together', async () => {
    const db = await open()
    const original = note(noteId)
    await seed(db, original)
    abortOnOutboxPut(db)

    await expect(setPinned(db, { noteId, pinned: true, deviceId, now: later })).rejects.toThrow()
    expect(await db.get('notes', noteId)).toEqual(original)
    expect(await db.count('historyEvents')).toBe(0)
    expect(await db.count('outbox')).toBe(0)
    expect(await db.count('noteVersions')).toBe(1)
  })
})

describe('setArchived', () => {
  it('archives and unarchives with a history entry each, and cuts no version', async () => {
    const db = await open()
    const original = note(noteId, { isPinned: true, color: '#fff475' })
    await seed(db, original)

    expect(await setArchived(db, { noteId, archived: true, deviceId, now: later })).toBe(true)
    expect(await db.get('notes', noteId)).toEqual({ ...original, isArchived: true })
    expect((await listBoard(db, { view: { kind: 'notes' }, sort: 'edited' })).map((card) => card.note.id)).toEqual([])
    expect((await listBoard(db, { view: { kind: 'archive' }, sort: 'edited' })).map((card) => card.note.id)).toEqual([
      noteId,
    ])

    expect(await setArchived(db, { noteId, archived: false, deviceId, now: '2026-11-24T12:06:00.000Z' })).toBe(true)
    expect(await db.get('notes', noteId)).toEqual(original)
    expect((await events(db)).map((event) => event.type)).toEqual(['archived', 'unarchived'])
    expect(await outbox(db)).toHaveLength(2)
    await expectSameVersion(db, original)

    expect(await setArchived(db, { noteId, archived: false, deviceId, now: later })).toBe(false)
    expect(await events(db)).toHaveLength(2)
  })
})

describe('setNoteColor', () => {
  it('changes the card color only, with no history entry and no version', async () => {
    const db = await open()
    const original = note(noteId, { isPinned: true, isArchived: false })
    await seed(db, original)
    await db.put('historyEvents', {
      id: 'already',
      noteId,
      deviceId,
      type: 'pinned',
      payload: null,
      occurredAt: at,
    })
    const calls = watchStores(db)

    expect(await setNoteColor(db, { noteId, color: '#fff475', now: later })).toBe(true)

    expect(calls).toEqual([['notes', 'outbox']])
    expect(await db.get('notes', noteId)).toEqual({ ...original, color: '#fff475' })
    await expectSameVersion(db, original)
    const history = await events(db)
    expect(history).toHaveLength(1)
    expect(history[0].type).toBe('pinned')
    const rows = await outbox(db)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      entityType: 'note',
      entityId: noteId,
      op: 'update',
      payload: { ...original, color: '#fff475' },
      createdAt: later,
    })
    const board = await listBoard(db, { view: { kind: 'notes' }, sort: 'edited' })
    expect(board.map((card) => card.note.color)).toEqual(['#fff475'])
  })

  it('writes nothing when the color is unchanged or the note is missing', async () => {
    const db = await open()
    const original = note(noteId, { color: '#fff475' })
    await seed(db, original)

    expect(await setNoteColor(db, { noteId, color: '#fff475', now: later })).toBe(false)
    expect(await setNoteColor(db, { noteId, color: null, now: later })).toBe(true)
    expect(await db.get('notes', noteId)).toEqual({ ...original, color: null })
    expect(await setNoteColor(db, { noteId: 'missing', color: '#fff475', now: later })).toBe(false)
    expect(await db.count('historyEvents')).toBe(0)
    expect(await outbox(db)).toHaveLength(1)
    await expectSameVersion(db, original)
  })
})

describe('labels', () => {
  it('creates a label, refuses a blank or duplicate name, and writes no history', async () => {
    const db = await open()
    const calls = watchStores(db)

    expect(await createLabel(db, { name: '   ', now: at })).toBeNull()
    const work = await createLabel(db, { name: '  Work  ', now: at })
    expect(work).toMatchObject({ userId: null, name: 'Work', updatedAt: at })
    expect(await createLabel(db, { name: 'work', now: later })).toBeNull()

    expect(calls).toEqual([
      ['labels', 'outbox'],
      ['labels', 'outbox'],
    ])
    expect(await db.getAll('labels')).toEqual([work])
    expect(await db.count('historyEvents')).toBe(0)
    expect(await db.count('noteVersions')).toBe(0)
    const rows = await outbox(db)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ entityType: 'label', entityId: work?.id, op: 'create', payload: work })
  })

  it('renames a label for every note and writes no history entry', async () => {
    const db = await open()
    const first = note(noteId, { updatedAt: at })
    const second = note(otherId, { updatedAt: later })
    await seed(db, first, 'Milk')
    await db.put('noteVersions', version(second, 'Tea'))
    await db.put('notes', second)
    const work = await createLabel(db, { name: 'Work', now: at })
    if (!work) throw new Error('expected a label')
    await addLabelToNote(db, { noteId, labelId: work.id, deviceId, now: at })
    await addLabelToNote(db, { noteId: otherId, labelId: work.id, deviceId, now: at })
    const before = await events(db)

    expect(await renameLabel(db, { labelId: work.id, name: 'Work', now: later })).toEqual(work)
    expect(await db.count('outbox')).toBe(3)
    const renamed = await renameLabel(db, { labelId: work.id, name: '  Job  ', now: later })
    expect(renamed).toEqual({ ...work, name: 'Job', updatedAt: later })
    const home = await createLabel(db, { name: 'Home', now: later })
    expect(await renameLabel(db, { labelId: work.id, name: 'home', now: later })).toBeNull()
    expect(await db.get('labels', work.id)).toEqual(renamed)
    expect(home).toMatchObject({ name: 'Home' })
    expect(await renameLabel(db, { labelId: 'missing', name: 'Else', now: later })).toBeNull()

    expect(await events(db)).toEqual(before)
    expect(await db.count('noteVersions')).toBe(2)
    expect(await db.get('notes', noteId)).toEqual(first)
    expect(await db.get('notes', otherId)).toEqual(second)
    const cards = await listBoard(db, { view: { kind: 'label', labelId: work.id }, sort: 'edited' })
    expect(cards.map((card) => [card.note.id, card.labels])).toEqual([
      [otherId, [{ id: work.id, name: 'Job' }]],
      [noteId, [{ id: work.id, name: 'Job' }]],
    ])
    const rows = await outbox(db)
    expect(rows.filter((row) => row.op === 'update' && row.entityType === 'label')).toHaveLength(1)
  })

  it('adds and removes a label on a note, with a history entry each and no version', async () => {
    const db = await open()
    const original = note(noteId, { isPinned: true, color: '#fff475' })
    await seed(db, original)
    const work = await createLabel(db, { name: 'Work', now: at })
    if (!work) throw new Error('expected a label')

    expect(await addLabelToNote(db, { noteId: 'missing', labelId: work.id, deviceId, now: later })).toBe(false)
    expect(await addLabelToNote(db, { noteId, labelId: 'missing', deviceId, now: later })).toBe(false)
    expect(await addLabelToNote(db, { noteId, labelId: work.id, deviceId, now: later })).toBe(true)
    expect(await addLabelToNote(db, { noteId, labelId: work.id, deviceId, now: later })).toBe(false)

    expect(await db.get('notes', noteId)).toEqual(original)
    await expectSameVersion(db, original)
    expect(await db.get('noteLabels', [noteId, work.id])).toEqual({
      noteId,
      labelId: work.id,
      isRemoved: false,
      updatedAt: later,
    })
    let history = await events(db)
    expect(history.map((event) => event.type)).toEqual(['label_added'])
    expect(history[0]).toMatchObject({
      noteId,
      deviceId,
      payload: { labelId: work.id },
      occurredAt: later,
    })
    let rows = await outbox(db)
    expect(rows.filter((row) => row.entityType === 'note_label')).toEqual([
      expect.objectContaining({
        entityId: noteId,
        op: 'create',
        payload: { noteId, labelId: work.id, isRemoved: false, updatedAt: later },
      }),
    ])
    const board = await listBoard(db, { view: { kind: 'notes' }, sort: 'edited' })
    expect(board[0].labels).toEqual([{ id: work.id, name: 'Work' }])

    expect(await removeLabelFromNote(db, { noteId, labelId: work.id, deviceId, now: '2026-11-24T12:06:00.000Z' })).toBe(
      true,
    )
    expect(await removeLabelFromNote(db, { noteId, labelId: work.id, deviceId, now: later })).toBe(false)
    expect(await db.get('noteLabels', [noteId, work.id])).toMatchObject({ isRemoved: true })
    expect(await db.get('notes', noteId)).toEqual(original)
    await expectSameVersion(db, original)
    history = await events(db)
    expect(history.map((event) => event.type)).toEqual(['label_added', 'label_removed'])
    expect((await listBoard(db, { view: { kind: 'notes' }, sort: 'edited' }))[0].labels).toEqual([])

    expect(await addLabelToNote(db, { noteId, labelId: work.id, deviceId, now: '2026-11-24T12:07:00.000Z' })).toBe(true)
    rows = await outbox(db)
    const linkRows = rows.filter((row) => row.entityType === 'note_label')
    expect(linkRows.map((row) => row.op)).toEqual(['create', 'update', 'update'])
    expect(await db.get('noteLabels', [noteId, work.id])).toMatchObject({ isRemoved: false })
    expect(await db.count('noteVersions')).toBe(1)
  })

  it('deletes a label from every note and keeps the notes and their versions', async () => {
    const db = await open()
    const first = note(noteId, { isPinned: true, color: '#fff475' })
    const second = note(otherId, { isArchived: true })
    await seed(db, first, 'Milk')
    await db.put('noteVersions', version(second, 'Tea'))
    await db.put('notes', second)
    const work = await createLabel(db, { name: 'Work', now: at })
    const home = await createLabel(db, { name: 'Home', now: at })
    if (!work || !home) throw new Error('expected labels')
    await addLabelToNote(db, { noteId, labelId: work.id, deviceId, now: at })
    await addLabelToNote(db, { noteId: otherId, labelId: work.id, deviceId, now: at })
    await addLabelToNote(db, { noteId, labelId: home.id, deviceId, now: at })
    await db.put('noteLabels', { noteId: otherId, labelId: 'old', isRemoved: true, updatedAt: at })
    await db.put('labels', { id: 'old', userId: null, name: 'Old', updatedAt: at })
    const versionsBefore = await db.getAll('noteVersions')

    expect(await deleteLabel(db, { labelId: 'missing', deviceId, now: later })).toBe(false)
    expect(await deleteLabel(db, { labelId: work.id, deviceId, now: later })).toBe(true)
    expect(await deleteLabel(db, { labelId: 'old', deviceId, now: later })).toBe(true)

    expect(await db.get('notes', noteId)).toEqual(first)
    expect(await db.get('notes', otherId)).toEqual(second)
    expect(await db.getAll('noteVersions')).toEqual(versionsBefore)
    expect(await db.get('labels', work.id)).toBeUndefined()
    expect(await db.get('labels', home.id)).toMatchObject({ name: 'Home' })
    expect(await db.get('noteLabels', [noteId, work.id])).toBeUndefined()
    expect(await db.get('noteLabels', [otherId, work.id])).toBeUndefined()
    expect(await db.get('noteLabels', [otherId, 'old'])).toBeUndefined()
    expect(await db.get('noteLabels', [noteId, home.id])).toMatchObject({ isRemoved: false })

    const history = (await events(db)).filter((event) => event.type === 'label_removed')
    expect(history.map((event) => [event.noteId, event.payload])).toEqual([
      [noteId, { labelId: work.id }],
      [otherId, { labelId: work.id }],
    ])
    const rows = await outbox(db)
    expect(
      rows
        .filter((row) => row.entityType === 'label' && row.op === 'delete')
        .map((row) => (row.payload as { id: string }).id)
        .sort(),
    ).toEqual([work.id, 'old'].sort())
    const cards = await listBoard(db, { view: { kind: 'label', labelId: home.id }, sort: 'edited' })
    expect(cards.map((card) => card.note.id)).toEqual([noteId])
    expect((await listBoard(db, { view: { kind: 'notes' }, sort: 'edited' })).map((card) => card.note.id)).toEqual([
      noteId,
    ])
    expect((await listBoard(db, { view: { kind: 'archive' }, sort: 'edited' })).map((card) => card.note.id)).toEqual([
      otherId,
    ])
  })

  it('rolls back a label delete so the notes, the label and the join stay', async () => {
    const db = await open()
    const original = note(noteId)
    await seed(db, original)
    const work = await createLabel(db, { name: 'Work', now: at })
    if (!work) throw new Error('expected a label')
    await addLabelToNote(db, { noteId, labelId: work.id, deviceId, now: at })
    const historyBefore = await db.count('historyEvents')
    const outboxBefore = await db.count('outbox')
    abortOnOutboxPut(db)

    await expect(deleteLabel(db, { labelId: work.id, deviceId, now: later })).rejects.toThrow()
    expect(await db.get('labels', work.id)).toEqual(work)
    expect(await db.get('noteLabels', [noteId, work.id])).toMatchObject({ isRemoved: false })
    expect(await db.get('notes', noteId)).toEqual(original)
    expect(await db.count('historyEvents')).toBe(historyBefore)
    expect(await db.count('outbox')).toBe(outboxBefore)
    expect(await db.count('noteVersions')).toBe(1)
  })
})
