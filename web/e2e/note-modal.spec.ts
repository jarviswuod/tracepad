import { expect, test, type Page } from '@playwright/test'

test('opens a card in a modal without moving the board, and Esc saves the edit', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 1280, height: 480 })
  await page.goto('/')
  for (const name of ['One', 'Two', 'Three', 'Four', 'Five', 'Six']) {
    await createNote(page, name, `${name} body`)
  }
  await page.evaluate(() => window.scrollTo(0, 60))
  const scrollBefore = await page.evaluate(() => window.scrollY)
  expect(scrollBefore).toBeGreaterThan(0)
  const before = await cardBoxes(page)

  await page.getByRole('button', { name: 'Three, Three body', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Note' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  await expect(dialog.getByLabel('Title', { exact: true })).toBeFocused()
  await expect(page.getByRole('button', { name: 'Three, Three body', exact: true })).toBeHidden()

  expect(await cardBoxes(page)).toEqual(before)
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore)
  await page.mouse.wheel(0, 400)
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore)

  const width = (await dialog.boundingBox())?.width ?? 0
  expect(Math.abs(width - 600)).toBeLessThanOrEqual(1)

  await dialog.getByLabel('Body', { exact: true }).fill('Three body, edited')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  const card = page.getByRole('button', { name: 'Three, Three body, edited', exact: true })
  await expect(card).toBeVisible()
  await expect(card).toBeFocused()
})

test('fills the width minus margins on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 })
  await page.goto('/')
  await createNote(page, 'Narrow', 'Phone')
  await page.getByRole('button', { name: 'Narrow, Phone', exact: true }).click()
  const box = await page.getByRole('dialog', { name: 'Note' }).boundingBox()
  expect(box).not.toBeNull()
  expect(Math.abs((box?.width ?? 0) - 343)).toBeLessThanOrEqual(1)
  expect(Math.abs((box?.x ?? 0) - 16)).toBeLessThanOrEqual(1)

  await page.getByTestId('note-modal-backdrop').click({ position: { x: 5, y: 5 } })
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('opens an old version and a trashed note in the modal', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/')
  await createNote(page, 'Alpha', 'Apples')
  await page.getByRole('button', { name: 'Alpha, Apples', exact: true }).click()
  await page.getByRole('dialog', { name: 'Note' }).getByRole('button', { name: 'History', exact: true }).click()

  await page.getByRole('list', { name: 'History' }).getByRole('button', { name: 'Alpha, Apples', exact: true }).click()
  const version = page.getByRole('dialog', { name: 'Version' })
  await expect(version).toBeVisible()
  await expect(version.getByRole('article', { name: 'Old version' })).toContainText('Apples')
  await expect(page.getByRole('heading', { name: 'Alpha', exact: true })).toBeVisible()
  await version.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(version).toHaveCount(0)

  await page.getByRole('button', { name: 'Back to note', exact: true }).click()
  const note = page.getByRole('dialog', { name: 'Note' })
  await note.getByRole('button', { name: 'Move to trash', exact: true }).click()
  await expect(note).toHaveCount(0)
  await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'Trash', exact: true }).click()
  await page.getByRole('button', { name: 'Alpha, Apples', exact: true }).click()
  await expect(note).toBeVisible()
  await expect(note.getByLabel('Title')).toHaveValue('Alpha')
  await page.keyboard.press('Escape')
  await expect(note).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Alpha, Apples', exact: true })).toBeVisible()
})

async function createNote(page: Page, title: string, body: string) {
  await page.getByRole('button', { name: 'Take a note' }).click()
  await page.getByLabel('Title', { exact: true }).fill(title)
  await page.getByLabel('Body', { exact: true }).fill(body)
  await page.getByRole('heading', { name: 'Tracepad' }).click()
  await expect(page.getByRole('button', { name: `${title}, ${body}`, exact: true })).toBeVisible()
}

function cardBoxes(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.board-cards > li'), (item) => {
      const box = item.getBoundingClientRect()
      return { x: box.x, y: box.y, width: box.width, height: box.height }
    }),
  )
}
