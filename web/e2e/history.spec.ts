import { expect, test, type Page } from '@playwright/test'

async function versionCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('tracepad')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      return await new Promise<number>((resolve, reject) => {
        const tx = db.transaction('noteVersions', 'readonly')
        const request = tx.objectStore('noteVersions').count()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    } finally {
      db.close()
    }
  })
}

test('edits twice, opens history, reads an old version, and compares in green and red', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Take a note' }).click()
  await page.getByLabel('Title').fill('Groceries')
  await page.getByLabel('Body').fill('alpha')
  await page.keyboard.press('Control+s')
  await page.getByLabel('Body').fill('beta')
  await page.keyboard.press('Control+s')
  await expect.poll(() => versionCount(page)).toBe(2)

  await page.getByRole('button', { name: 'History' }).click()
  const items = page.getByRole('list', { name: 'History' }).getByRole('listitem')
  await expect(items).toHaveCount(2)
  await expect(items.nth(0)).toContainText('beta')
  await expect(items.nth(1)).toContainText('alpha')
  await expect(items.nth(0).locator('time')).toBeVisible()
  await expect(items.nth(0)).toContainText('This device')
  await expect(items.nth(1)).toContainText('This device')

  await page.getByRole('button', { name: 'Open Groceries: alpha' }).click()
  const old = page.getByRole('article', { name: 'Old version' })
  await expect(old.getByLabel('Title')).toHaveValue('Groceries')
  await expect(old.getByLabel('Body')).toHaveValue('alpha')
  await expect(old.getByLabel('Title')).not.toBeEditable()
  await expect(old.getByLabel('Body')).not.toBeEditable()

  await page.getByRole('button', { name: 'Back to history' }).click()
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
})
