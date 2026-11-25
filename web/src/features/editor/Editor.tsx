import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import type { TracepadDatabase } from '../../data/db'
import { clearDraft, commitNoteContent, listChecklistTicks, saveDraft, setChecklistTick } from '../../data/notes'
import { noteHasPendingOutbox } from '../../data/outbox'
import type { ChecklistItem, NoteKind, NoteVersion, Uuid } from '../../domain/types'
import {
  checklistDisplayOrder,
  checklistItemsToBody,
  isUnchangedContent,
  normalizeChecklistItems,
  textToChecklistItems,
  type NoteContent,
} from '../../domain/versioning'
import { SavingDot, savingDotState } from './SavingDot'

/** Wait this long after the last keystroke, then save a draft. */
export const DRAFT_DEBOUNCE_MS = 5000

/** How often an open note re-reads its pending outbox rows. This never writes the text. */
export const PENDING_SYNC_POLL_MS = 1000

export type EditorHandle = {
  /** Save or discard, and resolve once the database write has finished. */
  leave: () => Promise<void>
  /** Leave the note, then call `onLeft`. Safe to call more than once. */
  close: () => Promise<void>
  /**
   * Write the note if it has no row yet, including when the title and body are empty.
   * Archive and Remind me call this, then set their own flag. It does not cut a version
   * once the note already exists.
   */
  ensureSaved: () => Promise<void>
}

type EditorProps = {
  db: TracepadDatabase
  deviceId: Uuid
  noteId: Uuid
  openedVersion: NoteVersion | null
  onLeft: () => void
  /** Called once the note is saved, to show its history page. */
  onHistory: () => void
  /** Save or discard, then let the screen move the note to the trash. */
  onTrash: () => void
  /** The note is in the trash, so "Restore" takes the place of "Move to trash". */
  trashed?: boolean
  /** Let the screen restore the note, then close it. */
  onRestore?: () => void
  /** Chips and the edited date. Omitted on a new note from "Take a note". */
  actions?: ReactNode
  /** Pin, on the title's line. Omitted on a new note. */
  titleAside?: ReactNode
  /** A saved note uses the modal toolbar instead of Move to trash and History. */
  showFooter?: boolean
  /** More on a new note from "Take a note". A saved note uses the modal toolbar. */
  more?: ReactNode
  /** Grow the body so a long note scrolls in the modal, not inside the field. */
  expandBody?: boolean
  ref?: Ref<EditorHandle>
}

type Snapshot = {
  kind: NoteKind
  title: string
  body: string
  items: ChecklistItem[]
}

type Opened = Snapshot & {
  id: Uuid | null
}

function snapshotFrom(version: NoteVersion | null): Opened {
  if (version?.kind === 'checklist') {
    return {
      id: version.id,
      kind: 'checklist',
      title: version.title ?? '',
      body: '',
      items: version.checklistItems ?? [],
    }
  }
  return {
    id: version?.id ?? null,
    kind: 'text',
    title: version?.title ?? '',
    body: version?.body ?? '',
    items: [],
  }
}

function toContent(snapshot: Snapshot): NoteContent {
  if (snapshot.kind === 'checklist') {
    return { kind: 'checklist', title: snapshot.title, items: snapshot.items }
  }
  return { kind: 'text', title: snapshot.title, body: snapshot.body }
}

function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  if (a.kind !== b.kind || a.title !== b.title) return false
  if (a.kind === 'text') return a.body === b.body
  if (a.items.length !== b.items.length) return false
  return a.items.every(
    (item, index) =>
      item.id === b.items[index].id &&
      item.text === b.items[index].text &&
      item.position === b.items[index].position,
  )
}

function itemName(item: ChecklistItem, index: number): string {
  return item.text === '' ? String(index + 1) : item.text
}

