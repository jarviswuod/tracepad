import { expect, test, type Locator, type Page } from '@playwright/test'

async function fieldHeight(locator: Locator): Promise<number> {
  return locator.evaluate((el) => el.getBoundingClientRect().height)
}

async function expectNoInnerScrollbar(locator: Locator) {
  const box = await locator.evaluate((el) => {
    const style = getComputedStyle(el)
    return { scroll: el.scrollHeight, client: el.clientHeight, overflow: style.overflowY }
  })
  expect(box.overflow).toBe('hidden')
  expect(box.scroll).toBeLessThanOrEqual(box.client + 1)
}

test('the create box and the open note grow, and a card shows its action row', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Take a note' }).click()
  await page.getByLabel('Title').fill('Grow')
  const body = page.getByLabel('Body')
  await expect(body).toBeVisible()
  await expect(body).toHaveCSS('resize', 'none')
  const oneLine = await fieldHeight(body)

  await body.fill('One\nTwo\nThree\nFour')
  await expect.poll(() => fieldHeight(body)).toBeGreaterThan(oneLine + 20)
  await expectNoInnerScrollbar(body)
  const tall = await fieldHeight(body)

  await body.fill('One')
  await expect.poll(() => fieldHeight(body)).toBeLessThan(tall - 10)
  await expectNoInnerScrollbar(body)

  const editor = page.getByRole('group', { name: 'Note' })
  await page.getByRole('button', { name: 'Show checkboxes', exact: true }).click()
  const withItems = await editor.boundingBox()
  expect(withItems).not.toBeNull()
  await page.getByRole('button', { name: 'Add item', exact: true }).click()
  await expect.poll(async () => (await editor.boundingBox())?.height ?? 0).toBeGreaterThan((withItems?.height ?? 0) + 12)
  const grown = (await editor.boundingBox())?.height ?? 0
  const editorScroll = await editor.evaluate((el) => ({
    scroll: el.scrollHeight,
    client: el.clientHeight,
    overflow: getComputedStyle(el).overflowY,
  }))
  expect(editorScroll.overflow === 'visible' || editorScroll.overflow === 'hidden').toBe(true)
  expect(editorScroll.scroll).toBeLessThanOrEqual(editorScroll.client + 1)

  await page.getByRole('button', { name: 'Remove 2', exact: true }).click()
  await expect.poll(async () => (await editor.boundingBox())?.height ?? 0).toBeLessThan(grown - 8)

  await page.getByRole('button', { name: 'Hide checkboxes', exact: true }).click()
  await page.getByRole('heading', { name: 'Tracepad' }).click()
  await expect(page.getByLabel('Title')).toHaveCount(0)

  const card = page.getByRole('button', { name: 'Grow, One', exact: true })
  await expect(card).toBeVisible()
  await card.click()
  const dialog = page.getByRole('dialog', { name: 'Note' })
  const openBody = dialog.getByLabel('Body')
  const openStart = await fieldHeight(openBody)
  await openBody.fill('One\nTwo\nThree\nFour\nFive')
  await expect.poll(() => fieldHeight(openBody)).toBeGreaterThan(openStart + 20)
  await expectNoInnerScrollbar(openBody)
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(dialog).toHaveCount(0)

  const closed = page.getByRole('button', { name: /^Grow,/, exact: true })
  await expect(closed).toBeVisible()
  const actions = closed.locator('xpath=ancestor::*[contains(@class,"note-card-frame")]').locator('.note-card-actions')
  // Closing the note puts focus back on the card, which shows the row. Leave that focus.
  await page.getByRole('heading', { name: 'Tracepad' }).click()
  await expect(actions).toBeHidden()

  await closed.hover()
  await expect(actions).toBeVisible()
  await expect(actions.getByRole('button', { name: 'Pin', exact: true })).toBeVisible()
  await expect(actions.getByRole('button', { name: 'Remind me', exact: true })).toBeVisible()
  await expect(actions.getByRole('button', { name: 'More', exact: true })).toBeVisible()
  await expect(closed).toHaveCSS('padding-top', '12px')
  await expect(closed).toHaveCSS('padding-right', '16px')
  await expect(closed).toHaveCSS('padding-bottom', '12px')
  await expect(closed).toHaveCSS('padding-left', '16px')

  const cardBox = await closed.boundingBox()
  const rowBox = await actions.boundingBox()
  const titleBox = await closed.locator('.note-title').boundingBox()
  expect(cardBox).not.toBeNull()
  expect(rowBox).not.toBeNull()
  expect(titleBox).not.toBeNull()
  expect(rowBox!.x).toBeGreaterThanOrEqual(cardBox!.x + 12)
  expect(rowBox!.x + rowBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width - 12)
  expect(rowBox!.y).toBeGreaterThanOrEqual(cardBox!.y + 8)
  expect(rowBox!.y + rowBox!.height).toBeLessThanOrEqual(cardBox!.y + cardBox!.height - 8)
  expect(titleBox!.y + titleBox!.height).toBeLessThanOrEqual(rowBox!.y + 1)

  const pinBox = await actions.getByRole('button', { name: 'Pin', exact: true }).boundingBox()
  const remindBox = await actions.getByRole('button', { name: 'Remind me', exact: true }).boundingBox()
  expect(pinBox).not.toBeNull()
  expect(remindBox).not.toBeNull()
  expect(remindBox!.x - (pinBox!.x + pinBox!.width)).toBeGreaterThanOrEqual(6)
  expect(remindBox!.x - (pinBox!.x + pinBox!.width)).toBeLessThanOrEqual(10)
  expect(pinBox!.height).toBeGreaterThanOrEqual(32)
  expect(pinBox!.y + pinBox!.height).toBeLessThanOrEqual(cardBox!.y + cardBox!.height)

  await page.mouse.move(0, 0)
  await expect(actions).toBeHidden()

  await closed.focus()
  await expect(actions).toBeVisible()
  await closed.blur()
  await expect(actions).toBeHidden()

  await closed.hover()
  await actions.getByRole('button', { name: 'Pin', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Note' })).toHaveCount(0)
  await expect(closed).toHaveAttribute('data-pinned', 'true')

  await closed.locator('.note-title').click()
  await expect(page.getByRole('dialog', { name: 'Note' })).toBeVisible()
  await page.getByRole('dialog', { name: 'Note' }).getByRole('button', { name: 'Close', exact: true }).click()

  await page.getByRole('heading', { name: 'Tracepad' }).click()
  await page.setViewportSize({ width: 390, height: 800 })
  await page.mouse.move(0, 0)
  await closed.scrollIntoViewIfNeeded()
  await expect(actions).toBeVisible()
})
