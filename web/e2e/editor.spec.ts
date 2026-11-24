import { expect, test } from '@playwright/test'

test('creates a note, edits it, leaves, and keeps two versions', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Take a note' }).click()
  await page.getByLabel('Title').fill('Groceries')
  await page.getByLabel('Body').fill('Milk')
  await page.getByRole('heading', { name: 'Tracepad' }).click()
  await expect(page.getByRole('button', { name: 'Groceries' })).toBeVisible()

  await page.getByRole('button', { name: 'Groceries' }).click()
  await page.getByLabel('Body').fill('Milk and bread')
  await page.getByRole('dialog', { name: 'Note' }).getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('button', { name: 'Milk and bread' })).toBeVisible()

  const stored = await page.evaluate(async () => {
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
      const notes = await read<{ id: string; currentVersionId: string | null }>('notes')
      const noteVersions = await read<{
        id: string
        parentVersionId: string | null
        body: string | null
      }>('noteVersions')
      const outbox = await read<{ entityType: string; op: string }>('outbox')
      return { notes, noteVersions, outbox }
    } finally {
      db.close()
    }
  })

  expect(stored.notes).toHaveLength(1)
  expect(stored.noteVersions).toHaveLength(2)
  const first = stored.noteVersions.find((version) => version.parentVersionId == null)
  const second = stored.noteVersions.find((version) => version.parentVersionId != null)
  expect(first).toBeTruthy()
  expect(second?.parentVersionId).toBe(first?.id)
  expect(first?.body).toBe('Milk')
  expect(second?.body).toBe('Milk and bread')
  expect(stored.notes[0].currentVersionId).toBe(second?.id)
  expect(stored.outbox.filter((row) => row.entityType === 'version' && row.op === 'create')).toHaveLength(2)
})
