import { describe, expect, it } from 'vitest'
import type { NoteVersion } from '../../domain/types'
import { compareText, compareVersions, versionText } from './compare'

describe('compareText', () => {
  it('marks added and removed text', () => {
    const diff = compareText('hello world', 'hello there')

    expect(diff.older).toEqual([
      { text: 'hello ', mark: 'same' },
      { text: 'world', mark: 'removed' },
    ])
    expect(diff.newer).toEqual([
      { text: 'hello ', mark: 'same' },
      { text: 'there', mark: 'added' },
    ])
    expect(diff.older.some((piece) => piece.mark === 'added')).toBe(false)
    expect(diff.newer.some((piece) => piece.mark === 'removed')).toBe(false)
  })

  it('diffs the title and the body on their own', () => {
    const diff = compareVersions(
      { title: 'Groceries', body: 'alpha' },
      { title: 'Groceries', body: 'beta' },
    )

    expect(diff.title.older.every((piece) => piece.mark === 'same')).toBe(true)
    expect(diff.title.newer.every((piece) => piece.mark === 'same')).toBe(true)
    expect(diff.body.older).toEqual([{ text: 'alpha', mark: 'removed' }])
    expect(diff.body.newer).toEqual([{ text: 'beta', mark: 'added' }])
  })
})

describe('versionText', () => {
  it('reads checklist items in position order as the body', () => {
    const version: NoteVersion = {
      id: 'v1',
      noteId: 'note-1',
      parentVersionId: null,
      deviceId: 'device-1',
      kind: 'checklist',
      title: 'Shopping',
      body: null,
      checklistItems: [
        { id: 'b', text: 'Bread', position: 1 },
        { id: 'a', text: 'Milk', position: 0 },
      ],
      createdAt: '2026-11-24T10:00:00.000Z',
      receivedAt: null,
    }

    expect(versionText(version)).toEqual({ title: 'Shopping', body: 'Milk\nBread' })
  })
})
