// Local search over the current text of a note. Nothing here talks to a server.
// Title, body and checklist item text match as a case-insensitive substring.
// previousVersions is never read: only the current title, body and checklist items count.
// Which notes can match depends on the page:
//   home: not trashed; archived notes only when includeArchived is set
//   archive: archived notes only, and never trashed
//   trash: trashed notes only
//   label: that label only; not trashed; archived notes only when includeArchived is set
// When page is omitted, a labelId selects the label page. Otherwise the search is home.

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

export type SearchPage = 'home' | 'archive' | 'trash' | 'label'

export type SearchOptions = {
  query: string
  includeArchived: boolean
  /** Set on a label page. Null on home covers labeled and unlabeled notes. */
  labelId: Uuid | null
  /**
   * The page being searched. Omitted keeps the original rule:
   * the label in labelId when that is set, and home otherwise.
   */
  page?: SearchPage
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

function searchPage(options: SearchOptions): SearchPage {
  if (options.page != null) return options.page
  return options.labelId != null ? 'label' : 'home'
}

function onPage(note: SearchableNote, options: SearchOptions): boolean {
  const page = searchPage(options)
  switch (page) {
    case 'trash':
      return isTrashed(note)
    case 'archive':
      return note.isArchived && !isTrashed(note)
    case 'label':
      if (isTrashed(note) || options.labelId == null || !note.labelIds.includes(options.labelId)) return false
      return !note.isArchived || options.includeArchived
    case 'home':
      if (isTrashed(note)) return false
      return !note.isArchived || options.includeArchived
    default: {
      const unreachable: never = page
      return unreachable
    }
  }
}

/** Notes whose current text contains the query, in the order they were given. */
export function searchNotes(notes: readonly SearchableNote[], options: SearchOptions): SearchMatch[] {
  const needle = options.query.trim().toLowerCase()
  if (needle === '') return []

  const matches: SearchMatch[] = []
  for (const note of notes) {
    if (!onPage(note, options)) continue
    if (!textMatches(note, needle)) continue
    matches.push({ id: note.id, archived: note.isArchived })
  }
  return matches
}
