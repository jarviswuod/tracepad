/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare let self: ServiceWorkerGlobalScope

// Precache the built shell (HTML, JS, CSS, icons, manifest) on the first install.
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Later opens, including offline, serve the shell for every screen route.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

// A new version stays waiting until the page posts this. The page does not reload on its own.
self.addEventListener('message', (event) => {
  const data: unknown = event.data
  if (typeof data === 'object' && data !== null && 'type' in data && data.type === 'SKIP_WAITING') {
    void self.skipWaiting()
  }
})

clientsClaim()
