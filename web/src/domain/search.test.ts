import { describe, expect, it } from 'vitest'
import { searchNotes, type SearchableNote, type SearchOptions } from './search'

function note(overrides: Partial<SearchableNote> = {}): SearchableNote {
  return {
    id: 'note',
    isArchived: false,
    trashedAt: null,
    labelIds: [],
    title: null,
    body: null,
    checklistItems: null,
    ...overrides,
  }
}

function search(notes: SearchableNote[], overrides: Partial<SearchOptions> = {}) {
  return searchNotes(notes, {
    query: 'apple',
    includeArchived: false,
    labelId: null,
    ...overrides,
  })
}

describe('searchNotes', () => {
  it('matches title, body and checklist items without caring about case', () => {
    const notes = [
      note({ id: 'title', title: 'APPLE pie' }),
      note({ id: 'body', body: 'a green Apple' }),
      note({
        id: 'item',
        title: 'Shopping',
        checklistItems: [
          { text: 'Bread' },
          { text: 'apple sauce' },
        ],
      }),
      note({ id: 'other', title: 'Berries', body: 'Pears', checklistItems: [{ text: 'Milk' }] }),
    ]

    expect(search(notes).map((match) => match.id)).toEqual(['title', 'body', 'item'])
    expect(search(notes, { query: '  ApPlE  ' }).map((match) => match.id)).toEqual(['title', 'body', 'item'])
    expect(search(notes, { query: 'milk' }).map((match) => match.id)).toEqual(['other'])
  })

  it('ignores older versions and matches only the current text', () => {
    const current = note({
      id: 'edited',
      title: 'Shopping',
      body: null,
      checklistItems: [{ text: 'Milk' }],
      previousVersions: [
        { title: 'secret title', body: 'secret body', checklistItems: [{ text: 'secret item' }] },
        { title: null, body: 'apple', checklistItems: null },
      ],
    })

    expect(search([current], { query: 'secret' })).toEqual([])
    expect(search([current], { query: 'apple' })).toEqual([])
    expect(search([current], { query: 'milk' })).toEqual([{ id: 'edited', archived: false }])
  })

  it('leaves archived notes out unless the switch is on, and marks those it includes', () => {
    const notes = [
      note({ id: 'open', title: 'Apple' }),
      note({ id: 'filed', title: 'apple', isArchived: true }),
    ]

    expect(search(notes)).toEqual([{ id: 'open', archived: false }])
    expect(search(notes, { includeArchived: true })).toEqual([
      { id: 'open', archived: false },
      { id: 'filed', archived: true },
    ])
  })

  it('never includes a trashed note', () => {
    const notes = [
      note({ id: 'bin', title: 'Apple', trashedAt: '2026-11-24T12:00:00.000Z' }),
      note({
        id: 'filed-bin',
        title: 'Apple',
        isArchived: true,
        trashedAt: '2026-11-24T12:00:00.000Z',
        labelIds: ['work'],
      }),
      note({ id: 'open', title: 'Apple' }),
    ]

    expect(search(notes, { includeArchived: true, labelId: 'work' })).toEqual([])
    expect(search(notes, { includeArchived: true })).toEqual([{ id: 'open', archived: false }])
  })

  it('stays inside one label, and covers labeled and unlabeled notes when no label is open', () => {
    const notes = [
      note({ id: 'work', title: 'Apple', labelIds: ['work'] }),
      note({ id: 'both', title: 'Apple', labelIds: ['home', 'work'] }),
      note({ id: 'home', title: 'Apple', labelIds: ['home'], isArchived: true }),
      note({ id: 'plain', title: 'Apple' }),
    ]

    expect(search(notes, { labelId: 'work' }).map((match) => match.id)).toEqual(['work', 'both'])
    expect(search(notes, { labelId: 'home' })).toEqual([{ id: 'both', archived: false }])
    expect(search(notes, { labelId: 'home', includeArchived: true })).toEqual([
      { id: 'both', archived: false },
      { id: 'home', archived: true },
    ])
    expect(search(notes).map((match) => match.id)).toEqual(['work', 'both', 'plain'])
  })

  it('finds one word only among that page\'s notes', () => {
    const notes = [
      note({ id: 'open', title: 'Apple' }),
      note({ id: 'filed', title: 'apple', isArchived: true }),
      note({ id: 'bin', title: 'APPLE', trashedAt: '2026-11-24T12:00:00.000Z' }),
      note({
        id: 'filed-bin',
        title: 'Apple',
        isArchived: true,
        trashedAt: '2026-11-24T12:00:00.000Z',
        labelIds: ['work'],
      }),
      note({ id: 'work', title: 'Apple', labelIds: ['work'] }),
      note({ id: 'work-filed', title: 'Apple', labelIds: ['work'], isArchived: true }),
      note({ id: 'home-label', title: 'Apple', labelIds: ['home'] }),
      note({ id: 'pear', title: 'Pear' }),
      note({
        id: 'old-filed',
        title: 'Pear',
        isArchived: true,
        previousVersions: [{ title: 'Apple', body: null, checklistItems: null }],
      }),
      note({
        id: 'bin-item',
        title: 'Shopping',
        trashedAt: '2026-11-24T12:00:00.000Z',
        checklistItems: [{ text: 'apple sauce' }],
      }),
    ]

    expect(search(notes, { page: 'home' }).map((match) => match.id)).toEqual(['open', 'work', 'home-label'])
    expect(search(notes, { page: 'home', includeArchived: true }).map((match) => match.id)).toEqual([
      'open',
      'filed',
      'work',
      'work-filed',
      'home-label',
    ])
    expect(search(notes, { page: 'archive' }).map((match) => match.id)).toEqual(['filed', 'work-filed'])
    expect(search(notes, { page: 'archive', query: 'APPLE' }).map((match) => match.id)).toEqual(['filed', 'work-filed'])
    expect(search(notes, { page: 'archive', query: 'apple' }).some((match) => match.id === 'old-filed')).toBe(false)
    expect(search(notes, { page: 'trash' }).map((match) => match.id)).toEqual(['bin', 'filed-bin', 'bin-item'])
    expect(search(notes, { page: 'label', labelId: 'work' }).map((match) => match.id)).toEqual(['work'])
    expect(search(notes, { page: 'label', labelId: 'work', includeArchived: true }).map((match) => match.id)).toEqual([
      'work',
      'work-filed',
    ])
    expect(search(notes, { page: 'label', labelId: 'home' }).map((match) => match.id)).toEqual(['home-label'])
    expect(search(notes, { page: 'label', labelId: 'home', includeArchived: true }).map((match) => match.id)).toEqual([
      'home-label',
    ])
  })

  it('matches nothing for an empty query', () => {
    const notes = [note({ id: 'open', title: 'Apple' })]
    expect(search(notes, { query: '' })).toEqual([])
    expect(search(notes, { query: '   ' })).toEqual([])
  })
})
