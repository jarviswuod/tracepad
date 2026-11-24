import { describe, expect, it } from 'vitest'
import { decideVersionCut, isEmptyNote, isUnchangedText } from './versioning'

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
