import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { BoardCard, BoardSort, BoardView } from '../../data/notes'
import type { Label, Uuid } from '../../domain/types'
import { displayedBody } from '../../domain/versioning'
import { IconButton } from '../../ui/icons'
import { SideLink } from '../../ui/SideLink'
import { useSideNames } from '../../ui/sideNames'
import { LabelSection } from '../labels/LabelSection'
import { NotePack } from './NotePack'
import { labelPath, pathsMatch, viewFromPath } from './viewPath'
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
  searching: boolean
  /** Grid drag. `orderedIds` is the pack's new order, pinned and others separate. */
  onReorder: (noteId: Uuid, orderedIds: readonly Uuid[]) => void
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

export function NoteCard({
  card,
  open = false,
  onOpen,
  markArchived = false,
  frame = 'list',
  children,
}: {
  card: BoardCard
  /** Open in a modal. The card keeps its slot but is hidden. */
  open?: boolean
  /** Search included this archived note, so the card says "Archived". */
  markArchived?: boolean
  /** Grid cards are Muuri items. List and history stay a plain list item. */
  frame?: 'list' | 'grid'
  onOpen: () => void
  children?: ReactNode
}) {
  const title = card.version.title
  const preview = displayedBody(card.version)
  const button = (
    <button
      type="button"
      className={markArchived && card.note.isArchived ? 'note-card note-card-marked' : 'note-card'}
      data-note-id={card.note.id}
      data-pinned={card.note.isPinned ? 'true' : 'false'}
      data-color={card.note.color ?? 'default'}
      aria-label={cardLabel(title, preview)}
      style={{ backgroundColor: card.note.color ?? '#ffffff' }}
      onClick={onOpen}
    >
      {markArchived && card.note.isArchived ? <span className="note-archived-bar" /> : null}
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
      {markArchived && card.note.isArchived ? <span className="note-archived">Archived</span> : null}
      {card.daysLeft != null ? <span className="days-left">{daysLeftLabel(card.daysLeft)}</span> : null}
    </button>
  )
  if (frame === 'grid') {
    return (
      <li className="board-item" data-note-id={card.note.id} style={open ? { visibility: 'hidden' } : undefined}>
        {button}
        {children}
      </li>
    )
  }
  return (
    <li style={open ? { visibility: 'hidden' } : undefined}>
      {button}
      {children}
    </li>
  )
}

/** The side list and the main column. History is not a board path, so nothing there is current. */
export function BoardShell({
  labels,
  onCreateLabel,
  onRenameLabel,
  onDeleteLabel,
  children,
}: {
  labels: Label[]
  onCreateLabel?: (name: string) => Promise<boolean>
  onRenameLabel?: (labelId: Uuid, name: string) => Promise<boolean>
  onDeleteLabel?: (labelId: Uuid) => void
  children: ReactNode
}) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { open } = useSideNames()
  const view = viewFromPath(pathname, labels)
  const currentLabelId =
    view?.kind === 'label' ? (labels.find((label) => label.id === view.labelId)?.id ?? null) : null

  function openPath(path: string) {
    if (pathsMatch(pathname, path)) return
    navigate(path)
  }

  function openLabel(labelId: Uuid) {
    const label = labels.find((item) => item.id === labelId)
    if (label) openPath(labelPath(label.name))
  }

  return (
    <div className="notes-home">
      <div className="board-shell">
        <nav className={open ? 'side-list' : 'side-list is-collapsed'} aria-label="Views">
          <ul className="side-links">
            <li>
              <SideLink current={view?.kind === 'notes'} label="Notes" icon="notes" onClick={() => openPath('/home')} />
            </li>
            <li>
              <SideLink
                current={view?.kind === 'reminders'}
                label="Reminders"
                icon="remind"
                onClick={() => openPath('/reminders')}
              />
            </li>
            <li>
              <LabelSection
                labels={labels}
                currentLabelId={currentLabelId}
                onOpen={openLabel}
                onCreate={onCreateLabel}
                onRename={onRenameLabel}
                onDelete={onDeleteLabel}
              />
            </li>
            <li>
              <SideLink current={view?.kind === 'archive'} label="Archive" icon="archive" onClick={() => openPath('/archive')} />
            </li>
            <li>
              <SideLink current={view?.kind === 'trash'} label="Trash" icon="delete" onClick={() => openPath('/trash')} />
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
      <IconButton label="Grid" icon="grid" aria-pressed={layout === 'grid'} onClick={() => onLayout('grid')} />
      <IconButton label="List" icon="list" aria-pressed={layout === 'list'} onClick={() => onLayout('list')} />
    </div>
  )
}

