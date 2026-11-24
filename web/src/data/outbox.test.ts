import { deleteDB } from 'idb'
import { afterEach, describe, expect, it } from 'vitest'
import type { OutboxRow } from '../domain/types'
import { openTracepadDb, type TracepadDatabase } from './db'
import { noteHasPendingOutbox, outboxRowTargetsNote } from './outbox'

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
