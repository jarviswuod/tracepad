import { expect, test, type Page } from '@playwright/test'

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

async function cardLabels(page: Page): Promise<string[]> {
  return page
    .getByRole('list', { name: 'History' })
    .locator('.note-card')
    .evaluateAll((cards) => cards.map((card) => card.getAttribute('aria-label') ?? ''))
}

test('history page: open by address, layout, sort, open a card, back, and compare in green and red', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Take a note' }).click()
  await page.getByLabel('Title').fill('Groceries')
  await page.getByLabel('Body').fill('alpha')
  await page.keyboard.press('Control+s')
  await page.getByLabel('Body').fill('beta')
  await page.keyboard.press('Control+s')
  await expect.poll(async () => (await readStore(page, 'noteVersions')).length).toBe(2)
  const [note] = await readStore<{ id: string }>(page, 'notes')

  await page.goto(`/history/${note.id}`)
  const list = page.getByRole('list', { name: 'History' })
  await expect(list.locator('.note-card')).toHaveCount(2)
  await expect(page.getByRole('navigation', { name: 'Views' })).toBeVisible()
  await expect(page.locator('.take-note')).toHaveText('Groceries')
  await expect(page.getByRole('button', { name: 'Take a note' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Open/ })).toHaveCount(0)
  await expect(page.getByText(/Read-only/i)).toHaveCount(0)
  await expect(list.getByRole('listitem').nth(0)).toContainText('This device')
  await expect(list.locator('time').first()).toBeVisible()

  await expect(list).toHaveAttribute('data-layout', 'grid')
  await page.getByRole('button', { name: 'List', exact: true }).click()
  await expect(list).toHaveAttribute('data-layout', 'list')
  await page.getByRole('button', { name: 'Grid', exact: true }).click()
  await expect(list).toHaveAttribute('data-layout', 'grid')

  await expect(page.getByLabel('Sort')).toHaveValue('newest')
  await expect.poll(() => cardLabels(page)).toEqual(['Groceries, beta', 'Groceries, alpha'])
  await page.getByLabel('Sort').selectOption('oldest')
  await expect.poll(() => cardLabels(page)).toEqual(['Groceries, alpha', 'Groceries, beta'])
  await page.getByLabel('Sort').selectOption('newest')

  const alpha = (await readStore<{ id: string; body: string }>(page, 'noteVersions')).find(
    (version) => version.body === 'alpha',
  )!
  await list.getByRole('button', { name: 'Groceries, alpha' }).click()
  await expect(page).toHaveURL(`/history/${note.id}/${alpha.id}`)
  const old = page.getByRole('article', { name: 'Old version' })
  await expect(old).toContainText('Groceries')
  await expect(old).toContainText('alpha')
  await expect(old.getByRole('textbox')).toHaveCount(0)
  await expect(old).not.toContainText(/Read-only/i)

  await page.goBack()
  await expect(page).toHaveURL(`/history/${note.id}`)
  await expect(old).toHaveCount(0)
  await expect(page.locator('.take-note')).toHaveText('Groceries')

  await page.getByRole('checkbox', { name: 'Select Groceries: beta' }).check()
  await page.getByRole('checkbox', { name: 'Select Groceries: alpha' }).check()
  await page.getByRole('button', { name: 'Compare' }).click()

  const older = page.getByRole('region', { name: 'Older version' })
  const newer = page.getByRole('region', { name: 'Newer version' })
  const olderBox = await older.boundingBox()
  const newerBox = await newer.boundingBox()
  expect(olderBox).toBeTruthy()
  expect(newerBox).toBeTruthy()
  expect(olderBox!.x).toBeLessThan(newerBox!.x)
  expect(Math.abs(olderBox!.y - newerBox!.y)).toBeLessThan(5)

  const removed = older.locator('.diff-removed')
  const added = newer.locator('.diff-added')
  await expect(removed).toHaveText('alpha')
  await expect(added).toHaveText('beta')
  await expect(removed).toHaveCSS('color', 'rgb(217, 48, 37)')
  await expect(added).toHaveCSS('color', 'rgb(11, 128, 67)')
  await expect(older.locator('.diff-added')).toHaveCount(0)
  await expect(newer.locator('.diff-removed')).toHaveCount(0)

  await page.getByRole('button', { name: 'Back to history' }).click()
  await page.getByRole('button', { name: 'Back to note' }).click()
  await expect(page).toHaveURL('/home')
  await expect(page.getByLabel('Body')).toHaveValue('beta')
})

test('a refresh after Back to note shows the board without opening the note', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Take a note' }).click()
  await page.getByLabel('Title').fill('Errands')
  await page.getByLabel('Body').fill('post office')
  await page.getByRole('button', { name: 'History' }).click()
  await expect(page).toHaveURL(/\/history\/[0-9a-f-]{36}$/)

  await page.getByRole('button', { name: 'Back to note' }).click()
  const dialog = page.getByRole('dialog', { name: 'Note' })
  await expect(dialog.getByLabel('Body')).toHaveValue('post office')
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.history.state?.usr ?? null)).toBeNull()

  await page.reload()
  await expect(page.getByRole('button', { name: 'Take a note' })).toBeEnabled()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Errands, post office', exact: true })).toBeVisible()
})

test('the History button opens the page, and browser back returns to the board', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Take a note' }).click()
  await page.getByLabel('Title').fill('Errands')
  await page.getByLabel('Body').fill('post office')
  await page.getByRole('button', { name: 'History' }).click()

  await expect(page).toHaveURL(/\/history\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('list', { name: 'History' }).locator('.note-card')).toHaveCount(1)
  await expect(page.locator('.take-note')).toHaveText('Errands')

  await page.goBack()
  await expect(page).toHaveURL('/home')
  await expect(page.getByRole('button', { name: 'Errands, post office', exact: true })).toBeVisible()
})
