import { expect, test, type Page } from '@playwright/test'

test('view URLs stay put across reload, rename, and Back to note', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/')
  await expect(page).toHaveURL('/home')

  await createNote(page, 'Alpha', 'Apples')
  await page.getByRole('button', { name: 'Alpha, Apples', exact: true }).click()
  const note = page.getByRole('dialog', { name: 'Note' })
  await note.getByRole('button', { name: 'More', exact: true }).click()
  await note.getByRole('menuitem', { name: 'Archive', exact: true }).click()
  await note.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(note).toHaveCount(0)

  const nav = page.getByRole('navigation', { name: 'Views' })
  await nav.getByRole('button', { name: 'Archive', exact: true }).click()
  await expectView(page, 'Archive', '/archive')
  await expect(page.getByRole('button', { name: 'Alpha, Apples', exact: true })).toBeVisible()
  await page.getByLabel('Sort').selectOption('created')
  await page.getByRole('button', { name: 'List', exact: true }).click()
  await expect(page).toHaveURL('/archive')
  await page.reload()
  await expectView(page, 'Archive', '/archive')
  await expect(page.getByRole('button', { name: 'Alpha, Apples', exact: true })).toBeVisible()

  await nav.getByRole('button', { name: 'Notes', exact: true }).click()
  await expect(page).toHaveURL('/home')
  await createNote(page, 'Beta', 'Berries')
  await page.getByRole('button', { name: 'Beta, Berries', exact: true }).click()
  await deleteOpenNote(page)
  await nav.getByRole('button', { name: 'Trash', exact: true }).click()
  await expectView(page, 'Trash', '/trash')
  await expect(page.getByRole('button', { name: 'Beta, Berries', exact: true })).toBeVisible()
  await page.reload()
  await expectView(page, 'Trash', '/trash')
  await expect(page.getByRole('button', { name: 'Beta, Berries', exact: true })).toBeVisible()

  await nav.getByRole('button', { name: 'Reminders', exact: true }).click()
  await expectView(page, 'Reminders', '/reminders')
  await page.reload()
  await expectView(page, 'Reminders', '/reminders')

  await nav.getByRole('button', { name: 'Edit labels', exact: true }).click()
  const editing = page.getByRole('dialog', { name: 'Edit labels' })
  await editing.getByLabel('Create new label').fill('Work')
  await editing.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(editing.getByRole('button', { name: 'Work', exact: true })).toBeVisible()
  await editing.getByRole('button', { name: 'Done', exact: true }).click()
  await nav.getByRole('button', { name: 'Work', exact: true }).click()
  await expectView(page, 'Work', '/label/Work')
  await page.reload()
  await expectView(page, 'Work', '/label/Work')

  await page.goto('/archive')
  await expectView(page, 'Archive', '/archive')
  await expect(page.getByRole('button', { name: 'Alpha, Apples', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Alpha, Apples', exact: true }).click()
  const archived = page.getByRole('dialog', { name: 'Note' })
  await archived.getByRole('button', { name: 'More', exact: true }).click()
  await archived.getByRole('menuitem', { name: 'Change labels', exact: true }).click()
  await archived.getByRole('checkbox', { name: 'Work', exact: true }).click()
  await expect(archived.getByRole('checkbox', { name: 'Work', exact: true })).toBeChecked()
  await archived.getByRole('button', { name: 'Close', exact: true }).click()

  await page.goto('/label/Work')
  await expectView(page, 'Work', '/label/Work')
  await expect(page.getByRole('button', { name: 'Alpha, Apples', exact: true })).toBeVisible()
  await nav.getByRole('button', { name: 'Edit labels', exact: true }).click()
  const rename = page.getByRole('dialog', { name: 'Edit labels' })
  await rename.getByRole('button', { name: 'Work', exact: true }).click()
  await rename.getByLabel('Rename Work').fill('Job')
  await rename.getByLabel('Rename Work').press('Enter')
  await expect(page).toHaveURL('/label/Job')
  await expect(nav.getByRole('button', { name: 'Job', exact: true })).toHaveAttribute('aria-current', 'page')
  await rename.getByRole('button', { name: 'Done', exact: true }).click()

  await page.getByRole('button', { name: 'Alpha, Apples', exact: true }).click()
  await page.getByRole('dialog', { name: 'Note' }).getByRole('button', { name: 'More', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Version history', exact: true }).click()
  await expect(page).toHaveURL(/\/history\/[0-9a-f-]{36}$/)
  await page.getByRole('button', { name: 'Back to note', exact: true }).click()
  const returned = page.getByRole('dialog', { name: 'Note' })
  await expect(returned.getByLabel('Body')).toHaveValue('Apples')
  await expect(page).toHaveURL('/label/Job')
  await returned.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(returned).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.history.state?.usr ?? null)).toBeNull()

  await page.reload()
  await expectView(page, 'Job', '/label/Job')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Alpha, Apples', exact: true })).toBeVisible()
})

async function expectView(page: Page, name: string, path: string) {
  await expect(page).toHaveURL(path)
  await expect(page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name, exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
}

async function createNote(page: Page, title: string, body: string) {
  await page.getByRole('button', { name: 'Take a note' }).click()
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Body').fill(body)
  await page.getByRole('heading', { name: 'Tracepad' }).click()
  await expect(page.getByRole('button', { name: `${title}, ${body}`, exact: true })).toBeVisible()
  await expect(page.getByLabel('Title')).toHaveCount(0)
}

async function deleteOpenNote(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Note' })
  await dialog.getByRole('button', { name: 'More', exact: true }).click()
  await dialog.getByRole('menuitem', { name: 'Delete note', exact: true }).click()
  await expect(dialog).toHaveCount(0)
}
