/** The words in `text`, and `archived=1` while the switch is on. Both live on the current page. */

export function readSearchQuery(search: string): { text: string; includeArchived: boolean } {
  const params = new URLSearchParams(search)
  return {
    text: params.get('text') ?? '',
    includeArchived: params.get('archived') === '1',
  }
}

/** The next query string, without a leading `?`. An empty box drops `text`. The switch off drops `archived`. */
export function writeSearchQuery(
  search: string,
  patch: { text?: string; includeArchived?: boolean },
): string {
  const current = readSearchQuery(search)
  const text = patch.text !== undefined ? patch.text : current.text
  const includeArchived = patch.includeArchived !== undefined ? patch.includeArchived : current.includeArchived
  const params = new URLSearchParams()
  if (text !== '') params.set('text', text)
  if (includeArchived) params.set('archived', '1')
  return params.toString()
}
