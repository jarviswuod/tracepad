// A soft tone when a reminder fires while this tab is open.
// The context starts on a click or when a reminder is saved, so a later timer can play.
// A missed reminder does not use this. If the browser blocks the sound, the notification still shows.

const TONE_SECONDS = 5
const TONE_HZ = 523.25
const TONE_GAIN = 0.05

let context: AudioContext | null = null

function audioContextConstructor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined
  const host = window as Window & { webkitAudioContext?: typeof AudioContext }
  return window.AudioContext ?? host.webkitAudioContext
}

/** Create or resume the shared context. Call this from a click or a reminder save. */
export function primeReminderAudio(): void {
  try {
    const Ctor = audioContextConstructor()
    if (!Ctor) return
    if (!context || context.state === 'closed') context = new Ctor()
    if (context.state === 'suspended') {
      try {
        void Promise.resolve(context.resume()).catch(() => undefined)
      } catch {
        // This gesture was refused. A later click can try again.
      }
    }
  } catch {
    context = null
  }
}

/** Listen for clicks so the first one starts the context before a timer fires. */
export function installReminderAudioPrime(): () => void {
  if (typeof document === 'undefined') return () => undefined
  const onClick = () => primeReminderAudio()
  document.addEventListener('click', onClick, true)
  return () => document.removeEventListener('click', onClick, true)
}

/** Sine wave at low volume, scheduled to stop five seconds later. */
export function playReminderTone(target: AudioContext): void {
  const oscillator = target.createOscillator()
  const gain = target.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.value = TONE_HZ
  gain.gain.value = TONE_GAIN
  oscillator.connect(gain)
  gain.connect(target.destination)
  const startAt = target.currentTime
  oscillator.start(startAt)
  oscillator.stop(startAt + TONE_SECONDS)
}

/** Play the tone on the primed context. A blocked context does not throw. */
export function playReminderAlarm(): void {
  if (!context) return
  try {
    playReminderTone(context)
  } catch {
    // The browser blocked the tone. The notification still shows.
  }
}

export function resetReminderAudio(): void {
  context = null
}
