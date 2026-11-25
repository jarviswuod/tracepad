import type { HistoryEvent, IsoTimestamp, Reminder, Uuid } from '../domain/types'
import {
  refusalForFireAt,
  reminderHasFired,
  reminderIsMissed,
  reminderIsPaused,
  sameInstant,
  PAST_TIME_MESSAGE,
} from '../domain/reminders'
import type { TracepadDatabase } from './db'
import { queueOutbox } from './outbox'

const listeners = new Set<() => void>()

/** The open tab re-reads reminders after a set, change, remove, trash, or restore. */
export function subscribeReminders(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function remindersChanged(): void {
  for (const listener of [...listeners]) listener()
}

export type SetReminderResult =
  | { ok: true; changed: boolean }
  | { ok: false; message: typeof PAST_TIME_MESSAGE | null }

export type ReminderWatch = {
  noteId: Uuid
  fireAt: IsoTimestamp
  title: string | null
  paused: boolean
  missed: boolean
}

function nowStamp(now?: IsoTimestamp): IsoTimestamp {
  return now ?? new Date().toISOString()
}

/** Await the writes and the commit. A failed write still settles `done`, so an abort is not left unhandled. */
async function finishTransaction(writing: Promise<void>, done: Promise<void>): Promise<void> {
  const settled = done.then(
    () => undefined,
    () => undefined,
  )
  try {
    await writing
    await done
  } catch (error) {
    await settled
    throw error
  }
}

function historyEvent(
  noteId: Uuid,
  deviceId: Uuid,
  type: 'reminder_set' | 'reminder_changed' | 'reminder_removed',
  fireAt: IsoTimestamp,
  occurredAt: IsoTimestamp,
): HistoryEvent {
  return {
    id: crypto.randomUUID(),
    noteId,
    deviceId,
    type,
    payload: { fireAt },
    occurredAt,
  }
}

export function getReminder(db: TracepadDatabase, noteId: Uuid): Promise<Reminder | undefined> {
  return db.get('reminders', noteId)
}

/**
 * Notes that have a reminder, with whether the open tab should wait, show a miss, or stay quiet.
 * A trashed note is paused. An archived note is not.
 */
export async function listReminderWatches(db: TracepadDatabase, now: IsoTimestamp): Promise<ReminderWatch[]> {
  const reminders = await db.getAll('reminders')
  reminders.sort((a, b) => a.fireAt.localeCompare(b.fireAt) || a.noteId.localeCompare(b.noteId))
  const watches: ReminderWatch[] = []
  for (const reminder of reminders) {
    const note = await db.get('notes', reminder.noteId)
    let title: string | null = null
    if (note?.currentVersionId) {
      const version = await db.get('noteVersions', note.currentVersionId)
      title = version?.title ?? null
    }
    watches.push({
      noteId: reminder.noteId,
      fireAt: reminder.fireAt,
      title,
      paused: reminderIsPaused(note ?? null),
      missed: reminderIsMissed(reminder, note ?? null, now),
    })
  }
  return watches
}

/**
 * Set the note's one reminder, or move it when one already exists.
 * A past time is refused before any write. The same future time is left as it is.
 * A change writes the reminder, one history entry, and one outbox row. No version is cut.
 * repeatInterval stays empty: repeating reminders are version 2.
 */
export async function setReminder(
  db: TracepadDatabase,
  input: { noteId: Uuid; fireAt: IsoTimestamp; deviceId: Uuid; now?: IsoTimestamp },
): Promise<SetReminderResult> {
  const now = nowStamp(input.now)
  if (refusalForFireAt(input.fireAt, now)) return { ok: false, message: PAST_TIME_MESSAGE }

  const tx = db.transaction(['notes', 'reminders', 'historyEvents', 'outbox'], 'readwrite')
  let result: SetReminderResult = { ok: false, message: null }
  let changed = false
  const writing = (async () => {
    const note = await tx.objectStore('notes').get(input.noteId)
    if (!note) return
    const existing = await tx.objectStore('reminders').get(input.noteId)
    if (existing && sameInstant(existing.fireAt, input.fireAt)) {
      result = { ok: true, changed: false }
      return
    }
    const reminder: Reminder = {
      noteId: note.id,
      userId: note.userId,
      fireAt: input.fireAt,
      repeatInterval: null,
      lastFiredAt: null,
      dismissedAt: null,
      pushSentAt: null,
      updatedAt: now,
    }
    await tx.objectStore('reminders').put(reminder)
    await tx.objectStore('historyEvents').put(
      historyEvent(note.id, input.deviceId, existing ? 'reminder_changed' : 'reminder_set', input.fireAt, now),
    )
    await queueOutbox(tx.objectStore('outbox'), {
      entityType: 'reminder',
      entityId: note.id,
      op: existing ? 'update' : 'create',
      payload: reminder,
      createdAt: now,
      userId: note.userId,
    })
    changed = true
    result = { ok: true, changed: true }
  })()
  await finishTransaction(writing, tx.done)
  if (changed) remindersChanged()
  return result
}

/**
 * Remove the note's reminder. One history entry and one outbox row.
 * A note with no reminder is left alone.
 */
export async function removeReminder(
  db: TracepadDatabase,
  input: { noteId: Uuid; deviceId: Uuid; now?: IsoTimestamp },
): Promise<boolean> {
  const now = nowStamp(input.now)
  const tx = db.transaction(['notes', 'reminders', 'historyEvents', 'outbox'], 'readwrite')
  let removed = false
  const writing = (async () => {
    const note = await tx.objectStore('notes').get(input.noteId)
    const existing = await tx.objectStore('reminders').get(input.noteId)
    if (!note || !existing) return
    await tx.objectStore('reminders').delete(note.id)
    await tx.objectStore('historyEvents').put(
      historyEvent(note.id, input.deviceId, 'reminder_removed', existing.fireAt, now),
    )
    await queueOutbox(tx.objectStore('outbox'), {
      entityType: 'reminder',
      entityId: note.id,
      op: 'delete',
      payload: { noteId: note.id },
      createdAt: now,
      userId: note.userId,
    })
    removed = true
  })()
  await finishTransaction(writing, tx.done)
  if (removed) remindersChanged()
  return removed
}

/**
 * Record that this fire time was delivered, so the next open does not show it as missed.
 * No history entry: firing is not a set, change, or remove. One outbox row, because the
 * reminder row changed. A different fire time, or one already delivered, is left alone.
 */
export async function markReminderFired(
  db: TracepadDatabase,
  input: { noteId: Uuid; fireAt: IsoTimestamp; now?: IsoTimestamp },
): Promise<boolean> {
  const now = nowStamp(input.now)
  const tx = db.transaction(['reminders', 'outbox'], 'readwrite')
  let marked = false
  const writing = (async () => {
    const existing = await tx.objectStore('reminders').get(input.noteId)
    if (!existing || !sameInstant(existing.fireAt, input.fireAt) || reminderHasFired(existing)) return
    const reminder: Reminder = { ...existing, lastFiredAt: now, updatedAt: now }
    await tx.objectStore('reminders').put(reminder)
    await queueOutbox(tx.objectStore('outbox'), {
      entityType: 'reminder',
      entityId: reminder.noteId,
      op: 'update',
      payload: reminder,
      createdAt: now,
      userId: reminder.userId,
    })
    marked = true
  })()
  await finishTransaction(writing, tx.done)
  return marked
}
