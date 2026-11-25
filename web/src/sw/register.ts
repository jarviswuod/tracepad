import type { UpdateRegistration } from './updates'

/** Posted to the waiting worker. It activates only after the user asks to reload. */
export const SKIP_WAITING = 'SKIP_WAITING'

type WaitingWorker = {
  postMessage: (message: { type: typeof SKIP_WAITING }) => void
}

type UpdateEvents = {
  addEventListener: (type: 'controllerchange', listener: () => void) => void
  removeEventListener: (type: 'controllerchange', listener: () => void) => void
}

/**
 * Activates the waiting worker, then reloads once that worker controls the page.
 * If nothing is waiting, reloads immediately. Either way the caller asked.
 */
export function applyWaitingUpdate(
  registration: { waiting: WaitingWorker | null } | undefined,
  events: UpdateEvents,
  reload: () => void,
): void {
  const waiting = registration?.waiting
  if (!waiting) {
    reload()
    return
  }

  let done = false
  const onChange = () => {
    if (done) return
    done = true
    events.removeEventListener('controllerchange', onChange)
    reload()
  }
  events.addEventListener('controllerchange', onChange)
  waiting.postMessage({ type: SKIP_WAITING })
}

/** Registers the app-shell worker and hands the registration to the prompt. */
export function watchAppShell(onRegistration: (registration: UpdateRegistration) => void): () => void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return () => {}

  let active = true
  void navigator.serviceWorker.register('/sw.js').then(
    (registration) => {
      if (!active) return
      onRegistration(registration as unknown as UpdateRegistration)
      // A new deployment is downloaded in the background. The prompt decides when to show.
      void registration.update().catch(() => {
        // Offline, or this worker is already the newest one.
      })
    },
    () => {
      // Dev, or the worker file is not available yet. Notes still open from IndexedDB.
    },
  )

  return () => {
    active = false
  }
}

/** The "Update ready, reload" action. Does nothing until the user chooses it. */
export function reloadForUpdate(): void {
  const reload = () => window.location.reload()
  if (!('serviceWorker' in navigator)) {
    reload()
    return
  }
  void navigator.serviceWorker.getRegistration().then(
    (registration) => {
      applyWaitingUpdate(
        registration,
        {
          addEventListener: (_type, listener) => {
            navigator.serviceWorker.addEventListener('controllerchange', listener)
          },
          removeEventListener: (_type, listener) => {
            navigator.serviceWorker.removeEventListener('controllerchange', listener)
          },
        },
        reload,
      )
    },
    () => reload(),
  )
}
