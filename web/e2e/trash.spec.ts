import { expect, test, type Page } from '@playwright/test'

test('trashes a note, undoes it, restores pin and color, and asks before deleting forever', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/')
  await createNote(page, 'Alpha', 'Apples')
  await patchNote(page, 'Alpha', { isPinned: true, color: 'yellow' })
  await page.reload()

  await expect(page.getByRole('heading', { name: 'Pinned' })).toBeVisible()
  await page.getByRole('button', { name: 'Alpha, Apples', exact: true }).click()
  await page.getByRole('button', { name: 'Move to trash', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Alpha, Apples', exact: true })).toHaveCount(0)
  await expect(page.getByRole('status')).toContainText('Note moved to trash')

  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  const restored = page.getByRole('button', { name: 'Alpha, Apples', exact: true })
  await expect(restored).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Pinned' })).toBeVisible()
  await expect(restored).toHaveCSS('background-color', 'rgb(255, 255, 0)')

  await restored.click()
  await page.getByRole('button', { name: 'Move to trash', exact: true }).click()
  await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'Trash', exact: true }).click()
  await expect(page.getByText('30 days left')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Pinned' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Restore Alpha, Apples', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Alpha, Apples', exact: true })).toHaveCount(0)

  await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'Notes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Alpha, Apples', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Pinned' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Alpha, Apples', exact: true })).toHaveCSS(
    'background-color',
    'rgb(255, 255, 0)',
  )

  await page.getByRole('button', { name: 'Alpha, Apples', exact: true }).click()
  await page.getByRole('button', { name: 'Move to trash', exact: true }).click()
  await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'Trash', exact: true }).click()
  await page.getByRole('button', { name: 'Delete Alpha, Apples forever', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Delete forever?')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Alpha, Apples', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Delete Alpha, Apples forever', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete forever', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Alpha, Apples', exact: true })).toHaveCount(0)
  await expect.poll(async () => (await readStore<{ id: string }>(page, 'notes')).length).toBe(0)
  await expect.poll(async () => (await readStore(page, 'noteVersions')).length).toBe(0)
})

test('asks before emptying the trash', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/')
  await createNote(page, 'Alpha', 'Apples')
  await createNote(page, 'Beta', 'Berries')
  await trashOpenNote(page, 'Alpha, Apples')
  await trashOpenNote(page, 'Beta, Berries')

  await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'Trash', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Alpha, Apples', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Beta, Berries', exact: true })).toBeVisible()
  await expect(page.getByText('30 days left')).toHaveCount(2)

  await page.getByRole('button', { name: 'Empty trash', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Empty trash?')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Alpha, Apples', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Empty trash', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Empty trash', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Alpha, Apples', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Beta, Berries', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0)
  await expect.poll(async () => (await readStore(page, 'notes')).length).toBe(0)
})

async function createNote(page: Page, title: string, body: string) {
  await page.getByRole('button', { name: 'Take a note' }).click()
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Body').fill(body)
  await page.getByRole('heading', { name: 'Tracepad' }).click()
  await expect(page.getByRole('button', { name: `${title}, ${body}`, exact: true })).toBeVisible()
}

async function trashOpenNote(page: Page, cardName: string) {
  await page.getByRole('button', { name: cardName, exact: true }).click()
  await page.getByRole('button', { name: 'Move to trash', exact: true }).click()
  await expect(page.getByRole('button', { name: cardName, exact: true })).toHaveCount(0)
}

async function readStore<T>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(async (name) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('tracepad')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      return await new Promise<T[]>((resolve, reject) => {
        const tx = db.transaction(name, 'readonly')
        const request = tx.objectStore(name).getAll()
        request.onsuccess = () => resolve(request.result as T[])
        request.onerror = () => reject(request.error)
      })
    } finally {
      db.close()
    }
  }, store)
}

function patchNote(
  page: Page,
  title: string,
  fields: { isPinned?: boolean; color?: string | null },
) {
  return page.evaluate(async ({ title, fields }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('tracepad')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const readAll = <T,>(store: string) =>
      new Promise<T[]>((resolve, reject) => {
        const tx = db.transaction(store, 'readonly')
        const request = tx.objectStore(store).getAll()
        request.onsuccess = () => resolve(request.result as T[])
        request.onerror = () => reject(request.error)
      })
    try {
      const notes = await readAll<{ id: string; currentVersionId: string | null }>('notes')
      const versions = await readAll<{ id: string; title: string | null }>('noteVersions')
      const note = notes.find((item) => {
        const current = versions.find((version) => version.id === item.currentVersionId)
        return current?.title === title
      })
      if (!note) throw new Error(`no note titled ${title}`)
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('notes', 'readwrite')
        const store = tx.objectStore('notes')
        const read = store.get(note.id)
        read.onerror = () => reject(read.error)
        read.onsuccess = () => {
          store.put({ ...(read.result as object), ...fields })
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      })
    } finally {
      db.close()
    }
  }, { title, fields })
}
