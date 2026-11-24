import { useState, type FormEvent } from 'react'
import type { Label, Uuid } from '../../domain/types'
import { NOTE_COLORS } from './colors'
import './labels.css'

type NoteMetaProps = {
  isPinned: boolean
  isArchived: boolean
  color: string | null
  labels: Label[]
  activeLabelIds: Uuid[]
  onPin: (pinned: boolean) => void
  onArchive: (archived: boolean) => void
  onColor: (color: string | null) => void
  onToggleLabel: (labelId: Uuid, on: boolean) => void
  onAddLabel: (name: string) => void
}

/** Pin, archive, color and labels for a note that already has a row. A new note has none yet. */
export function NoteMeta({
  isPinned,
  isArchived,
  color,
  labels,
  activeLabelIds,
  onPin,
  onArchive,
  onColor,
  onToggleLabel,
  onAddLabel,
}: NoteMetaProps) {
  const [draft, setDraft] = useState('')

  function addLabel(event: FormEvent) {
    event.preventDefault()
    const name = draft.trim()
    if (name === '') return
    setDraft('')
    onAddLabel(name)
  }

  return (
    <div className="note-meta">
      <div className="note-meta-row">
        <button type="button" onClick={() => onPin(!isPinned)}>
          {isPinned ? 'Unpin' : 'Pin'}
        </button>
        <button type="button" onClick={() => onArchive(!isArchived)}>
          {isArchived ? 'Unarchive note' : 'Archive note'}
        </button>
      </div>
      <div className="color-choices" role="group" aria-label="Color">
        {NOTE_COLORS.map((swatch) => (
          <button
            key={swatch.name}
            type="button"
            className="color-swatch"
            aria-label={`${swatch.name} color`}
            aria-pressed={color === swatch.value}
            style={{ backgroundColor: swatch.value ?? '#ffffff' }}
            onClick={() => onColor(swatch.value)}
          />
        ))}
      </div>
      {labels.length > 0 ? (
        <ul className="note-label-picks">
          {labels.map((label) => (
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
      ) : null}
      <form className="note-label-add" onSubmit={addLabel}>
        <input
          aria-label="Label name"
          placeholder="Label"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit">Add label</button>
      </form>
    </div>
  )
}
