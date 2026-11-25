import { expect, test } from '@playwright/test'

test('the open note shows pin, remind, archive and more icons, and an item moves up', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Take a note' }).click()
  await page.getByLabel('Title').fill('Shopping')
  await page.getByLabel('Body').fill('Bread\nMilk')
  await page.getByRole('button', { name: 'Show checkboxes', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: 'Tick Bread' })).toBeVisible()

  await page.getByRole('heading', { name: 'Tracepad' }).click()
  await page.getByRole('button', { name: /^Shopping,/ }).click()

  const dialog = page.getByRole('dialog', { name: 'Note' })
  await expect(dialog).toBeVisible()

  const pin = dialog.getByRole('button', { name: 'Pin', exact: true })
  const more = dialog.getByRole('button', { name: 'More', exact: true })
  await expect(pin.locator('svg')).toBeVisible()
  await expect(pin).toHaveAttribute('title', 'Pin')
  await expect(more.locator('svg')).toBeVisible()
  await expect(more).toHaveAttribute('title', 'More')

  await more.click()
  const remind = dialog.getByRole('menuitem', { name: 'Remind me', exact: true })
  const archive = dialog.getByRole('menuitem', { name: 'Archive', exact: true })
  await expect(remind.locator('svg')).toBeVisible()
  await expect(remind).toHaveAttribute('title', 'Remind me')
  await expect(archive.locator('svg')).toBeVisible()
  await expect(archive).toHaveAttribute('title', 'Archive')

  await expect(dialog.getByRole('checkbox', { name: /^Tick / }).nth(0)).toHaveAccessibleName('Tick Bread')
  const up = dialog.getByRole('button', { name: 'Move Milk up', exact: true })
  await expect(up.locator('svg')).toBeVisible()
  await expect(up).not.toContainText('Up')
  await up.click()
  await expect(dialog.getByRole('checkbox', { name: /^Tick / }).nth(0)).toHaveAccessibleName('Tick Milk')
  await expect(dialog.getByRole('checkbox', { name: /^Tick / }).nth(1)).toHaveAccessibleName('Tick Bread')
})
