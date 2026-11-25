import type { BoardSort, TimeSort } from './boardOrder'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

export type DayGroup<T> = {
  /** Local calendar day. Stable for a list key. */
  key: string
  heading: string
  cards: T[]
}

type DatedCard = {
  note: {
    isPinned: boolean
    createdAt: string
    updatedAt: string
  }
}

function timeSortFor(sort: BoardSort, customBase: TimeSort): TimeSort {
  if (sort === 'created') return 'created'
  if (sort === 'custom') return customBase
  return 'edited'
}

function timestamp(card: DatedCard, sort: TimeSort): string {
  return sort === 'created' ? card.note.createdAt : card.note.updatedAt
}

function localDay(iso: string): { key: string; date: Date } | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return { key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`, date }
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

/** Today, Yesterday, "November 25" this year, or "November 25, 2025" otherwise. */
export function formatDayHeading(iso: string, now: Date): string {
  const day = localDay(iso)
  if (!day) return iso
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  if (day.key === dayKey(today)) return 'Today'
  if (day.key === dayKey(yesterday)) return 'Yesterday'
  const month = MONTHS[day.date.getMonth()]
  const date = day.date.getDate()
  if (day.date.getFullYear() === now.getFullYear()) return `${month} ${date}`
  return `${month} ${date}, ${day.date.getFullYear()}`
}

/**
 * One heading per local day. Cards stay in the order they arrived.
 * A day stays where its first card sits, so a sorted list keeps newest days first.
 */
export function groupByDay<T extends DatedCard>(cards: readonly T[], sort: TimeSort, now: Date): DayGroup<T>[] {
  const groups: DayGroup<T>[] = []
  const indexByKey = new Map<string, number>()
  for (const card of cards) {
    const iso = timestamp(card, sort)
    const day = localDay(iso)
    const key = day?.key ?? `invalid:${iso}`
    const existing = indexByKey.get(key)
    if (existing == null) {
      indexByKey.set(key, groups.length)
      groups.push({ key, heading: formatDayHeading(iso, now), cards: [card] })
    } else {
      groups[existing].cards.push(card)
    }
  }
  return groups
}

/**
 * Pinned and others are grouped apart. Each section has its own day headings.
 * Recently edited uses updatedAt. Newest created uses createdAt.
 * Custom uses `customBase`, which is the time sort in place before the drag.
 */
export function groupBoardByDay<T extends DatedCard>(
  cards: readonly T[],
  sort: BoardSort,
  now: Date,
  customBase: TimeSort = 'edited',
): { pinned: DayGroup<T>[]; others: DayGroup<T>[] } {
  const timeSort = timeSortFor(sort, customBase)
  const pinned = cards.filter((card) => card.note.isPinned)
  const others = cards.filter((card) => !card.note.isPinned)
  return {
    pinned: groupByDay(pinned, timeSort, now),
    others: groupByDay(others, timeSort, now),
  }
}
