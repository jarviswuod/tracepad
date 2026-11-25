import { afterEach, describe, expect, it, vi } from 'vitest'
import { createReminderClock } from './clock'

const noteId = 'note-1'
const start = Date.parse('2026-11-25T12:00:00.000Z')

describe('reminder clock', () => {
  let now = start

  afterEach(() => {
    vi.useRealTimers()
  })

  function harness(maxDelay?: number) {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    now = start
    const fired: string[] = []
    const clock = createReminderClock(
      {
        setTimeout: (fn, ms) => setTimeout(fn, ms),
        clearTimeout: (handle) => clearTimeout(handle),
      },
      () => now,
      (id) => fired.push(id),
      maxDelay,
    )
    return { clock, fired }
  }

  async function advance(ms: number) {
    now += ms
    await vi.advanceTimersByTimeAsync(ms)
  }

  function at(ms: number) {
    return new Date(start + ms).toISOString()
  }

  it('fires when the delay elapses and not before', async () => {
    const { clock, fired } = harness()
    clock.sync([{ noteId, fireAt: at(4000), paused: false }])

    await advance(3999)
    expect(fired).toEqual([])
    await advance(1)
    expect(fired).toEqual([noteId])
    clock.stop()
  })

  it('drops the old timer when the time changes', async () => {
    const { clock, fired } = harness()
    clock.sync([{ noteId, fireAt: at(5000), paused: false }])
    clock.sync([{ noteId, fireAt: at(9000), paused: false }])

    await advance(5000)
    expect(fired).toEqual([])
    await advance(4000)
    expect(fired).toEqual([noteId])
    clock.stop()
  })

  it('cancels a removed reminder', async () => {
    const { clock, fired } = harness()
    clock.sync([{ noteId, fireAt: at(3000), paused: false }])
    clock.sync([])

    await advance(3000)
    expect(fired).toEqual([])
    clock.stop()
  })

  it('does not fire a paused reminder, including one that was already armed', async () => {
    const { clock, fired } = harness()
    clock.sync([{ noteId, fireAt: at(2000), paused: false }])
    clock.sync([{ noteId, fireAt: at(2000), paused: true }])

    await advance(2000)
    expect(fired).toEqual([])
    clock.sync([{ noteId, fireAt: at(4000), paused: true }])
    await advance(2000)
    expect(fired).toEqual([])
    clock.stop()
  })

  it('splits a wait longer than the cap and still fires on time', async () => {
    const { clock, fired } = harness(1000)
    clock.sync([{ noteId, fireAt: at(2500), paused: false }])

    await advance(1000)
    expect(fired).toEqual([])
    await advance(1000)
    expect(fired).toEqual([])
    await advance(500)
    expect(fired).toEqual([noteId])
    clock.stop()
  })
})
