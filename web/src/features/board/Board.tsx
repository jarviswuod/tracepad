import { useEffect, useLayoutEffect, useState, useRef, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { BoardCard, BoardSort, BoardView, TimeSort } from '../../data/notes'
import { groupBoardByDay, type DayGroup } from '../../domain/boardDays'
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
  /** Date groups follow this time while Custom is selected. */
  customBase: TimeSort
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
  /** Pin, Remind me, and More for a closed card. Omitted on history and in the trash. */
  cardActions?: (card: BoardCard) => ReactNode
}

const NARROW_BOARD = '(max-width: 720px)'

function useNarrowBoard(): boolean {
  const [narrow, setNarrow] = useState(() => {
    if (typeof window.matchMedia !== 'function') return false
    return window.matchMedia(NARROW_BOARD).matches
  })
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia(NARROW_BOARD)
    const apply = () => setNarrow(media.matches)
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [])
  return narrow
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
  actions,
  actionsAlways = false,
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
  /** Pin, Remind me, and More. Shown on hover, focus, or a narrow screen. */
  actions?: ReactNode
  /** A narrow screen has no hover, so the row stays visible. */
  actionsAlways?: boolean
  children?: ReactNode
}) {
  const [hover, setHover] = useState(false)
  const [focus, setFocus] = useState(false)
  const title = card.version.title
  const preview = displayedBody(card.version)
  const showActions = actions != null && !open && (actionsAlways || hover || focus)
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
      onFocus={() => setFocus(true)}
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
      {actions != null ? <span className="note-card-actions-slot" hidden={!showActions} /> : null}
    </button>
  )
  const body =
    actions == null ? (
      button
    ) : (
      <div
        className="note-card-frame"
        data-note-id={card.note.id}
        style={open ? { visibility: 'hidden' } : undefined}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setFocus(true)}
        onBlur={(event) => {
          const next = event.relatedTarget
          if (next instanceof Node && event.currentTarget.contains(next)) return
          setFocus(false)
        }}
      >
        {button}
        <div
          className="note-card-actions"
          hidden={!showActions}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {actions}
        </div>
      </div>
    )
  if (frame === 'grid') {
    return (
      <li className="board-item" data-note-id={card.note.id} style={open ? { visibility: 'hidden' } : undefined}>
        {body}
        {children}
      </li>
    )
  }
  return (
    <li style={open ? { visibility: 'hidden' } : undefined}>
      {body}
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

function DayCards({
  day,
  packLabel,
  layout,
  dragEnabled,
  markArchived,
  inTrash,
  openNoteId,
  onOpen,
  onRestore,
  onDeleteForever,
  onReorder,
  cardActions,
  actionsAlways,
}: {
  day: DayGroup<BoardCard>
  packLabel: string
  layout: BoardLayout
  dragEnabled: boolean
  markArchived: boolean
  inTrash: boolean
  openNoteId: Uuid | null
  onOpen: (noteId: Uuid) => void
  onRestore: (noteId: Uuid) => void
  onDeleteForever: (noteId: Uuid) => void
  onReorder: (noteId: Uuid, orderedIds: readonly Uuid[]) => void
  cardActions?: (card: BoardCard) => ReactNode
  actionsAlways: boolean
}) {
  const items = day.cards.map((card) => {
    const label = cardLabel(card.version.title, displayedBody(card.version))
    const actions = inTrash || card.note.trashedAt != null ? undefined : cardActions?.(card)
    return (
      <NoteCard
        key={card.note.id}
        card={card}
        frame={layout === 'grid' ? 'grid' : 'list'}
        open={card.note.id === openNoteId}
        markArchived={markArchived}
        actions={actions}
        actionsAlways={actionsAlways}
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
      <li className="board-heading board-date">
        <h2>{day.heading}</h2>
      </li>
      {layout === 'grid' ? (
        <li className="board-pack-row">
          <NotePack
            layoutKey={layoutKey(day.cards, openNoteId)}
            dragEnabled={dragEnabled}
            label={packLabel}
            onReorder={onReorder}
          >
            {items}
          </NotePack>
        </li>
      ) : (
        items
      )}
    </>
  )
}

function DaySection({
  title,
  days,
  packLabel,
  ...cardProps
}: {
  title: string | null
  days: DayGroup<BoardCard>[]
  packLabel: string
  layout: BoardLayout
  dragEnabled: boolean
  markArchived: boolean
  inTrash: boolean
  openNoteId: Uuid | null
  onOpen: (noteId: Uuid) => void
  onRestore: (noteId: Uuid) => void
  onDeleteForever: (noteId: Uuid) => void
  onReorder: (noteId: Uuid, orderedIds: readonly Uuid[]) => void
  cardActions?: (card: BoardCard) => ReactNode
  actionsAlways: boolean
}) {
  if (days.length === 0) return null
  return (
    <>
      {title ? (
        <li className="board-heading">
          <h2>{title}</h2>
        </li>
      ) : null}
      {days.map((day) => (
        <DayCards key={day.key} day={day} packLabel={packLabel} {...cardProps} />
      ))}
    </>
  )
}

export function Board({
  cards,
  labels,
  view,
  sort,
  customBase,
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
  cardActions,
}: BoardProps) {
  const narrow = useNarrowBoard()
  const grouped = groupBoardByDay(cards, sort, new Date(), customBase)
  // Trash keeps the pin flag but does not show it. Search is not the trash list.
  const inTrash = view.kind === 'trash' && !searching
  const showGroups = !inTrash && grouped.pinned.length > 0
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
    cardActions,
    actionsAlways: narrow,
  }
  // Moving a note to another day remounts its card. Focus follows the new card.
  const focusedCard = useRef<HTMLElement | null>(null)
  useEffect(() => {
    function onFocusIn(event: FocusEvent) {
      const target = event.target
      if (target instanceof HTMLElement && target.classList.contains('note-card')) {
        focusedCard.current = target
      }
    }
    document.addEventListener('focusin', onFocusIn)
    return () => document.removeEventListener('focusin', onFocusIn)
  }, [])
  useLayoutEffect(() => {
    const previous = focusedCard.current
    if (!previous || previous.isConnected) return
    const id = previous.getAttribute('data-note-id')
    if (!id) return
    const next = document.querySelector<HTMLElement>(`.note-card[data-note-id="${id}"]`)
    if (!next) return
    next.focus()
    focusedCard.current = next
  })

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
        <DaySection
          {...shared}
          title={showGroups ? 'Pinned' : null}
          days={grouped.pinned}
          packLabel={showGroups ? 'Pinned' : 'Notes'}
        />
        <DaySection
          {...shared}
          title={showGroups ? 'Others' : null}
          days={grouped.others}
          packLabel={showGroups ? 'Others' : 'Notes'}
        />
      </ul>
    </BoardShell>
  )
}
