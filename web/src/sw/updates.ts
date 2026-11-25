/** A service worker the page can watch. Narrower than the browser type so tests can fake one. */
export type UpdateWorker = {
  state: string
  addEventListener: (type: 'statechange', listener: () => void) => void
  removeEventListener: (type: 'statechange', listener: () => void) => void
}

/** The registration fields the update prompt reads. */
export type UpdateRegistration = {
  waiting: UpdateWorker | null
  installing: UpdateWorker | null
  addEventListener: (type: 'updatefound', listener: () => void) => void
  removeEventListener: (type: 'updatefound', listener: () => void) => void
}

/**
 * Calls `onWaiting` when a new worker is installed and an older one already
 * controls this page. The first install has no controller yet, so it stays quiet.
 * Nothing here reloads the page.
 */
export function bindUpdatePrompt(
  registration: UpdateRegistration,
  hasController: () => boolean,
  onWaiting: () => void,
): () => void {
  let worker: UpdateWorker | null = null

  const consider = () => {
    const installed = worker?.state === 'installed' || registration.waiting != null
    if (hasController() && installed) onWaiting()
  }

  const onState = () => consider()

  const watch = (next: UpdateWorker | null) => {
    worker?.removeEventListener('statechange', onState)
    worker = next
    worker?.addEventListener('statechange', onState)
  }

  const onUpdateFound = () => {
    watch(registration.installing)
    consider()
  }

  watch(registration.installing)
  registration.addEventListener('updatefound', onUpdateFound)
  consider()

  return () => {
    registration.removeEventListener('updatefound', onUpdateFound)
    worker?.removeEventListener('statechange', onState)
  }
}
