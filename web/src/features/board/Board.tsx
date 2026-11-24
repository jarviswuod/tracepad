import type { ReactNode } from 'react'
import type { BoardCard, BoardSort, BoardView } from '../../data/notes'
import type { Label, Uuid } from '../../domain/types'
import './board.css'

type BoardProps = {
  cards: BoardCard[]
  labels: Label[]
  view: BoardView
  sort: BoardSort
  layout: 'grid' | 'list'
  editor: ReactNode
  createDisabled: boolean
  ready: boolean
  onView: (view: BoardView) => void
  onSort: (sort: BoardSort) => void
  onLayout: (layout: 'grid' | 'list') => void
  onOpen: (noteId: Uuid) => void
  onCreate: () => void
}

function cardLabel(title: string | null, preview: string | null): string {
  const parts = [title, preview].filter((part) => part != null && part !== '')
  return parts.join(', ') || 'Untitled'
}

function daysLeftLabel(days: number): string {
  return days === 1 ? '1 day left' : `${days} days left`
}

function SideButton({
  current,
  onClick,
  children,
}: {
  current: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button type="button" aria-current={current ? 'page' : undefined} onClick={onClick}>
      {children}
    </button>
  )
}

function NoteCard({ card, onOpen }: { card: BoardCard; onOpen: (noteId: Uuid) => void }) {
  const title = card.version.title
  const preview = card.version.body
  return (
    <li>
      <button
        type="button"
        className="note-card"
        data-note-id={card.note.id}
        data-pinned={card.note.isPinned ? 'true' : 'false'}
        data-color={card.note.color ?? 'default'}
        aria-label={cardLabel(title, preview)}
        style={{ backgroundColor: card.note.color ?? '#ffffff' }}
        onClick={() => onOpen(card.note.id)}
      >
        {title ? <span className="note-title">{title}</span> : null}
        {preview ? <span className={title ? 'note-preview' : 'note-title'}>{preview}</span> : null}
        {!title && !preview ? <span className="note-title">Untitled</span> : null}
        {card.daysLeft != null ? <span className="days-left">{daysLeftLabel(card.daysLeft)}</span> : null}
      </button>
    </li>
  )
}

export function Board({
  cards,
  labels,
  view,
  sort,
  layout,
  editor,
  createDisabled,
  ready,
  onView,
  onSort,
  onLayout,
  onOpen,
  onCreate,
}: BoardProps) {
  const pinned = cards.filter((card) => card.note.isPinned)
  const others = cards.filter((card) => !card.note.isPinned)
  // Trash keeps the pin flag but does not show it.
  const showGroups = view.kind !== 'trash' && pinned.length > 0

  return (
    <div className="notes-home">
      <div className="board-shell">
        <nav className="side-list" aria-label="Views">
          <ul className="side-links">
            <li>
              <SideButton current={view.kind === 'notes'} onClick={() => onView({ kind: 'notes' })}>
                Notes
              </SideButton>
            </li>
            <li>
              <SideButton current={view.kind === 'reminders'} onClick={() => onView({ kind: 'reminders' })}>
                Reminders
              </SideButton>
            </li>
            <li>
              <div className="side-heading">Labels</div>
              <ul className="side-label-list">
                {labels.map((label) => (
                  <li key={label.id}>
                    <SideButton
                      current={view.kind === 'label' && view.labelId === label.id}
                      onClick={() => onView({ kind: 'label', labelId: label.id })}
                    >
                      {label.name}
                    </SideButton>
                  </li>
                ))}
              </ul>
            </li>
            <li>
              <SideButton current={view.kind === 'archive'} onClick={() => onView({ kind: 'archive' })}>
                Archive
              </SideButton>
            </li>
            <li>
              <SideButton current={view.kind === 'trash'} onClick={() => onView({ kind: 'trash' })}>
                Trash
              </SideButton>
            </li>
          </ul>
        </nav>
        <div className="board-column">
          {editor ?? (
            <button type="button" className="take-note" onClick={onCreate} disabled={createDisabled}>
              Take a note
            </button>
          )}
          <div className="board-toolbar">
            <label htmlFor="board-sort">
              Sort
              <select
                id="board-sort"
                value={sort}
                onChange={(event) => {
                  const value = event.target.value
                  if (value === 'edited' || value === 'created') onSort(value)
                }}
              >
                <option value="edited">Recently edited</option>
                <option value="created">Newest created</option>
              </select>
            </label>
            <div className="layout-toggle" role="group" aria-label="Layout">
              <button
                type="button"
                aria-pressed={layout === 'grid'}
                onClick={() => onLayout('grid')}
              >
                Grid
              </button>
              <button
                type="button"
                aria-pressed={layout === 'list'}
                onClick={() => onLayout('list')}
              >
                List
              </button>
            </div>
          </div>
          {ready && cards.length === 0 && editor == null ? (
            <p className="empty-state">Take a note</p>
          ) : null}
          <ul className="board-cards" data-layout={layout} aria-label="Board">
            {showGroups ? (
              <li className="board-heading">
                <h2>Pinned</h2>
              </li>
            ) : null}
            {(showGroups ? pinned : cards).map((card) => (
              <NoteCard key={card.note.id} card={card} onOpen={onOpen} />
            ))}
            {showGroups && others.length > 0 ? (
              <li className="board-heading">
                <h2>Others</h2>
              </li>
            ) : null}
            {showGroups
              ? others.map((card) => <NoteCard key={card.note.id} card={card} onOpen={onOpen} />)
              : null}
          </ul>
        </div>
      </div>
    </div>
  )
}
