import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { deleteDB } from 'idb'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NoteVersion } from '../../domain/types'
import { openTracepadDb, type TracepadDatabase } from '../../data/db'
import { commitNoteText, ensureDeviceId } from '../../data/notes'
import { DRAFT_DEBOUNCE_MS, PENDING_SYNC_POLL_MS } from './Editor'
import { NotesHome } from './NotesHome'

const opened: TracepadDatabase[] = []
const names: string[] = []

async function open() {
  const name = `tracepad-editor-${crypto.randomUUID()}`
  names.push(name)
  const db = await openTracepadDb(name)
  opened.push(db)
  return db
}

afterEach(async () => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  opened.splice(0).forEach((db) => db.close())
  await Promise.all(names.splice(0).map((name) => deleteDB(name)))
})

async function renderHome(db: TracepadDatabase) {
  render(
    <>
      <h1>Tracepad</h1>
      <NotesHome db={db} />
    </>,
  )
  await waitFor(() => expect(screen.getByRole('button', { name: 'Take a note' })).toBeEnabled())
}

async function startNote() {
  fireEvent.click(screen.getByRole('button', { name: 'Take a note' }))
  return {
    title: await screen.findByLabelText('Title'),
    body: await screen.findByLabelText('Body'),
  }
}

function leaveNote() {
  fireEvent.pointerDown(screen.getByRole('heading', { name: 'Tracepad' }))
}

async function versions(db: TracepadDatabase): Promise<NoteVersion[]> {
  const rows = await db.getAll('noteVersions')
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}

describe('editor', () => {
  it('debounces a draft until 5 seconds after the last keystroke', async () => {
    expect(DRAFT_DEBOUNCE_MS).toBe(5000)
    const db = await open()
    await renderHome(db)
    const { body } = await startNote()

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    fireEvent.change(body, { target: { value: 'Mi' } })
    await vi.advanceTimersByTimeAsync(4000)
    fireEvent.change(body, { target: { value: 'Milk' } })
    await vi.advanceTimersByTimeAsync(4999)
    expect(await db.count('drafts')).toBe(0)
    expect(await db.count('noteVersions')).toBe(0)

    await vi.advanceTimersByTimeAsync(1)
    vi.useRealTimers()

    await waitFor(async () => {
      expect(await db.count('drafts')).toBe(1)
    })
    const draft = (await db.getAll('drafts'))[0]
    expect(draft.body).toBe('Milk')
    expect(draft.kind).toBe('text')
    expect(await db.count('noteVersions')).toBe(0)
    expect(body).toHaveValue('Milk')
  })

  it('mints a device id for the note, cuts a version on leave, and stays on Ctrl+S', async () => {
    const ids: string[] = []
    const real = crypto.randomUUID.bind(crypto)
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      const id = real()
      ids.push(id)
      return id
    })

    const db = await open()
    await renderHome(db)
    const beforeNote = ids.length
    const { title, body } = await startNote()
    const noteId = ids[beforeNote]
    expect(noteId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)

    fireEvent.change(title, { target: { value: 'Shopping' } })
    fireEvent.change(body, { target: { value: 'Milk' } })

    const save = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true })
    window.dispatchEvent(save)
    expect(save.defaultPrevented).toBe(true)

    await waitFor(async () => {
      expect(await db.count('noteVersions')).toBe(1)
    })
    expect(screen.getByLabelText('Title')).toHaveValue('Shopping')
    expect(screen.getByLabelText('Body')).toHaveValue('Milk')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }))
    await waitFor(async () => {
      expect(await versions(db)).toHaveLength(1)
    })

    fireEvent.change(screen.getByLabelText('Body'), { target: { value: 'Milk and bread' } })
    leaveNote()

    await screen.findByRole('button', { name: /Shopping/ })
    const stored = await versions(db)
    expect(stored).toHaveLength(2)
    expect(stored[0].parentVersionId).toBeNull()
    expect(stored[1].parentVersionId).toBe(stored[0].id)
    expect(stored[1].body).toBe('Milk and bread')
    expect((await db.get('notes', noteId))?.currentVersionId).toBe(stored[1].id)
  })

  it('discards an empty note and does not version an unchanged open', async () => {
    const db = await open()
    await renderHome(db)
    await startNote()
    leaveNote()
    await screen.findByRole('button', { name: 'Take a note' })
    expect(await db.count('notes')).toBe(0)
    expect(await db.count('noteVersions')).toBe(0)

    const { title, body } = await startNote()
    fireEvent.change(title, { target: { value: 'Shopping' } })
    fireEvent.change(body, { target: { value: 'Milk' } })
    leaveNote()
    await screen.findByRole('button', { name: /Shopping/ })
    expect(await db.count('noteVersions')).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: /Shopping/ }))
    await screen.findByLabelText('Body')
    leaveNote()
    await screen.findByRole('button', { name: 'Take a note' })
    expect(await db.count('noteVersions')).toBe(1)
  })
})

const seededNoteId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

async function seedNote(db: TracepadDatabase) {
  const deviceId = await ensureDeviceId(db)
  const result = await commitNoteText(db, {
    noteId: seededNoteId,
    deviceId,
    openedVersionId: null,
    opened: { title: null, body: null },
    next: { title: 'Shopping', body: 'Milk' },
    now: '2026-11-24T12:00:00.000Z',
  })
  if (result.kind !== 'cut') throw new Error('expected a version')
}

