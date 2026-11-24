import { describe, expect, it } from 'vitest'
import { isTrashExpired, isTrashed, TRASH_RETENTION_DAYS } from './trash'

const DAY_MS = 24 * 60 * 60 * 1000
const now = '2026-11-24T12:00:00.000Z'
const nowMs = Date.parse(now)

function at(deltaMs: number): string {
  return new Date(nowMs + deltaMs).toISOString()
}

describe('trash retention', () => {
  it('keeps a note for 30 days and treats later as expired', () => {
    expect(TRASH_RETENTION_DAYS).toBe(30)
    expect(isTrashExpired(now, now)).toBe(false)
    expect(isTrashExpired(at(-29 * DAY_MS), now)).toBe(false)
    expect(isTrashExpired(at(-30 * DAY_MS), now)).toBe(false)
    expect(isTrashExpired(at(-30 * DAY_MS - 1), now)).toBe(true)
    expect(isTrashExpired(at(-31 * DAY_MS), now)).toBe(true)
    expect(isTrashExpired(at(DAY_MS), now)).toBe(false)
    expect(isTrashExpired('not-a-time', now)).toBe(false)
  })

  it('treats a set trashedAt as hidden from the board and from search', () => {
    expect(isTrashed({ trashedAt: now })).toBe(true)
    expect(isTrashed({ trashedAt: null })).toBe(false)
  })
})
