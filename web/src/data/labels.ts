import type { Label } from '../domain/types'
import type { TracepadDatabase } from './db'

/** Labels in name order, for the side list. */
export async function listLabels(db: TracepadDatabase): Promise<Label[]> {
  const labels = await db.getAll('labels')
  return labels.sort(
    (a, b) => a.name.localeCompare(b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
}