export function Editor({
  db,
  deviceId,
  noteId,
  openedVersion,
  onLeft,
  onHistory,
  onTrash,
  trashed = false,
  onRestore,
  actions,
  titleAside,
  showFooter = true,
  more,
  expandBody = false,
  ref,
}: EditorProps) {
  const initial = snapshotFrom(openedVersion)
  // Title, body, and items live here. Draft saves and outbox checks never write them back.
  const [title, setTitle] = useState(initial.title)
  const [body, setBody] = useState(initial.body)
  const [kind, setKind] = useState(initial.kind)
  const [items, setItems] = useState(initial.items)
  const [ticked, setTicked] = useState<ReadonlySet<Uuid>>(() => new Set())
  const [unsaved, setUnsaved] = useState(false)
  const [pendingSync, setPendingSync] = useState(false)

  const contentRef = useRef<Snapshot>({
    kind: initial.kind,
    title: initial.title,
    body: initial.body,
    items: initial.items,
  })
  // The ref is the source of truth for "what we opened". Rendering must not copy
  // state back over it, or a version cut during this turn would be forgotten.
  const openedRef = useRef<Opened>(initial)
  const onLeftRef = useRef(onLeft)
  onLeftRef.current = onLeft
  const onHistoryRef = useRef(onHistory)
  onHistoryRef.current = onHistory
  const onTrashRef = useRef(onTrash)
  onTrashRef.current = onTrash
  const onRestoreRef = useRef(onRestore)
  onRestoreRef.current = onRestore

  const cardRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const closing = useRef<Promise<void> | null>(null)
  const pendingTicket = useRef(0)
  const alive = useRef(true)
  const ticksReady = useRef(false)

  function applyPending(pending: boolean, ticket: number) {
    if (!alive.current || ticket !== pendingTicket.current) return
    setPendingSync(pending)
  }

  function requestPending() {
    const ticket = ++pendingTicket.current
    void noteHasPendingOutbox(db, noteId).then((pending) => applyPending(pending, ticket))
  }

  function applyContent(next: Snapshot) {
    contentRef.current = next
    setKind(next.kind)
    setTitle(next.title)
    setBody(next.body)
    setItems(next.items)
  }

  async function settleIndicator(snapshot: Snapshot) {
    const ticket = ++pendingTicket.current
    const pending = await noteHasPendingOutbox(db, noteId)
    applyPending(pending, ticket)
    if (!alive.current) return
    if (sameSnapshot(contentRef.current, snapshot)) setUnsaved(false)
  }

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.current.then(task, task)
    queue.current = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  function clearTimer() {
    if (timer.current != null) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }

  function scheduleDraft() {
    clearTimer()
    timer.current = setTimeout(() => {
      timer.current = null
      void enqueue(() => autosave())
    }, DRAFT_DEBOUNCE_MS)
  }

  async function autosave() {
    const current = contentRef.current
    const base = openedRef.current
    if (isUnchangedContent(toContent(base), toContent(current))) {
      await clearDraft(db, noteId, deviceId)
    } else if (current.kind === 'checklist') {
      await saveDraft(db, {
        noteId,
        deviceId,
        baseVersionId: base.id,
        kind: 'checklist',
        title: current.title,
        checklistItems: current.items,
      })
    } else {
      await saveDraft(db, {
        noteId,
        deviceId,
        baseVersionId: base.id,
        title: current.title,
        body: current.body,
      })
    }
    await settleIndicator(current)
  }

  async function persistSnapshot(snapshot: Snapshot, keepEmpty: boolean) {
    const base = openedRef.current
    const result = await commitNoteContent(db, {
      noteId,
      deviceId,
      openedVersionId: base.id,
      opened: toContent(base),
      next: toContent(snapshot),
      keepEmpty,
    })
    if (result.kind === 'cut') {
      openedRef.current = { ...snapshot, id: result.versionId }
    }
    await settleIndicator(snapshot)
    return result
  }

  function cutSnapshot(snapshot: Snapshot) {
    return persistSnapshot(snapshot, false)
  }

  /** The note row Archive and Remind me need. An existing note is left as it is. */
  async function ensureSaved() {
    clearTimer()
    await enqueue(async () => {
      if (openedRef.current.id != null) return
      const snapshot = contentRef.current
      await persistSnapshot(snapshot, true)
      if (!sameSnapshot(contentRef.current, snapshot)) scheduleDraft()
    })
  }

  async function leave() {
    clearTimer()
    await enqueue(async () => {
      let guard = 0
      while (guard < 5) {
        guard += 1
        const snapshot = contentRef.current
        await cutSnapshot(snapshot)
        if (sameSnapshot(contentRef.current, snapshot)) return
      }
    })
  }

  function requestClose() {
    if (closing.current) return closing.current
    closing.current = (async () => {
      try {
        await leave()
        onLeftRef.current()
      } catch {
        closing.current = null
      }
    })()
    return closing.current
  }

  function openHistory() {
    void leave().then(
      () => onHistoryRef.current(),
      () => undefined,
    )
  }

  useImperativeHandle(ref, () => ({ leave, close: requestClose, ensureSaved }), [
    leave,
    requestClose,
    ensureSaved,
  ])

  useEffect(() => {
    return () => clearTimer()
  }, [])

  useEffect(() => {
    alive.current = true
    requestPending()
    const id = setInterval(requestPending, PENDING_SYNC_POLL_MS)
    return () => {
      alive.current = false
      clearInterval(id)
    }
  }, [db, noteId])

  useEffect(() => {
    let active = true
    void listChecklistTicks(db, noteId).then((rows) => {
      if (!active || ticksReady.current) return
      ticksReady.current = true
      setTicked(new Set(rows.filter((row) => row.ticked).map((row) => row.itemId)))
    })
    return () => {
      active = false
    }
  }, [db, noteId])

  useEffect(() => {
    function onPressOutside(event: Event) {
      const target = event.target
      // The control that opened the editor may already be gone by the time the
      // click finishes bubbling. That press is not someone leaving the note.
      if (!(target instanceof Node) || !target.isConnected) return
      const card = cardRef.current
      if (!card || card.contains(target)) return
      if (card.closest('[aria-modal="true"]')?.contains(target)) return
      if (target instanceof Element && target.closest('.dialog, .dialog-backdrop')) return
      if (target instanceof Element && target.closest('[data-note-id]')) return
      void requestClose()
    }

    function onKeyDown(event: KeyboardEvent) {
      if (!event.ctrlKey || event.altKey || event.shiftKey || event.key.toLowerCase() !== 's') return
      event.preventDefault()
      clearTimer()
      const snapshot = contentRef.current
      void enqueue(() => cutSnapshot(snapshot))
    }

    document.addEventListener('pointerdown', onPressOutside)
    document.addEventListener('mousedown', onPressOutside)
    document.addEventListener('click', onPressOutside)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPressOutside)
      document.removeEventListener('mousedown', onPressOutside)
      document.removeEventListener('click', onPressOutside)
      window.removeEventListener('keydown', onKeyDown)
    }
  })

  useLayoutEffect(() => {
    const element = bodyRef.current
    if (!element || !expandBody || kind !== 'text') return
    element.style.height = 'auto'
    if (element.scrollHeight > 0) element.style.height = `${element.scrollHeight}px`
  }, [body, expandBody, kind])

  function changeTitle(value: string) {
    contentRef.current = { ...contentRef.current, title: value }
    setTitle(value)
    setUnsaved(true)
    scheduleDraft()
  }

  function changeBody(value: string) {
    contentRef.current = { ...contentRef.current, body: value }
    setBody(value)
    setUnsaved(true)
    scheduleDraft()
  }

  function updateItems(next: ChecklistItem[]) {
    contentRef.current = { ...contentRef.current, items: next }
    setItems(next)
    setUnsaved(true)
    scheduleDraft()
  }

  function changeItem(itemId: Uuid, value: string) {
    updateItems(contentRef.current.items.map((item) => (item.id === itemId ? { ...item, text: value } : item)))
  }

  function addItem() {
    const current = contentRef.current.items
    const position = current.reduce((max, item) => Math.max(max, item.position), -1) + 1
    updateItems([...current, { id: crypto.randomUUID(), text: '', position }])
  }

  function removeItem(itemId: Uuid) {
    updateItems(contentRef.current.items.filter((item) => item.id !== itemId))
  }

  function moveItem(itemId: Uuid, direction: -1 | 1) {
    const ordered = normalizeChecklistItems(contentRef.current.items)
    const group = ordered.filter((item) => ticked.has(item.id) === ticked.has(itemId))
    const index = group.findIndex((item) => item.id === itemId)
    const neighbor = group[index + direction]
    if (index < 0 || !neighbor) return
    const moving = group[index]
    const stored = new Map(contentRef.current.items.map((item) => [item.id, item.position]))
    const movingPos = stored.get(moving.id)
    const neighborPos = stored.get(neighbor.id)
    if (movingPos == null || neighborPos == null) return
    updateItems(
      contentRef.current.items.map((item) => {
        if (item.id === moving.id) return { ...item, position: neighborPos }
        if (item.id === neighbor.id) return { ...item, position: movingPos }
        return item
      }),
    )
  }

  function toggleTick(itemId: Uuid, nextTicked: boolean) {
    void enqueue(async () => {
      if (openedRef.current.id == null) {
        const snapshot = contentRef.current
        await cutSnapshot(snapshot)
        if (openedRef.current.id == null) return
        if (!contentRef.current.items.some((item) => item.id === itemId)) return
      }
      const changed = await setChecklistTick(db, {
        noteId,
        itemId,
        ticked: nextTicked,
        deviceId,
      })
      if (!changed || !alive.current) return
      ticksReady.current = true
      setTicked((current) => {
        const next = new Set(current)
        if (nextTicked) next.add(itemId)
        else next.delete(itemId)
        return next
      })
      requestPending()
    })
  }

  function convert() {
    clearTimer()
    void enqueue(async () => {
      let guard = 0
      while (guard < 5) {
        guard += 1
        const current = contentRef.current
        const next: Snapshot =
          current.kind === 'text'
            ? {
                kind: 'checklist',
                title: current.title,
                body: '',
                items: textToChecklistItems(current.body, () => crypto.randomUUID()),
              }
            : {
                kind: 'text',
                title: current.title,
                body: checklistItemsToBody(current.items) ?? '',
                items: [],
              }
        const result = await commitNoteContent(db, {
          noteId,
          deviceId,
          openedVersionId: openedRef.current.id,
          opened: toContent(openedRef.current),
          next: toContent(next),
        })
        if (result.kind === 'cut') {
          openedRef.current = { ...next, id: result.versionId }
        }
        if (!sameSnapshot(contentRef.current, current)) continue
        if (result.kind === 'discard') {
          openedRef.current = { ...next, id: null }
        }
        applyContent(next)
        await settleIndicator(next)
        return
      }
    })
  }

  const titleField = (
    <input
      aria-label="Title"
      placeholder="Title"
      value={title}
      autoFocus
      onChange={(event) => changeTitle(event.target.value)}
    />
  )

  const shown = checklistDisplayOrder(items, ticked)
  const openCount = shown.filter((item) => !ticked.has(item.id)).length

  return (
    <div className="editor" ref={cardRef} role="group" aria-label="Note">
      <SavingDot state={savingDotState(unsaved, pendingSync)} />
      {titleAside ? (
        <div className="editor-title-row">
          {titleField}
          {titleAside}
        </div>
      ) : (
        titleField
      )}
      {kind === 'checklist' ? (
        <>
          <ul className="checklist" aria-label="Checklist">
            {shown.map((item, index) => {
              const done = ticked.has(item.id)
              const name = itemName(item, index)
              const groupStart = done ? openCount : 0
              const groupEnd = done ? shown.length : openCount
              return (
                <li key={item.id} className={done ? 'checklist-item is-ticked' : 'checklist-item'}>
                  <input
                    type="checkbox"
                    aria-label={`Tick ${name}`}
                    checked={done}
                    onChange={(event) => toggleTick(item.id, event.target.checked)}
                  />
                  <input
                    className={done ? 'checklist-text is-ticked' : 'checklist-text'}
                    aria-label={`Item ${name}`}
                    value={item.text}
                    onChange={(event) => changeItem(item.id, event.target.value)}
                  />
                  <button
                    type="button"
                    aria-label={`Move ${name} up`}
                    disabled={index === groupStart}
                    onClick={() => moveItem(item.id, -1)}
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${name} down`}
                    disabled={index === groupEnd - 1}
                    onClick={() => moveItem(item.id, 1)}
                  >
                    Down
                  </button>
                  <button type="button" aria-label={`Remove ${name}`} onClick={() => removeItem(item.id)}>
                    Remove
                  </button>
                </li>
              )
            })}
          </ul>
          <button type="button" className="checklist-add" onClick={addItem}>
            Add item
          </button>
        </>
      ) : (
        <textarea
          ref={bodyRef}
          className={expandBody ? 'editor-body-expand' : undefined}
          aria-label="Body"
          placeholder="Take a note"
          value={body}
          onChange={(event) => changeBody(event.target.value)}
        />
      )}
      {actions}
      <div className="editor-actions">
        <button type="button" className="editor-checklist-toggle" onClick={convert}>
          {kind === 'checklist' ? 'Hide checkboxes' : 'Show checkboxes'}
        </button>
        {more}
        {showFooter ? (
          <>
            {trashed ? (
              <button type="button" onClick={() => void onRestoreRef.current?.()}>
                Restore
              </button>
            ) : (
              <button type="button" onClick={() => void onTrashRef.current()}>
                Move to trash
              </button>
            )}
            <button type="button" onClick={openHistory}>
              History
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}
