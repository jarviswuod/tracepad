import { expect, test, type Locator, type Page } from '@playwright/test'

test('creates, orders, renames and deletes labels from the Edit labels dialog', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/')
  await createNote(page, 'Alpha', 'Apples')

  const nav = page.getByRole('navigation', { name: 'Views' })
  await nav.getByRole('button', { name: 'Edit labels', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit labels' })
  await expect(dialog).toBeVisible()
  await expectWidthAndTop(page, dialog)

  await createLabel(dialog, '1. 10')
  await createLabel(dialog, 'banana')
  await createLabel(dialog, '1. 9')
  await expect(names(dialog)).toHaveText(['1. 9', '1. 10', 'banana'])
  await expect(nav.getByRole('list', { name: 'Labels' }).getByRole('button')).toHaveText([
    '1. 9',
    '1. 10',
    'banana',
    'Edit labels',
  ])

  await dialog.getByRole('button', { name: 'banana', exact: true }).click()
  await dialog.getByLabel('Rename banana').fill('Apple')
  await dialog.getByLabel('Rename banana').press('Enter')
  await expect(names(dialog)).toHaveText(['1. 9', '1. 10', 'Apple'])

  const apple = dialog.locator('.edit-label-row', { hasText: 'Apple' })
  await dialog.getByRole('button', { name: 'Apple', exact: true }).focus()
  await expect(apple.getByRole('button', { name: 'Delete Apple', exact: true })).toBeVisible()

  await dialog.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(dialog).toHaveCount(0)

  await page.getByRole('button', { name: 'Alpha, Apples', exact: true }).click()
  const note = page.getByRole('dialog', { name: 'Note' })
  await expect(note.locator('.note-label-picks label')).toHaveText(['1. 9', '1. 10', 'Apple'])
  await note.getByRole('checkbox', { name: '1. 9', exact: true }).click()
  await expect(note.getByRole('checkbox', { name: '1. 9', exact: true })).toBeChecked()
  await note.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Alpha, Apples', exact: true })).toContainText('1. 9')

  await nav.getByRole('button', { name: 'Edit labels', exact: true }).click()
  const editing = page.getByRole('dialog', { name: 'Edit labels' })
  const row = editing.locator('.edit-label-row', { hasText: '1. 9' })
  const remove = row.getByRole('button', { name: 'Delete 1. 9', exact: true })
  await expect(remove).toBeHidden()
  await row.hover()
  await expect(remove).toBeVisible()
  await remove.click()
  const confirm = page.getByRole('dialog', { name: 'Delete label?' })
  await expect(confirm).toContainText(
    "We'll delete this label and remove it from all of your notes. Your notes won't be deleted.",
  )
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(editing.getByRole('button', { name: '1. 9', exact: true })).toBeVisible()
  await row.hover()
  await remove.click()
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(editing.getByRole('button', { name: '1. 9', exact: true })).toHaveCount(0)

  const done = editing.getByRole('button', { name: 'Done', exact: true })
  for (let i = 1; i <= 16; i += 1) await createLabel(editing, `Extra ${String(i).padStart(2, '0')}`)
  const list = editing.locator('.edit-labels-list')
  await expect.poll(async () => list.evaluate((el) => el.scrollHeight > el.clientHeight + 8)).toBe(true)
  await expect(done).toBeInViewport()
  const before = await done.boundingBox()
  await list.evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  expect(await list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
  const after = await done.boundingBox()
  expect(after?.y).toBe(before?.y)
  await expectWidthAndTop(page, editing)
  expect(await page.evaluate(() => document.documentElement.scrollTop)).toBe(0)
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden')

  await done.click()
  await expect(page.getByRole('button', { name: 'Alpha, Apples', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Alpha, Apples', exact: true })).not.toContainText('1. 9')
  expect(await readStore(page, 'notes')).toHaveLength(1)
})

function names(dialog: Locator): Locator {
  return dialog.locator('.edit-label-name')
}

async function createLabel(dialog: Locator, name: string) {
  const input = dialog.getByLabel('Create new label')
  await input.fill(name)
  await input.press('Enter')
  await expect(dialog.getByRole('button', { name, exact: true })).toBeVisible()
}

async function expectWidthAndTop(page: Page, dialog: Locator) {
  const box = await dialog.boundingBox()
  const viewport = page.viewportSize()
  expect(box).not.toBeNull()
  expect(viewport).not.toBeNull()
  expect(Math.abs((box?.width ?? 0) - 300)).toBeLessThan(2)
  expect(Math.abs((box?.y ?? 0) - (viewport?.height ?? 0) * 0.15)).toBeLessThan(2)
  expect(Math.abs((box?.x ?? 0) + (box?.width ?? 0) / 2 - (viewport?.width ?? 0) / 2)).toBeLessThan(2)
}

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
