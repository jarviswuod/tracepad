import { useEffect, useRef, useState, type FormEvent } from 'react'
import { getReminder, removeReminder, setReminder } from '../../data/reminders'
import type { TracepadDatabase } from '../../data/db'
import { PAST_TIME_MESSAGE, refusalForFireAt } from '../../domain/reminders'
import type { Reminder, Uuid } from '../../domain/types'
import './reminders.css'

type ReminderControlProps = {
  db: TracepadDatabase
  noteId: Uuid
  deviceId: Uuid
  onChanged: () => void
  /** Write the note row before the reminder, when Take a note has not saved one yet. */
  onEnsureNote?: () => Promise<void>
  /** `form` is the date form inside More. The parent owns closing it. */
  mode?: 'button' | 'form'
  onClose?: () => void
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** A datetime-local value in the viewer's local time, including seconds. */
export function isoToDatetimeLocal(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function datetimeLocalToIso(value: string): string | null {
  if (value.trim() === '') return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function formatReminderWhen(fireAt: string): string {
  const date = new Date(fireAt)
  if (Number.isNaN(date.getTime())) return fireAt
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

/** Set, change, or remove the note's one reminder. A past time shows "Pick a future time." */
export function ReminderControl({
  db,
  noteId,
  deviceId,
  onChanged,
  onEnsureNote,
  mode = 'button',
  onClose,
}: ReminderControlProps) {
  const embedded = mode === 'form'
  const [reminder, setStored] = useState<Reminder | null>(null)
  const [open, setOpen] = useState(embedded)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const touched = useRef(false)

  useEffect(() => {
    let active = true
    void getReminder(db, noteId).then((row) => {
      if (!active) return
      setStored(row ?? null)
      if (!touched.current) setValue(row ? isoToDatetimeLocal(row.fireAt) : '')
    })
    return () => {
      active = false
    }
  }, [db, noteId])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open || embedded) return

    function shut(event: Event) {
      const target = event.target
      if (!(target instanceof Node) || rootRef.current?.contains(target)) return
      setOpen(false)
      const dialog = rootRef.current?.closest('[role="dialog"]')
      if (!dialog?.contains(target)) {
        event.preventDefault()
        event.stopPropagation()
      }
    }

    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
    }

    document.addEventListener('pointerdown', shut, true)
    document.addEventListener('mousedown', shut, true)
    document.addEventListener('click', shut, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', shut, true)
      document.removeEventListener('mousedown', shut, true)
      document.removeEventListener('click', shut, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [embedded, open])

  function toggle() {
    if (open) {
      setOpen(false)
      return
    }
    touched.current = false
    setValue(reminder ? isoToDatetimeLocal(reminder.fireAt) : '')
    setError(null)
    setOpen(true)
  }

  function closeForm() {
    setOpen(false)
    onClose?.()
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    const fireAt = datetimeLocalToIso(value) ?? value
    if (refusalForFireAt(fireAt, new Date().toISOString())) {
      setError(PAST_TIME_MESSAGE)
      return
    }
    if (onEnsureNote) await onEnsureNote()
    const result = await setReminder(db, { noteId, fireAt, deviceId })
    if (!result.ok) {
      setError(result.message)
      return
    }
    const stored = await getReminder(db, noteId)
    setStored(stored ?? null)
    setError(null)
    closeForm()
    if (result.changed) onChanged()
  }

  async function remove() {
    const removed = await removeReminder(db, { noteId, deviceId })
    if (!removed) return
    setStored(null)
    setError(null)
    closeForm()
    onChanged()
  }

  const form = open ? (
    <form
      className={embedded ? 'reminder-fields' : 'reminder-panel'}
      role="group"
      aria-label="Reminder"
      onSubmit={(event) => void save(event)}
    >
      <label>
        Date and time
        <input
          ref={inputRef}
          type="datetime-local"
          step={1}
          value={value}
          onChange={(event) => {
            touched.current = true
            setValue(event.target.value)
            setError(null)
          }}
        />
      </label>
      {error ? (
        <p className="reminder-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit">Save</button>
      {reminder ? (
        <button type="button" onClick={() => void remove()}>
          Remove reminder
        </button>
      ) : null}
    </form>
  ) : null

  if (embedded) return form

  return (
    <div className="reminder-control" ref={rootRef}>
      <button type="button" aria-expanded={open} aria-label={reminder ? 'Change reminder' : 'Remind me'} onClick={toggle}>
        {reminder ? formatReminderWhen(reminder.fireAt) : 'Remind me'}
      </button>
      {form}
    </div>
  )
}
