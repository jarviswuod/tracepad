import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { deleteDB } from 'idb'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NoteVersion } from '../../domain/types'
import { openTracepadDb, type TracepadDatabase } from '../../data/db'
import { DRAFT_DEBOUNCE_MS } from './Editor'
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
