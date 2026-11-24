import { deleteDB } from 'idb'
import { afterEach, describe, expect, it } from 'vitest'
import type { HistoryEvent, NoteVersion } from '../domain/types'
import { openTracepadDb, type TracepadDatabase } from './db'
import { listNoteHistory } from './history'

let counter = 0
const opened: TracepadDatabase[] = []
const names: string[] = []

function freshName() {
  const name = `tracepad-history-${++counter}-${crypto.randomUUID()}`
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

function version(id: string, noteId: string, createdAt: string): NoteVersion {
  return {
    id,
    noteId,
    parentVersionId: null,
    deviceId: 'device-1',
    kind: 'text',
    title: null,
    body: id,
    checklistItems: null,
    createdAt,
    receivedAt: null,
  }
}

function event(id: string, noteId: string, occurredAt: string): HistoryEvent {
  return {
    id,
    noteId,
    deviceId: 'device-1',
    type: 'pinned',
    payload: null,
    occurredAt,
  }
}

describe('listNoteHistory', () => {
  it('returns that note’s versions and events', async () => {
    const db = await open()
    await db.put('noteVersions', version('v1', 'note-a', '2026-11-24T10:00:00.000Z'))
    await db.put('noteVersions', version('v2', 'note-a', '2026-11-24T12:00:00.000Z'))
    await db.put('noteVersions', version('v3', 'note-b', '2026-11-24T11:00:00.000Z'))
    await db.put('historyEvents', event('e1', 'note-a', '2026-11-24T11:00:00.000Z'))
    await db.put('historyEvents', event('e2', 'note-b', '2026-11-24T11:00:00.000Z'))

    const history = await listNoteHistory(db, 'note-a')

    expect(history.versions.map((row) => row.id).sort()).toEqual(['v1', 'v2'])
    expect(history.events.map((row) => row.id)).toEqual(['e1'])
  })
})
