// When a version is cut.
// A brand-new note with no title and no body (or only empty checklist items) is thrown away.
// Text that matches the version you opened is not a new state, including when
// an edit is typed and then changed back. Null and "" are the same empty field.
// The first version has no parent. An edit's parent is the version that was opened.
// Turning text into a checklist, or back, is a new state. So is adding, removing,
// rewording, or reordering items. A tick is not part of this comparison.

import type { ChecklistItem, NoteKind, Uuid } from './types'

export type NoteText = {
  title: string | null
  body: string | null
}

export type TextContent = {
  kind: 'text'
  title: string | null
  body: string | null
}

export type ChecklistContent = {
  kind: 'checklist'
  title: string | null
  items: ChecklistItem[]
}

export type NoteContent = TextContent | ChecklistContent

export type VersionDecision =
  | { kind: 'discard' }
  | { kind: 'unchanged' }
  | { kind: 'cut'; parentVersionId: Uuid | null }

/** Empty fields are stored as null. A field of only "" is empty; spaces are text. */
export function normalizeField(value: string | null): string | null {
  if (value == null || value === '') return null
  return value
}

export function normalizeNoteText(text: NoteText): NoteText {
  return { title: normalizeField(text.title), body: normalizeField(text.body) }
}

/**
 * Lines of a text body. A trailing newline is the end of the last line, not an extra item.
 * A blank line between lines is kept.
 */
export function textLines(body: string | null): string[] {
  if (body == null || body === '') return []
  const lines = body.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

/** Each line becomes an item, in order. The caller supplies a new id per line. */
export function textToChecklistItems(body: string | null, makeId: () => Uuid): ChecklistItem[] {
  return textLines(body).map((text, position) => ({ id: makeId(), text, position }))
}

/** Stable order: position, then id. Positions are rewritten 0, 1, 2, … so only the order matters. */
export function normalizeChecklistItems(items: readonly ChecklistItem[]): ChecklistItem[] {
  const sorted = [...items].sort(
    (a, b) => a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
  return sorted.map((item, position) => ({ id: item.id, text: item.text, position }))
}

/** Items become lines, in position order. No items is an empty body. */
export function checklistItemsToBody(items: readonly ChecklistItem[]): string | null {
  const ordered = normalizeChecklistItems(items)
  if (ordered.length === 0) return null
  const body = ordered.map((item) => item.text).join('\n')
  return body === '' ? null : body
}

/** Same items, in the same order, with the same words. Position gaps do not count. */
export function sameChecklistItems(a: readonly ChecklistItem[], b: readonly ChecklistItem[]): boolean {
  const left = normalizeChecklistItems(a)
  const right = normalizeChecklistItems(b)
  if (left.length !== right.length) return false
  return left.every((item, index) => item.id === right[index].id && item.text === right[index].text)
}

export function isEmptyNote(text: NoteText): boolean {
  const normalized = normalizeNoteText(text)
  return normalized.title == null && normalized.body == null
}

/** A checklist is empty when the title is empty and every item's text is empty. */
export function isEmptyContent(content: NoteContent): boolean {
  if (content.kind === 'text') return isEmptyNote(content)
  if (normalizeField(content.title) != null) return false
  return content.items.every((item) => normalizeField(item.text) == null)
}

export function isUnchangedText(opened: NoteText, next: NoteText): boolean {
  return isUnchangedContent(
    { kind: 'text', title: opened.title, body: opened.body },
    { kind: 'text', title: next.title, body: next.body },
  )
}

export function isUnchangedContent(opened: NoteContent, next: NoteContent): boolean {
  if (opened.kind !== next.kind) return false
  if (normalizeField(opened.title) !== normalizeField(next.title)) return false
  if (opened.kind === 'text' && next.kind === 'text') {
    return normalizeField(opened.body) === normalizeField(next.body)
  }
  if (opened.kind === 'checklist' && next.kind === 'checklist') {
    return sameChecklistItems(opened.items, next.items)
  }
  return false
}

/**
 * openedVersionId is null only when the note has no version yet.
 * Discard applies only then: emptying an existing note is an edit, so it is kept.
 */
export function decideVersionCut(input: {
  openedVersionId: Uuid | null
  opened: NoteText
  next: NoteText
}): VersionDecision {
  return decideContentCut({
    openedVersionId: input.openedVersionId,
    opened: { kind: 'text', title: input.opened.title, body: input.opened.body },
    next: { kind: 'text', title: input.next.title, body: input.next.body },
  })
}

export function decideContentCut(input: {
  openedVersionId: Uuid | null
  opened: NoteContent
  next: NoteContent
}): VersionDecision {
  if (input.openedVersionId == null && isEmptyContent(input.next)) return { kind: 'discard' }
  if (isUnchangedContent(input.opened, input.next)) return { kind: 'unchanged' }
  return { kind: 'cut', parentVersionId: input.openedVersionId }
}

/**
 * Unticked items stay in position order. Ticked items follow them, still in position order.
 * Ticking does not change the stored positions.
 */
export function checklistDisplayOrder(
  items: readonly ChecklistItem[],
  ticked: ReadonlySet<Uuid>,
): ChecklistItem[] {
  const ordered = normalizeChecklistItems(items)
  const open: ChecklistItem[] = []
  const done: ChecklistItem[] = []
  for (const item of ordered) {
    if (ticked.has(item.id)) done.push(item)
    else open.push(item)
  }
  return [...open, ...done]
}

/** The words a card or a history row shows. Checklist items are lines, in position order. */
export function displayedBody(version: {
  kind: NoteKind
  body: string | null
  checklistItems: ChecklistItem[] | null
}): string | null {
  if (version.kind === 'checklist') return checklistItemsToBody(version.checklistItems ?? [])
  return version.body
}
