import './editor.css'

/** Grey while keystrokes are unsaved. Hidden once they are saved and nothing is waiting to sync. */
export type SavingDotState = 'unsaved' | 'pending' | 'saved'

export function savingDotState(hasUnsavedKeystrokes: boolean, hasPendingOutbox: boolean): SavingDotState {
  if (hasUnsavedKeystrokes) return 'unsaved'
  if (hasPendingOutbox) return 'pending'
  return 'saved'
}

const labelFor: Record<Exclude<SavingDotState, 'saved'>, string> = {
  unsaved: 'Unsaved',
  pending: 'Not synced yet',
}

/** Filled while keystrokes are still unsaved. A hollow ring means the draft is saved but not synced. */
const GREY = '#9aa0a6'

export function SavingDot({ state }: { state: SavingDotState }) {
  if (state === 'saved') return null
  const style =
    state === 'unsaved'
      ? { backgroundColor: GREY }
      : { backgroundColor: 'transparent', border: `2px solid ${GREY}` }
  return (
    <span
      className={`saving-dot saving-dot-${state}`}
      data-saving={state}
      aria-label={labelFor[state]}
      style={style}
    />
  )
}
