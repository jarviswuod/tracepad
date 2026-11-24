// Newest first by default, or oldest first. A version's time is createdAt; an event's time is occurredAt.
// Color is not a history event, so a color change never appears in this list.

import type { HistoryEvent, HistoryEventType, IsoTimestamp, NoteVersion, Uuid } from '../../domain/types'
import { versionText } from './compare'

export type TimelineEntry =
  | {
      kind: 'version'
      id: Uuid
      at: IsoTimestamp
      deviceId: Uuid
      version: NoteVersion
    }
  | {
      kind: 'event'
      id: Uuid
      at: IsoTimestamp
      deviceId: Uuid | null
      event: HistoryEvent
    }

export type HistoryOrder = 'newest' | 'oldest'

export const HISTORY_EVENT_LABEL: Record<HistoryEventType, string> = {
  pinned: 'Pinned',
  unpinned: 'Unpinned',
  label_added: 'Label added',
  label_removed: 'Label removed',
  archived: 'Archived',
  unarchived: 'Unarchived',
  auto_archived: 'Auto-archived',
  trashed: 'Trashed',
  restored: 'Restored',
  ticked: 'Ticked',
  unticked: 'Unticked',
  reminder_set: 'Reminder set',
  reminder_changed: 'Reminder changed',
  reminder_removed: 'Reminder removed',
  conflict_resolved: 'Conflict resolved',
}

export function historyEventLabel(type: HistoryEventType): string {
  return HISTORY_EVENT_LABEL[type]
}

/** The device that wrote the entry. A guest device has no name yet, so this device is "This device". */
export function deviceLabel(deviceId: Uuid | null, localDeviceId: Uuid): string {
  if (deviceId == null) return 'Server'
  if (deviceId === localDeviceId) return 'This device'
  return deviceId
}

/** A stable clock time. History shows the device's timestamp in UTC. */
export function formatHistoryTime(iso: IsoTimestamp): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const formatted = new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date)
  return `${formatted} UTC`
}

export function versionPreview(version: NoteVersion): string {
  const { title, body } = versionText(version)
  const parts = [title.trim(), body.trim()].filter((part) => part !== '')
  if (parts.length === 0) return 'Empty note'
  const text = parts.join(': ').replace(/\s+/g, ' ')
  if (text.length <= 80) return text
  return `${text.slice(0, 79)}…`
}

/**
 * Mix versions and history events into one timeline, newest first unless asked for oldest first.
 * The same timestamp is ordered by id descending (ascending for oldest first) so the order stays stable.
 */
export function mergeTimeline(
  versions: NoteVersion[],
  events: HistoryEvent[],
  order: HistoryOrder = 'newest',
): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...versions.map((version) => ({
      kind: 'version' as const,
      id: version.id,
      at: version.createdAt,
      deviceId: version.deviceId,
      version,
    })),
    ...events.map((event) => ({
      kind: 'event' as const,
      id: event.id,
      at: event.occurredAt,
      deviceId: event.deviceId,
      event,
    })),
  ]
  entries.sort((a, b) => {
    if (a.at !== b.at) return a.at < b.at ? 1 : -1
    if (a.id !== b.id) return a.id < b.id ? 1 : -1
    return 0
  })
  return order === 'oldest' ? entries.reverse() : entries
}
