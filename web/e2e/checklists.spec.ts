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

test('makes a checklist, ticks an item, and shows it in history without a new version', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Take a note' }).click()
  await page.getByLabel('Title').fill('Shopping')
  await page.getByLabel('Body').fill('Milk\nBread')
  await page.getByRole('button', { name: 'Show checkboxes' }).click()

  const milk = page.getByRole('checkbox', { name: 'Tick Milk' })
  const bread = page.getByRole('checkbox', { name: 'Tick Bread' })
  await expect(milk).toBeVisible()
  await expect(bread).toBeVisible()
  await expect.poll(async () => (await readStore(page, 'noteVersions')).length).toBe(1)

  await milk.click()
  await expect(milk).toBeChecked()
  await expect(page.getByLabel('Item Milk')).toHaveCSS('text-decoration-line', 'line-through')
  const boxes = page.getByRole('checkbox', { name: /^Tick / })
  await expect(boxes.nth(0)).toHaveAccessibleName('Tick Bread')
  await expect(boxes.nth(1)).toHaveAccessibleName('Tick Milk')
  await expect.poll(async () => (await readStore<{ ticked: boolean }>(page, 'checklistTicks')).length).toBe(1)
  expect(await readStore(page, 'noteVersions')).toHaveLength(1)

  await page.getByRole('button', { name: 'History' }).click()
  await expect(page).toHaveURL(/\/history\/[0-9a-f-]{36}$/)
  const list = page.getByRole('list', { name: 'History' })
  await expect(list.locator('.note-card')).toHaveCount(1)
  await expect(list.getByText('Ticked', { exact: true })).toBeVisible()
  expect(await readStore(page, 'noteVersions')).toHaveLength(1)
})
