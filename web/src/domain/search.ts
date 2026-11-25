// Local search over the current text of a note. Nothing here talks to a server.
// Title, body and checklist item text match as a case-insensitive substring.
// Archived notes are left out unless includeArchived is set. Trashed notes are never included.
// A labelId limits matches to notes carrying that label. Null covers labeled and unlabeled notes.
// previousVersions is never read: only the current title, body and checklist items count.

import { isTrashed } from './trash'
import type { IsoTimestamp, Uuid } from './types'

export type SearchText = {
  title: string | null
  body: string | null
  checklistItems: readonly { text: string }[] | null
}

export type SearchableNote = SearchText & {
  id: Uuid
  isArchived: boolean
  trashedAt: IsoTimestamp | null
  labelIds: readonly Uuid[]
  /** Earlier versions. Search ignores them. */
  previousVersions?: readonly SearchText[]
}

export type SearchOptions = {
  query: string
  includeArchived: boolean
  /** Set on a label view. Null searches every label and unlabeled notes. */
  labelId: Uuid | null
}

export type SearchMatch = {
  id: Uuid
  /** True when the note is archived, so the card is marked "Archived". */
  archived: boolean
}

function includesText(value: string | null, needle: string): boolean {
  if (value == null || value === '') return false
  return value.toLowerCase().includes(needle)
}

function textMatches(text: SearchText, needle: string): boolean {
  if (includesText(text.title, needle) || includesText(text.body, needle)) return true
  const items = text.checklistItems
  if (items == null) return false
  return items.some((item) => includesText(item.text, needle))
}

/** Notes whose current text contains the query, in the order they were given. */
export function searchNotes(notes: readonly SearchableNote[], options: SearchOptions): SearchMatch[] {
  const needle = options.query.trim().toLowerCase()
  if (needle === '') return []

  const matches: SearchMatch[] = []
  for (const note of notes) {
    if (isTrashed(note)) continue
    if (note.isArchived && !options.includeArchived) continue
    if (options.labelId != null && !note.labelIds.includes(options.labelId)) continue
    if (!textMatches(note, needle)) continue
    matches.push({ id: note.id, archived: note.isArchived })
  }
  return matches
}
