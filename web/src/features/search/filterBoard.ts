import type { BoardCard } from '../../data/notes'
import { searchNotes, type SearchOptions, type SearchableNote } from '../../domain/search'

export function toSearchableNote(card: BoardCard): SearchableNote {
  return {
    id: card.note.id,
    isArchived: card.note.isArchived,
    trashedAt: card.note.trashedAt,
    labelIds: card.labels.map((label) => label.id),
    title: card.version.title,
    body: card.version.body,
    checklistItems: card.version.checklistItems,
  }
}

/** Board cards whose current text matches. Order stays the order of `cards`. */
export function searchBoardCards(cards: readonly BoardCard[], options: SearchOptions): BoardCard[] {
  const ids = new Set(searchNotes(cards.map(toSearchableNote), options).map((match) => match.id))
  return cards.filter((card) => ids.has(card.note.id))
}
