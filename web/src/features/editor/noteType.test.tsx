import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { deleteDB } from 'idb'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AppRoutes } from '../../app/AppRoutes'
import { openTracepadDb, type TracepadDatabase } from '../../data/db'
import type { Note, NoteVersion } from '../../domain/types'

const here = dirname(fileURLToPath(import.meta.url))
const editorCss = readFileSync(resolve(here, 'editor.css'), 'utf8')
const boardCss = readFileSync(resolve(here, '../board/board.css'), 'utf8')
const labelsCss = readFileSync(resolve(here, '../labels/labels.css'), 'utf8')

/** A stand-in for the browser focus ring, so a missing outline:none fails the test. */
const focusProbe = `
input:focus,
textarea:focus,
button:focus {
  outline: 2px solid red;
}
`

const opened: TracepadDatabase[] = []
const names: string[] = []

async function open() {
  const name = `tracepad-note-type-${crypto.randomUUID()}`
  names.push(name)
  const db = await openTracepadDb(name)
  opened.push(db)
  return db
}

afterEach(async () => {
  cleanup()
  document.getElementById('tracepad-note-type-css')?.remove()
  opened.splice(0).forEach((db) => db.close())
  await Promise.all(names.splice(0).map((name) => deleteDB(name)))
})

const noteId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function todayAt(hours: number, minutes: number): string {
  const date = new Date()
  date.setHours(hours, minutes, 0, 0)
  return date.toISOString()
}

function note(overrides: Partial<Note> = {}): Note {
  const updatedAt = todayAt(15, 4)
  return {
    id: noteId,
    userId: null,
    currentVersionId: `${noteId}-v`,
    isPinned: false,
    isArchived: false,
    color: null,
    trashedAt: null,
    createdAt: updatedAt,
    updatedAt,
    sortPosition: null,
    serverUpdatedAt: null,
    ...overrides,
  }
}

function version(row: Note, title = 'Shopping', body = 'Milk'): NoteVersion {
  return {
    id: row.currentVersionId ?? `${row.id}-v`,
    noteId: row.id,
    parentVersionId: null,
    deviceId: 'device-1',
    kind: 'text',
    title,
    body,
    checklistItems: null,
    createdAt: row.updatedAt,
    receivedAt: null,
  }
}

function installCss() {
  document.getElementById('tracepad-note-type-css')?.remove()
  const style = document.createElement('style')
  style.id = 'tracepad-note-type-css'
  style.textContent = `${focusProbe}\n${editorCss}\n${boardCss}\n${labelsCss}`
  document.head.appendChild(style)
}

async function renderHome(db: TracepadDatabase) {
  installCss()
  render(
    <MemoryRouter>
      <AppRoutes db={db} />
    </MemoryRouter>,
  )
  await waitFor(() => expect(screen.getByRole('button', { name: 'Take a note' })).toBeEnabled())
}

function rootPx(): number {
  return Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}

function expectFontRem(element: Element, rem: number) {
  expect(Number.parseFloat(getComputedStyle(element).fontSize)).toBeCloseTo(rootPx() * rem, 2)
}

function expectLineHeight(element: Element, ratio: number) {
  const style = getComputedStyle(element)
  const fontSize = Number.parseFloat(style.fontSize)
  const line = style.lineHeight
  if (line === String(ratio)) return
  expect(Number.parseFloat(line)).toBeCloseTo(fontSize * ratio, 2)
}

function expectChipBox(element: Element) {
  expectFontRem(element, 0.9)
  expectLineHeight(element, 1.2)
  const style = getComputedStyle(element)
  expect(style.paddingTop).toBe('4px')
  expect(style.paddingBottom).toBe('4px')
  expect(style.paddingLeft).toBe('8px')
  expect(style.paddingRight).toBe('8px')
}

function expectNoFocusOutline(element: HTMLElement) {
  element.focus()
  expect(element).toHaveFocus()
  expect(getComputedStyle(element).outlineStyle).toBe('none')
}

