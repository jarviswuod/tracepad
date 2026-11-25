import { describe, expect, it } from 'vitest'
import {
  PAST_TIME_MESSAGE,
  refusalForFireAt,
  reminderHasFired,
  reminderIsMissed,
  reminderIsPaused,
  reminderShouldArm,
} from './reminders'

const now = '2026-11-25T12:00:00.000Z'
const future = '2026-11-25T12:05:00.000Z'
const past = '2026-11-25T11:00:00.000Z'
const open = { trashedAt: null }
const archived = { trashedAt: null }
const trashed = { trashedAt: past }

describe('reminder rules', () => {
  it('refuses a time that is not in the future', () => {
    expect(refusalForFireAt(past, now)).toBe(PAST_TIME_MESSAGE)
    expect(refusalForFireAt(now, now)).toBe(PAST_TIME_MESSAGE)
    expect(refusalForFireAt('not-a-time', now)).toBe(PAST_TIME_MESSAGE)
    expect(refusalForFireAt('', now)).toBe(PAST_TIME_MESSAGE)
    expect(refusalForFireAt(future, now)).toBeNull()
    expect(PAST_TIME_MESSAGE).toBe('Pick a future time.')
  })

  it('pauses a trashed or missing note and still arms an archived one', () => {
    const reminder = { fireAt: future, lastFiredAt: null }
    expect(reminderIsPaused(trashed)).toBe(true)
    expect(reminderIsPaused(null)).toBe(true)
    expect(reminderIsPaused(archived)).toBe(false)
    expect(reminderShouldArm(reminder, archived, now)).toBe(true)
    expect(reminderShouldArm(reminder, trashed, now)).toBe(false)
    expect(reminderShouldArm(reminder, null, now)).toBe(false)
    expect(reminderIsMissed(reminder, trashed, future)).toBe(false)
  })

  it('detects a due reminder that has not fired, and ignores one that has', () => {
    const reminder = { fireAt: past, lastFiredAt: null }
    expect(reminderIsMissed(reminder, open, now)).toBe(true)
    expect(reminderShouldArm(reminder, open, now)).toBe(false)
    expect(reminderIsMissed({ fireAt: future, lastFiredAt: null }, open, now)).toBe(false)
    expect(reminderHasFired({ fireAt: past, lastFiredAt: now })).toBe(true)
    expect(reminderIsMissed({ fireAt: past, lastFiredAt: now }, open, now)).toBe(false)
    expect(reminderHasFired({ fireAt: future, lastFiredAt: past })).toBe(false)
    expect(reminderShouldArm({ fireAt: future, lastFiredAt: past }, open, now)).toBe(true)
  })
})
