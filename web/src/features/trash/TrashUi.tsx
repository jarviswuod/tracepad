import { useEffect, useId } from 'react'
import './trash.css'

/** How long the "Undo" snackbar stays after a note is moved to the trash. */
export const UNDO_SNACKBAR_MS = 5000

/** Clears `undoId` a few seconds after it is set. `onExpire` must stay the same function. */
export function useUndoWindow(undoId: string | null, onExpire: () => void): void {
  useEffect(() => {
    if (undoId == null) return
    const timer = setTimeout(onExpire, UNDO_SNACKBAR_MS)
    return () => clearTimeout(timer)
  }, [undoId, onExpire])
}

export function UndoSnackbar({ onUndo }: { onUndo: () => void }) {
  return (
    <div className="snackbar" role="status">
      <span>Note moved to trash</span>
      <button type="button" onClick={onUndo}>
        Undo
      </button>
    </div>
  )
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string
  body: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const titleId = useId()

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onCancel()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onCancel])

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>{title}</h2>
        <p>{body}</p>
        <div className="dialog-actions">
          <button type="button" onClick={onCancel} autoFocus>
            Cancel
          </button>
          <button type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
