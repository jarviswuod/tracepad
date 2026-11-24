// When a version is cut. Text only; checklists come later.
// A brand-new note with no title and no body is thrown away.
// Text that matches the version you opened is not a new state, including when
// an edit is typed and then changed back. Null and "" are the same empty field.
// The first version has no parent. An edit's parent is the version that was opened.

import type { Uuid } from './types'

export type NoteText = {
  title: string | null
  body: string | null
}

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

export function isEmptyNote(text: NoteText): boolean {
  const normalized = normalizeNoteText(text)
  return normalized.title == null && normalized.body == null
}

export function isUnchangedText(opened: NoteText, next: NoteText): boolean {
  const left = normalizeNoteText(opened)
  const right = normalizeNoteText(next)
  return left.title === right.title && left.body === right.body
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
  if (input.openedVersionId == null && isEmptyNote(input.next)) return { kind: 'discard' }
  if (isUnchangedText(input.opened, input.next)) return { kind: 'unchanged' }
  return { kind: 'cut', parentVersionId: input.openedVersionId }
}
