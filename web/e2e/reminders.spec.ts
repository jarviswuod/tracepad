import { expect, test, type Page } from '@playwright/test'

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

function minuteValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** The next whole minute that is still at least `leadMs` ahead. The field has no seconds. */
function upcomingMinute(leadMs: number): Date {
  const when = new Date(Date.now() + leadMs)
  when.setSeconds(0, 0)
  if (when.getTime() < Date.now() + leadMs) when.setMinutes(when.getMinutes() + 1)
  return when
}

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['notifications'])
  await context.addInitScript(() => {
    const native = window.Notification
    const seen: Notification[] = []
    ;(window as unknown as { __tracepadNotifications: Notification[] }).__tracepadNotifications = seen
    function Wrapped(title: string, options?: NotificationOptions) {
      const note = new native(title, options)
      seen.push(note)
      return note
    }
    Object.defineProperty(Wrapped, 'permission', { get: () => native.permission })
    Wrapped.requestPermission = (callback?: NotificationPermissionCallback) => native.requestPermission(callback)
    window.Notification = Wrapped as unknown as typeof Notification
  })
})

test('refuses a past reminder time', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Take a note' }).click()
  await page.getByLabel('Title').fill('Late')
  await page.getByLabel('Body').fill('Too late')
  await page.getByRole('heading', { name: 'Tracepad' }).click()
  await page.getByRole('button', { name: 'Late, Too late' }).click()

  await page.getByRole('button', { name: 'More', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Remind me', exact: true }).click()
  await page.getByLabel('Date and time').fill('2000-01-01T00:00')
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByRole('alert')).toHaveText('Pick a future time.')
  expect(await readStore(page, 'reminders')).toHaveLength(0)
})

test('fires a reminder a few seconds ahead and opens the note', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/')
  await page.getByRole('button', { name: 'Take a note' }).click()
  await page.getByLabel('Title').fill('Groceries')
  await page.getByLabel('Body').fill('Milk')
  await page.getByRole('heading', { name: 'Tracepad' }).click()
  await page.getByRole('button', { name: 'Groceries, Milk' }).click()

  await page.getByRole('button', { name: 'More', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Remind me', exact: true }).click()
  const when = upcomingMinute(8_000)
  const waitMs = when.getTime() - Date.now() + 15_000
  await page.getByLabel('Date and time').fill(minuteValue(when))
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('group', { name: 'Reminder' })).toHaveCount(0)

  await page.getByRole('dialog', { name: 'Note' }).getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('dialog', { name: 'Note' })).toHaveCount(0)

  const inApp = page.getByRole('button', { name: 'Reminder: Groceries' })
  await expect
    .poll(
      async () => {
        const notifications = await page.evaluate(
          () => (window as unknown as { __tracepadNotifications: Notification[] }).__tracepadNotifications.length,
        )
        return notifications + (await inApp.count())
      },
      { timeout: waitMs },
    )
    .toBeGreaterThan(0)

  const shown = await page.evaluate(() => {
    const note = (window as unknown as { __tracepadNotifications: Notification[] }).__tracepadNotifications[0]
    return note ? { title: note.title, body: note.body } : null
  })
  if (shown) {
    expect(shown).toEqual({ title: 'Groceries', body: 'Reminder' })
    await page.evaluate(() => {
      const note = (window as unknown as { __tracepadNotifications: Notification[] }).__tracepadNotifications[0]
      note.onclick?.(new MouseEvent('click'))
    })
  } else {
    // Headless Chrome keeps notifications blocked. The reminder still shows in the app.
    await inApp.click()
  }

  const dialog = page.getByRole('dialog', { name: 'Note' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Title')).toHaveValue('Groceries')

  const stored = await readStore<{ lastFiredAt: string | null }>(page, 'reminders')
  expect(stored).toHaveLength(1)
  expect(stored[0]?.lastFiredAt).toBeTruthy()
})

test('archives a blank new note from More and sets a reminder from that menu', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Take a note' }).click()
  const note = page.getByRole('group', { name: 'Note' })
  await note.getByRole('button', { name: 'More', exact: true }).click()
  await expect(note.getByRole('menuitem')).toHaveText(['Remind me', 'Archive'])
  await note.getByRole('menuitem', { name: 'Archive', exact: true }).click()

  await note.getByRole('button', { name: 'More', exact: true }).click()
  await expect(note.getByRole('menuitem', { name: 'Unarchive', exact: true })).toBeVisible()
  await note.getByRole('menuitem', { name: 'Remind me', exact: true }).click()
  const when = new Date(Date.now() + 120_000)
  when.setSeconds(0, 0)
  await page.getByLabel('Date and time').fill(minuteValue(when))
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('group', { name: 'Reminder' })).toHaveCount(0)

  await page.getByRole('heading', { name: 'Tracepad' }).click()
  await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'Archive', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Untitled', exact: true })).toBeVisible()

  const notes = await readStore<{ isArchived: boolean }>(page, 'notes')
  expect(notes).toHaveLength(1)
  expect(notes[0]?.isArchived).toBe(true)
  expect(await readStore(page, 'noteVersions')).toHaveLength(1)
  expect(await readStore(page, 'reminders')).toHaveLength(1)
})
