import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ServiceWorkerUpdate } from './UpdatePrompt'
import type { UpdateRegistration, UpdateWorker } from './updates'

afterEach(() => cleanup())

function createWorker(initial: string): UpdateWorker & { setState: (next: string) => void } {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    get state() {
      return state
    },
    addEventListener(type, listener) {
      if (type === 'statechange') listeners.add(listener)
    },
    removeEventListener(type, listener) {
      if (type === 'statechange') listeners.delete(listener)
    },
    setState(next) {
      state = next
      for (const listener of [...listeners]) listener()
    },
  }
}

function createRegistration(): UpdateRegistration & {
  setWaiting: (worker: UpdateWorker | null) => void
  beginInstall: () => UpdateWorker & { setState: (next: string) => void }
} {
  let waiting: UpdateWorker | null = null
  let installing: UpdateWorker | null = null
  const updateListeners = new Set<() => void>()
  return {
    get waiting() {
      return waiting
    },
    get installing() {
      return installing
    },
    addEventListener(type, listener) {
      if (type === 'updatefound') updateListeners.add(listener)
    },
    removeEventListener(type, listener) {
      if (type === 'updatefound') updateListeners.delete(listener)
    },
    setWaiting(worker) {
      waiting = worker
    },
    beginInstall() {
      const worker = createWorker('installing')
      installing = worker
      for (const listener of [...updateListeners]) listener()
      return worker
    },
  }
}

describe('update prompt', () => {
  it('shows Update ready, reload when a new worker is waiting, and does not reload until chosen', () => {
    const onReload = vi.fn()
    const registration = createRegistration()
    render(
      <ServiceWorkerUpdate registration={registration} hasController={() => true} onReload={onReload} />,
    )

    expect(screen.queryByRole('button', { name: 'Update ready, reload' })).not.toBeInTheDocument()
    act(() => {
      registration.beginInstall().setState('installed')
    })

    expect(screen.getByRole('button', { name: 'Update ready, reload' })).toBeInTheDocument()
    expect(onReload).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Update ready, reload' }))
    expect(onReload).toHaveBeenCalledTimes(1)
  })

  it('shows the prompt for a worker that was already waiting', () => {
    const onReload = vi.fn()
    const registration = createRegistration()
    registration.setWaiting(createWorker('installed'))
    render(
      <ServiceWorkerUpdate registration={registration} hasController={() => true} onReload={onReload} />,
    )

    expect(screen.getByRole('button', { name: 'Update ready, reload' })).toBeInTheDocument()
    expect(onReload).not.toHaveBeenCalled()
  })

  it('stays hidden on the first install, including when that worker takes control', () => {
    const onReload = vi.fn()
    const controlled = { current: false }
    const registration = createRegistration()
    render(
      <ServiceWorkerUpdate
        registration={registration}
        hasController={() => controlled.current}
        onReload={onReload}
      />,
    )

    act(() => {
      const worker = registration.beginInstall()
      worker.setState('installed')
      controlled.current = true
      worker.setState('activated')
    })

    expect(screen.queryByRole('button', { name: 'Update ready, reload' })).not.toBeInTheDocument()
    expect(onReload).not.toHaveBeenCalled()
  })
})
