import type { Note } from './types'

/** Recently edited, newest created, or the order saved by dragging. */
export type BoardSort = 'edited' | 'created' | 'custom'

/** The time order that a null sortPosition keeps while Custom is selected. */
export type TimeSort = 'edited' | 'created'

function timeKey(note: Note, sort: TimeSort): string {
  return sort === 'created' ? note.createdAt : note.updatedAt
}

/** Newest first. The same time keeps the smaller id first, so the order is stable. */
function compareTime(a: Note, b: Note, sort: TimeSort): number {
  const aKey = timeKey(a, sort)
  const bKey = timeKey(b, sort)
  if (aKey !== bKey) return aKey < bKey ? 1 : -1
  if (a.id === b.id) return 0
  return a.id < b.id ? -1 : 1
}

function compareBoard(a: Note, b: Note, sort: TimeSort): number {
  if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
  return compareTime(a, b, sort)
}

/**
 * Rank within one pin group. A null sortPosition keeps that note's place in the
 * time order. A saved sortPosition is used as the rank instead.
 */
function customRanks(notes: readonly Note[], base: TimeSort): Map<string, number> {
  const ranks = new Map<string, number>()
  for (const pinned of [true, false]) {
    const byTime = notes.filter((note) => note.isPinned === pinned).sort((a, b) => compareTime(a, b, base))
    byTime.forEach((note, index) => {
      ranks.set(note.id, note.sortPosition ?? index)
    })
  }
  return ranks
}

function compareCustom(a: Note, b: Note, ranks: Map<string, number>, base: TimeSort): number {
  if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
  const aRank = ranks.get(a.id) ?? 0
  const bRank = ranks.get(b.id) ?? 0
  if (aRank !== bRank) return aRank - bRank
  return compareTime(a, b, base)
}

/** Pinned first on every sort. Custom uses sortPosition; nulls keep `customBase`. */
export function orderNotes<T extends Note>(
  notes: readonly T[],
  sort: BoardSort,
  customBase: TimeSort = 'edited',
): T[] {
  if (sort !== 'custom') return notes.slice().sort((a, b) => compareBoard(a, b, sort))
  const ranks = customRanks(notes, customBase)
  return notes.slice().sort((a, b) => compareCustom(a, b, ranks, customBase))
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const sortedA = a.slice().sort()
  const sortedB = b.slice().sort()
  return sortedA.every((id, index) => id === sortedB[index])
}

function between(prev: number | null, next: number | null): number | null {
  if (prev == null && next == null) return null
  if (prev == null) return (next as number) - 1
  if (next == null) return prev + 1
  if (prev === next) return prev + 1
  return (prev + next) / 2
}

/**
 * The sortPosition that puts `draggedId` at its index in `nextOrder`.
 * Null when the order did not change. Only this note is written.
 * `group` is one pack: pinned or not, already separated.
 */
export function sortPositionForDrag(
  group: readonly Note[],
  draggedId: string,
  nextOrder: readonly string[],
  base: TimeSort,
): number | null {
  if (!group.some((note) => note.id === draggedId)) return null
  if (!sameIds(group.map((note) => note.id), nextOrder)) return null
  const current = orderNotes(group, 'custom', base).map((note) => note.id)
  if (current.every((id, index) => id === nextOrder[index])) return null

  const ranks = customRanks(group, base)
  const index = nextOrder.indexOf(draggedId)
  const prevId = index > 0 ? nextOrder[index - 1] : null
  const nextId = index < nextOrder.length - 1 ? nextOrder[index + 1] : null
  const prev = prevId == null ? null : (ranks.get(prevId) ?? null)
  const next = nextId == null ? null : (ranks.get(nextId) ?? null)
  if (prevId != null && prev == null) return null
  if (nextId != null && next == null) return null
  return between(prev, next)
}
