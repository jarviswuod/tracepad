import type { BoardView } from '../../data/notes'
import type { Uuid } from '../../domain/types'

/**
 * No stored label uses this id. A name that isn't in the database is still a label
 * view, and this id matches no notes, so the board is empty.
 */
export const UNKNOWN_LABEL_ID: Uuid = 'unknown-label'

const FIXED_PATHS = new Set(['/home', '/archive', '/trash', '/reminders'])

/** A label always lives under `/label/`, even when its name is "home" or "trash". */
export function labelPath(name: string): string {
  return `/label/${encodeURIComponent(name)}`
}

/** The label name in a `/label/...` path, or null when the path is not a label. */
export function labelNameFromPath(pathname: string): string | null {
  const prefix = '/label/'
  if (!pathname.startsWith(prefix)) return null
  const raw = pathname.slice(prefix.length)
  if (raw === '' || raw.includes('/')) return null
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

/**
 * The board view for this path. Null for history and anything else.
 * `/home` is Notes. An unknown label name is still that label's view.
 */
export function viewFromPath(
  pathname: string,
  labels: readonly { id: Uuid; name: string }[],
): BoardView | null {
  if (pathname === '/home') return { kind: 'notes' }
  if (pathname === '/archive') return { kind: 'archive' }
  if (pathname === '/trash') return { kind: 'trash' }
  if (pathname === '/reminders') return { kind: 'reminders' }
  const name = labelNameFromPath(pathname)
  if (name == null) return null
  const label = labels.find((item) => item.name === name)
  return { kind: 'label', labelId: label?.id ?? UNKNOWN_LABEL_ID }
}

/** True when both paths are the same board view, including differently encoded label names. */
export function pathsMatch(a: string, b: string): boolean {
  if (a === b) return true
  const aName = labelNameFromPath(a)
  const bName = labelNameFromPath(b)
  return aName != null && aName === bName
}

/** The word in the top bar. Notes, history, and anything else keep the app name. */
export function barTitle(pathname: string): string {
  if (pathname === '/archive') return 'Archive'
  if (pathname === '/trash') return 'Trash'
  if (pathname === '/reminders') return 'Reminders'
  return labelNameFromPath(pathname) ?? 'Tracepad'
}

/** Home shows the yellow lightbulb beside the app name. */
export function showsBrandMark(pathname: string): boolean {
  return pathname === '/' || pathname === '/home'
}

/** Where "Back to note" returns. Anything that isn't a board path is Notes. */
export function boardReturnPath(value: unknown): string {
  if (typeof value !== 'string') return '/home'
  if (FIXED_PATHS.has(value)) return value
  if (labelNameFromPath(value) != null) return value
  return '/home'
}
