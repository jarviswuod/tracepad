import { useEffect, useRef, useState } from 'react'
import type { Label, Uuid } from '../../domain/types'
import { NOTE_COLORS } from './colors'
import { formatEditedDate } from './editedDate'
import './labels.css'

type Panel = 'closed' | 'menu' | 'labels' | 'colors'

type NotePinButtonProps = {
  isPinned: boolean
  onPin: (pinned: boolean) => void
}

/** "Pin" or "Unpin" on the title's line. */
export function NotePinButton({ isPinned, onPin }: NotePinButtonProps) {
  return (
    <button type="button" className="editor-pin" onClick={() => onPin(!isPinned)}>
      {isPinned ? 'Unpin' : 'Pin'}
    </button>
  )
}

type NoteContentEndProps = {
  labels: Label[]
  activeLabelIds: Uuid[]
  updatedAt: string
}

/** Label chips and the edited date, after the body. Labels stay in the shared order. */
export function NoteContentEnd({ labels, activeLabelIds, updatedAt }: NoteContentEndProps) {
  const chips = labels.filter((label) => activeLabelIds.includes(label.id))
  return (
    <div className="note-content-end">
      <div className="note-open-chips">
        {chips.map((label) => (
          <span key={label.id} className="note-open-chip">
            {label.name}
          </span>
        ))}
      </div>
      <time className="note-edited" dateTime={updatedAt}>
        {formatEditedDate(updatedAt)}
      </time>
    </div>
  )
}

type NoteToolbarProps = {
  trashed: boolean
  isArchived: boolean
  color: string | null
  labels: Label[]
  activeLabelIds: Uuid[]
  onArchive: (archived: boolean) => void
  onColor: (color: string | null) => void
  onToggleLabel: (labelId: Uuid, on: boolean) => void
  onAddLabel: (name: string) => void
  onHistory: () => void
  onDelete: () => void
  onRestore: () => void
  onDeleteForever: () => void
}

/**
 * The open note's bottom bar. A saved note has Archive, More, and Close.
 * A trashed note has Restore and Delete forever, and no More.
 */
export function NoteToolbar({
  trashed,
  isArchived,
  color,
  labels,
  activeLabelIds,
  onArchive,
  onColor,
  onToggleLabel,
  onAddLabel,
  onHistory,
  onDelete,
  onRestore,
  onDeleteForever,
}: NoteToolbarProps) {
  const [panel, setPanel] = useState<Panel>('closed')
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const labelInputRef = useRef<HTMLInputElement>(null)
  const open = panel !== 'closed'

  useEffect(() => {
    if (panel !== 'labels') return
    labelInputRef.current?.focus()
  }, [panel])

  useEffect(() => {
    if (!open) return

    function shut(event: Event) {
      const target = event.target
      if (!(target instanceof Node) || rootRef.current?.contains(target)) return
      setPanel('closed')
      setQuery('')
      const dialog = rootRef.current?.closest('[role="dialog"]')
      if (!dialog?.contains(target)) {
        event.preventDefault()
        event.stopPropagation()
      }
    }

    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setPanel('closed')
      setQuery('')
    }

    document.addEventListener('pointerdown', shut, true)
    document.addEventListener('mousedown', shut, true)
    document.addEventListener('click', shut, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', shut, true)
      document.removeEventListener('mousedown', shut, true)
      document.removeEventListener('click', shut, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  if (trashed) {
    return (
      <>
        <button type="button" onClick={onRestore}>
          Restore
        </button>
        <button type="button" onClick={onDeleteForever}>
          Delete forever
        </button>
      </>
    )
  }

  const trimmed = query.trim()
  const needle = trimmed.toLowerCase()
  const filtered = needle === '' ? labels : labels.filter((label) => label.name.toLowerCase().includes(needle))
  const showCreate = needle !== '' && filtered.length === 0

  function toggleMore() {
    setQuery('')
    setPanel((current) => (current === 'closed' ? 'menu' : 'closed'))
  }

  return (
    <>
      <button type="button" onClick={() => onArchive(!isArchived)}>
        {isArchived ? 'Unarchive' : 'Archive'}
      </button>
      <div className="note-more" ref={rootRef}>
        <button type="button" aria-expanded={open} aria-haspopup="menu" onClick={toggleMore}>
          More
        </button>
        {panel === 'menu' ? (
          <div className="note-more-panel" role="menu" aria-label="More">
            <button type="button" role="menuitem" className="note-menu-item" onClick={() => setPanel('labels')}>
              Change labels
            </button>
            <button type="button" role="menuitem" className="note-menu-item" onClick={() => setPanel('colors')}>
              Colors
            </button>
            <button
              type="button"
              role="menuitem"
              className="note-menu-item"
              onClick={() => {
                setPanel('closed')
                onHistory()
              }}
            >
              Version history
            </button>
            <button
              type="button"
              role="menuitem"
              className="note-menu-item"
              onClick={() => {
                setPanel('closed')
                onDelete()
              }}
            >
              Delete note
            </button>
          </div>
        ) : null}
        {panel === 'labels' ? (
          <div className="note-more-panel" role="group" aria-label="Label note">
            <p className="note-panel-heading">Label note</p>
            <input
              ref={labelInputRef}
              className="note-label-field"
              aria-label="Enter label name"
              placeholder="Enter label name"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <ul className="note-label-scroll">
              {filtered.map((label) => (
                <li key={label.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={activeLabelIds.includes(label.id)}
                      onChange={(event) => onToggleLabel(label.id, event.target.checked)}
                    />
                    {label.name}
                  </label>
                </li>
              ))}
            </ul>
            {showCreate ? (
              <button
                type="button"
                className="note-create-label"
                onClick={() => {
                  setQuery('')
                  onAddLabel(trimmed)
                }}
              >
                {`Create "${trimmed}"`}
              </button>
            ) : null}
          </div>
        ) : null}
        {panel === 'colors' ? (
          <div className="note-more-panel note-color-panel" role="group" aria-label="Colors">
            <div className="color-choices">
              {NOTE_COLORS.map((swatch) => (
                <button
                  key={swatch.name}
                  type="button"
                  className="color-swatch"
                  title={swatch.name}
                  aria-label={`${swatch.name} color`}
                  aria-pressed={color === swatch.value}
                  style={{ backgroundColor: swatch.value ?? '#ffffff' }}
                  onClick={() => onColor(swatch.value)}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </>
  )
}
