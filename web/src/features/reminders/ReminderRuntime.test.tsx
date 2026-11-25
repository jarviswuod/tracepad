import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { deleteDB } from 'idb'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Note, NoteVersion, Reminder } from '../../domain/types'
import { openTracepadDb, type TracepadDatabase } from '../../data/db'
import { NOTIFICATION_ASKED_KEY } from './notify'
import { ReminderRuntime } from './ReminderRuntime'
import { resetReminderAudio } from './tone'

const opened: TracepadDatabase[] = []
const names: string[] = []
const created: { title: string; body?: string }[] = []

async function open() {
  const name = `tracepad-reminder-runtime-${crypto.randomUUID()}`
  names.push(name)
  const db = await openTracepadDb(name)
  opened.push(db)
  return db
}

afterEach(async () => {
  cleanup()
  resetReminderAudio()
  vi.unstubAllGlobals()
  localStorage.removeItem(NOTIFICATION_ASKED_KEY)
  created.length = 0
  opened.splice(0).forEach((db) => db.close())
  await Promise.all(names.splice(0).map((name) => deleteDB(name)))
})

const noteId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const at = '2026-11-25T12:00:00.000Z'

function note(): Note {
  return {
    id: noteId,
    userId: null,
    currentVersionId: `${noteId}-v`,
    isPinned: false,
    isArchived: false,
    color: null,
    trashedAt: null,
    createdAt: at,
    updatedAt: at,
    sortPosition: null,
    serverUpdatedAt: null,
  }
}

function version(): NoteVersion {
  return {
    id: `${noteId}-v`,
    noteId,
    parentVersionId: null,
    deviceId: 'device-1',
    kind: 'text',
    title: 'Shopping',
    body: 'Milk',
    checklistItems: null,
    createdAt: at,
    receivedAt: null,
  }
}

function reminder(fireAt: string): Reminder {
  return {
    noteId,
    userId: null,
    fireAt,
    repeatInterval: null,
    lastFiredAt: null,
    dismissedAt: null,
    pushSentAt: null,
    updatedAt: at,
  }
}

function stubNotification(permission: NotificationPermission) {
  const requestPermission = vi.fn(async () => permission)
  class FakeNotification {
    static permission = permission
    static requestPermission = requestPermission
    onclick: (() => void) | null = null
    constructor(title: string, options?: NotificationOptions) {
      created.push({ title, body: options?.body })
    }
    close() {}
  }
  vi.stubGlobal('Notification', FakeNotification)
  return requestPermission
}

function Where() {
  const location = useLocation()
  const state = location.state as { openNoteId?: string } | null
  return <p data-testid="where">{`${location.pathname}:${state?.openNoteId ?? ''}`}</p>
}

function renderRuntime(db: TracepadDatabase) {
  render(
    <MemoryRouter initialEntries={['/archive']}>
      <Where />
      <ReminderRuntime db={db} />
    </MemoryRouter>,
  )
}

