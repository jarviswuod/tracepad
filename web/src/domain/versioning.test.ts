import { describe, expect, it } from 'vitest'
import type { ChecklistItem } from './types'
import {
  checklistDisplayOrder,
  checklistItemsToBody,
  decideContentCut,
  decideVersionCut,
  isEmptyNote,
  isUnchangedText,
  textToChecklistItems,
} from './versioning'

const openedId = '11111111-1111-4111-8111-111111111111'

describe('empty-note rule', () => {
  it('discards a new note when the title and body are empty', () => {
    for (const next of [
      { title: null, body: null },
      { title: '', body: '' },
      { title: null, body: '' },
      { title: '', body: null },
    ]) {
      expect(isEmptyNote(next)).toBe(true)
      expect(
        decideVersionCut({ openedVersionId: null, opened: { title: null, body: null }, next }),
      ).toEqual({ kind: 'discard' })
    }
  })

  it('keeps a new note that has a title only or a body only', () => {
    expect(
      decideVersionCut({
        openedVersionId: null,
        opened: { title: null, body: null },
        next: { title: 'Shopping', body: null },
      }),
    ).toEqual({ kind: 'cut', parentVersionId: null })

    expect(
      decideVersionCut({
        openedVersionId: null,
        opened: { title: '', body: '' },
        next: { title: '', body: 'Milk' },
      }),
    ).toEqual({ kind: 'cut', parentVersionId: null })
  })

  it('treats spaces as text, so a new note of spaces is kept', () => {
    expect(isEmptyNote({ title: ' ', body: '' })).toBe(false)
    expect(
      decideVersionCut({
        openedVersionId: null,
        opened: { title: null, body: null },
        next: { title: ' ', body: null },
      }),
    ).toEqual({ kind: 'cut', parentVersionId: null })
  })

  it('cuts a version when an existing note is cleared, and does not discard it', () => {
    expect(
      decideVersionCut({
        openedVersionId: openedId,
        opened: { title: 'Shopping', body: 'Milk' },
        next: { title: '', body: '' },
      }),
    ).toEqual({ kind: 'cut', parentVersionId: openedId })
  })
})

describe('unchanged-text rule', () => {
  it('cuts no version when the text matches the opened version', () => {
    expect(
      isUnchangedText({ title: 'Shopping', body: null }, { title: 'Shopping', body: '' }),
    ).toBe(true)

    expect(
      decideVersionCut({
        openedVersionId: openedId,
        opened: { title: 'Shopping', body: 'Milk' },
        next: { title: 'Shopping', body: 'Milk' },
      }),
    ).toEqual({ kind: 'unchanged' })
  })

  it('cuts no version when the text is changed and then changed back', () => {
    const opened = { title: 'Shopping', body: 'Milk' }
    const edited = { title: 'Shopping', body: 'Milk and bread' }
    expect(isUnchangedText(opened, edited)).toBe(false)
    expect(
      decideVersionCut({ openedVersionId: openedId, opened, next: opened }),
    ).toEqual({ kind: 'unchanged' })
  })

  it('cuts a version when the title or the body differs', () => {
    expect(
      decideVersionCut({
        openedVersionId: openedId,
        opened: { title: 'Shopping', body: 'Milk' },
        next: { title: 'Shopping', body: 'Milk ' },
      }),
    ).toEqual({ kind: 'cut', parentVersionId: openedId })
  })
})

describe('parent link', () => {
  it('gives the first version no parent', () => {
    expect(
      decideVersionCut({
        openedVersionId: null,
        opened: { title: null, body: null },
        next: { title: 'Shopping', body: 'Milk' },
      }),
    ).toEqual({ kind: 'cut', parentVersionId: null })
  })

  it("sets an edit's parent to the version that was opened", () => {
    expect(
      decideVersionCut({
        openedVersionId: openedId,
        opened: { title: 'Shopping', body: 'Milk' },
        next: { title: 'Shopping', body: 'Bread' },
      }),
    ).toEqual({ kind: 'cut', parentVersionId: openedId })
  })
})

const milk: ChecklistItem = { id: '11111111-1111-4111-8111-111111111111', text: 'Milk', position: 0 }
const bread: ChecklistItem = { id: '22222222-2222-4222-8222-222222222222', text: 'Bread', position: 1 }
const eggs: ChecklistItem = { id: '33333333-3333-4333-8333-333333333333', text: 'Eggs', position: 2 }

function idsFrom(list: string[]): () => string {
  let index = 0
  return () => list[index++]
}

