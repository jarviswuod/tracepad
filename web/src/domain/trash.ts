import type { IsoTimestamp } from './types'

/** A trashed note is removed after this many days, on the device or by the server. */
export const TRASH_RETENTION_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

export const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * DAY_MS

/**
 * Trash is a flag. The board hides these notes except in Trash.
 * Search includes them on the Trash page and leaves them out everywhere else.
 */
export function isTrashed(note: { trashedAt: IsoTimestamp | null }): boolean {
  return note.trashedAt != null
}

/** True when `trashedAt` is more than 30 days before `now`. Exactly 30 days is still in the trash. */
export function isTrashExpired(trashedAt: IsoTimestamp, now: IsoTimestamp): boolean {
  const elapsed = Date.parse(now) - Date.parse(trashedAt)
  return Number.isFinite(elapsed) && elapsed > TRASH_RETENTION_MS
}