describe('ReminderRuntime', () => {
  it('shows a missed reminder on startup and opens the note when tapped', async () => {
    stubNotification('granted')
    const db = await open()
    await db.put('notes', note())
    await db.put('noteVersions', version())
    await db.put('reminders', reminder('2020-01-01T00:00:00.000Z'))
    renderRuntime(db)

    fireEvent.click(await screen.findByRole('button', { name: 'Missed reminder: Shopping' }))
    expect(screen.getByTestId('where')).toHaveTextContent(`/home:${noteId}`)
    expect(created).toEqual([{ title: 'Shopping', body: 'Missed reminder' }])
    expect(screen.queryByText(/Notifications are blocked/)).not.toBeInTheDocument()
  })

  it('shows a banner when notifications are blocked', async () => {
    stubNotification('denied')
    const db = await open()
    await db.put('notes', note())
    await db.put('noteVersions', version())
    await db.put('reminders', reminder(new Date(Date.now() + 60 * 60 * 1000).toISOString()))
    renderRuntime(db)

    expect(
      await screen.findByText('Notifications are blocked. Reminders show in Tracepad while this tab is open.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Allow notifications' })).not.toBeInTheDocument()
  })

  it('asks once, explains, and shows the banner if permission stays blocked', async () => {
    const requestPermission = stubNotification('default')
    requestPermission.mockResolvedValue('denied')
    const db = await open()
    await db.put('notes', note())
    await db.put('noteVersions', version())
    await db.put('reminders', reminder(new Date(Date.now() + 60 * 60 * 1000).toISOString()))
    renderRuntime(db)

    expect(await screen.findByText('Tracepad uses notifications to remind you while this tab is open.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Allow notifications' }))

    expect(
      await screen.findByText('Notifications are blocked. Reminders show in Tracepad while this tab is open.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Allow notifications' })).not.toBeInTheDocument()
    expect(requestPermission).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(NOTIFICATION_ASKED_KEY)).toBe('1')
  })

  function installAudio(options?: { refuse?: boolean }) {
    const oscillators: Array<{ started: number[]; stopped: number[]; type: string }> = []
    const gains: Array<{ value: number }> = []
    const contexts: Array<{ currentTime: number; state: AudioContextState }> = []

    class FakeAudioContext {
      currentTime = 4
      state: AudioContextState = 'suspended'
      destination = {}
      resume = () => {
        this.state = 'running'
        return Promise.resolve()
      }
      createOscillator() {
        const osc = {
          type: 'sine',
          frequency: { value: 0 },
          started: [] as number[],
          stopped: [] as number[],
          connect() {
            return osc
          },
          start(when = 0) {
            if (options?.refuse) throw new Error('The AudioContext was not allowed to start')
            osc.started.push(when)
          },
          stop(when = 0) {
            osc.stopped.push(when)
          },
        }
        oscillators.push(osc)
        return osc
      }
      createGain() {
        const gain = { value: 1 }
        gains.push(gain)
        return {
          gain,
          connect() {
            return gain
          },
        }
      }
      constructor() {
        contexts.push(this)
      }
    }

    vi.stubGlobal('AudioContext', FakeAudioContext)
    return { oscillators, gains, contexts }
  }

  async function seed(db: TracepadDatabase, fireAt: string) {
    await db.put('notes', note())
    await db.put('noteVersions', version())
    await db.put('reminders', reminder(fireAt))
  }

  it('plays a soft tone for five seconds when a reminder fires on time', async () => {
    stubNotification('granted')
    const audio = installAudio()
    const db = await open()
    await seed(db, new Date(Date.now() + 1500).toISOString())
    renderRuntime(db)

    fireEvent.click(document.body)
    expect(audio.contexts).toHaveLength(1)
    expect(audio.contexts[0]?.state).toBe('running')
    expect(audio.oscillators).toHaveLength(0)

    await waitFor(() => expect(audio.oscillators).toHaveLength(1), { timeout: 5000 })
    expect(audio.oscillators[0]?.type).toBe('sine')
    expect(audio.oscillators[0]?.started).toEqual([4])
    expect(audio.oscillators[0]?.stopped).toEqual([9])
    expect(audio.gains[0]?.value).toBeGreaterThan(0)
    expect(audio.gains[0]?.value).toBeLessThanOrEqual(0.1)
    expect(created).toEqual([{ title: 'Shopping', body: 'Reminder' }])
  })

  it('does not play a tone for a reminder missed on startup', async () => {
    stubNotification('granted')
    const audio = installAudio()
    const db = await open()
    await seed(db, '2020-01-01T00:00:00.000Z')
    renderRuntime(db)
    fireEvent.click(document.body)

    expect(await screen.findByRole('button', { name: 'Missed reminder: Shopping' })).toBeInTheDocument()
    expect(audio.oscillators).toHaveLength(0)
    expect(audio.contexts[0]?.state).toBe('running')
    expect(created).toEqual([{ title: 'Shopping', body: 'Missed reminder' }])
  })

  it('still shows the notification when the tone is refused', async () => {
    stubNotification('granted')
    installAudio({ refuse: true })
    const db = await open()
    await seed(db, new Date(Date.now() + 1500).toISOString())
    renderRuntime(db)
    fireEvent.click(document.body)

    await waitFor(() => expect(created).toEqual([{ title: 'Shopping', body: 'Reminder' }]), { timeout: 5000 })
    expect(screen.queryByRole('button', { name: 'Reminder: Shopping' })).not.toBeInTheDocument()
  })
})
