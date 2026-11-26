import { expect, test, type Page } from '@playwright/test'

test('a long new note stops at the maximum and scrolls inside the box', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Take a note' }).click()

  const editor = page.getByRole('group', { name: 'Note' })
  const body = editor.getByLabel('Body')
  await body.fill('One\nTwo\nThree\nFour')

  const cap = await editor.evaluate((el) => Number.parseFloat(getComputedStyle(el).maxHeight))
  const shortHeight = (await editor.boundingBox())?.height ?? 0
  expect(cap).toBeGreaterThan(400)
  expect(Math.abs(cap - (800 - 260))).toBeLessThanOrEqual(1)
  expect(shortHeight).toBeGreaterThan(0)
  expect(shortHeight).toBeLessThan(cap - 40)

  const long = Array.from({ length: 80 }, (_, index) => `Line ${index + 1} of a new note`).join('\n')
  await body.fill(long)
  await expect.poll(async () => Math.abs(((await editor.boundingBox())?.height ?? 0) - cap)).toBeLessThanOrEqual(1)

  const scroller = editor.locator('.editor-scroll')
  await expect(scroller).toHaveCSS('scrollbar-width', 'thin')
  await expect(scroller).toHaveCSS('scrollbar-color', 'rgb(189, 193, 198) rgba(0, 0, 0, 0)')

  const more = editor.getByRole('button', { name: 'More', exact: true })
  const checklist = editor.getByRole('button', { name: 'Show checkboxes', exact: true })
  const moreBefore = await more.boundingBox()
  const checklistBefore = await checklist.boundingBox()
  const editorBox = await editor.boundingBox()
  expect(moreBefore).not.toBeNull()
  expect(checklistBefore).not.toBeNull()
  expect(editorBox).not.toBeNull()
  expect(moreBefore!.y + moreBefore!.height).toBeGreaterThan(editorBox!.y + editorBox!.height - 28)
  expect(moreBefore!.y + moreBefore!.height).toBeLessThanOrEqual(editorBox!.y + editorBox!.height)
  expect(Math.abs(moreBefore!.y - checklistBefore!.y)).toBeLessThanOrEqual(1)

  const scrolled = await scroller.evaluate((node) => {
    const title = node.querySelector('[aria-label="Title"]')
    const titleBefore = title?.getBoundingClientRect().top ?? 0
    const overflow = node.scrollHeight > node.clientHeight + 20
    node.scrollTop = node.scrollHeight
    const titleAfter = title?.getBoundingClientRect().top ?? 0
    return { overflow, top: node.scrollTop, titleDelta: titleBefore - titleAfter }
  })
  expect(scrolled.overflow).toBe(true)
  expect(scrolled.top).toBeGreaterThan(20)
  expect(scrolled.titleDelta).toBeGreaterThan(20)

  const moreAfter = await more.boundingBox()
  const checklistAfter = await checklist.boundingBox()
  expect(Math.abs((moreAfter?.y ?? 0) - moreBefore!.y)).toBeLessThanOrEqual(1)
  expect(Math.abs((checklistAfter?.y ?? 0) - checklistBefore!.y)).toBeLessThanOrEqual(1)
  await expect(more).toBeVisible()
  await expect(checklist).toBeVisible()

  const pageBox = await pageScroll(page)
  expect(pageBox.scrollY).toBe(0)
  expect(pageBox.scrollHeight).toBeLessThanOrEqual(pageBox.clientHeight + 1)
  expect((editorBox?.y ?? 0) + (editorBox?.height ?? 0)).toBeLessThanOrEqual(pageBox.clientHeight + 1)

  const heightAtMax = (await editor.boundingBox())?.height ?? 0
  await body.fill(`${long}\n${long}`)
  await expect.poll(async () => (await editor.boundingBox())?.height ?? 0).toBeLessThanOrEqual(heightAtMax + 1)
  const afterMore = await pageScroll(page)
  expect(afterMore.scrollY).toBe(0)
  expect(afterMore.scrollHeight).toBe(pageBox.scrollHeight)
})

async function pageScroll(page: Page) {
  return page.evaluate(() => ({
    scrollY: window.scrollY,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }))
}
