import { expect, test, type Page } from '@playwright/test'

test('pins, archives, colors, then adds, renames and deletes a label', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/')
  await createNote(page, 'Alpha', 'Apples')
  await createNote(page, 'Beta', 'Berries')
  expect(await readStore(page, 'noteVersions')).toHaveLength(2)

  const nav = page.getByRole('navigation', { name: 'Views' })
  await page.getByRole('button', { name: 'Alpha, Apples', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Note' })
  await dialog.getByRole('button', { name: 'Pin', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Pinned' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Archive note', exact: true }).click()
  await dialog.getByRole('button', { name: 'Yellow color', exact: true }).click()
  await dialog.getByLabel('Label name').fill('Work')
  await dialog.getByRole('button', { name: 'Add label', exact: true }).click()
  await expect(dialog.getByRole('checkbox', { name: 'Work', exact: true })).toBeChecked()
  await expect(nav.getByRole('button', { name: 'Work', exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Alpha, Apples', exact: true })).toHaveCount(0)

  await nav.getByRole('button', { name: 'Archive', exact: true }).click()
  const alpha = page.getByRole('button', { name: 'Alpha, Apples', exact: true })
  await expect(alpha).toBeVisible()
  await expect(alpha).toContainText('Work')
  await expect(alpha).toHaveCSS('background-color', 'rgb(255, 244, 117)')
  await expect(page.getByRole('heading', { name: 'Pinned' })).toBeVisible()

  await nav.getByRole('button', { name: 'Notes', exact: true }).click()
  await page.getByRole('button', { name: 'Beta, Berries', exact: true }).click()
  const betaDialog = page.getByRole('dialog', { name: 'Note' })
  await betaDialog.getByRole('checkbox', { name: 'Work', exact: true }).click()
  await expect(betaDialog.getByRole('checkbox', { name: 'Work', exact: true })).toBeChecked()
  await betaDialog.getByRole('button', { name: 'Close', exact: true }).click()

  await nav.getByRole('button', { name: 'Work', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Alpha, Apples', exact: true })).toContainText('Work')
  await expect(page.getByRole('button', { name: 'Beta, Berries', exact: true })).toContainText('Work')

  await page.getByRole('button', { name: 'Rename Work', exact: true }).click()
  await page.getByLabel('Rename Work').fill('Job')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(nav.getByRole('button', { name: 'Job', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Alpha, Apples', exact: true })).toContainText('Job')
  await expect(page.getByRole('button', { name: 'Beta, Berries', exact: true })).toContainText('Job')
  await expect(page.getByRole('button', { name: 'Alpha, Apples', exact: true })).not.toContainText('Work')

  await page.getByRole('button', { name: 'Delete Job', exact: true }).click()
  await expect(nav.getByRole('button', { name: 'Job', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Alpha, Apples', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Beta, Berries', exact: true })).toHaveCount(0)

  await nav.getByRole('button', { name: 'Notes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Beta, Berries', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Beta, Berries', exact: true })).not.toContainText('Job')
  await nav.getByRole('button', { name: 'Archive', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Alpha, Apples', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Alpha, Apples', exact: true })).not.toContainText('Job')

  await page.getByRole('button', { name: 'Alpha, Apples', exact: true }).click()
  await page.getByRole('dialog', { name: 'Note' }).getByRole('button', { name: 'History', exact: true }).click()
  const history = page.getByRole('list', { name: 'History' })
  await expect(history.getByText('Pinned', { exact: true })).toBeVisible()
  await expect(history.getByText('Archived', { exact: true })).toBeVisible()
  await expect(history.getByText('Label added', { exact: true })).toBeVisible()
  await expect(history.getByText('Label removed', { exact: true })).toBeVisible()
  await expect(history.getByText(/color/i)).toHaveCount(0)

  expect(await readStore(page, 'noteVersions')).toHaveLength(2)
  expect(await readStore(page, 'notes')).toHaveLength(2)
  expect(await readStore(page, 'labels')).toHaveLength(0)
  const notes = await readStore<{
    isPinned: boolean
    isArchived: boolean
    color: string | null
    currentVersionId: string | null
  }>(page, 'notes')
  const versions = await readStore<{ id: string; title: string | null }>(page, 'noteVersions')
  const alphaNote = notes.find((row) => {
    const current = versions.find((version) => version.id === row.currentVersionId)
    return current?.title === 'Alpha'
  })
  expect(alphaNote).toMatchObject({ isPinned: true, isArchived: true, color: '#fff475' })
})

async function createNote(page: Page, title: string, body: string) {
  await page.getByRole('button', { name: 'Take a note' }).click()
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Body').fill(body)
  await page.getByRole('heading', { name: 'Tracepad' }).click()
  await expect(page.getByRole('button', { name: `${title}, ${body}`, exact: true })).toBeVisible()
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
