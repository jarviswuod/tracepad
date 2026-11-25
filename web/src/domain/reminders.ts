// One reminder per note. A time that is not strictly after now is refused.
// Trashed notes pause the reminder. Archived notes still fire.
// Repeating reminders are version 2 (section 20) and are not scheduled here.

import type { IsoTimestamp } from './types'

export const PAST_TIME_MESSAGE = 'Pick a future time.'

export function sameInstant(a: string, b: string): boolean {
  const left = Date.parse(a)
  const right = Date.parse(b)
  return Number.isFinite(left) && left === right
}

/** A missing note is paused too: there is nothing to open. */
export function reminderIsPaused(note: { trashedAt: IsoTimestamp | null } | null): boolean {
  return note == null || note.trashedAt != null
}

/** True once this fire time has already been delivered. A later fire time has not. */
export function reminderHasFired(reminder: { fireAt: IsoTimestamp; lastFiredAt: IsoTimestamp | null }): boolean {
  if (reminder.lastFiredAt == null) return false
  const fired = Date.parse(reminder.lastFiredAt)
  const due = Date.parse(reminder.fireAt)
  return Number.isFinite(fired) && Number.isFinite(due) && fired >= due
}

/**
 * Due, not paused, and not yet delivered. The tab was closed (or the note was
 * trashed) at the fire time, so the next open shows it as missed.
 */
export function reminderIsMissed(
  reminder: { fireAt: IsoTimestamp; lastFiredAt: IsoTimestamp | null },
  note: { trashedAt: IsoTimestamp | null } | null,
  now: IsoTimestamp,
): boolean {
  if (reminderIsPaused(note) || reminderHasFired(reminder)) return false
  const due = Date.parse(reminder.fireAt)
  const current = Date.parse(now)
  return Number.isFinite(due) && Number.isFinite(current) && due <= current
}

/** Future, not paused, and not yet delivered. The open tab arms a timer for it. */
export function reminderShouldArm(
  reminder: { fireAt: IsoTimestamp; lastFiredAt: IsoTimestamp | null },
  note: { trashedAt: IsoTimestamp | null } | null,
  now: IsoTimestamp,
): boolean {
  if (reminderIsPaused(note) || reminderHasFired(reminder)) return false
  const due = Date.parse(reminder.fireAt)
  const current = Date.parse(now)
  return Number.isFinite(due) && Number.isFinite(current) && due > current
}

/** Form check. Empty, unreadable, and past times, including now, are refused. */
export function refusalForFireAt(fireAt: string, now: IsoTimestamp): typeof PAST_TIME_MESSAGE | null {
  const due = Date.parse(fireAt)
  const current = Date.parse(now)
  if (!Number.isFinite(due) || !Number.isFinite(current) || due <= current) return PAST_TIME_MESSAGE
  return null
}