async function markOutboxSent(db: TracepadDatabase) {
  const rows = await db.getAll('outbox')
  for (const row of rows) {
    if (row.status === 'pending') await db.put('outbox', { ...row, status: 'sent' })
  }
}

function scheduleRealTask(fn: () => void) {
  const OuterFunction = Node.constructor as typeof Function
  const setImmediate = new OuterFunction('return setImmediate')() as (callback: () => void) => void
  setImmediate(fn)
}

async function flushTasks() {
  for (let i = 0; i < 8; i += 1) await new Promise<void>((resolve) => scheduleRealTask(resolve))
}

/** Keep draft writes in flight until the test lets them finish, without blocking keystrokes. */
function holdDraftSaves() {
  const original = IDBTransaction.prototype.addEventListener
  const gates = new WeakMap<IDBTransaction, Promise<void>>()
  const releases: Array<() => void> = []

  IDBTransaction.prototype.addEventListener = function (
    this: IDBTransaction,
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) {
    if (
      type === 'complete' &&
      this.mode === 'readwrite' &&
      this.objectStoreNames.contains('drafts') &&
      typeof listener === 'function'
    ) {
      let held = gates.get(this)
      if (!held) {
        let release: () => void = () => {}
        held = new Promise<void>((resolve) => {
          release = resolve
        })
        gates.set(this, held)
        releases.push(release)
      }
      const delayed: EventListener = (event) => {
        void held.then(() => listener.call(this, event))
      }
      return original.call(this, type, delayed, options)
    }
    if (listener == null) return
    return original.call(this, type, listener, options)
  } as typeof IDBTransaction.prototype.addEventListener

  return {
    releases,
    restore() {
      IDBTransaction.prototype.addEventListener = original
    },
  }
}

describe('saving dot', () => {
  it('shows unsaved, then not synced, then nothing', async () => {
    const db = await open()
    await seedNote(db)
    await markOutboxSent(db)
    await renderHome(db)

    fireEvent.click(await screen.findByRole('button', { name: /Shopping/ }))
    const body = await screen.findByLabelText('Body')
    const note = screen.getByRole('group', { name: 'Note' })
    expect(body).toHaveValue('Milk')
    expect(screen.queryByLabelText('Unsaved')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Not synced yet')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    fireEvent.change(body, { target: { value: 'Milk and tea' } })
    const unsaved = screen.getByLabelText('Unsaved')
    expect(note).toContainElement(unsaved)
    expect(unsaved).toHaveClass('saving-dot-unsaved')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    await vi.advanceTimersByTimeAsync(DRAFT_DEBOUNCE_MS)
    vi.useRealTimers()

    await waitFor(() => expect(screen.getByLabelText('Not synced yet')).toBeInTheDocument())
    expect(screen.queryByLabelText('Unsaved')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Body')).toHaveValue('Milk and tea')
    expect(screen.getByLabelText('Not synced yet')).toHaveClass('saving-dot-pending')

    await markOutboxSent(db)
    await waitFor(() => expect(screen.queryByLabelText('Not synced yet')).not.toBeInTheDocument(), {
      timeout: PENDING_SYNC_POLL_MS + 1500,
    })
    expect(screen.queryByLabelText('Unsaved')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Body')).toHaveValue('Milk and tea')

    const versionId = (await db.get('notes', seededNoteId))?.currentVersionId
    const version = versionId ? await db.get('noteVersions', versionId) : undefined
    if (!version) throw new Error('expected the opened version')
    await db.put('noteVersions', { ...version, body: 'FROM THE SERVER' })
    await new Promise((resolve) => setTimeout(resolve, PENDING_SYNC_POLL_MS + 200))
    expect(screen.getByLabelText('Body')).toHaveValue('Milk and tea')
  })

  it('keeps later keystrokes when a draft save is still in flight', async () => {
    const db = await open()
    const hold = holdDraftSaves()
    try {
      await renderHome(db)
      const { body } = await startNote()
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

      fireEvent.change(body, { target: { value: 'One' } })
      await vi.advanceTimersByTimeAsync(DRAFT_DEBOUNCE_MS)
      for (let i = 0; i < 8 && hold.releases.length === 0; i += 1) await flushTasks()
      expect(hold.releases).toHaveLength(1)

      const started = performance.now()
      for (const value of ['OneT', 'OneTw', 'OneTwo']) {
        fireEvent.change(body, { target: { value } })
        expect(body).toHaveValue(value)
      }
      expect(performance.now() - started).toBeLessThan(100)

      hold.releases[0]()
      await flushTasks()
      expect(body).toHaveValue('OneTwo')
      expect((await db.getAll('drafts'))[0]?.body).toBe('One')

      await vi.advanceTimersByTimeAsync(DRAFT_DEBOUNCE_MS)
      for (let i = 0; i < 8 && hold.releases.length < 2; i += 1) await flushTasks()
      expect(hold.releases).toHaveLength(2)
      hold.releases[1]()
      await flushTasks()

      vi.useRealTimers()
      await waitFor(async () => {
        expect((await db.getAll('drafts'))[0]?.body).toBe('OneTwo')
      })
      expect(body).toHaveValue('OneTwo')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    } finally {
      hold.restore()
      vi.useRealTimers()
    }
  })
})
