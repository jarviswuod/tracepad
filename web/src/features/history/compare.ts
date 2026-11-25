// Side by side. The older side keeps removed text. The newer side keeps added text.
// Word diff from the `diff` package (jsdiff). Color is not text, so it is never compared.

import { diffWords } from 'diff'
import type { NoteVersion } from '../../domain/types'
import { displayedBody } from '../../domain/versioning'

export type DiffMark = 'same' | 'added' | 'removed'

export type DiffPiece = {
  text: string
  mark: DiffMark
}

export type SideBySideDiff = {
  older: DiffPiece[]
  newer: DiffPiece[]
}

export function versionText(version: NoteVersion): { title: string; body: string } {
  return { title: version.title ?? '', body: displayedBody(version) ?? '' }
}

/** Older on the left, newer on the right, by the version's own time. */
export function orderVersions(a: NoteVersion, b: NoteVersion): { older: NoteVersion; newer: NoteVersion } {
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? { older: a, newer: b } : { older: b, newer: a }
  }
  return a.id <= b.id ? { older: a, newer: b } : { older: b, newer: a }
}

export function compareText(older: string, newer: string): SideBySideDiff {
  const olderPieces: DiffPiece[] = []
  const newerPieces: DiffPiece[] = []
  for (const change of diffWords(older, newer)) {
    if (change.value === '') continue
    if (change.added) {
      newerPieces.push({ text: change.value, mark: 'added' })
    } else if (change.removed) {
      olderPieces.push({ text: change.value, mark: 'removed' })
    } else {
      olderPieces.push({ text: change.value, mark: 'same' })
      newerPieces.push({ text: change.value, mark: 'same' })
    }
  }
  return { older: olderPieces, newer: newerPieces }
}

export function compareVersions(
  older: { title: string; body: string },
  newer: { title: string; body: string },
): { title: SideBySideDiff; body: SideBySideDiff } {
  return {
    title: compareText(older.title, newer.title),
    body: compareText(older.body, newer.body),
  }
}
