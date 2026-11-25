// Loads reminders, arms timers, and delivers due ones.
// A missed reminder is one whose time passed while it was not armed (tab closed, or the note was trashed).
// Repeating reminders are version 2: a firing does not schedule the next one.

import type { TracepadDatabase } from '../../data/db'
import {
  listReminderWatches,
  markReminderFired,
  subscribeReminders,
  type ReminderWatch,
} from '../../data/reminders'
import { sameInstant } from '../../domain/reminders'
import { createReminderClock, type ClockTimers } from './clock'

export type ReminderEngine = {
  stop: () => void
  /** Resolves when queued loads and deliveries have finished. */
  settled: () => Promise<void>
}

export function startReminderEngine(
  db: TracepadDatabase,
  options: {
    now?: () => number
    timers?: ClockTimers
    onMissed: (watch: ReminderWatch) => void
    onFired: (watch: ReminderWatch) => void
    onWatches?: (watches: ReminderWatch[]) => void
  },
): ReminderEngine {
  const now = options.now ?? (() => Date.now())
  const timers = options.timers ?? {
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (handle) => clearTimeout(handle),
  }
  let stopped = false
  let tail: Promise<void> = Promise.resolve()
  const seen = new Set<string>()

  function chain(work: () => Promise<void>) {
    const run = tail.then(work, work)
    tail = run.then(
      () => undefined,
      () => undefined,
    )
  }

  function deliver(kind: 'fired' | 'missed', watch: ReminderWatch) {
    const id = `${watch.noteId}\0${watch.fireAt}`
    if (seen.has(id)) return
    seen.add(id)
    if (kind === 'missed') options.onMissed(watch)
    else options.onFired(watch)
  }

  const clock = createReminderClock(timers, now, (noteId, fireAt) => {
    chain(() => handleFire(noteId, fireAt))
  })

  async function handleFire(noteId: string, fireAt: string) {
    if (stopped) return
    const nowIso = new Date(now()).toISOString()
    const watches = await listReminderWatches(db, nowIso)
    const watch = watches.find((item) => item.noteId === noteId)
    // Due and not yet delivered. Paused (trashed) and already-delivered rows stay quiet.
    if (!watch || !watch.missed || !sameInstant(watch.fireAt, fireAt)) return
    deliver('fired', watch)
    await markReminderFired(db, { noteId, fireAt: watch.fireAt, now: nowIso })
  }

  async function reload() {
    if (stopped) return
    const nowIso = new Date(now()).toISOString()
    const watches = await listReminderWatches(db, nowIso)
    if (stopped) return
    const missed = watches.filter((watch) => watch.missed)
    for (const watch of missed) deliver('missed', watch)
    for (const watch of missed) {
      await markReminderFired(db, { noteId: watch.noteId, fireAt: watch.fireAt, now: nowIso })
    }
    if (stopped) return
    clock.sync(watches.map((watch) => ({ noteId: watch.noteId, fireAt: watch.fireAt, paused: watch.paused })))
    options.onWatches?.(watches)
  }

  function scheduleReload() {
    if (stopped) return
    chain(() => reload())
  }

  const unsubscribe = subscribeReminders(scheduleReload)
  scheduleReload()

  return {
    stop() {
      stopped = true
      unsubscribe()
      clock.stop()
    },
    settled: () => tail,
  }
}
