import { describe, expect, it, vi } from 'vitest'
import { applyWaitingUpdate, SKIP_WAITING } from './register'

function controllerEvents() {
  const listeners = new Set<() => void>()
  return {
    addEventListener(type: 'controllerchange', listener: () => void) {
      if (type === 'controllerchange') listeners.add(listener)
    },
    removeEventListener(type: 'controllerchange', listener: () => void) {
      if (type === 'controllerchange') listeners.delete(listener)
    },
    fire() {
      for (const listener of [...listeners]) listener()
    },
  }
}

describe('reload for a waiting service worker', () => {
  it('asks the waiting worker to activate and reloads only after it takes control', () => {
    const postMessage = vi.fn()
    const events = controllerEvents()
    const reload = vi.fn()

    applyWaitingUpdate({ waiting: { postMessage } }, events, reload)

    expect(postMessage).toHaveBeenCalledWith({ type: SKIP_WAITING })
    expect(reload).not.toHaveBeenCalled()
    events.fire()
    expect(reload).toHaveBeenCalledTimes(1)
    events.fire()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('reloads immediately when the user asks and nothing is waiting', () => {
    const reload = vi.fn()
    applyWaitingUpdate({ waiting: null }, controllerEvents(), reload)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
