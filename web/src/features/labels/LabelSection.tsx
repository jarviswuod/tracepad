import { useEffect, useState, type FormEvent } from 'react'
import type { Label, Uuid } from '../../domain/types'

type LabelSectionProps = {
  labels: Label[]
  currentLabelId: Uuid | null
  onOpen: (labelId: Uuid) => void
  onCreate?: (name: string) => Promise<boolean>
  onRename?: (labelId: Uuid, name: string) => Promise<boolean>
  onDelete?: (labelId: Uuid) => void
}

/** The Labels block in the side list: open a label, and create, rename or delete one. */
export function LabelSection({ labels, currentLabelId, onOpen, onCreate, onRename, onDelete }: LabelSectionProps) {
  const tools = onCreate && onRename && onDelete ? { onCreate, onRename, onDelete } : null
  const [draft, setDraft] = useState('')
  const [renaming, setRenaming] = useState<{ id: Uuid; name: string } | null>(null)
  const [renameValue, setRenameValue] = useState('')

  useEffect(() => {
    if (renaming && !labels.some((label) => label.id === renaming.id)) setRenaming(null)
  }, [labels, renaming])

  function startRename(label: Label) {
    setRenaming({ id: label.id, name: label.name })
    setRenameValue(label.name)
  }

  async function create(event: FormEvent) {
    event.preventDefault()
    if (!tools) return
    const ok = await tools.onCreate(draft)
    if (ok) setDraft('')
  }

  async function saveRename(event: FormEvent) {
    event.preventDefault()
    if (!tools || !renaming) return
    const ok = await tools.onRename(renaming.id, renameValue)
    if (ok) setRenaming(null)
  }

  return (
    <>
      <div className="side-heading">Labels</div>
      <ul className="side-label-list">
        {labels.map((label) => (
          <li key={label.id}>
            {tools && renaming?.id === label.id ? (
              <form className="side-label-rename" onSubmit={(event) => void saveRename(event)}>
                <input
                  aria-label={`Rename ${renaming.name}`}
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                />
                <button type="submit">Save</button>
                <button type="button" onClick={() => setRenaming(null)}>
                  Cancel
                </button>
              </form>
            ) : (
              <div className="side-label-row">
                <button
                  type="button"
                  aria-current={currentLabelId === label.id ? 'page' : undefined}
                  onClick={() => onOpen(label.id)}
                >
                  {label.name}
                </button>
                {tools ? (
                  <div className="side-label-tools">
                    <button type="button" aria-label={`Rename ${label.name}`} onClick={() => startRename(label)}>
                      Rename
                    </button>
                    <button type="button" aria-label={`Delete ${label.name}`} onClick={() => tools.onDelete(label.id)}>
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </li>
        ))}
      </ul>
      {tools ? (
        <form className="side-label-create" onSubmit={(event) => void create(event)}>
          <input
            aria-label="New label"
            placeholder="New label"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit">Create label</button>
        </form>
      ) : null}
    </>
  )
}
