import { deleteDB } from 'idb'
import { afterEach, describe, expect, it } from 'vitest'
import type { ChecklistItem, OutboxRow } from '../domain/types'
import { openTracepadDb, type TracepadDatabase } from './db'
import {
  commitNoteContent,
  commitNoteText,
  ensureDeviceId,
  listChecklistTicks,
  recoverLeftoverDrafts,
  saveDraft,
  setChecklistTick,
} from './notes'

let counter = 0
const opened: TracepadDatabase[] = []
const names: string[] = []

function freshName() {
  const name = `tracepad-checklists-${++counter}-${crypto.randomUUID()}`
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
const milk: ChecklistItem = { id: '11111111-1111-4111-8111-111111111111', text: 'Milk', position: 0 }
const bread: ChecklistItem = { id: '22222222-2222-4222-8222-222222222222', text: 'Bread', position: 1 }

async function outbox(db: TracepadDatabase): Promise<OutboxRow[]> {
  const rows = await db.getAll('outbox')
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}

async function versions(db: TracepadDatabase) {
  const rows = await db.getAll('noteVersions')
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}

describe('checklist conversions', () => {
  it('turns each line into an item and cuts a version parented on the text', async () => {
    const db = await open()
    const text = await commitNoteText(db, {
      noteId,
      deviceId,
      openedVersionId: null,
      opened: { title: null, body: null },
      next: { title: 'Shopping', body: 'Milk\nBread' },
      now: at,
    })
    if (text.kind !== 'cut') throw new Error('expected a text version')

    const checklist = await commitNoteContent(db, {
      noteId,
      deviceId,
      openedVersionId: text.versionId,
      opened: { kind: 'text', title: 'Shopping', body: 'Milk\nBread' },
      next: { kind: 'checklist', title: 'Shopping', items: [milk, bread] },
      now: later,
    })
    if (checklist.kind !== 'cut') throw new Error('expected a checklist version')

    const stored = await versions(db)
    expect(stored).toHaveLength(2)
    expect(stored[1]).toMatchObject({
      id: checklist.versionId,
      parentVersionId: text.versionId,
      kind: 'checklist',
      title: 'Shopping',
      body: null,
      checklistItems: [milk, bread],
    })
    expect((await db.get('notes', noteId))?.currentVersionId).toBe(checklist.versionId)
    expect((await outbox(db)).filter((row) => row.entityType === 'version')).toHaveLength(2)
  })

  it('turns items back into lines and cuts another version', async () => {
    const db = await open()
    const checklist = await commitNoteContent(db, {
      noteId,
      deviceId,
      openedVersionId: null,
      opened: { kind: 'text', title: null, body: null },
      next: {
        kind: 'checklist',
        title: 'Shopping',
        items: [
          { ...bread, position: 0 },
          { ...milk, position: 1 },
        ],
      },
      now: at,
    })
    if (checklist.kind !== 'cut') throw new Error('expected a checklist version')

    const text = await commitNoteContent(db, {
      noteId,
      deviceId,
      openedVersionId: checklist.versionId,
      opened: { kind: 'checklist', title: 'Shopping', items: [bread, milk] },
      next: { kind: 'text', title: 'Shopping', body: 'Bread\nMilk' },
      now: later,
    })
    if (text.kind !== 'cut') throw new Error('expected a text version')

    const stored = await versions(db)
    expect(stored).toHaveLength(2)
    expect(stored[1]).toMatchObject({
      parentVersionId: checklist.versionId,
      kind: 'text',
      title: 'Shopping',
      body: 'Bread\nMilk',
      checklistItems: null,
    })
  })
})

describe('checklist item edits', () => {
  it('cuts a version for a reword, a reorder, a removal, and an addition', async () => {
    const db = await open()
    const first = await commitNoteContent(db, {
      noteId,
      deviceId,
      openedVersionId: null,
      opened: { kind: 'checklist', title: null, items: [] },
      next: { kind: 'checklist', title: 'Shopping', items: [milk, bread] },
      now: at,
    })
    if (first.kind !== 'cut') throw new Error('expected a version')

    const reworded = await commitNoteContent(db, {
      noteId,
      deviceId,
      openedVersionId: first.versionId,
      opened: { kind: 'checklist', title: 'Shopping', items: [milk, bread] },
      next: { kind: 'checklist', title: 'Shopping', items: [{ ...milk, text: 'Oat milk' }, bread] },
      now: '2026-11-24T12:01:00.000Z',
    })
    const reordered = await commitNoteContent(db, {
      noteId,
      deviceId,
      openedVersionId: reworded.kind === 'cut' ? reworded.versionId : first.versionId,
      opened: { kind: 'checklist', title: 'Shopping', items: [{ ...milk, text: 'Oat milk' }, bread] },
      next: {
        kind: 'checklist',
        title: 'Shopping',
        items: [
          { ...bread, position: 0 },
          { ...milk, text: 'Oat milk', position: 1 },
        ],
      },
      now: '2026-11-24T12:02:00.000Z',
    })
    const removed = await commitNoteContent(db, {
      noteId,
      deviceId,
      openedVersionId: reordered.kind === 'cut' ? reordered.versionId : first.versionId,
      opened: {
        kind: 'checklist',
        title: 'Shopping',
        items: [
          { ...bread, position: 0 },
          { ...milk, text: 'Oat milk', position: 1 },
        ],
      },
      next: { kind: 'checklist', title: 'Shopping', items: [{ ...bread, position: 0 }] },
      now: '2026-11-24T12:03:00.000Z',
    })
    const added = await commitNoteContent(db, {
      noteId,
      deviceId,
      openedVersionId: removed.kind === 'cut' ? removed.versionId : first.versionId,
      opened: { kind: 'checklist', title: 'Shopping', items: [bread] },
      next: {
        kind: 'checklist',
        title: 'Shopping',
        items: [
          { ...bread, position: 0 },
          { ...milk, position: 1 },
        ],
      },
      now: '2026-11-24T12:04:00.000Z',
    })

    expect([reworded.kind, reordered.kind, removed.kind, added.kind]).toEqual(['cut', 'cut', 'cut', 'cut'])
    const stored = await versions(db)
    expect(stored).toHaveLength(5)
    expect(stored[1].checklistItems?.map((item) => item.text)).toEqual(['Oat milk', 'Bread'])
    expect(stored[2].checklistItems?.map((item) => item.text)).toEqual(['Bread', 'Oat milk'])
    expect(stored[3].checklistItems?.map((item) => item.text)).toEqual(['Bread'])
    expect(stored[4].checklistItems?.map((item) => item.text)).toEqual(['Bread', 'Milk'])
    expect(stored[4].parentVersionId).toBe(stored[3].id)
  })

  it('cuts no version when the items are unchanged', async () => {
    const db = await open()
    const first = await commitNoteContent(db, {
      noteId,
      deviceId,
      openedVersionId: null,
      opened: { kind: 'checklist', title: null, items: [] },
      next: { kind: 'checklist', title: 'Shopping', items: [milk, bread] },
      now: at,
    })
    if (first.kind !== 'cut') throw new Error('expected a version')

    const again = await commitNoteContent(db, {
      noteId,
      deviceId,
      openedVersionId: first.versionId,
      opened: { kind: 'checklist', title: 'Shopping', items: [milk, bread] },
      next: { kind: 'checklist', title: 'Shopping', items: [{ ...bread, position: 5 }, { ...milk, position: 1 }] },
      now: later,
    })

    expect(again).toEqual({ kind: 'unchanged' })
    expect(await db.count('noteVersions')).toBe(1)
    expect((await db.get('notes', noteId))?.updatedAt).toBe(at)
  })
})

describe('checklist ticks', () => {
  async function seed(db: TracepadDatabase) {
    const result = await commitNoteContent(db, {
      noteId,
      deviceId,
      openedVersionId: null,
      opened: { kind: 'checklist', title: null, items: [] },
      next: { kind: 'checklist', title: 'Shopping', items: [milk, bread] },
      now: at,
    })
    if (result.kind !== 'cut') throw new Error('expected a version')
    return result.versionId
  }

  it('stores the tick, a history entry, and one outbox row, and cuts no version', async () => {
    const db = await open()
    const versionId = await seed(db)
    const calls: string[][] = []
    const original = db.transaction.bind(db)
    db.transaction = ((...args: Parameters<TracepadDatabase['transaction']>) => {
      const [storeNames] = args
      const names = Array.isArray(storeNames) ? [...storeNames] : [storeNames]
      calls.push(names)
      return original(...args)
    }) as typeof db.transaction

    const changed = await setChecklistTick(db, {
      noteId,
      itemId: milk.id,
      ticked: true,
      deviceId,
      now: later,
    })

    expect(changed).toBe(true)
    expect(calls).toEqual([['notes', 'checklistTicks', 'historyEvents', 'outbox']])
    expect(await db.count('noteVersions')).toBe(1)
    const note = await db.get('notes', noteId)
    expect(note?.currentVersionId).toBe(versionId)
    expect(note?.updatedAt).toBe(at)

    expect(await listChecklistTicks(db, noteId)).toEqual([
      { noteId, itemId: milk.id, ticked: true, updatedAt: later },
    ])
    const events = await db.getAll('historyEvents')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      noteId,
      deviceId,
      type: 'ticked',
      payload: { itemId: milk.id },
      occurredAt: later,
    })
    const tickRows = (await outbox(db)).filter((row) => row.entityType === 'tick')
    expect(tickRows).toHaveLength(1)
    expect(tickRows[0]).toMatchObject({
      entityType: 'tick',
      entityId: noteId,
      op: 'create',
      payload: { noteId, itemId: milk.id, ticked: true, updatedAt: later },
      createdAt: later,
      status: 'pending',
    })
  })

  it('unticks with a history entry and still cuts no version', async () => {
    const db = await open()
    const versionId = await seed(db)
    await setChecklistTick(db, { noteId, itemId: milk.id, ticked: true, deviceId, now: later })
    const versionsBefore = await db.count('noteVersions')

    const changed = await setChecklistTick(db, {
      noteId,
      itemId: milk.id,
      ticked: false,
      deviceId,
      now: '2026-11-24T12:06:00.000Z',
    })

    expect(changed).toBe(true)
    expect(await db.count('noteVersions')).toBe(versionsBefore)
    expect((await db.get('notes', noteId))?.currentVersionId).toBe(versionId)
    expect(await listChecklistTicks(db, noteId)).toEqual([
      { noteId, itemId: milk.id, ticked: false, updatedAt: '2026-11-24T12:06:00.000Z' },
    ])
    const events = await db.getAll('historyEvents')
    expect(events.map((event) => event.type).sort()).toEqual(['ticked', 'unticked'])
    const tickRows = (await outbox(db)).filter((row) => row.entityType === 'tick')
    expect(tickRows.map((row) => row.op).sort()).toEqual(['create', 'update'])
  })

  it('does nothing when the tick is already in that state or the note is missing', async () => {
    const db = await open()
    await seed(db)
    await setChecklistTick(db, { noteId, itemId: milk.id, ticked: true, deviceId, now: later })
    const before = {
      ticks: await db.count('checklistTicks'),
      events: await db.count('historyEvents'),
      outbox: await db.count('outbox'),
      versions: await db.count('noteVersions'),
    }

    expect(await setChecklistTick(db, { noteId, itemId: milk.id, ticked: true, deviceId, now: later })).toBe(false)
    expect(await setChecklistTick(db, { noteId, itemId: bread.id, ticked: false, deviceId, now: later })).toBe(false)
    expect(await setChecklistTick(db, { noteId: 'missing', itemId: milk.id, ticked: true, deviceId, now: later })).toBe(
      false,
    )

    expect(await db.count('checklistTicks')).toBe(before.ticks)
    expect(await db.count('historyEvents')).toBe(before.events)
    expect(await db.count('outbox')).toBe(before.outbox)
    expect(await db.count('noteVersions')).toBe(before.versions)
  })

  it('rolls the tick, the history entry, and the outbox row back together', async () => {
    const db = await open()
    await seed(db)
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

    await expect(
      setChecklistTick(db, { noteId, itemId: milk.id, ticked: true, deviceId, now: later }),
    ).rejects.toThrow()
    expect(await db.count('checklistTicks')).toBe(0)
    expect(await db.count('historyEvents')).toBe(0)
    expect((await outbox(db)).filter((row) => row.entityType === 'tick')).toHaveLength(0)
    expect(await db.count('noteVersions')).toBe(1)
  })
})

describe('checklist drafts', () => {
  it('turns a leftover checklist draft into a checklist version', async () => {
    const db = await open()
    const device = await ensureDeviceId(db)
    await saveDraft(db, {
      noteId,
      deviceId: device,
      baseVersionId: null,
      kind: 'checklist',
      title: 'Shopping',
      checklistItems: [bread, milk],
      now: at,
    })

    await recoverLeftoverDrafts(db)

    expect(await db.count('drafts')).toBe(0)
    const stored = await versions(db)
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({
      kind: 'checklist',
      title: 'Shopping',
      body: null,
      parentVersionId: null,
      checklistItems: [
        { ...milk, position: 0 },
        { ...bread, position: 1 },
      ],
    })
  })
})
