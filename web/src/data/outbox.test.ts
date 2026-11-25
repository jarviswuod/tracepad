import { deleteDB } from 'idb'
import { afterEach, describe, expect, it } from 'vitest'
import type { ChangeOp, EntityType, Note, OutboxRow } from '../domain/types'
import { openTracepadDb, type TracepadDatabase } from './db'
import { addLabelToNote, createLabel } from './labels'
import { commitNoteText, saveDraft, setArchived, setChecklistTick, setNoteColor, setPinned } from './notes'
import {
  countPendingOutbox,
  listPendingOutbox,
  markOutboxSent,
  noteHasPendingOutbox,
  outboxRowTargetsNote,
  queueOutbox,
} from './outbox'
import { setReminder } from './reminders'
import { deleteNoteForever, moveToTrash, restoreFromTrash } from './trash'

let counter = 0
const opened: TracepadDatabase[] = []
const names: string[] = []

function freshName() {
  const name = `tracepad-outbox-${++counter}-${crypto.randomUUID()}`
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
const otherNoteId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const at = '2026-11-24T12:00:00.000Z'

function row(overrides: Pick<OutboxRow, 'id' | 'entityType' | 'entityId' | 'status'> & Partial<OutboxRow>): OutboxRow {
  return {
    userId: null,
    op: 'create',
    payload: null,
    createdAt: at,
    attempts: 0,
    lastError: null,
    ...overrides,
  }
}

describe('outboxRowTargetsNote', () => {
  it('matches a pending row by entity id or by noteId in the payload', () => {
    const draft = row({ id: 'd1', entityType: 'draft', entityId: noteId, status: 'pending' })
    const version = row({
      id: 'v1',
      entityType: 'version',
      entityId: 'version-1',
      status: 'pending',
      payload: { noteId, body: 'Milk' },
    })
    const sent = row({ id: 's1', entityType: 'draft', entityId: noteId, status: 'sent' })
    const other = row({
      id: 'o1',
      entityType: 'version',
      entityId: 'version-2',
      status: 'pending',
      payload: { noteId: otherNoteId },
    })

    expect(outboxRowTargetsNote(draft, noteId)).toBe(true)
    expect(outboxRowTargetsNote(version, noteId)).toBe(true)
    expect(outboxRowTargetsNote(sent, noteId)).toBe(false)
    expect(outboxRowTargetsNote(other, noteId)).toBe(false)
  })
})

describe('noteHasPendingOutbox', () => {
  it('is true only for pending rows of this note', async () => {
    const db = await open()
    expect(await noteHasPendingOutbox(db, noteId)).toBe(false)

    await db.put(
      'outbox',
      row({
        id: 'other',
        entityType: 'draft',
        entityId: otherNoteId,
        status: 'pending',
        createdAt: '2026-11-24T12:00:01.000Z',
      }),
    )
    await db.put(
      'outbox',
      row({
        id: 'sent',
        entityType: 'version',
        entityId: 'version-sent',
        status: 'sent',
        payload: { noteId },
        createdAt: '2026-11-24T12:00:02.000Z',
      }),
    )
    expect(await noteHasPendingOutbox(db, noteId)).toBe(false)

    await db.put(
      'outbox',
      row({
        id: 'version',
        entityType: 'version',
        entityId: 'version-1',
        status: 'pending',
        payload: { noteId, title: 'Shopping' },
        createdAt: '2026-11-24T12:00:03.000Z',
      }),
    )
    expect(await noteHasPendingOutbox(db, noteId)).toBe(true)
    expect(await noteHasPendingOutbox(db, otherNoteId)).toBe(true)
  })
})

const deviceId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const later = '2026-11-24T12:05:00.000Z'
const itemId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

function storedNote(overrides: Partial<Note> = {}): Note {
  return {
    id: noteId,
    userId: null,
    currentVersionId: `${noteId}-v`,
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

async function expectOnePending(
  db: TracepadDatabase,
  expected: { entityType: EntityType; entityId: string; op: ChangeOp },
) {
  expect(await countPendingOutbox(db)).toBe(1)
  const rows = await listPendingOutbox(db)
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({
    ...expected,
    userId: null,
    status: 'pending',
    attempts: 0,
    lastError: null,
  })
}

describe('queue, list, mark sent, count', () => {
  it('lists pending rows oldest first and leaves sent rows out of the count', async () => {
    const db = await open()
    const tx = db.transaction('outbox', 'readwrite')
    const newer = await queueOutbox(tx.store, {
      entityType: 'note',
      entityId: otherNoteId,
      op: 'update',
      payload: { id: otherNoteId },
      createdAt: later,
      userId: null,
    })
    const older = await queueOutbox(tx.store, {
      entityType: 'draft',
      entityId: noteId,
      op: 'create',
      payload: { noteId },
      createdAt: at,
      userId: null,
    })
    await tx.done

    expect(await countPendingOutbox(db)).toBe(2)
    expect((await listPendingOutbox(db)).map((pending) => pending.id)).toEqual([older.id, newer.id])

    await markOutboxSent(db, [older.id, 'missing-id'])
    await markOutboxSent(db, [])

    expect(await countPendingOutbox(db)).toBe(1)
    expect(await listPendingOutbox(db)).toEqual([expect.objectContaining({ id: newer.id, status: 'pending' })])
    expect(await db.get('outbox', older.id)).toMatchObject({ status: 'sent', attempts: 0, lastError: null })

    await markOutboxSent(db, [older.id])
    expect(await countPendingOutbox(db)).toBe(1)
    expect(await db.count('outbox')).toBe(2)
  })

  it('a failed transaction leaves no outbox row', async () => {
    const db = await open()
    const tx = db.transaction(['notes', 'outbox'], 'readwrite')
    void tx.done.then(
      () => undefined,
      () => undefined,
    )
    const note = storedNote()
    const writing = (async () => {
      await tx.objectStore('notes').put(note)
      const outbox = tx.objectStore('outbox')
      outbox.put = function (this: IDBObjectStore) {
        this.transaction.abort()
        throw new DOMException('AbortError', 'AbortError')
      } as typeof outbox.put
      await queueOutbox(outbox, {
        entityType: 'note',
        entityId: note.id,
        op: 'update',
        payload: note,
        createdAt: at,
        userId: null,
      })
    })()

    await expect(writing).rejects.toThrow()
    expect(await db.count('notes')).toBe(0)
    expect(await db.count('outbox')).toBe(0)
    expect(await countPendingOutbox(db)).toBe(0)
  })
})

describe('each write path queues one row', () => {
  it('versions: one version create', async () => {
    const db = await open()
    const result = await commitNoteText(db, {
      noteId,
      deviceId,
      openedVersionId: null,
      opened: { title: null, body: null },
      next: { title: 'Shopping', body: 'Milk' },
      now: at,
    })
    expect(result.kind).toBe('cut')
    if (result.kind !== 'cut') return
    await expectOnePending(db, { entityType: 'version', entityId: result.versionId, op: 'create' })
  })

  it('drafts: one draft create', async () => {
    const db = await open()
    await saveDraft(db, {
      noteId,
      deviceId,
      baseVersionId: null,
      title: 'Shopping',
      body: 'Milk',
      now: at,
    })
    await expectOnePending(db, { entityType: 'draft', entityId: noteId, op: 'create' })
  })

  it('pin: one note update', async () => {
    const db = await open()
    await db.put('notes', storedNote())
    expect(await setPinned(db, { noteId, pinned: true, deviceId, now: later })).toBe(true)
    await expectOnePending(db, { entityType: 'note', entityId: noteId, op: 'update' })
  })

  it('archive: one note update', async () => {
    const db = await open()
    await db.put('notes', storedNote())
    expect(await setArchived(db, { noteId, archived: true, deviceId, now: later })).toBe(true)
    await expectOnePending(db, { entityType: 'note', entityId: noteId, op: 'update' })
  })

  it('color: one note update', async () => {
    const db = await open()
    await db.put('notes', storedNote())
    expect(await setNoteColor(db, { noteId, color: '#fff475', now: later })).toBe(true)
    await expectOnePending(db, { entityType: 'note', entityId: noteId, op: 'update' })
  })

  it('labels: one label create', async () => {
    const db = await open()
    const label = await createLabel(db, { name: 'Work', now: at })
    if (!label) throw new Error('expected a label')
    await expectOnePending(db, { entityType: 'label', entityId: label.id, op: 'create' })
  })

  it('labels: one note_label create when a label is added to a note', async () => {
    const db = await open()
    await db.put('notes', storedNote())
    await db.put('labels', { id: 'work', userId: null, name: 'Work', updatedAt: at })
    expect(await addLabelToNote(db, { noteId, labelId: 'work', deviceId, now: later })).toBe(true)
    await expectOnePending(db, { entityType: 'note_label', entityId: noteId, op: 'create' })
  })

  it('ticks: one tick create', async () => {
    const db = await open()
    await db.put('notes', storedNote())
    expect(await setChecklistTick(db, { noteId, itemId, ticked: true, deviceId, now: later })).toBe(true)
    await expectOnePending(db, { entityType: 'tick', entityId: noteId, op: 'create' })
  })

  it('trash: one note update', async () => {
    const db = await open()
    await db.put('notes', storedNote())
    expect(await moveToTrash(db, { noteId, deviceId, now: later })).toBe(true)
    await expectOnePending(db, { entityType: 'note', entityId: noteId, op: 'update' })
  })

  it('restore: one note update', async () => {
    const db = await open()
    await db.put('notes', storedNote({ trashedAt: at }))
    expect(await restoreFromTrash(db, { noteId, deviceId, now: later })).toBe(true)
    await expectOnePending(db, { entityType: 'note', entityId: noteId, op: 'update' })
  })

  it('delete forever: one note purge', async () => {
    const db = await open()
    await db.put('notes', storedNote({ trashedAt: at }))
    expect(await deleteNoteForever(db, { noteId, now: later })).toBe(true)
    await expectOnePending(db, { entityType: 'note', entityId: noteId, op: 'purge' })
  })

  it('reminders: one reminder create', async () => {
    const db = await open()
    await db.put('notes', storedNote())
    expect(await setReminder(db, { noteId, fireAt: later, deviceId, now: at })).toEqual({
      ok: true,
      changed: true,
    })
    await expectOnePending(db, { entityType: 'reminder', entityId: noteId, op: 'create' })
  })
})
