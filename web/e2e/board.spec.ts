import { expect, test, type Page } from '@playwright/test'

test('creates notes, pins one, switches sort and views, and toggles grid and list', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/')

  const nav = page.getByRole('navigation', { name: 'Views' })
  await expect(nav.getByRole('button', { name: 'Notes', exact: true })).toBeVisible()
  await expect(nav.getByRole('button', { name: 'Reminders', exact: true })).toBeVisible()
  await expect(nav.getByRole('button', { name: 'Edit labels', exact: true })).toBeVisible()
  await expect(nav.getByRole('button', { name: 'Archive', exact: true })).toBeVisible()
  await expect(nav.getByRole('button', { name: 'Trash', exact: true })).toBeVisible()
  await expect(page.locator('.empty-state')).toHaveText('Take a note')
  await expect(page.getByLabel('Sort')).toHaveValue('edited')
  await expect(page.getByRole('button', { name: 'Grid', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('list', { name: 'Board' })).toHaveAttribute('data-layout', 'grid')

  await createNote(page, 'Alpha', 'Apples')
  await createNote(page, 'Beta', 'Berries')
  await page.getByRole('button', { name: 'Alpha, Apples', exact: true }).click()
  await page.getByLabel('Body').fill('Applesauce')
  await page.getByRole('dialog', { name: 'Note' }).getByRole('button', { name: 'Close' }).click()
  await expect(page.getByLabel('Title')).toHaveCount(0)

  await expect.poll(() => cardLabels(page)).toEqual(['Alpha, Applesauce', 'Beta, Berries'])
  await expect(page.getByRole('button', { name: 'Beta, Berries', exact: true })).toContainText('Berries')

  await page.getByLabel('Sort').selectOption('created')
  await expect.poll(() => cardLabels(page)).toEqual(['Beta, Berries', 'Alpha, Applesauce'])
  await page.getByLabel('Sort').selectOption('edited')
  await expect.poll(() => cardLabels(page)).toEqual(['Alpha, Applesauce', 'Beta, Berries'])

  await patchNote(page, 'Alpha', { isPinned: true, color: 'yellow' })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Pinned' })).toBeVisible()
  await expect.poll(() => cardLabels(page)).toEqual(['Alpha, Applesauce', 'Beta, Berries'])
  await page.getByLabel('Sort').selectOption('created')
  await expect.poll(() => cardLabels(page)).toEqual(['Alpha, Applesauce', 'Beta, Berries'])
  await expect(page.getByRole('button', { name: 'Alpha, Applesauce', exact: true })).toHaveCSS(
    'background-color',
    'rgb(255, 255, 0)',
  )
  await expect(page.getByRole('button', { name: 'Beta, Berries', exact: true })).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  )

  await page.getByRole('button', { name: 'List', exact: true }).click()
  await expect(page.getByRole('list', { name: 'Board' })).toHaveAttribute('data-layout', 'list')
  await expect(page.getByRole('button', { name: 'List', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => columnCount(page)).toBe(1)
  await page.getByRole('button', { name: 'Grid', exact: true }).click()
  await expect(page.getByRole('list', { name: 'Board' })).toHaveAttribute('data-layout', 'grid')
  await expect.poll(() => columnCount(page)).toBeGreaterThan(1)

  await patchNote(page, 'Alpha', { isArchived: true })
  await page.reload()
  await expect.poll(() => cardLabels(page)).toEqual(['Beta, Berries'])
  await nav.getByRole('button', { name: 'Archive', exact: true }).click()
  await expect.poll(() => cardLabels(page)).toEqual(['Alpha, Applesauce'])

  await patchNote(page, 'Beta', { trashedAt: new Date().toISOString() })
  await page.reload()
  await expect(page.locator('.empty-state')).toHaveText('Take a note')
  await expect(page.getByRole('list', { name: 'Board' }).getByRole('button')).toHaveCount(0)
  await nav.getByRole('button', { name: 'Trash', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Beta, Berries', exact: true })).toBeVisible()
  await expect(page.getByText('30 days left')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Alpha, Applesauce', exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Pinned' })).toHaveCount(0)

  await attachLabel(page, 'Alpha', 'Work')
  await page.reload()
  await nav.getByRole('button', { name: 'Work', exact: true }).click()
  await expect.poll(() => cardLabels(page)).toEqual(['Alpha, Applesauce'])
  await page.getByRole('button', { name: 'Alpha, Applesauce', exact: true }).click()
  await expect(page.getByLabel('Title')).toHaveValue('Alpha')
  await expect(page.getByLabel('Body')).toHaveValue('Applesauce')
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

type StoredChange =
  | {
      action: 'patch'
      title: string
      fields: {
        isPinned?: boolean
        isArchived?: boolean
        color?: string | null
        trashedAt?: string | null
      }
    }
  | { action: 'label'; title: string; labelName: string }

function patchNote(
  page: Page,
  title: string,
  fields: {
    isPinned?: boolean
    isArchived?: boolean
    color?: string | null
    trashedAt?: string | null
  },
) {
  return changeStoredNote(page, { action: 'patch', title, fields })
}

function attachLabel(page: Page, title: string, labelName: string) {
  return changeStoredNote(page, { action: 'label', title, labelName })
}

async function changeStoredNote(page: Page, change: StoredChange) {
  await page.evaluate(async (change) => {
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
    const findNote = async (db: IDBDatabase, title: string) => {
      const notes = await readAll<{ id: string; currentVersionId: string | null }>(db, 'notes')
      const versions = await readAll<{ id: string; title: string | null }>(db, 'noteVersions')
      const note = notes.find((item) => {
        const current = versions.find((version) => version.id === item.currentVersionId)
        return current?.title === title
      })
      if (!note) throw new Error(`no note titled ${title}`)
      return note
    }
    const done = (tx: IDBTransaction) =>
      new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      })

    const db = await openTracepad()
    try {
      const note = await findNote(db, change.title)
      if (change.action === 'patch') {
        const tx = db.transaction('notes', 'readwrite')
        const store = tx.objectStore('notes')
        const read = store.get(note.id)
        read.onerror = () => tx.abort()
        read.onsuccess = () => {
          store.put({ ...(read.result as object), ...change.fields })
        }
        await done(tx)
      } else {
        const labelId = crypto.randomUUID()
        const updatedAt = new Date().toISOString()
        const tx = db.transaction(['labels', 'noteLabels'], 'readwrite')
        tx.objectStore('labels').put({
          id: labelId,
          userId: null,
          name: change.labelName,
          updatedAt,
        })
        tx.objectStore('noteLabels').put({
          noteId: note.id,
          labelId,
          isRemoved: false,
          updatedAt,
        })
        await done(tx)
      }
    } finally {
      db.close()
    }
  }, change)
}
