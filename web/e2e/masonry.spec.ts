import { expect, test, type Locator, type Page } from '@playwright/test'

test.use({ viewport: { width: 900, height: 1000 } })

test('grid packs by height, drag order survives reload, and list stays one column', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/')

  const longBody = 'Alpha long note. '.repeat(30).trim()
  await createNote(page, 'Long', longBody)
  await createNote(page, 'Short', 'Alpha hi')
  await createNote(page, 'Later', 'Alpha yo')

  const later = page.getByRole('button', { name: /^Later,/ })
  const short = page.getByRole('button', { name: /^Short,/ })
  const long = page.getByRole('button', { name: /^Long,/ })

  await expect.poll(async () => packed(later, short, long)).toBe(true)
  const laterBox = await later.boundingBox()
  const longBox = await long.boundingBox()
  expect(laterBox && longBox && laterBox.height < longBox.height).toBe(true)

  await page.getByRole('button', { name: 'List', exact: true }).click()
  await expect.poll(() => columnCount(page)).toBe(1)
  const beforeDrag = await cardLabels(page)
  await drag(page, short, later)
  await expect.poll(() => cardLabels(page)).toEqual(beforeDrag)
  await expect(page.getByLabel('Sort')).toHaveValue('edited')

  await page.getByRole('button', { name: 'Grid', exact: true }).click()
  await later.click()
  await expect(page.getByLabel('Title')).toHaveValue('Later')
  await page.getByRole('dialog', { name: 'Note' }).getByRole('button', { name: 'Close' }).click()
  await expect(page.getByLabel('Title')).toHaveCount(0)

  await page.getByLabel('Search').fill('Alpha')
  const whileSearching = await cardLabels(page)
  await expect.poll(() => cardLabels(page)).toHaveLength(3)
  await drag(page, short, later)
  await expect.poll(() => cardLabels(page)).toEqual(whileSearching)
  await expect(page.getByLabel('Sort')).toHaveValue('edited')
  await page.getByLabel('Search').fill('')

  await expect.poll(async () => packed(later, short, long)).toBe(true)
  await drag(page, short, later)
  await expect(page.getByLabel('Sort')).toHaveValue('custom')
  await expect.poll(() => cardLabels(page)).not.toEqual(['Later, Alpha yo', 'Short, Alpha hi', `Long, ${longBody}`])
  const customOrder = await cardLabels(page)
  expect(customOrder[0]).toMatch(/^Short,/)

  await page.reload()
  await expect(page.getByLabel('Sort')).toHaveValue('custom')
  await expect.poll(() => cardLabels(page)).toEqual(customOrder)

  await page.getByLabel('Sort').selectOption('edited')
  await expect.poll(() => cardLabels(page)).toEqual(['Later, Alpha yo', 'Short, Alpha hi', `Long, ${longBody}`])
  await long.click()
  await page.getByLabel('Body').fill('Alpha edited')
  await page.getByRole('dialog', { name: 'Note' }).getByRole('button', { name: 'Close' }).click()
  await expect.poll(() => cardLabels(page)).toEqual(['Long, Alpha edited', 'Later, Alpha yo', 'Short, Alpha hi'])

  await later.click()
  await page.getByRole('button', { name: 'Pin', exact: true }).click()
  await page.getByRole('dialog', { name: 'Note' }).getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('heading', { name: 'Pinned' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Others' })).toBeVisible()
  const others = page.getByRole('list', { name: 'Others' })
  await expect(others.getByRole('button', { name: /^Long,/ })).toBeVisible()
  await drag(page, others.getByRole('button', { name: /^Long,/ }), page.getByRole('button', { name: /^Later,/ }))
  await expect(others.getByRole('button', { name: /^Long,/ })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Pinned' }).getByRole('button', { name: /^Later,/ })).toBeVisible()
})

async function createNote(page: Page, title: string, body: string) {
  await page.getByRole('button', { name: 'Take a note' }).click()
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Body').fill(body)
  await page.getByRole('heading', { name: 'Tracepad' }).click()
  await expect(page.getByRole('button', { name: `${title}, ${body}`, exact: true })).toBeVisible()
  await expect(page.getByLabel('Title')).toHaveCount(0)
}

function cardLabels(page: Page): Promise<string[]> {
  return page
    .getByRole('list', { name: 'Board' })
    .getByRole('button')
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label') ?? ''))
}

function columnCount(page: Page): Promise<number> {
  return page.getByRole('list', { name: 'Board' }).evaluate((list) => {
    return getComputedStyle(list)
      .gridTemplateColumns.split(' ')
      .filter((part) => part.length > 0).length
  })
}

/** The one-line note is above a later note in its column, and another note sits in a different column. */
async function packed(higher: Locator, beside: Locator, lower: Locator): Promise<boolean> {
  const top = await higher.boundingBox()
  const side = await beside.boundingBox()
  const bottom = await lower.boundingBox()
  if (!top || !side || !bottom) return false
  const sameColumn = Math.abs(top.x - bottom.x) < 4
  const otherColumn = Math.abs(top.x - side.x) > 40
  return top.height < bottom.height && top.y + 4 < bottom.y && sameColumn && otherColumn
}

async function drag(page: Page, from: Locator, to: Locator) {
  const fromBox = await from.boundingBox()
  const toBox = await to.boundingBox()
  if (!fromBox || !toBox) throw new Error('missing card to drag')
  const startX = fromBox.x + fromBox.width / 2
  const startY = fromBox.y + Math.min(20, fromBox.height / 2)
  const endX = toBox.x + toBox.width / 2
  const endY = toBox.y + Math.min(20, toBox.height / 2)
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(endX, endY, { steps: 25 })
  await page.mouse.up()
}
