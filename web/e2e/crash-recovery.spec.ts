import { expect, test, type Page } from '@playwright/test'

test('turns a leftover draft into a version after reload', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Take a note' }).click()
  await page.getByLabel('Title').fill('Groceries')
  await page.getByLabel('Body').fill('Milk')

  await expect.poll(() => snapshot(page), { timeout: 10_000 }).toEqual({
    drafts: [{ title: 'Groceries', body: 'Milk' }],
    versions: [],
  })

  await page.reload()
  await expect(page.getByRole('button', { name: 'Groceries, Milk' })).toBeVisible()
  await expect(page.getByLabel('Title')).toHaveCount(0)

  const stored = await snapshot(page)
  expect(stored.drafts).toEqual([])
  expect(stored.versions).toHaveLength(1)
  expect(stored.versions[0]).toMatchObject({
    parentVersionId: null,
    title: 'Groceries',
    body: 'Milk',
  })
})

type Snapshot = {
  drafts: Array<{ title: string | null; body: string | null }>
  versions: Array<{ parentVersionId: string | null; title: string | null; body: string | null }>
}

function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('tracepad')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const read = <T,>(store: string) =>
      new Promise<T[]>((resolve, reject) => {
        const tx = db.transaction(store, 'readonly')
        const request = tx.objectStore(store).getAll()
        request.onsuccess = () => resolve(request.result as T[])
        request.onerror = () => reject(request.error)
      })
    try {
      const drafts = await read<{ title: string | null; body: string | null }>('drafts')
      const versions = await read<{
        parentVersionId: string | null
        title: string | null
        body: string | null
      }>('noteVersions')
      return {
        drafts: drafts.map((draft) => ({ title: draft.title, body: draft.body })),
        versions: versions.map((version) => ({
          parentVersionId: version.parentVersionId,
          title: version.title,
          body: version.body,
        })),
      }
    } finally {
      db.close()
    }
  })
}
