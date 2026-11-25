import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { deleteDB } from 'idb'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NoteVersion } from '../../domain/types'
import { openTracepadDb, type TracepadDatabase } from '../../data/db'
import { commitNoteText, ensureDeviceId } from '../../data/notes'
import { isoToDatetimeLocal } from '../reminders/ReminderControl'
import { DRAFT_DEBOUNCE_MS, PENDING_SYNC_POLL_MS } from './Editor'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../../app/AppRoutes'

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
    <MemoryRouter>
      <h1>Tracepad</h1>
      <AppRoutes db={db} />
    </MemoryRouter>,
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

  it('turns lines into items, ticks one to the bottom, and cuts no version for the tick', async () => {
    const db = await open()
    await renderHome(db)
    const { title, body } = await startNote()
    fireEvent.change(title, { target: { value: 'Shopping' } })
    fireEvent.change(body, { target: { value: 'Milk\nBread' } })
    fireEvent.click(screen.getByRole('button', { name: 'Show checkboxes' }))

    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Tick Milk' })).toBeInTheDocument())
    expect(screen.queryByLabelText('Body')).not.toBeInTheDocument()
    const converted = await versions(db)
    expect(converted).toHaveLength(1)
    expect(converted[0].kind).toBe('checklist')
    expect(converted[0].checklistItems?.map((item) => item.text)).toEqual(['Milk', 'Bread'])

    fireEvent.click(screen.getByRole('checkbox', { name: 'Tick Milk' }))
    await waitFor(() => {
      expect(screen.getAllByRole('checkbox').map((box) => box.getAttribute('aria-label'))).toEqual([
        'Tick Bread',
        'Tick Milk',
      ])
    })
    expect(screen.getByRole('textbox', { name: 'Item Milk' })).toHaveClass('is-ticked')
    expect(screen.getByRole('textbox', { name: 'Item Bread' })).not.toHaveClass('is-ticked')
    expect(await db.count('noteVersions')).toBe(1)
    expect((await db.getAll('historyEvents')).map((event) => event.type)).toEqual(['ticked'])
    expect((await db.getAll('checklistTicks'))[0]).toMatchObject({ ticked: true })
    expect((await db.getAll('outbox')).some((row) => row.entityType === 'tick' && row.op === 'create')).toBe(true)
  })

  it('cuts a version on leave when items are added, removed, reworded, or reordered', async () => {
    const db = await open()
    await renderHome(db)
    const { body } = await startNote()
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Shopping' } })
    fireEvent.change(body, { target: { value: 'Milk\nBread' } })
    fireEvent.click(screen.getByRole('button', { name: 'Show checkboxes' }))
    await screen.findByRole('checkbox', { name: 'Tick Milk' })

    fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Item 3' }), { target: { value: 'Eggs' } })
    fireEvent.click(screen.getByRole('button', { name: 'Remove Bread' }))
    fireEvent.click(screen.getByRole('button', { name: 'Move Milk down' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Item Milk' }), { target: { value: 'Oat milk' } })
    leaveNote()

    await screen.findByRole('button', { name: /Shopping/ })
    const stored = await versions(db)
    expect(stored).toHaveLength(2)
    expect(stored[1].parentVersionId).toBe(stored[0].id)
    expect(stored[1].kind).toBe('checklist')
    expect(stored[1].checklistItems?.map((item) => item.text)).toEqual(['Eggs', 'Oat milk'])
  })

  it('turns items back into lines and cuts a version', async () => {
    const db = await open()
    await renderHome(db)
    const { body } = await startNote()
    fireEvent.change(body, { target: { value: 'Milk\nBread' } })
    fireEvent.click(screen.getByRole('button', { name: 'Show checkboxes' }))
    await screen.findByRole('checkbox', { name: 'Tick Milk' })
    fireEvent.click(screen.getByRole('button', { name: 'Hide checkboxes' }))

    await waitFor(() => expect(screen.getByLabelText('Body')).toHaveValue('Milk\nBread'))
    const stored = await versions(db)
    expect(stored).toHaveLength(2)
    expect(stored[0].kind).toBe('checklist')
    expect(stored[1]).toMatchObject({
      kind: 'text',
      parentVersionId: stored[0].id,
      body: 'Milk\nBread',
      checklistItems: null,
    })
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

  it('archives a blank new note through More and keeps it', async () => {
    const db = await open()
    await renderHome(db)
    await startNote()
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }))

    await waitFor(async () => expect(await db.count('notes')).toBe(1))
    const stored = (await db.getAll('notes'))[0]
    expect(stored?.isArchived).toBe(true)
    expect(await db.count('noteVersions')).toBe(1)
    expect((await db.getAll('historyEvents')).map((event) => event.type)).toEqual(['archived'])

    leaveNote()
    await screen.findByRole('button', { name: 'Take a note' })
    expect(await db.count('notes')).toBe(1)
    expect(screen.queryByRole('button', { name: 'Untitled' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    expect(await screen.findByRole('button', { name: 'Untitled' })).toBeInTheDocument()
  })

  it('archives typed text on a new note without a second version', async () => {
    const db = await open()
    await renderHome(db)
    const { title, body } = await startNote()
    fireEvent.change(title, { target: { value: 'Shopping' } })
    fireEvent.change(body, { target: { value: 'Milk' } })
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }))

    await waitFor(async () => expect((await db.getAll('notes'))[0]?.isArchived).toBe(true))
    expect(await db.count('noteVersions')).toBe(1)
    expect((await db.getAll('noteVersions'))[0]).toMatchObject({ title: 'Shopping', body: 'Milk' })

    leaveNote()
    await screen.findByRole('button', { name: 'Take a note' })
    expect(await db.count('noteVersions')).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    expect(await screen.findByRole('button', { name: 'Shopping, Milk' })).toBeInTheDocument()
  })

  it('sets a reminder on a blank new note and keeps it', async () => {
    const db = await open()
    await renderHome(db)
    await startNote()
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remind me' }))
    const soon = new Date(Date.now() + 60_000).toISOString()
    fireEvent.change(screen.getByLabelText('Date and time'), { target: { value: isoToDatetimeLocal(soon) } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(async () => expect(await db.count('reminders')).toBe(1))
    expect(await db.count('notes')).toBe(1)
    expect(await db.count('noteVersions')).toBe(1)
    expect((await db.getAll('notes'))[0]?.isArchived).toBe(false)
    expect((await db.getAll('historyEvents')).map((event) => event.type)).toEqual(['reminder_set'])

    leaveNote()
    expect(await screen.findByRole('button', { name: 'Untitled' })).toBeInTheDocument()
    expect(await db.count('notes')).toBe(1)
    expect(await db.count('reminders')).toBe(1)
  })

  it('does not keep a blank note when the reminder time is in the past', async () => {
    const db = await open()
    await renderHome(db)
    await startNote()
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remind me' }))
    fireEvent.change(screen.getByLabelText('Date and time'), { target: { value: '2000-01-01T00:00:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Pick a future time.')
    expect(await db.count('notes')).toBe(0)
    expect(await db.count('reminders')).toBe(0)
    fireEvent.keyDown(document, { key: 'Escape' })
    leaveNote()
    await screen.findByRole('button', { name: 'Take a note' })
    expect(await db.count('notes')).toBe(0)
  })

  it('sets, changes and removes a reminder from More without cutting a version', async () => {
    const db = await open()
    await renderHome(db)
    const { title, body } = await startNote()
    fireEvent.change(title, { target: { value: 'Shopping' } })
    fireEvent.change(body, { target: { value: 'Milk' } })
    leaveNote()
    await screen.findByRole('button', { name: /Shopping/ })
    expect(await db.count('noteVersions')).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: /Shopping/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Note' })
    const soon = new Date(Date.now() + 60_000).toISOString()
    const later = new Date(Date.now() + 120_000).toISOString()

    fireEvent.click(within(dialog).getByRole('button', { name: 'More' }))
    fireEvent.click(within(dialog).getByRole('menuitem', { name: 'Remind me' }))
    fireEvent.change(within(dialog).getByLabelText('Date and time'), { target: { value: isoToDatetimeLocal(soon) } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(async () => expect(await db.count('reminders')).toBe(1))

    fireEvent.click(within(dialog).getByRole('button', { name: 'More' }))
    fireEvent.click(within(dialog).getByRole('menuitem', { name: 'Remind me' }))
    const input = await within(dialog).findByLabelText('Date and time')
    await waitFor(() => expect(input).not.toHaveValue(''))
    fireEvent.change(input, { target: { value: isoToDatetimeLocal(later) } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(async () => {
      const types = (await db.getAll('historyEvents')).map((event) => event.type).sort()
      expect(types).toEqual(['reminder_changed', 'reminder_set'])
    })

    fireEvent.click(within(dialog).getByRole('button', { name: 'More' }))
    fireEvent.click(within(dialog).getByRole('menuitem', { name: 'Remind me' }))
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Remove reminder' }))
    await waitFor(async () => expect(await db.count('reminders')).toBe(0))
    expect(await db.count('noteVersions')).toBe(1)
    expect((await db.getAll('historyEvents')).map((event) => event.type).sort()).toEqual([
      'reminder_changed',
      'reminder_removed',
      'reminder_set',
    ])
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
    expect(screen.getAllByRole('dialog')).toEqual([screen.getByRole('dialog', { name: 'Note' })])

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
