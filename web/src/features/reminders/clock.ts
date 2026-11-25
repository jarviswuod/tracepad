// Timers for reminders while this tab is open. A change drops the old timer.
// A wait longer than the browser will honor is split into chunks and re-armed.
// Repeating reminders are version 2 and are not re-armed after they fire.

export const MAX_TIMER_MS = 2_147_483_647

export type ClockTimers = {
  setTimeout: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => void
}

export type ArmableReminder = {
  noteId: string
  fireAt: string
  paused: boolean
}

type Armed = {
  fireAt: string
  handle: ReturnType<typeof setTimeout>
}

export type ReminderClock = {
  sync: (items: readonly ArmableReminder[]) => void
  stop: () => void
}

export function createReminderClock(
  timers: ClockTimers,
  now: () => number,
  onFire: (noteId: string, fireAt: string) => void,
  maxDelay = MAX_TIMER_MS,
): ReminderClock {
  const armed = new Map<string, Armed>()

  function clear(noteId: string) {
    const existing = armed.get(noteId)
    if (!existing) return
    timers.clearTimeout(existing.handle)
    armed.delete(noteId)
  }

  function start(noteId: string, fireAt: string) {
    const delay = Date.parse(fireAt) - now()
    if (!Number.isFinite(delay) || delay <= 0) {
      clear(noteId)
      return
    }
    const wait = Math.min(delay, maxDelay)
    const handle = timers.setTimeout(() => {
      const left = Date.parse(fireAt) - now()
      if (left > 0) {
        start(noteId, fireAt)
        return
      }
      armed.delete(noteId)
      onFire(noteId, fireAt)
    }, wait)
    const previous = armed.get(noteId)
    if (previous) timers.clearTimeout(previous.handle)
    armed.set(noteId, { fireAt, handle })
  }

  return {
    sync(items) {
      const keep = new Set<string>()
      for (const item of items) {
        if (item.paused) continue
        const delay = Date.parse(item.fireAt) - now()
        if (!Number.isFinite(delay) || delay <= 0) continue
        keep.add(item.noteId)
        const existing = armed.get(item.noteId)
        if (existing && existing.fireAt === item.fireAt) continue
        start(item.noteId, item.fireAt)
      }
      for (const noteId of [...armed.keys()]) {
        if (!keep.has(noteId)) clear(noteId)
      }
    },
    stop() {
      for (const noteId of [...armed.keys()]) clear(noteId)
    },
  }
}
