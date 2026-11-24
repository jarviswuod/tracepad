import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import type { Label, Uuid } from '../../domain/types'
import { NoteModal } from '../../ui/NoteModal'
import { ConfirmDialog } from '../trash/TrashUi'
import './labels.css'

const DELETE_BODY = "We'll delete this label and remove it from all of your notes. Your notes won't be deleted."

type EditLabelsDialogProps = {
  labels: Label[]
  onCreate: (name: string) => Promise<boolean>
  onRename: (labelId: Uuid, name: string) => Promise<boolean>
  onDelete: (labelId: Uuid) => void
  onClose: () => void
}

/** Keep's "Edit labels" dialog: create on top, rename in place, delete after a confirmation. */
export function EditLabelsDialog({ labels, onCreate, onRename, onDelete, onClose }: EditLabelsDialogProps) {
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<Uuid | null>(null)
  const [editValue, setEditValue] = useState('')
  const [pending, setPending] = useState<Label | null>(null)
  const editInputRef = useRef<HTMLInputElement>(null)
  const skipBlur = useRef(false)

  useEffect(() => {
    if (editingId && !labels.some((label) => label.id === editingId)) setEditingId(null)
  }, [labels, editingId])

  useEffect(() => {
    const input = editInputRef.current
    if (!input) return
    input.focus()
    input.select()
  }, [editingId])

  async function create(event: FormEvent) {
    event.preventDefault()
    const ok = await onCreate(draft)
    if (ok) setDraft('')
  }

  function startEdit(label: Label) {
    skipBlur.current = false
    setEditingId(label.id)
    setEditValue(label.name)
  }

  function cancelEdit() {
    skipBlur.current = true
    setEditingId(null)
  }

  async function saveEdit() {
    if (editingId == null) return
    const id = editingId
    const ok = await onRename(id, editValue)
    if (ok) setEditingId((current) => (current === id ? null : current))
  }

  function close() {
    if (pending) return
    onClose()
  }

  return createPortal(
    <NoteModal label="Edit labels" color={null} size="labels" closeText="Done" onClose={close}>
      <form className="edit-labels-create" onSubmit={(event) => void create(event)}>
        <input
          aria-label="Create new label"
          placeholder="Create new label"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        {draft !== '' ? (
          <>
            <button type="submit">Save</button>
            <button type="button" onClick={() => setDraft('')}>
              Cancel
            </button>
          </>
        ) : null}
      </form>
      <ul className="edit-labels-list">
        {labels.map((label) => (
          <li key={label.id} className="edit-label-row">
            {editingId === label.id ? (
              <input
                ref={editInputRef}
                aria-label={`Rename ${label.name}`}
                value={editValue}
                onChange={(event) => setEditValue(event.target.value)}
                onBlur={() => {
                  if (skipBlur.current) {
                    skipBlur.current = false
                    return
                  }
                  void saveEdit()
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    event.stopPropagation()
                    cancelEdit()
                    return
                  }
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void saveEdit()
                  }
                }}
              />
            ) : (
              <button type="button" className="edit-label-name" onClick={() => startEdit(label)}>
                {label.name}
              </button>
            )}
            <button
              type="button"
              className="edit-label-delete"
              aria-label={`Delete ${label.name}`}
              onClick={() => setPending(label)}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
      {pending ? (
        <ConfirmDialog
          title="Delete label?"
          body={DELETE_BODY}
          confirmLabel="Delete"
          onConfirm={() => {
            onDelete(pending.id)
            setPending(null)
          }}
          onCancel={() => setPending(null)}
        />
      ) : null}
    </NoteModal>,
    document.body,
  )
}
