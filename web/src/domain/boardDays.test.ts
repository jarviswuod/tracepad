import { describe, expect, it } from 'vitest'
import { groupBoardByDay } from './boardDays'

const now = new Date(2026, 10, 25, 18, 0, 0)

function at(year: number, month: number, day: number, hour: number): string {
  return new Date(year, month, day, hour).toISOString()
}

function card(
  id: string,
  times: { isPinned?: boolean; createdAt?: string; updatedAt?: string } = {},
) {
  const updatedAt = times.updatedAt ?? at(2026, 10, 25, 12)
  return {
    id,
    note: {
      isPinned: times.isPinned ?? false,
      createdAt: times.createdAt ?? updatedAt,
      updatedAt,
    },
  }
}

describe('groupBoardByDay', () => {
  it('names today, yesterday, and a day last year', () => {
    const grouped = groupBoardByDay(
      [
        card('today', { updatedAt: at(2026, 10, 25, 9) }),
        card('yesterday', { updatedAt: at(2026, 10, 24, 9) }),
        card('last-year', { updatedAt: at(2025, 10, 25, 9) }),
      ],
      'edited',
      now,
    )

    expect(grouped.pinned).toEqual([])
    expect(grouped.others.map((group) => group.heading)).toEqual(['Today', 'Yesterday', 'November 25, 2025'])
    expect(grouped.others.map((group) => group.cards.map((item) => item.id))).toEqual([
      ['today'],
      ['yesterday'],
      ['last-year'],
    ])
  })

  it('omits the year for another day this year', () => {
    const grouped = groupBoardByDay([card('nov3', { updatedAt: at(2026, 10, 3, 8) })], 'edited', now)
    expect(grouped.others.map((group) => group.heading)).toEqual(['November 3'])
  })

  it('calls the previous calendar day Yesterday across a year boundary', () => {
    const grouped = groupBoardByDay(
      [card('eve', { updatedAt: at(2025, 11, 31, 18) })],
      'edited',
      new Date(2026, 0, 1, 12),
    )
    expect(grouped.others.map((group) => group.heading)).toEqual(['Yesterday'])
  })

  it('uses the created date when the sort is newest created', () => {
    const editedToday = card('edited', {
      updatedAt: at(2026, 10, 25, 9),
      createdAt: at(2025, 10, 25, 9),
    })
    const createdToday = card('created', {
      updatedAt: at(2026, 10, 24, 9),
      createdAt: at(2026, 10, 25, 9),
    })

    const byEdited = groupBoardByDay([editedToday, createdToday], 'edited', now)
    expect(byEdited.others.map((group) => [group.heading, group.cards.map((item) => item.id)])).toEqual([
      ['Today', ['edited']],
      ['Yesterday', ['created']],
    ])

    const byCreated = groupBoardByDay([createdToday, editedToday], 'created', now)
    expect(byCreated.others.map((group) => [group.heading, group.cards.map((item) => item.id)])).toEqual([
      ['Today', ['created']],
      ['November 25, 2025', ['edited']],
    ])
  })

  it('keeps pinned and others apart, and keeps the order inside a day', () => {
    const grouped = groupBoardByDay(
      [
        card('pinned-early', { isPinned: true, updatedAt: at(2026, 10, 25, 11) }),
        card('pinned-late', { isPinned: true, updatedAt: at(2026, 10, 25, 8) }),
        card('pinned-old', { isPinned: true, updatedAt: at(2025, 10, 25, 9) }),
        card('other-first', { updatedAt: at(2026, 10, 25, 10) }),
        card('other-second', { updatedAt: at(2026, 10, 25, 7) }),
        card('other-yesterday', { updatedAt: at(2026, 10, 24, 9) }),
      ],
      'edited',
      now,
    )

    expect(grouped.pinned.map((group) => [group.heading, group.cards.map((item) => item.id)])).toEqual([
      ['Today', ['pinned-early', 'pinned-late']],
      ['November 25, 2025', ['pinned-old']],
    ])
    expect(grouped.others.map((group) => [group.heading, group.cards.map((item) => item.id)])).toEqual([
      ['Today', ['other-first', 'other-second']],
      ['Yesterday', ['other-yesterday']],
    ])
  })

  it('uses the custom base time when the sort is custom', () => {
    const createdToday = card('new', {
      createdAt: at(2026, 10, 25, 9),
      updatedAt: at(2025, 10, 25, 9),
    })
    const createdLastYear = card('old', {
      createdAt: at(2025, 10, 25, 9),
      updatedAt: at(2026, 10, 25, 9),
    })

    const grouped = groupBoardByDay([createdToday, createdLastYear], 'custom', now, 'created')
    expect(grouped.others.map((group) => [group.heading, group.cards.map((item) => item.id)])).toEqual([
      ['Today', ['new']],
      ['November 25, 2025', ['old']],
    ])
  })
})
