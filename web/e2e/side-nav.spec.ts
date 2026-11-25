import { expect, test, type Locator } from '@playwright/test'

test('the top bar names the open menu, and Main menu hides the side names', async ({ page }) => {
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Views' })
  const notes = nav.getByRole('button', { name: 'Notes', exact: true })
  const heading = page.getByRole('heading', { level: 1 })

  await expect(heading).toHaveAccessibleName('Tracepad')
  await expect(page.locator('.brand-bulb')).toBeVisible()
  await expect(notes).toHaveAttribute('aria-current', 'page')
  await expect(notes).toContainText('Notes')
  await expectYellow(notes)
  await expectClear(nav.getByRole('button', { name: 'Archive', exact: true }))

  await nav.getByRole('button', { name: 'Trash', exact: true }).click()
  await expect(heading).toHaveAccessibleName('Trash')
  await expect(page.locator('.brand-bulb')).toHaveCount(0)
  const trash = nav.getByRole('button', { name: 'Trash', exact: true })
  await expect(trash).toHaveAttribute('aria-current', 'page')
  await expectYellow(trash)
  await expect(notes).not.toHaveAttribute('aria-current', 'page')

  await nav.getByRole('button', { name: 'Archive', exact: true }).click()
  await expect(heading).toHaveAccessibleName('Archive')
  await nav.getByRole('button', { name: 'Reminders', exact: true }).click()
  await expect(heading).toHaveAccessibleName('Reminders')

  await nav.getByRole('button', { name: 'Edit labels', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit labels' })
  const input = dialog.getByLabel('Create new label')
  await input.fill('6 mths daily coding TODO')
  await input.press('Enter')
  await dialog.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(dialog).toHaveCount(0)

  const label = nav.getByRole('button', { name: '6 mths daily coding TODO', exact: true })
  await label.click()
  await expect(heading).toHaveAccessibleName('6 mths daily coding TODO')
  await expectYellow(label)

  const menu = page.getByRole('button', { name: 'Main menu', exact: true })
  await expect(menu).toHaveAttribute('title', 'Main menu')
  await menu.click()
  await expect(nav).toHaveClass(/is-collapsed/)
  await expect(label).not.toContainText('6 mths')
  await expect(notes).not.toContainText('Notes')
  await expect(page.getByRole('button', { name: 'Grid', exact: true })).not.toContainText('Grid')
  await expect(heading).toHaveAccessibleName('6 mths daily coding TODO')
  await expectYellow(label)
  const box = await label.boundingBox()
  expect(box).not.toBeNull()
  expect(Math.abs((box?.width ?? 0) - (box?.height ?? 0))).toBeLessThan(2)

  await menu.click()
  await expect(nav).not.toHaveClass(/is-collapsed/)
  await expect(label).toContainText('6 mths daily coding TODO')
  await expect(notes).toContainText('Notes')
  await expectYellow(label)
})

async function expectYellow(locator: Locator) {
  await expect
    .poll(async () => locator.evaluate((el) => getComputedStyle(el).backgroundColor))
    .toBe('rgb(254, 239, 195)')
}

async function expectClear(locator: Locator) {
  await expect
    .poll(async () => locator.evaluate((el) => getComputedStyle(el).backgroundColor))
    .toBe('rgba(0, 0, 0, 0)')
}
