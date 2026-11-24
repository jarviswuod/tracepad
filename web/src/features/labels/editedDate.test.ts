import { describe, expect, it } from 'vitest'
import { formatEditedDate } from './editedDate'

describe('formatEditedDate', () => {
  const now = new Date(2026, 10, 25, 18, 0, 0)

  it('uses the time when the note was updated today', () => {
    expect(formatEditedDate(new Date(2026, 10, 25, 15, 4).toISOString(), now)).toBe('Edited 3:04 PM')
    expect(formatEditedDate(new Date(2026, 10, 25, 9, 5).toISOString(), now)).toBe('Edited 9:05 AM')
    expect(formatEditedDate(new Date(2026, 10, 25, 0, 0).toISOString(), now)).toBe('Edited 12:00 AM')
    expect(formatEditedDate(new Date(2026, 10, 25, 12, 0).toISOString(), now)).toBe('Edited 12:00 PM')
  })

  it('uses the month and day for a note updated this year', () => {
    expect(formatEditedDate(new Date(2026, 10, 3, 8, 0).toISOString(), now)).toBe('Edited Nov 3')
    expect(formatEditedDate(new Date(2026, 3, 29, 8, 0).toISOString(), now)).toBe('Edited Apr 29')
  })

  it('adds the year when the note was updated in another year', () => {
    expect(formatEditedDate(new Date(2024, 3, 29, 8, 0).toISOString(), now)).toBe('Edited Apr 29, 2024')
    expect(formatEditedDate(new Date(2025, 0, 2, 8, 0).toISOString(), now)).toBe('Edited Jan 2, 2025')
  })
})
