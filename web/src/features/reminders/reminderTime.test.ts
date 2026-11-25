import { describe, expect, it } from 'vitest'
import { datetimeLocalToIso, defaultReminderValue, isoToDatetimeLocal, reminderFieldValue } from './ReminderControl'

describe('reminder default time', () => {
  it('is three hours ahead of a fixed clock, with seconds at zero, including across midnight', () => {
    const evening = new Date(2026, 10, 25, 22, 15, 45, 500)
    expect(defaultReminderValue(evening)).toBe('2026-11-26T01:15')

    const late = new Date(2026, 10, 25, 23, 59, 59, 999)
    expect(defaultReminderValue(late)).toBe('2026-11-26T02:59')

    const morning = new Date(2026, 10, 25, 9, 4, 59, 999)
    expect(defaultReminderValue(morning)).toBe('2026-11-25T12:04')

    const exact = new Date(2026, 10, 25, 21, 0, 0, 0)
    expect(defaultReminderValue(exact)).toBe('2026-11-26T00:00')
  })

  it('keeps a saved reminder instead of the default, still with no seconds', () => {
    const now = new Date(2026, 10, 25, 22, 15, 45, 500)
    const saved = new Date(2026, 10, 26, 8, 30, 45, 250).toISOString()

    expect(reminderFieldValue(saved, now)).toBe('2026-11-26T08:30')
    expect(reminderFieldValue(saved, now)).not.toBe(defaultReminderValue(now))
    expect(isoToDatetimeLocal(saved)).toBe('2026-11-26T08:30')
    expect(reminderFieldValue(null, now)).toBe('2026-11-26T01:15')
    expect(reminderFieldValue(undefined, now)).toBe(defaultReminderValue(now))
  })

  it('stores a field value with seconds and milliseconds at zero', () => {
    const iso = datetimeLocalToIso('2099-06-15T08:30:45.250')
    expect(iso).toMatch(/T\d{2}:\d{2}:00\.000Z$/)
    const date = new Date(iso ?? '')
    expect(date.getFullYear()).toBe(2099)
    expect(date.getMonth()).toBe(5)
    expect(date.getDate()).toBe(15)
    expect(date.getHours()).toBe(8)
    expect(date.getMinutes()).toBe(30)
    expect(date.getSeconds()).toBe(0)
    expect(date.getMilliseconds()).toBe(0)
    expect(isoToDatetimeLocal(iso ?? '')).toBe('2099-06-15T08:30')
  })
})
