import { createContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { IconButton } from './icons'
import './note-modal.css'

/** Set when this modal pins `.editor-actions` outside the scrolling body. */
export type NoteModalFixedSlot = {
  actionsEl: HTMLDivElement | null
}

export const NoteModalFixedContext = createContext<NoteModalFixedSlot | null>(null)

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
  /** Esc, a click on the backdrop, or the closing button. */
  onClose: () => void
  /** Where focus goes on close if the element focused before opening is gone. */
  returnFocusTo?: () => HTMLElement | null
  /** Text of the button at the bottom right. Notes say "Close"; Edit labels says "Done". */
  closeText?: string
  /** "note" is the wide card near the top. "labels" is the narrow dialog. */
  size?: 'note' | 'labels'
  /** Buttons on the left of the bottom bar. Close stays on the right. */
  toolbar?: ReactNode
  /** Blue bar across the top when search included this archived note. */
  archivedBar?: boolean
  /** Label chips and the edited date, pinned under the scrolling text. */
  contentEnd?: ReactNode
  /** Pin `.editor-actions` under the text. The editor fills that bar. */
  fixedBars?: boolean
  children: ReactNode
}

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => {
    const style = getComputedStyle(element)
    return style.display !== 'none' && style.visibility !== 'hidden'
  })
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
export function NoteModal({
  label,
  color,
  onClose,
  returnFocusTo,
  closeText = 'Close',
  size = 'note',
  toolbar,
  archivedBar = false,
  contentEnd,
  fixedBars = false,
  children,
}: NoteModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const actionsHost = useRef<HTMLDivElement>(null)
  const [actionsEl, setActionsEl] = useState<HTMLDivElement | null>(null)
  const fixed = useMemo(() => (fixedBars ? { actionsEl } : null), [fixedBars, actionsEl])

  useLayoutEffect(() => {
    setActionsEl(fixedBars ? actionsHost.current : null)
  }, [fixedBars])
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
        if (event.defaultPrevented) return
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
    <NoteModalFixedContext.Provider value={fixed}>
      <div
        className={size === 'labels' ? 'note-modal-backdrop note-modal-backdrop-labels' : 'note-modal-backdrop'}
        data-testid="note-modal-backdrop"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose()
        }}
      >
        <div
          ref={panelRef}
          className={size === 'labels' ? 'note-modal note-modal-labels' : 'note-modal'}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          tabIndex={-1}
          style={{ backgroundColor: color ?? '#ffffff' }}
        >
          {archivedBar ? <span className="note-archived-bar" /> : null}
          <div className="note-modal-body">{children}</div>
          {contentEnd}
          {fixedBars ? <div className="editor-actions" ref={actionsHost} /> : null}
          <div className="note-modal-actions">
            {toolbar}
            {closeText === 'Close' ? (
              <IconButton className="note-modal-close" label="Close" icon="close" onClick={onClose} />
            ) : (
              <button type="button" className="note-modal-close" onClick={onClose}>
                {closeText}
              </button>
            )}
          </div>
        </div>
      </div>
    </NoteModalFixedContext.Provider>
  )
}
