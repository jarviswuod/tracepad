import { expect, test, type Page } from '@playwright/test'

test('types steadily while a draft saves and keeps every keystroke in order', async ({ page }) => {
  await page.addInitScript(() => {
    const host = globalThis as typeof globalThis & {
      __tracepadDraftSavesHeld?: number
      __tracepadReleaseDraftSave?: () => void
    }
    const releases: Array<() => void> = []
    const gates = new WeakMap<IDBTransaction, Promise<void>>()
    host.__tracepadDraftSavesHeld = 0
    host.__tracepadReleaseDraftSave = () => {
      const release = releases.shift()
      if (release) release()
    }

    const original = IDBTransaction.prototype.addEventListener
    IDBTransaction.prototype.addEventListener = function (
      this: IDBTransaction,
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions,
    ) {
      if (
        type === 'complete' &&
        this.mode === 'readwrite' &&
        this.objectStoreNames.contains('drafts') &&
        typeof listener === 'function'
      ) {
        let held = gates.get(this)
        if (!held) {
          let release: () => void = () => {}
          held = new Promise<void>((resolve) => {
            release = resolve
          })
          gates.set(this, held)
          releases.push(release)
          host.__tracepadDraftSavesHeld = (host.__tracepadDraftSavesHeld ?? 0) + 1
        }
        const delayed: EventListener = (event) => {
          void held.then(() => listener.call(this, event))
        }
        return original.call(this, type, delayed, options)
      }
      if (listener == null) return
      return original.call(this, type, listener, options)
    }
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Take a note' }).click()
  const body = page.getByLabel('Body')
  await body.click()

  const first = 'abcde'
  const rest = 'XYZ'
  const full = first + rest

  await body.pressSequentially(first, { delay: 30 })
  await expect(body).toHaveValue(first)
  const unsaved = page.getByLabel('Unsaved')
  await expect(unsaved).toBeVisible()
  await expect(unsaved).toHaveCSS('background-color', 'rgb(154, 160, 166)')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)

  await expect.poll(() => heldCount(page), { timeout: 8000 }).toBe(1)
  await expect.poll(() => draftBody(page), { timeout: 8000 }).toBe(first)

  let typed = first
  for (const character of rest) {
    await page.keyboard.type(character)
    typed += character
    await expect(body).toHaveValue(typed)
  }

  await releaseDraftSave(page)
  await expect(body).toHaveValue(full)

  await expect.poll(() => heldCount(page), { timeout: 8000 }).toBe(2)
  await expect.poll(() => draftBody(page), { timeout: 8000 }).toBe(full)
  await expect(body).toHaveValue(full)

  await releaseDraftSave(page)
  await expect(page.getByLabel('Not synced yet')).toBeVisible()
  await expect(page.getByLabel('Unsaved')).toHaveCount(0)
  await expect(body).toHaveValue(full)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
})

function heldCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (globalThis as typeof globalThis & { __tracepadDraftSavesHeld?: number }).__tracepadDraftSavesHeld ?? 0,
  )
}

function releaseDraftSave(page: Page): Promise<void> {
  return page.evaluate(() => {
    const release = (globalThis as typeof globalThis & { __tracepadReleaseDraftSave?: () => void })
      .__tracepadReleaseDraftSave
    release?.()
  })
}

function draftBody(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('tracepad')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      const rows = await new Promise<Array<{ body: string | null }>>((resolve, reject) => {
        const tx = db.transaction('drafts', 'readonly')
        const request = tx.objectStore('drafts').getAll()
        request.onsuccess = () => resolve(request.result as Array<{ body: string | null }>)
        request.onerror = () => reject(request.error)
      })
      return rows[0]?.body ?? null
    } finally {
      db.close()
    }
  })
}