describe('note type and focus', () => {
  it('uses a 1.2rem title and a 1.5 line-height while creating and while open, and 0.9rem chips', async () => {
    const db = await open()
    const row = note()
    await db.put('noteVersions', version(row))
    await db.put('notes', row)
    await db.put('labels', { id: 'work', userId: null, name: 'Work', updatedAt: row.updatedAt })
    await db.put('noteLabels', { noteId, labelId: 'work', isRemoved: false, updatedAt: row.updatedAt })
    await renderHome(db)

    const card = screen.getByRole('button', { name: 'Shopping, Milk' })
    const cardTitle = card.querySelector('.note-title')
    const preview = card.querySelector('.note-preview')
    const cardChip = card.querySelector('.note-chip')
    expect(cardTitle).not.toBeNull()
    expect(preview).not.toBeNull()
    expect(cardChip).not.toBeNull()
    expectFontRem(cardTitle as Element, 1.2)
    expect(getComputedStyle(cardTitle as Element).fontWeight).toBe('500')
    expectFontRem(preview as Element, 1)
    expectLineHeight(preview as Element, 1.5)
    expectChipBox(cardChip as Element)

    fireEvent.click(card)
    const dialog = await screen.findByRole('dialog', { name: 'Note' })
    const openTitle = within(dialog).getByLabelText('Title')
    const openBody = within(dialog).getByLabelText('Body')
    const openChip = await within(dialog).findByText('Work')
    expect(openChip).toHaveClass('note-open-chip')
    expectFontRem(openTitle, 1.2)
    expect(getComputedStyle(openTitle).fontWeight).toBe('500')
    expectFontRem(openBody, 1)
    expectLineHeight(openBody, 1.5)
    expectChipBox(openChip)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Take a note' }))
    const createTitle = await screen.findByLabelText('Title')
    const createBody = await screen.findByLabelText('Body')
    expectFontRem(createTitle, 1.2)
    expect(getComputedStyle(createTitle).fontWeight).toBe('500')
    expectFontRem(createBody, 1)
    expectLineHeight(createBody, 1.5)
  })

  it('drops the focus outline on note and label fields, and keeps the selected color ring', async () => {
    const db = await open()
    const row = note()
    await db.put('noteVersions', version(row))
    await db.put('notes', row)
    await db.put('labels', { id: 'work', userId: null, name: 'Work', updatedAt: row.updatedAt })
    await db.put('noteLabels', { noteId, labelId: 'work', isRemoved: false, updatedAt: row.updatedAt })
    await renderHome(db)

    fireEvent.click(screen.getByRole('button', { name: 'Take a note' }))
    const createTitle = await screen.findByLabelText('Title')
    const createBody = screen.getByLabelText('Body')
    expectNoFocusOutline(createTitle)
    expectNoFocusOutline(createBody)
    fireEvent.change(createBody, { target: { value: 'Milk' } })
    fireEvent.click(screen.getByRole('button', { name: 'Show checkboxes' }))
    const item = await screen.findByLabelText('Item Milk')
    expectNoFocusOutline(item)

    fireEvent.click(screen.getByRole('button', { name: 'Shopping, Milk' }))
    const dialog = await screen.findByRole('dialog', { name: 'Note' })
    expectNoFocusOutline(within(dialog).getByLabelText('Title'))
    expectNoFocusOutline(within(dialog).getByLabelText('Body'))

    fireEvent.click(within(dialog).getByRole('button', { name: 'More' }))
    fireEvent.click(within(dialog).getByRole('menuitem', { name: 'Change labels' }))
    expectNoFocusOutline(within(dialog).getByLabelText('Enter label name'))

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(within(dialog).queryByLabelText('Enter label name')).not.toBeInTheDocument())
    fireEvent.click(within(dialog).getByRole('button', { name: 'More' }))
    fireEvent.click(within(dialog).getByRole('menuitem', { name: 'Colors' }))
    const yellow = within(dialog).getByRole('button', { name: 'Yellow color' })
    fireEvent.click(yellow)
    await waitFor(() => expect(yellow).toHaveAttribute('aria-pressed', 'true'))
    yellow.focus()
    const swatch = getComputedStyle(yellow)
    expect(swatch.outlineStyle).toBe('solid')
    expect(swatch.outlineWidth).toBe('2px')
    expect(swatch.outlineColor.replaceAll(' ', '')).toBe('rgb(26,115,232)')

    const close = within(dialog).getByRole('button', { name: 'Close' })
    close.focus()
    expect(getComputedStyle(close).outlineStyle).not.toBe('none')

    fireEvent.click(close)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Note' })).not.toBeInTheDocument())

    const notes = within(screen.getByRole('navigation', { name: 'Views' })).getByRole('button', { name: 'Notes' })
    notes.focus()
    expectFontRem(notes, 1)
    expect(getComputedStyle(notes).outlineStyle).not.toBe('none')

    fireEvent.click(screen.getByRole('button', { name: 'Edit labels' }))
    const editing = await screen.findByRole('dialog', { name: 'Edit labels' })
    expectNoFocusOutline(within(editing).getByLabelText('Create new label'))
    fireEvent.click(within(editing).getByRole('button', { name: 'Work' }))
    expectNoFocusOutline(await within(editing).findByLabelText('Rename Work'))
    const done = within(editing).getByRole('button', { name: 'Done' })
    done.focus()
    expect(getComputedStyle(done).outlineStyle).not.toBe('none')
  })
})
