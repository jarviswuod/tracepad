import { useLayoutEffect, useRef, type ReactNode } from 'react'
import Muuri, { type Item } from 'muuri'
import type { Uuid } from '../../domain/types'

const DRAG_START_DISTANCE = 8

type NotePackProps = {
  /** Changes when the cards, their text, or which one is open changes. */
  layoutKey: string
  dragEnabled: boolean
  label: string
  onReorder: (noteId: Uuid, orderedIds: readonly Uuid[]) => void
  children: ReactNode
}

/** Column count matches the old grid: at least 15rem, with room for a 0.75rem gap. */
function applyPackWidth(host: HTMLElement) {
  const width = host.clientWidth || host.parentElement?.clientWidth || 0
  if (width <= 0) return
  const rootFont = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  const min = 15 * rootFont
  const gap = 0.75 * rootFont
  const columns = Math.max(1, Math.floor((width + gap) / (min + gap)))
  const itemWidth = Math.floor(width / columns)
  host.style.setProperty('--board-columns', String(columns))
  host.style.setProperty('--board-item-width', `${itemWidth}px`)
}

function syncGrid(grid: Muuri, host: HTMLElement) {
  applyPackWidth(host)
  const elements = [...host.querySelectorAll<HTMLElement>(':scope > .board-item')]
  const current = grid.getItems()
  const elementSet = new Set<HTMLElement>(elements)
  const removed = current.filter((item) => {
    const element = item.getElement()
    return element == null || !elementSet.has(element)
  })
  if (removed.length > 0) grid.remove(removed, { removeElements: false, layout: false })
  const present = new Set(grid.getItems().map((item) => item.getElement()).filter((element) => element != null))
  const added = elements.filter((element) => !present.has(element))
  if (added.length > 0) grid.add(added, { layout: false })
  const byElement = new Map(grid.getItems().map((item) => [item.getElement(), item] as const))
  const ordered: Item[] = []
  for (const element of elements) {
    const item = byElement.get(element)
    if (item) ordered.push(item)
  }
  if (ordered.length > 1) grid.sort(ordered, { layout: false })
  grid.refreshItems().layout()
}

/**
 * One Muuri pack. Each card keeps its own height and the next card goes in the
 * shortest column. A drag stays inside this pack.
 */
export function NotePack({ layoutKey, dragEnabled, label, onReorder, children }: NotePackProps) {
  const hostRef = useRef<HTMLUListElement>(null)
  const gridRef = useRef<Muuri | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const onReorderRef = useRef(onReorder)
  const ignoreClick = useRef(false)
  onReorderRef.current = onReorder

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    applyPackWidth(host)
    let grid: Muuri
    try {
      grid = new Muuri(host, {
        items: '.board-item',
        layout: { fillGaps: true, rounding: true },
        layoutOnResize: false,
        layoutDuration: 0,
        dragEnabled,
        dragHandle: '.note-card',
        dragStartPredicate: dragEnabled ? { distance: DRAG_START_DISTANCE } : () => false,
        dragSortHeuristics: { sortInterval: 0 },
        dragRelease: { duration: 200, easing: 'ease' },
      })
    } catch {
      return
    }
    gridRef.current = grid

    const onDragStart = () => {
      ignoreClick.current = true
    }
    const onDragEnd = (item: Item) => {
      const draggedId = item.getElement()?.getAttribute('data-note-id')
      if (!draggedId) return
      const ids = grid.getItems().map((entry) => entry.getElement()?.getAttribute('data-note-id') ?? '')
      if (ids.length === 0 || ids.some((id) => id === '')) return
      onReorderRef.current(draggedId, ids)
      window.setTimeout(() => {
        ignoreClick.current = false
      }, 0)
    }
    grid.on('dragStart', onDragStart)
    grid.on('dragEnd', onDragEnd)

    let lastWidth = Math.round(host.clientWidth)
    const heights = new Map<Element, number>()
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver((entries) => {
            const current = gridRef.current
            const pack = hostRef.current
            if (!current || !pack) return
            let widthChanged = false
            let itemChanged = false
            for (const entry of entries) {
              if (entry.target === pack) {
                const width = Math.round(entry.contentRect.width)
                if (width !== lastWidth) {
                  lastWidth = width
                  widthChanged = true
                }
              } else {
                const height = Math.round(entry.contentRect.height)
                if (heights.get(entry.target) !== height) {
                  heights.set(entry.target, height)
                  itemChanged = true
                }
              }
            }
            if (!widthChanged && !itemChanged) return
            syncGrid(current, pack)
          })
    observerRef.current = observer
    observer?.observe(host)

    return () => {
      observer?.disconnect()
      observerRef.current = null
      grid.destroy()
      if (gridRef.current === grid) gridRef.current = null
    }
  }, [dragEnabled])

  useLayoutEffect(() => {
    const grid = gridRef.current
    const host = hostRef.current
    if (!grid || !host) return
    syncGrid(grid, host)
    const observer = observerRef.current
    if (!observer) return
    host.querySelectorAll('.board-item').forEach((element) => observer.observe(element))
  }, [layoutKey, dragEnabled])

  return (
    <ul
      className="board-pack"
      aria-label={label}
      ref={hostRef}
      onClickCapture={(event) => {
        if (!ignoreClick.current) return
        event.stopPropagation()
        event.preventDefault()
      }}
    >
      {children}
    </ul>
  )
}
