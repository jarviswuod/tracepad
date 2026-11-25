import type { ReactNode } from 'react'
import type { BoardCard, BoardSort, BoardView } from '../../data/notes'
import type { Label, Uuid } from '../../domain/types'
import { displayedBody } from '../../domain/versioning'
import { LabelSection } from '../labels/LabelSection'
import './board.css'

export type BoardLayout = 'grid' | 'list'

type BoardProps = {
  cards: BoardCard[]
  labels: Label[]
  view: BoardView
  sort: BoardSort
  layout: BoardLayout
  /** The inline editor for a new note, shown in place of "Take a note". */
  editor: ReactNode
  /** The note open in a modal, if any. */
  openNoteId: Uuid | null
  createDisabled: boolean
  ready: boolean
  onView: (view: BoardView) => void
  onSort: (sort: BoardSort) => void
  onLayout: (layout: BoardLayout) => void
  onOpen: (noteId: Uuid) => void
  onCreate: () => void
  onRestore: (noteId: Uuid) => void
  onDeleteForever: (noteId: Uuid) => void
  onEmptyTrash: () => void
  onCreateLabel: (name: string) => Promise<boolean>
  onRenameLabel: (labelId: Uuid, name: string) => Promise<boolean>
  onDeleteLabel: (labelId: Uuid) => void
}

function cardLabel(title: string | null, preview: string | null): string {
  const parts = [title, preview].filter((part) => part != null && part !== '')
  return parts.join(', ') || UNTITLED
}

const UNTITLED = 'Untitled'

