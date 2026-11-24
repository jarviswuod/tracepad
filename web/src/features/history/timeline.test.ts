import { describe, expect, it } from 'vitest'
import type { HistoryEvent, HistoryEventType, NoteVersion } from '../../domain/types'
import {
  HISTORY_EVENT_LABEL,
  deviceLabel,
  formatHistoryTime,
  historyEventLabel,
  mergeTimeline,
} from './timeline'

const deviceId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function version(id: string, createdAt: string, body: string): NoteVersion {
  return {
    id,
    noteId: 'note-1',
    parentVersionId: null,
    deviceId,
    kind: 'text',
    title: 'Groceries',
    body,
    checklistItems: null,
    createdAt,
    receivedAt: null,
  }
}

function event(
  id: string,
  occurredAt: string,
  type: HistoryEventType,
  eventDeviceId: string | null = deviceId,
): HistoryEvent {
  return {
    id,
    noteId: 'note-1',
    deviceId: eventDeviceId,
    type,
    payload: null,
    occurredAt,
  }
}

describe('mergeTimeline', () => {
  it('merges versions and events newest first', () => {
    const entries = mergeTimeline(
      [
        version('v-old', '2026-11-24T10:00:00.000Z', 'alpha'),
        version('v-new', '2026-11-24T12:00:00.000Z', 'beta'),
      ],
      [
        event('e-mid', '2026-11-24T11:00:00.000Z', 'pinned'),
        event('e-new', '2026-11-24T13:00:00.000Z', 'archived'),
      ],
    )

    expect(entries.map((entry) => entry.id)).toEqual(['e-new', 'v-new', 'e-mid', 'v-old'])
    expect(entries.map((entry) => entry.kind)).toEqual(['event', 'version', 'event', 'version'])
    expect(entries.map((entry) => entry.at)).toEqual([
      '2026-11-24T13:00:00.000Z',
      '2026-11-24T12:00:00.000Z',
      '2026-11-24T11:00:00.000Z',
      '2026-11-24T10:00:00.000Z',
    ])
  })

  it('orders entries that share a time by id descending', () => {
    const at = '2026-11-24T10:00:00.000Z'
    const entries = mergeTimeline([version('b', at, 'alpha')], [event('a', at, 'pinned')])
    expect(entries.map((entry) => entry.id)).toEqual(['b', 'a'])
  })

  it('never includes a color change', () => {
    expect(Object.keys(HISTORY_EVENT_LABEL).join(' ')).not.toMatch(/color/)
    expect(Object.values(HISTORY_EVENT_LABEL).join(' ').toLowerCase()).not.toContain('color')

    const entries = mergeTimeline(
      [version('v1', '2026-11-24T10:00:00.000Z', 'alpha')],
      [event('e1', '2026-11-24T11:00:00.000Z', 'pinned')],
    )
    const labels = entries.map((entry) =>
      entry.kind === 'version' ? 'Version' : historyEventLabel(entry.event.type),
    )
    expect(labels.join(' ').toLowerCase()).not.toContain('color')
    expect(entries).toHaveLength(2)
  })
})

describe('history entry text', () => {
  it('shows a time and a device', () => {
    expect(formatHistoryTime('2026-11-24T12:00:00.000Z')).toBe('24 Nov 2026, 12:00 UTC')
    expect(deviceLabel(deviceId, deviceId)).toBe('This device')
    expect(deviceLabel('phone-device', deviceId)).toBe('phone-device')
    expect(deviceLabel(null, deviceId)).toBe('Server')
  })
})
