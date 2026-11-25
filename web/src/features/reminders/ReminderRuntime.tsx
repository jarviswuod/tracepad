import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { TracepadDatabase } from '../../data/db'
import type { ReminderWatch } from '../../data/reminders'
import type { Uuid } from '../../domain/types'
import { startReminderEngine } from './engine'
import { askForNotifications, notificationPermission, showSystemNotification, wasNotificationAsked } from './notify'
import { installReminderAudioPrime, playReminderAlarm } from './tone'
import './reminders.css'

type Notice = {
  noteId: Uuid
  fireAt: string
  title: string | null
}

function noticeTitle(title: string | null): string {
  const trimmed = title?.trim() ?? ''
  return trimmed === '' ? 'Untitled' : trimmed
}

/**
 * While the tab is open: arm local timers, ask once for notifications, and
 * show reminders the tab missed while it was closed.
 */
export function ReminderRuntime({ db }: { db: TracepadDatabase }) {
  const navigate = useNavigate()
  const [missed, setMissed] = useState<Notice[]>([])
  const [inApp, setInApp] = useState<Notice[]>([])
  const [permission, setPermission] = useState(notificationPermission)
  const [asked, setAsked] = useState(wasNotificationAsked)
  const [hasActive, setHasActive] = useState(false)
  const openRef = useRef<(noteId: Uuid) => void>(() => undefined)

  function open(noteId: Uuid) {
    setMissed((current) => current.filter((item) => item.noteId !== noteId))
    setInApp((current) => current.filter((item) => item.noteId !== noteId))
    navigate('/home', { state: { openNoteId: noteId } })
  }
  openRef.current = open

  useEffect(() => installReminderAudioPrime(), [])

  useEffect(() => {
    let active = true
    const engine = startReminderEngine(db, {
      onMissed(watch) {
        if (!active) return
        setMissed((current) => (current.some((item) => item.noteId === watch.noteId) ? current : [...current, toNotice(watch)]))
        showSystemNotification({
          title: noticeTitle(watch.title),
          body: 'Missed reminder',
          noteId: watch.noteId,
          onClick: () => openRef.current(watch.noteId),
        })
      },
      onFired(watch) {
        if (!active) return
        const shown = showSystemNotification({
          title: noticeTitle(watch.title),
          body: 'Reminder',
          noteId: watch.noteId,
          onClick: () => openRef.current(watch.noteId),
        })
        playReminderAlarm()
        if (!shown) setInApp((current) => [...current, toNotice(watch)])
      },
      onWatches(watches) {
        if (!active) return
        setPermission(notificationPermission())
        setHasActive(
          watches.some((watch) => !watch.paused && (watch.missed || Date.parse(watch.fireAt) > Date.now())),
        )
      },
    })
    return () => {
      active = false
      engine.stop()
    }
  }, [db])

  async function allow() {
    const next = await askForNotifications()
    setAsked(true)
    setPermission(next)
  }

  const explain = hasActive && permission === 'default' && !asked
  const blocked = hasActive && !explain && permission !== 'granted'

  return (
    <>
      {explain ? (
        <div className="reminder-ask" role="status">
          <p>Tracepad uses notifications to remind you while this tab is open.</p>
          <button type="button" onClick={() => void allow()}>
            Allow notifications
          </button>
        </div>
      ) : null}
      {blocked ? (
        <div className="reminder-banner" role="status">
          Notifications are blocked. Reminders show in Tracepad while this tab is open.
        </div>
      ) : null}
      {missed.length > 0 ? (
        <div className="reminder-notices" role="region" aria-label="Missed reminders">
          <ul>
            {missed.map((item) => (
              <li key={item.noteId}>
                <button type="button" onClick={() => open(item.noteId)}>
                  {`Missed reminder: ${noticeTitle(item.title)}`}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {inApp.length > 0 ? (
        <div className="reminder-notices" role="status" aria-label="Reminders">
          <ul>
            {inApp.map((item) => (
              <li key={item.noteId}>
                <button type="button" onClick={() => open(item.noteId)}>
                  {`Reminder: ${noticeTitle(item.title)}`}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  )
}

function toNotice(watch: ReminderWatch): Notice {
  return { noteId: watch.noteId, fireAt: watch.fireAt, title: watch.title }
}
