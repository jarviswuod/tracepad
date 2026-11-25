import { expect, test, type Locator, type Page } from '@playwright/test'

test('searches notes, includes archived notes from the switch, and stays inside a label', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await createNote(page, 'Orchard', 'Apples')
  await createNote(page, 'Kitchen', 'Berries')
  await createNote(page, 'Desk', 'Pencils')

  await page.getByRole('button', { name: 'Orchard, Apples', exact: true }).click()
  const orchard = page.getByRole('dialog', { name: 'Note' })
  await orchard.getByRole('button', { name: 'Archive', exact: true }).click()
  await orchard.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Orchard, Apples', exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: 'Kitchen, Berries', exact: true }).click()
  const kitchen = page.getByRole('dialog', { name: 'Note' })
  await chooseMore(kitchen, 'Change labels')
  await kitchen.getByLabel('Enter label name').fill('Home')
  await kitchen.getByRole('button', { name: 'Create "Home"', exact: true }).click()
  await expect(kitchen.getByRole('checkbox', { name: 'Home', exact: true })).toBeChecked()
  await kitchen.getByRole('button', { name: 'Close', exact: true }).click()

  const search = page.getByRole('searchbox', { name: 'Search' })
  await search.fill('APPLES')
  await expect(page.locator('.empty-state')).toHaveText('No notes match')
  await expect(page.getByRole('button', { name: 'Orchard, Apples', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Desk, Pencils', exact: true })).toHaveCount(0)

  await page.getByRole('switch', { name: 'Include archived' }).click()
  const archived = page.getByRole('button', { name: 'Orchard, Apples', exact: true })
  await expect(archived).toBeVisible()
  await expect(archived).toContainText('Archived')
  await expect(page.getByRole('button', { name: 'Kitchen, Berries', exact: true })).toHaveCount(0)

  await search.fill('pencils')
  await expect(page.getByRole('button', { name: 'Desk, Pencils', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Orchard, Apples', exact: true })).toHaveCount(0)

  await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'Home', exact: true }).click()
  await expect(page.locator('.empty-state')).toHaveText('No notes match')
  await expect(page.getByRole('button', { name: 'Desk, Pencils', exact: true })).toHaveCount(0)

  await search.fill('berries')
  await expect(page.getByRole('button', { name: 'Kitchen, Berries', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Desk, Pencils', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Orchard, Apples', exact: true })).toHaveCount(0)
})

async function chooseMore(dialog: Locator, item: string) {
  const more = dialog.getByRole('button', { name: 'More', exact: true })
  if ((await more.getAttribute('aria-expanded')) === 'true') await more.click()
  await more.click()
  await dialog.getByRole('menuitem', { name: item, exact: true }).click()
}

async function createNote(page: Page, title: string, body: string) {
  await page.getByRole('button', { name: 'Take a note' }).click()
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Body').fill(body)
  await page.getByRole('heading', { name: 'Tracepad' }).click()
  await expect(page.getByRole('button', { name: `${title}, ${body}`, exact: true })).toBeVisible()
}
