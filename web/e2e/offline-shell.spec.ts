import { expect, test } from '@playwright/test'

test('loads once online, then shows existing notes from the cached shell while offline', async ({
  page,
  context,
}) => {
  test.setTimeout(60_000)
  await page.goto('/')

  const manifest = await page.request.get('/manifest.webmanifest')
  expect(manifest.ok()).toBeTruthy()
  const body = (await manifest.json()) as { icons?: { src: string }[] }
  expect(body.icons?.length).toBeGreaterThan(0)
  for (const icon of body.icons ?? []) {
    expect((await page.request.get(icon.src)).ok()).toBeTruthy()
  }

  await page.getByRole('button', { name: 'Take a note' }).click()
  await page.getByLabel('Title').fill('Offline note')
  await page.getByLabel('Body').fill('Still here')
  await page.getByRole('heading', { name: 'Tracepad' }).click()
  await expect(page.getByRole('button', { name: 'Offline note, Still here', exact: true })).toBeVisible()

  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.ready
    if (registration.active?.state !== 'activated') return false
    const names = await caches.keys()
    for (const name of names) {
      const cache = await caches.open(name)
      const keys = await cache.keys()
      if (keys.some((request) => request.url.includes('/index.html'))) return true
    }
    return false
  })

  await expect(page.getByRole('button', { name: 'Update ready, reload' })).toHaveCount(0)

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Tracepad' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Offline note, Still here', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Update ready, reload' })).toHaveCount(0)
})
