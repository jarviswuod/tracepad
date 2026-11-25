import { expect, test, type Page } from '@playwright/test'

test('groups notes by day on home, archive, and a label', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/home')

  await createNote(page, 'Alpha', 'Apples')
  await createNote(page, 'Beta', 'Berries')

  const today = atLocalHour(0, 15)
  const yesterday = atLocalHour(-1, 15)
  await patchNotes(page, [
    { title: 'Alpha', updatedAt: today, createdAt: yesterday },
    { title: 'Beta', updatedAt: yesterday, createdAt: today },
  ])
  await page.reload()

  const edited = ['Today', 'Alpha, Apples', 'Yesterday', 'Beta, Berries']
  const created = ['Today', 'Beta, Berries', 'Yesterday', 'Alpha, Apples']
  await expect.poll(() => outline(page)).toEqual(edited)
  await expect(page.locator('.board-pack .board-date')).toHaveCount(0)
  await expect(page.locator('.board-date h2').first()).toHaveCSS('text-transform', 'none')
  expect(await dateHeadingSpansBoard(page)).toBe(true)

  await page.getByRole('button', { name: 'List', exact: true }).click()
  await expect.poll(() => outline(page)).toEqual(edited)
  expect(await dateHeadingSpansBoard(page)).toBe(true)
  await page.getByRole('button', { name: 'Grid', exact: true }).click()

  await page.getByRole('searchbox', { name: 'Search' }).fill('es')
  await expect.poll(() => outline(page)).toEqual(edited)
  await page.getByRole('searchbox', { name: 'Search' }).fill('')
  await expect.poll(() => outline(page)).toEqual(edited)

  await patchNotes(page, [
    { title: 'Alpha', isArchived: true },
    { title: 'Beta', isArchived: true },
  ])
  await page.reload()
  await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'Archive', exact: true }).click()
  await expect.poll(() => outline(page)).toEqual(edited)

  await labelNotes(page, ['Alpha', 'Beta'], 'Work')
  await page.reload()
  await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'Work', exact: true }).click()
  await expect.poll(() => outline(page)).toEqual(edited)

  await page.getByLabel('Sort').selectOption('created')
  await expect.poll(() => outline(page)).toEqual(created)
})

function atLocalHour(dayOffset: number, hour: number): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hour).toISOString()
}

function outline(page: Page): Promise<string[]> {
  return page.getByRole('list', { name: 'Board' }).evaluate((list) => {
    const lines: string[] = []
    const visit = (element: Element) => {
      if (element.classList.contains('board-heading')) {
        lines.push((element.textContent ?? '').trim())
        return
      }
      if (element.classList.contains('note-card')) {
        lines.push(element.getAttribute('aria-label') ?? '')
        return
      }
      for (const child of element.children) visit(child)
    }
    for (const child of list.children) visit(child)
    return lines
  })
}

function dateHeadingSpansBoard(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const board = document.querySelector('.board-cards')
    const heading = document.querySelector('.board-date')
    if (!(board instanceof HTMLElement) || !(heading instanceof HTMLElement)) return false
    const boardBox = board.getBoundingClientRect()
    const headingBox = heading.getBoundingClientRect()
    return Math.abs(headingBox.width - boardBox.width) <= 1 && Math.abs(headingBox.left - boardBox.left) <= 1
  })
}

async function createNote(page: Page, title: string, body: string) {
  await page.getByRole('button', { name: 'Take a note' }).click()
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Body').fill(body)
  await page.getByRole('heading', { name: 'Tracepad' }).click()
  await expect(page.getByRole('button', { name: `${title}, ${body}`, exact: true })).toBeVisible()
  await expect(page.getByLabel('Title')).toHaveCount(0)
}

type NotePatch = {
  title: string
  createdAt?: string
  updatedAt?: string
  isArchived?: boolean
}

async function patchNotes(page: Page, patches: NotePatch[]) {
  await page.evaluate(async (patches) => {
    const openTracepad = () =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('tracepad')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    const readAll = <T,>(db: IDBDatabase, store: string) =>
      new Promise<T[]>((resolve, reject) => {
        const tx = db.transaction(store, 'readonly')
        const request = tx.objectStore(store).getAll()
        request.onsuccess = () => resolve(request.result as T[])
        request.onerror = () => reject(request.error)
      })
    const done = (tx: IDBTransaction) =>
      new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      })

    const db = await openTracepad()
    try {
      const notes = await readAll<{ id: string; currentVersionId: string | null }>(db, 'notes')
      const versions = await readAll<{ id: string; title: string | null }>(db, 'noteVersions')
      const tx = db.transaction('notes', 'readwrite')
      const store = tx.objectStore('notes')
      for (const patch of patches) {
        const note = notes.find((item) => {
          const current = versions.find((version) => version.id === item.currentVersionId)
          return current?.title === patch.title
        })
        if (!note) throw new Error(`no note titled ${patch.title}`)
        const row = await new Promise<Record<string, unknown>>((resolve, reject) => {
          const read = store.get(note.id)
          read.onsuccess = () => resolve(read.result as Record<string, unknown>)
          read.onerror = () => reject(read.error)
        })
        const fields: { createdAt?: string; updatedAt?: string; isArchived?: boolean } = {}
        if (patch.createdAt != null) fields.createdAt = patch.createdAt
        if (patch.updatedAt != null) fields.updatedAt = patch.updatedAt
        if (patch.isArchived != null) fields.isArchived = patch.isArchived
        store.put({ ...row, ...fields })
      }
      await done(tx)
    } finally {
      db.close()
    }
  }, patches)
}

async function labelNotes(page: Page, titles: string[], labelName: string) {
  await page.evaluate(
    async ({ titles, labelName }) => {
      const openTracepad = () =>
        new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('tracepad')
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
      const readAll = <T,>(db: IDBDatabase, store: string) =>
        new Promise<T[]>((resolve, reject) => {
          const tx = db.transaction(store, 'readonly')
          const request = tx.objectStore(store).getAll()
          request.onsuccess = () => resolve(request.result as T[])
          request.onerror = () => reject(request.error)
        })
      const done = (tx: IDBTransaction) =>
        new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
          tx.onabort = () => reject(tx.error)
        })

      const db = await openTracepad()
      try {
        const notes = await readAll<{ id: string; currentVersionId: string | null }>(db, 'notes')
        const versions = await readAll<{ id: string; title: string | null }>(db, 'noteVersions')
        const noteIds = titles.map((title) => {
          const note = notes.find((item) => {
            const current = versions.find((version) => version.id === item.currentVersionId)
            return current?.title === title
          })
          if (!note) throw new Error(`no note titled ${title}`)
          return note.id
        })
        const updatedAt = new Date().toISOString()
        const labelId = crypto.randomUUID()
        const tx = db.transaction(['labels', 'noteLabels'], 'readwrite')
        tx.objectStore('labels').put({ id: labelId, userId: null, name: labelName, updatedAt })
        for (const noteId of noteIds) {
          tx.objectStore('noteLabels').put({ noteId, labelId, isRemoved: false, updatedAt })
        }
        await done(tx)
      } finally {
        db.close()
      }
    },
    { titles, labelName },
  )
}