/** What a card shows in its title spot: the title, else the preview, else "Untitled". */
export function cardHeading(title: string | null, preview: string | null): string {
  return title || preview || UNTITLED
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

export function NoteCard({
  card,
  open = false,
  onOpen,
  children,
}: {
  card: BoardCard
  /** Open in a modal. The card keeps its slot but is hidden. */
  open?: boolean
  onOpen: () => void
  children?: ReactNode
}) {
  const title = card.version.title
  const preview = displayedBody(card.version)
  return (
    <li style={open ? { visibility: 'hidden' } : undefined}>
      <button
        type="button"
        className="note-card"
        data-note-id={card.note.id}
        data-pinned={card.note.isPinned ? 'true' : 'false'}
        data-color={card.note.color ?? 'default'}
        aria-label={cardLabel(title, preview)}
        style={{ backgroundColor: card.note.color ?? '#ffffff' }}
        onClick={onOpen}
      >
        {title ? <span className="note-title">{title}</span> : null}
        {preview ? <span className={title ? 'note-preview' : 'note-title'}>{preview}</span> : null}
        {!title && !preview ? <span className="note-title">{UNTITLED}</span> : null}
        {card.labels.length > 0 ? (
          <span className="note-chips">
            {card.labels.map((label) => (
              <span key={label.id} className="note-chip">
                {label.name}
              </span>
            ))}
          </span>
        ) : null}
        {card.daysLeft != null ? <span className="days-left">{daysLeftLabel(card.daysLeft)}</span> : null}
      </button>
      {children}
    </li>
  )
}

/** The side list and the main column. `view` is null when no board view is showing. */
export function BoardShell({
  labels,
  view,
  onView,
  onCreateLabel,
  onRenameLabel,
  onDeleteLabel,
  children,
}: {
  labels: Label[]
  view: BoardView | null
  onView: (view: BoardView) => void
  onCreateLabel?: (name: string) => Promise<boolean>
  onRenameLabel?: (labelId: Uuid, name: string) => Promise<boolean>
  onDeleteLabel?: (labelId: Uuid) => void
  children: ReactNode
}) {
  return (
    <div className="notes-home">
      <div className="board-shell">
        <nav className="side-list" aria-label="Views">
          <ul className="side-links">
            <li>
              <SideButton current={view?.kind === 'notes'} onClick={() => onView({ kind: 'notes' })}>
                Notes
              </SideButton>
            </li>
            <li>
              <SideButton current={view?.kind === 'reminders'} onClick={() => onView({ kind: 'reminders' })}>
                Reminders
              </SideButton>
            </li>
            <li>
              <LabelSection
                labels={labels}
                currentLabelId={view?.kind === 'label' ? view.labelId : null}
                onOpen={(labelId) => onView({ kind: 'label', labelId })}
                onCreate={onCreateLabel}
                onRename={onRenameLabel}
                onDelete={onDeleteLabel}
              />
            </li>
            <li>
              <SideButton current={view?.kind === 'archive'} onClick={() => onView({ kind: 'archive' })}>
                Archive
              </SideButton>
            </li>
            <li>
              <SideButton current={view?.kind === 'trash'} onClick={() => onView({ kind: 'trash' })}>
                Trash
              </SideButton>
            </li>
          </ul>
        </nav>
        <div className="board-column">{children}</div>
      </div>
    </div>
  )
}

export function LayoutToggle({
  layout,
  onLayout,
}: {
  layout: BoardLayout
  onLayout: (layout: BoardLayout) => void
}) {
  return (
    <div className="layout-toggle" role="group" aria-label="Layout">
      <button type="button" aria-pressed={layout === 'grid'} onClick={() => onLayout('grid')}>
        Grid
      </button>
      <button type="button" aria-pressed={layout === 'list'} onClick={() => onLayout('list')}>
        List
      </button>
    </div>
  )
}

export function Board({
  cards,
  labels,
  view,
  sort,
  layout,
  editor,
  openNoteId,
  createDisabled,
  ready,
  onView,
  onSort,
  onLayout,
  onOpen,
  onCreate,
  onRestore,
  onDeleteForever,
  onEmptyTrash,
  onCreateLabel,
  onRenameLabel,
  onDeleteLabel,
}: BoardProps) {
  const pinned = cards.filter((card) => card.note.isPinned)
  const others = cards.filter((card) => !card.note.isPinned)
  // Trash keeps the pin flag but does not show it.
  const showGroups = view.kind !== 'trash' && pinned.length > 0

  function renderCard(card: BoardCard) {
    const heading = cardLabel(card.version.title, displayedBody(card.version))
    return (
      <NoteCard
        key={card.note.id}
        card={card}
        open={card.note.id === openNoteId}
        onOpen={() => onOpen(card.note.id)}
      >
        {view.kind === 'trash' && card.daysLeft != null ? (
          <div className="trash-actions">
            <button type="button" aria-label={`Restore ${heading}`} onClick={() => onRestore(card.note.id)}>
              Restore
            </button>
            <button
              type="button"
              aria-label={`Delete ${heading} forever`}
              onClick={() => onDeleteForever(card.note.id)}
            >
              Delete forever
            </button>
          </div>
        ) : null}
      </NoteCard>
    )
  }

  return (
    <BoardShell
      labels={labels}
      view={view}
      onView={onView}
      onCreateLabel={onCreateLabel}
      onRenameLabel={onRenameLabel}
      onDeleteLabel={onDeleteLabel}
    >
      {editor ?? (
        <button type="button" className="take-note" onClick={onCreate} disabled={createDisabled}>
          Take a note
        </button>
      )}
      <div className="board-toolbar">
        {view.kind === 'trash' && cards.some((card) => card.daysLeft != null) ? (
          <button type="button" className="empty-trash" onClick={onEmptyTrash}>
            Empty trash
          </button>
        ) : null}
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
        <LayoutToggle layout={layout} onLayout={onLayout} />
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
        {(showGroups ? pinned : cards).map((card) => renderCard(card))}
        {showGroups && others.length > 0 ? (
          <li className="board-heading">
            <h2>Others</h2>
          </li>
        ) : null}
        {showGroups ? others.map((card) => renderCard(card)) : null}
      </ul>
    </BoardShell>
  )
}