describe('text and checklist conversion', () => {
  it('turns each line into an item and keeps a blank line in the middle', () => {
    expect(textToChecklistItems('Milk\nBread', idsFrom(['a', 'b']))).toEqual([
      { id: 'a', text: 'Milk', position: 0 },
      { id: 'b', text: 'Bread', position: 1 },
    ])
    expect(textToChecklistItems('Milk\n\nBread', idsFrom(['a', 'b', 'c']))).toEqual([
      { id: 'a', text: 'Milk', position: 0 },
      { id: 'b', text: '', position: 1 },
      { id: 'c', text: 'Bread', position: 2 },
    ])
  })

  it('does not make an extra item from a trailing newline, and an empty body has no items', () => {
    expect(textToChecklistItems('Milk\n', idsFrom(['a', 'b']))).toEqual([
      { id: 'a', text: 'Milk', position: 0 },
    ])
    expect(textToChecklistItems(null, idsFrom(['a']))).toEqual([])
    expect(textToChecklistItems('', idsFrom(['a']))).toEqual([])
    expect(textToChecklistItems('  Milk', idsFrom(['a']))).toEqual([
      { id: 'a', text: '  Milk', position: 0 },
    ])
  })

  it('turns items back into lines in position order', () => {
    expect(
      checklistItemsToBody([
        { id: 'b', text: 'Bread', position: 1 },
        { id: 'a', text: 'Milk', position: 0 },
      ]),
    ).toBe('Milk\nBread')
    expect(checklistItemsToBody([])).toBeNull()
    expect(checklistItemsToBody(textToChecklistItems('Milk\nBread', idsFrom(['a', 'b'])))).toBe('Milk\nBread')
  })

  it('cuts a version when text becomes a checklist or a checklist becomes text', () => {
    const items = textToChecklistItems('Milk\nBread', idsFrom(['a', 'b']))
    expect(
      decideContentCut({
        openedVersionId: openedId,
        opened: { kind: 'text', title: 'Shopping', body: 'Milk\nBread' },
        next: { kind: 'checklist', title: 'Shopping', items },
      }),
    ).toEqual({ kind: 'cut', parentVersionId: openedId })

    expect(
      decideContentCut({
        openedVersionId: openedId,
        opened: { kind: 'checklist', title: 'Shopping', items },
        next: { kind: 'text', title: 'Shopping', body: 'Milk\nBread' },
      }),
    ).toEqual({ kind: 'cut', parentVersionId: openedId })
  })

  it('discards a new empty checklist and keeps one that has an item', () => {
    expect(
      decideContentCut({
        openedVersionId: null,
        opened: { kind: 'text', title: null, body: null },
        next: { kind: 'checklist', title: null, items: [] },
      }),
    ).toEqual({ kind: 'discard' })

    expect(
      decideContentCut({
        openedVersionId: null,
        opened: { kind: 'checklist', title: null, items: [] },
        next: { kind: 'checklist', title: 'Shopping', items: [] },
      }),
    ).toEqual({ kind: 'cut', parentVersionId: null })
  })
})

describe('checklist item edits', () => {
  const opened = { kind: 'checklist' as const, title: 'Shopping', items: [milk, bread] }

  it('cuts a version when an item is added, removed, reworded, or reordered', () => {
    expect(
      decideContentCut({
        openedVersionId: openedId,
        opened,
        next: { kind: 'checklist', title: 'Shopping', items: [milk, bread, eggs] },
      }),
    ).toEqual({ kind: 'cut', parentVersionId: openedId })

    expect(
      decideContentCut({
        openedVersionId: openedId,
        opened,
        next: { kind: 'checklist', title: 'Shopping', items: [milk] },
      }),
    ).toEqual({ kind: 'cut', parentVersionId: openedId })

    expect(
      decideContentCut({
        openedVersionId: openedId,
        opened,
        next: { kind: 'checklist', title: 'Shopping', items: [{ ...milk, text: 'Oat milk' }, bread] },
      }),
    ).toEqual({ kind: 'cut', parentVersionId: openedId })

    expect(
      decideContentCut({
        openedVersionId: openedId,
        opened,
        next: {
          kind: 'checklist',
          title: 'Shopping',
          items: [
            { ...bread, position: 0 },
            { ...milk, position: 1 },
          ],
        },
      }),
    ).toEqual({ kind: 'cut', parentVersionId: openedId })
  })

  it('cuts no version when the items match, including after a change is undone', () => {
    expect(
      decideContentCut({
        openedVersionId: openedId,
        opened,
        next: {
          kind: 'checklist',
          title: 'Shopping',
          items: [
            { ...milk, position: 5 },
            { ...bread, position: 9 },
          ],
        },
      }),
    ).toEqual({ kind: 'unchanged' })

    const reworded = { kind: 'checklist' as const, title: 'Shopping', items: [{ ...milk, text: 'Oat milk' }, bread] }
    expect(decideContentCut({ openedVersionId: openedId, opened, next: reworded })).toEqual({
      kind: 'cut',
      parentVersionId: openedId,
    })
    expect(decideContentCut({ openedVersionId: openedId, opened, next: opened })).toEqual({ kind: 'unchanged' })
  })
})

describe('checklist display order', () => {
  it('moves ticked items to the bottom and leaves stored positions alone', () => {
    const items = [milk, bread, eggs]
    expect(checklistDisplayOrder(items, new Set([milk.id])).map((item) => item.text)).toEqual([
      'Bread',
      'Eggs',
      'Milk',
    ])
    expect(checklistDisplayOrder(items, new Set()).map((item) => item.id)).toEqual([milk.id, bread.id, eggs.id])
    expect(items.map((item) => item.position)).toEqual([0, 1, 2])
  })
})