function layoutKey(cards: BoardCard[], openNoteId: Uuid | null): string {
  return cards
    .map((card) => {
      const text = displayedBody(card.version) ?? ''
      return `${card.note.id}:${card.version.title ?? ''}:${text}:${card.labels.length}:${card.daysLeft ?? ''}:${card.note.color ?? ''}`
    })
    .join('|')
    .concat(`#${openNoteId ?? ''}`)
}

function CardGroup({
  heading,
  cards,
  layout,
  layoutKey: key,
  dragEnabled,
  markArchived,
  inTrash,
  openNoteId,
  onOpen,
  onRestore,
  onDeleteForever,
  onReorder,
}: {
  heading: string | null
  cards: BoardCard[]
  layout: BoardLayout
  layoutKey: string
  dragEnabled: boolean
  markArchived: boolean
  inTrash: boolean
  openNoteId: Uuid | null
  onOpen: (noteId: Uuid) => void
  onRestore: (noteId: Uuid) => void
  onDeleteForever: (noteId: Uuid) => void
  onReorder: (noteId: Uuid, orderedIds: readonly Uuid[]) => void
}) {
  if (cards.length === 0) return null
  const items = cards.map((card) => {
    const label = cardLabel(card.version.title, displayedBody(card.version))
    return (
      <NoteCard
        key={card.note.id}
        card={card}
        frame={layout === 'grid' ? 'grid' : 'list'}
        open={card.note.id === openNoteId}
        markArchived={markArchived}
        onOpen={() => onOpen(card.note.id)}
      >
        {inTrash && card.daysLeft != null ? (
          <div className="trash-actions">
            <IconButton label={`Restore ${label}`} icon="restore" onClick={() => onRestore(card.note.id)} />
            <IconButton
              label={`Delete ${label} forever`}
              icon="delete"
              onClick={() => onDeleteForever(card.note.id)}
            />
          </div>
        ) : null}
      </NoteCard>
    )
  })
  return (
    <>
      {heading ? (
        <li className="board-heading">
          <h2>{heading}</h2>
        </li>
      ) : null}
      {layout === 'grid' ? (
        <li className="board-pack-row">
          <NotePack layoutKey={key} dragEnabled={dragEnabled} label={heading ?? 'Notes'} onReorder={onReorder}>
            {items}
          </NotePack>
        </li>
      ) : (
        items
      )}
    </>
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
  searching,
  onReorder,
}: BoardProps) {
  const pinned = cards.filter((card) => card.note.isPinned)
  const others = cards.filter((card) => !card.note.isPinned)
  // Trash keeps the pin flag but does not show it. Search is not the trash list.
  const inTrash = view.kind === 'trash' && !searching
  const showGroups = !inTrash && pinned.length > 0
  // Home and a label bring archived notes in only while the switch is on.
  const markArchived = searching && (view.kind === 'notes' || view.kind === 'label')
  const shared = {
    layout,
    dragEnabled: !searching,
    markArchived,
    inTrash,
    openNoteId,
    onOpen,
    onRestore,
    onDeleteForever,
    onReorder,
  }

  return (
    <BoardShell
      labels={labels}
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
        {inTrash && cards.some((card) => card.daysLeft != null) ? (
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
              if (value === 'edited' || value === 'created' || value === 'custom') onSort(value)
            }}
          >
            <option value="edited">Recently edited</option>
            <option value="created">Newest created</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <LayoutToggle layout={layout} onLayout={onLayout} />
      </div>
      {ready && cards.length === 0 && editor == null ? (
        <p className="empty-state">{searching ? 'No notes match' : 'Take a note'}</p>
      ) : null}
      <ul
        className={layout === 'grid' ? 'board-cards board-packs' : 'board-cards'}
        data-layout={layout}
        aria-label="Board"
      >
        {layout === 'grid' && pinned.length > 0 && others.length > 0 ? (
          <>
            <CardGroup {...shared} heading={showGroups ? 'Pinned' : null} cards={pinned} layoutKey={layoutKey(pinned, openNoteId)} />
            <CardGroup {...shared} heading={showGroups ? 'Others' : null} cards={others} layoutKey={layoutKey(others, openNoteId)} />
          </>
        ) : showGroups ? (
          <>
            <CardGroup {...shared} heading="Pinned" cards={pinned} layoutKey={layoutKey(pinned, openNoteId)} />
            <CardGroup {...shared} heading="Others" cards={others} layoutKey={layoutKey(others, openNoteId)} />
          </>
        ) : (
          <CardGroup {...shared} heading={null} cards={cards} layoutKey={layoutKey(cards, openNoteId)} />
        )}
      </ul>
    </BoardShell>
  )
}
