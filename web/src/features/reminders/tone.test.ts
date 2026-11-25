import { fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installReminderAudioPrime, playReminderAlarm, playReminderTone, primeReminderAudio, resetReminderAudio } from './tone'

type FakeOscillator = {
  type: string
  frequency: { value: number }
  started: number[]
  stopped: number[]
}

type FakeContext = {
  currentTime: number
  state: AudioContextState
  destination: Record<string, never>
  resume: () => Promise<void>
  createOscillator: () => FakeOscillator
  createGain: () => { gain: { value: number }; connect: () => void }
}

function installAudio(options?: { refuse?: boolean }) {
  const contexts: FakeContext[] = []
  const oscillators: FakeOscillator[] = []
  const gains: Array<{ value: number }> = []

  class FakeAudioContext {
    currentTime = 4
    state: AudioContextState = 'suspended'
    destination = {}
    resume = () => {
      this.state = 'running'
      return Promise.resolve()
    }
    createOscillator() {
      const osc: FakeOscillator = {
        type: 'sine',
        frequency: { value: 0 },
        started: [],
        stopped: [],
      }
      const api = Object.assign(osc, {
        connect() {
          return api
        },
        start(when = 0) {
          if (options?.refuse) throw new Error('The AudioContext was not allowed to start')
          osc.started.push(when)
        },
        stop(when = 0) {
          osc.stopped.push(when)
        },
      })
      oscillators.push(osc)
      return api
    }
    createGain() {
      const gain = { value: 1 }
      gains.push(gain)
      return {
        gain,
        connect() {
          return undefined
        },
      }
    }
    constructor() {
      contexts.push(this)
    }
  }

  vi.stubGlobal('AudioContext', FakeAudioContext)
  return { contexts, oscillators, gains }
}

let removePrime: () => void = () => undefined

afterEach(() => {
  removePrime()
  removePrime = () => undefined
  resetReminderAudio()
  vi.unstubAllGlobals()
})

describe('reminder tone', () => {
  it('starts a quiet sine and stops it five seconds later', () => {
    const audio = installAudio()
    const context = new AudioContext()
    playReminderTone(context)

    expect(audio.oscillators).toHaveLength(1)
    const osc = audio.oscillators[0]
    expect(osc?.type).toBe('sine')
    expect(osc?.started).toEqual([4])
    expect(osc?.stopped).toEqual([9])
    expect(audio.gains[0]?.value).toBeGreaterThan(0)
    expect(audio.gains[0]?.value).toBeLessThanOrEqual(0.1)
  })

  it('starts the audio context on the first click', () => {
    const audio = installAudio()
    removePrime = installReminderAudioPrime()

    expect(audio.contexts).toHaveLength(0)
    fireEvent.click(document.body)
    expect(audio.contexts).toHaveLength(1)
    expect(audio.contexts[0]?.state).toBe('running')
    expect(audio.oscillators).toHaveLength(0)

    fireEvent.click(document.body)
    expect(audio.contexts).toHaveLength(1)
  })

  it('does not throw when the browser refuses the tone', () => {
    installAudio({ refuse: true })
    primeReminderAudio()
    expect(() => playReminderAlarm()).not.toThrow()
  })
})
