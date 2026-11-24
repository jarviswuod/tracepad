import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import type { TracepadDatabase } from '../../data/db'
import { clearDraft, commitNoteText, saveDraft } from '../../data/notes'
import { noteHasPendingOutbox } from '../../data/outbox'
import type { NoteVersion, Uuid } from '../../domain/types'
import { isUnchangedText } from '../../domain/versioning'
import { SavingDot, savingDotState } from './SavingDot'

/** Wait this long after the last keystroke, then save a draft. */
export const DRAFT_DEBOUNCE_MS = 5000

/** How often an open note re-reads its pending outbox rows. This never writes the text. */
export const PENDING_SYNC_POLL_MS = 1000

export type EditorHandle = {
  /** Save or discard, and resolve once the database write has finished. */
  leave: () => Promise<void>
}

type EditorProps = {
  db: TracepadDatabase
  deviceId: Uuid
  noteId: Uuid
  openedVersion: NoteVersion | null
  onLeft: () => void
  /** Called once the note is saved, to show its history page. */
  onHistory: () => void
  ref?: Ref<EditorHandle>
}

type Opened = {
  id: Uuid | null
  title: string
  body: string
}

type EditorText = {
  title: string
  body: string
}

export function Editor({ db, deviceId, noteId, openedVersion, onLeft, onHistory, ref }: EditorProps) {
  // Title and body live here. Draft saves and outbox checks never write them back.
  const [title, setTitle] = useState(openedVersion?.title ?? '')
  const [body, setBody] = useState(openedVersion?.body ?? '')
  const [unsaved, setUnsaved] = useState(false)
  const [pendingSync, setPendingSync] = useState(false)

  const textRef = useRef<EditorText>({ title, body })
  textRef.current = { title, body }
  // The ref is the source of truth for "what we opened". Rendering must not copy
  // state back over it, or a version cut during this turn would be forgotten.
  const openedRef = useRef<Opened>({
    id: openedVersion?.id ?? null,
    title: openedVersion?.title ?? '',
    body: openedVersion?.body ?? '',
  })
  const onLeftRef = useRef(onLeft)
  onLeftRef.current = onLeft
  const onHistoryRef = useRef(onHistory)
  onHistoryRef.current = onHistory

  const cardRef = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const closing = useRef<Promise<void> | null>(null)
  const pendingTicket = useRef(0)
  const alive = useRef(true)

  function applyPending(pending: boolean, ticket: number) {
    if (!alive.current || ticket !== pendingTicket.current) return
    setPendingSync(pending)
  }

  function requestPending() {
    const ticket = ++pendingTicket.current
    void noteHasPendingOutbox(db, noteId).then((pending) => applyPending(pending, ticket))
  }

  async function settleIndicator(snapshot: EditorText) {
    const ticket = ++pendingTicket.current
    const pending = await noteHasPendingOutbox(db, noteId)
    applyPending(pending, ticket)
    if (!alive.current) return
    const current = textRef.current
    if (current.title === snapshot.title && current.body === snapshot.body) setUnsaved(false)
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
    const text = textRef.current
    const base = openedRef.current
    if (isUnchangedText(base, text)) {
      await clearDraft(db, noteId, deviceId)
    } else {
      await saveDraft(db, {
        noteId,
        deviceId,
        baseVersionId: base.id,
        title: text.title,
        body: text.body,
      })
    }
    await settleIndicator(text)
  }

  async function cutSnapshot(snapshotTitle: string, snapshotBody: string) {
    const base = openedRef.current
    const result = await commitNoteText(db, {
      noteId,
      deviceId,
      openedVersionId: base.id,
      opened: { title: base.title, body: base.body },
      next: { title: snapshotTitle, body: snapshotBody },
    })
    if (result.kind === 'cut') {
      openedRef.current = { id: result.versionId, title: snapshotTitle, body: snapshotBody }
    }
    await settleIndicator({ title: snapshotTitle, body: snapshotBody })
    return result
  }

  async function leave() {
    clearTimer()
    await enqueue(async () => {
      let guard = 0
      while (guard < 5) {
        guard += 1
        const snapshot = textRef.current
        await cutSnapshot(snapshot.title, snapshot.body)
        const latest = textRef.current
        if (latest.title === snapshot.title && latest.body === snapshot.body) return
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

  useImperativeHandle(ref, () => ({ leave }), [leave])

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
    function onPressOutside(event: Event) {
      const target = event.target
      // The control that opened the editor may already be gone by the time the
      // click finishes bubbling. That press is not someone leaving the note.
      if (!(target instanceof Node) || !target.isConnected) return
      const card = cardRef.current
      if (!card || card.contains(target)) return
      if (target instanceof Element && target.closest('[data-note-id]')) return
      void requestClose()
    }

    function onKeyDown(event: KeyboardEvent) {
      if (!event.ctrlKey || event.altKey || event.shiftKey || event.key.toLowerCase() !== 's') return
      event.preventDefault()
      clearTimer()
      const snapshot = textRef.current
      void enqueue(() => cutSnapshot(snapshot.title, snapshot.body))
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

  function changeTitle(value: string) {
    textRef.current = { ...textRef.current, title: value }
    setTitle(value)
    setUnsaved(true)
    scheduleDraft()
  }

  function changeBody(value: string) {
    textRef.current = { ...textRef.current, body: value }
    setBody(value)
    setUnsaved(true)
    scheduleDraft()
  }

  return (
    <div className="editor" ref={cardRef} role="group" aria-label="Note">
      <SavingDot state={savingDotState(unsaved, pendingSync)} />
      <input
        aria-label="Title"
        placeholder="Title"
        value={title}
        autoFocus
        onChange={(event) => changeTitle(event.target.value)}
      />
      <textarea
        aria-label="Body"
        placeholder="Take a note"
        value={body}
        onChange={(event) => changeBody(event.target.value)}
      />
      <div className="editor-actions">
        <button type="button" onClick={openHistory}>
          History
        </button>
      </div>
    </div>
  )
}
