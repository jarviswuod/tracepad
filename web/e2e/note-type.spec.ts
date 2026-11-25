import { expect, test, type Locator, type Page } from '@playwright/test'

async function fontRem(locator: Locator): Promise<number> {
  return locator.evaluate((el) => {
    const root = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
    return Number.parseFloat(getComputedStyle(el).fontSize) / root
  })
}

async function lineHeightRatio(locator: Locator): Promise<number> {
  return locator.evaluate((el) => {
    const style = getComputedStyle(el)
    return Number.parseFloat(style.lineHeight) / Number.parseFloat(style.fontSize)
  })
}

async function expectChipBox(locator: Locator) {
  expect(await fontRem(locator)).toBeCloseTo(0.9, 2)
  expect(await lineHeightRatio(locator)).toBeCloseTo(1.2, 2)
  await expect(locator).toHaveCSS('padding-top', '4px')
  await expect(locator).toHaveCSS('padding-bottom', '4px')
  await expect(locator).toHaveCSS('padding-left', '8px')
  await expect(locator).toHaveCSS('padding-right', '8px')
}

async function leaveNote(page: Page) {
  await page.getByRole('heading', { name: 'Tracepad' }).click()
  await expect(page.getByLabel('Title')).toHaveCount(0)
}

test('note title, body, and label chips keep their sizes in the create box and the open note', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Take a note' }).click()
  const createTitle = page.getByLabel('Title')
  const createBody = page.getByLabel('Body')
  await expect(createTitle).toBeVisible()

  expect(await fontRem(createTitle)).toBeCloseTo(1.2, 2)
  await expect(createTitle).toHaveCSS('font-weight', '500')
  expect(await fontRem(createBody)).toBeCloseTo(1, 2)
  expect(await lineHeightRatio(createBody)).toBeCloseTo(1.5, 2)

  await createTitle.focus()
  expect(await createTitle.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none')
  await createBody.focus()
  expect(await createBody.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none')

  await createTitle.fill('Groceries')
  await createBody.fill('Milk')
  await page.getByRole('button', { name: 'Show checkboxes', exact: true }).click()
  const item = page.getByLabel('Item Milk')
  await expect(item).toBeVisible()
  await item.focus()
  expect(await item.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none')
  await page.getByRole('button', { name: 'Hide checkboxes', exact: true }).click()
  await expect(createBody).toHaveValue('Milk')
  await leaveNote(page)

  const card = page.getByRole('button', { name: 'Groceries, Milk', exact: true })
  await expect(card).toBeVisible()
  const cardTitle = card.locator('.note-title')
  const preview = card.locator('.note-preview')
  expect(await fontRem(cardTitle)).toBeCloseTo(1.2, 2)
  await expect(cardTitle).toHaveCSS('font-weight', '500')
  expect(await fontRem(preview)).toBeCloseTo(1, 2)
  expect(await lineHeightRatio(preview)).toBeCloseTo(1.5, 2)

  await card.click()
  const dialog = page.getByRole('dialog', { name: 'Note' })
  const openTitle = dialog.getByLabel('Title')
  const openBody = dialog.getByLabel('Body')
  await expect(openTitle).toHaveValue('Groceries')
  expect(await fontRem(openTitle)).toBeCloseTo(1.2, 2)
  await expect(openTitle).toHaveCSS('font-weight', '500')
  expect(await fontRem(openBody)).toBeCloseTo(1, 2)
  expect(await lineHeightRatio(openBody)).toBeCloseTo(1.5, 2)
  await openTitle.focus()
  expect(await openTitle.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none')
  await openBody.focus()
  expect(await openBody.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none')

  await dialog.getByRole('button', { name: 'More', exact: true }).click()
  await dialog.getByRole('menuitem', { name: 'Change labels', exact: true }).click()
  const labelField = dialog.getByLabel('Enter label name')
  await expect(labelField).toBeFocused()
  expect(await labelField.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none')
  await labelField.fill('Work')
  await dialog.getByRole('button', { name: 'Create "Work"', exact: true }).click()
  const openChip = dialog.locator('.note-open-chip')
  await expect(openChip).toHaveText('Work')
  await expectChipBox(openChip)

  await page.keyboard.press('Escape')
  await dialog.getByRole('button', { name: 'More', exact: true }).click()
  await dialog.getByRole('menuitem', { name: 'Colors', exact: true }).click()
  const yellow = dialog.getByRole('button', { name: 'Yellow color', exact: true })
  await yellow.click()
  await expect(yellow).toHaveAttribute('aria-pressed', 'true')
  await yellow.focus()
  const ring = await yellow.evaluate((el) => {
    const style = getComputedStyle(el)
    return { style: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor }
  })
  expect(ring.style).toBe('solid')
  expect(ring.width).toBe('2px')
  expect(ring.color).toBe('rgb(26, 115, 232)')

  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(dialog).toHaveCount(0)

  const cardChip = card.locator('.note-chip')
  await expect(cardChip).toHaveText('Work')
  await expectChipBox(cardChip)

  const notes = page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'Notes', exact: true })
  expect(await fontRem(notes)).toBeCloseTo(1, 2)

  await page.getByRole('button', { name: 'Edit labels', exact: true }).click()
  const editing = page.getByRole('dialog', { name: 'Edit labels' })
  const createLabel = editing.getByLabel('Create new label')
  await expect(createLabel).toBeFocused()
  expect(await createLabel.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none')
  await editing.getByRole('button', { name: 'Work', exact: true }).click()
  const rename = editing.getByLabel('Rename Work')
  await expect(rename).toBeFocused()
  expect(await rename.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none')
})
