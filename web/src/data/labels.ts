import type { HistoryEvent, IsoTimestamp, Label, NoteLabel, Uuid } from '../domain/types'
import type { TracepadDatabase } from './db'
import { queueOutbox } from './outbox'

/** Case-insensitive, digits before letters, numbers in natural order ("1. 9" before "1. 10"). */
const labelNameOrder = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

export function compareLabelNames(a: string, b: string): number {
  return labelNameOrder.compare(a, b)
}

/** Labels in name order, for the side list and the note's label picker. */
export async function listLabels(db: TracepadDatabase): Promise<Label[]> {
  const labels = await db.getAll('labels')
  return labels.sort(
    (a, b) => compareLabelNames(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
}

/** Labels still on this note. A removed join stays in the database and is left out of this list. */
export async function listActiveLabelIds(db: TracepadDatabase, noteId: Uuid): Promise<Uuid[]> {
  const links = await db.getAll('noteLabels')
  return links.filter((link) => link.noteId === noteId && !link.isRemoved).map((link) => link.labelId)
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

function cleanName(name: string): string | null {
  const trimmed = name.trim()
  return trimmed === '' ? null : trimmed
}

function nameTaken(labels: Label[], userId: Uuid | null, name: string, exceptId?: Uuid): boolean {
  const key = name.toLowerCase()
  return labels.some(
    (label) => label.id !== exceptId && label.userId === userId && label.name.toLowerCase() === key,
  )
}

function labelEvent(
  noteId: Uuid,
  deviceId: Uuid,
  type: 'label_added' | 'label_removed',
  labelId: Uuid,
  occurredAt: IsoTimestamp,
): HistoryEvent {
  return {
    id: crypto.randomUUID(),
    noteId,
    deviceId,
    type,
    payload: { labelId },
    occurredAt,
  }
}

/**
 * A new label for the side list. Blank and duplicate names (ignoring case) are refused.
 * No history entry: a label on its own is not a change to a note.
 */
export async function createLabel(
  db: TracepadDatabase,
  input: { name: string; userId?: Uuid | null; now?: IsoTimestamp },
): Promise<Label | null> {
  const name = cleanName(input.name)
  if (name == null) return null
  const now = nowStamp(input.now)
  const userId = input.userId ?? null
  const tx = db.transaction(['labels', 'outbox'], 'readwrite')
  let created: Label | null = null
  const writing = (async () => {
    const labels = tx.objectStore('labels')
    const existing = await labels.getAll()
    if (nameTaken(existing, userId, name)) return
    const label: Label = { id: crypto.randomUUID(), userId, name, updatedAt: now }
    await labels.put(label)
    await queueOutbox(tx.objectStore('outbox'), {
      entityType: 'label',
      entityId: label.id,
      op: 'create',
      payload: label,
      createdAt: now,
      userId,
    })
    created = label
  })()
  await finishTransaction(writing, tx.done)
  return created
}

/**
 * Every note that carries the label shows the new name. No history entry per note.
 * Blank, missing, and duplicate names are refused. The same name is left as it is.
 */
export async function renameLabel(
  db: TracepadDatabase,
  input: { labelId: Uuid; name: string; now?: IsoTimestamp },
): Promise<Label | null> {
  const name = cleanName(input.name)
  if (name == null) return null
  const now = nowStamp(input.now)
  const tx = db.transaction(['labels', 'outbox'], 'readwrite')
  let renamed: Label | null = null
  const writing = (async () => {
    const labels = tx.objectStore('labels')
    const current = await labels.get(input.labelId)
    if (!current) return
    if (current.name === name) {
      renamed = current
      return
    }
    const existing = await labels.getAll()
    if (nameTaken(existing, current.userId, name, current.id)) return
    const label: Label = { ...current, name, updatedAt: now }
    await labels.put(label)
    await queueOutbox(tx.objectStore('outbox'), {
      entityType: 'label',
      entityId: label.id,
      op: 'update',
      payload: label,
      createdAt: now,
      userId: label.userId,
    })
    renamed = label
  })()
  await finishTransaction(writing, tx.done)
  return renamed
}

/**
 * Delete the label and its join rows. Notes stay, and none of their versions are cut.
 * Each note that still had the label gets a label_removed entry. One label outbox row.
 */
export async function deleteLabel(
  db: TracepadDatabase,
  input: { labelId: Uuid; deviceId: Uuid; now?: IsoTimestamp },
): Promise<boolean> {
  const now = nowStamp(input.now)
  const tx = db.transaction(['labels', 'noteLabels', 'historyEvents', 'outbox'], 'readwrite')
  let deleted = false
  const writing = (async () => {
    const label = await tx.objectStore('labels').get(input.labelId)
    if (!label) return
    const links = await tx.objectStore('noteLabels').index('byLabelId').getAll(input.labelId)
    for (const link of links) {
      if (!link.isRemoved) {
        await tx.objectStore('historyEvents').put(
          labelEvent(link.noteId, input.deviceId, 'label_removed', label.id, now),
        )
      }
      await tx.objectStore('noteLabels').delete([link.noteId, link.labelId])
    }
    await tx.objectStore('labels').delete(label.id)
    await queueOutbox(tx.objectStore('outbox'), {
      entityType: 'label',
      entityId: label.id,
      op: 'delete',
      payload: { id: label.id },
      createdAt: now,
      userId: label.userId,
    })
    deleted = true
  })()
  await finishTransaction(writing, tx.done)
  return deleted
}

/**
 * Put the label on the note. The join row is kept when it was only removed, so a later remove can win.
 * One history entry and one note_label outbox row. A note_label has no single id: the outbox entity id
 * is the note, and the payload carries both ids. The note's version is not touched.
 */
export async function addLabelToNote(
  db: TracepadDatabase,
  input: { noteId: Uuid; labelId: Uuid; deviceId: Uuid; now?: IsoTimestamp },
): Promise<boolean> {
  const now = nowStamp(input.now)
  const tx = db.transaction(['notes', 'labels', 'noteLabels', 'historyEvents', 'outbox'], 'readwrite')
  let added = false
  const writing = (async () => {
    const note = await tx.objectStore('notes').get(input.noteId)
    const label = await tx.objectStore('labels').get(input.labelId)
    if (!note || !label) return
    const existing = await tx.objectStore('noteLabels').get([input.noteId, input.labelId])
    if (existing && !existing.isRemoved) return
    const link: NoteLabel = {
      noteId: input.noteId,
      labelId: input.labelId,
      isRemoved: false,
      updatedAt: now,
    }
    await tx.objectStore('noteLabels').put(link)
    await tx.objectStore('historyEvents').put(labelEvent(note.id, input.deviceId, 'label_added', label.id, now))
    await queueOutbox(tx.objectStore('outbox'), {
      entityType: 'note_label',
      entityId: note.id,
      op: existing ? 'update' : 'create',
      payload: link,
      createdAt: now,
      userId: note.userId,
    })
    added = true
  })()
  await finishTransaction(writing, tx.done)
  return added
}

/**
 * Take the label off the note. The join stays with is_removed set, so a later add can win.
 * One history entry and one note_label outbox row. No version is cut.
 */
export async function removeLabelFromNote(
  db: TracepadDatabase,
  input: { noteId: Uuid; labelId: Uuid; deviceId: Uuid; now?: IsoTimestamp },
): Promise<boolean> {
  const now = nowStamp(input.now)
  const tx = db.transaction(['notes', 'noteLabels', 'historyEvents', 'outbox'], 'readwrite')
  let removed = false
  const writing = (async () => {
    const note = await tx.objectStore('notes').get(input.noteId)
    const existing = await tx.objectStore('noteLabels').get([input.noteId, input.labelId])
    if (!note || !existing || existing.isRemoved) return
    const link: NoteLabel = { ...existing, isRemoved: true, updatedAt: now }
    await tx.objectStore('noteLabels').put(link)
    await tx.objectStore('historyEvents').put(labelEvent(note.id, input.deviceId, 'label_removed', link.labelId, now))
    await queueOutbox(tx.objectStore('outbox'), {
      entityType: 'note_label',
      entityId: note.id,
      op: 'update',
      payload: link,
      createdAt: now,
      userId: note.userId,
    })
    removed = true
  })()
  await finishTransaction(writing, tx.done)
  return removed
}
