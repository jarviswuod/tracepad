import { useEffect, useRef, useState, type ReactNode } from 'react'
import './note-modal.css'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

type NoteModalProps = {
  /** The dialog's accessible name. */
  label: string
  /** The note's color, used as the background. Null is the default white. */
  color: string | null
  /** Esc, a click on the backdrop, or "Close". */
  onClose: () => void
  /** Where focus goes on close if the element focused before opening is gone. */
  returnFocusTo?: () => HTMLElement | null
  children: ReactNode
}

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
}

/** Stops the page from scrolling without letting it move when the scrollbar goes away. */
function lockPageScroll(): () => void {
  const root = document.documentElement
  const body = document.body
  const gap = window.innerWidth - root.clientWidth
  const previous = { overflow: root.style.overflow, paddingRight: body.style.paddingRight }
  const padding = Number.parseFloat(getComputedStyle(body).paddingRight) || 0
  root.style.overflow = 'hidden'
  if (gap > 0) body.style.paddingRight = `${padding + gap}px`
  return () => {
    root.style.overflow = previous.overflow
    body.style.paddingRight = previous.paddingRight
  }
}

/**
 * Every opened card (a saved note, an old version, a trashed note) shows in this modal,
 * centered over the board like Keep. Creating a note through "Take a note" stays inline.
 */
export function NoteModal({ label, color, onClose, returnFocusTo, children }: NoteModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  // Read during render, before this commit can hide the card that opened the modal.
  const [opener] = useState(() =>
    document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement
      : null,
  )
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const returnFocusRef = useRef(returnFocusTo)
  returnFocusRef.current = returnFocusTo

  useEffect(() => {
    const panel = panelRef.current
    if (!panel || panel.contains(document.activeElement)) return
    ;(focusables(panel)[0] ?? panel).focus()
  }, [])

  useEffect(() => {
    const unlock = lockPageScroll()
    return () => {
      unlock()
      const target = opener?.isConnected ? opener : (returnFocusRef.current?.() ?? null)
      target?.focus()
    }
  }, [opener])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const panel = panelRef.current
      if (!panel) return
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables(panel)
      const active = document.activeElement
      if (items.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const inside = active instanceof Node && panel.contains(active)
      if (event.shiftKey && (!inside || active === first || active === panel)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div
      className="note-modal-backdrop"
      data-testid="note-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        className="note-modal"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        style={{ backgroundColor: color ?? '#ffffff' }}
      >
        <div className="note-modal-body">{children}</div>
        <div className="note-modal-actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
