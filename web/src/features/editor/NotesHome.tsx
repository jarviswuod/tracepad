import { useCallback, useEffect, useRef, useState } from 'react'
import type { TracepadDatabase } from '../../data/db'
import { listLabels } from '../../data/labels'
import {
  ensureDeviceId,
  getListedNote,
  listBoard,
  type BoardCard,
  type BoardSort,
  type BoardView,
} from '../../data/notes'
import { deleteNoteForever, emptyTrash, moveToTrash, restoreFromTrash } from '../../data/trash'
import type { Label, NoteVersion, Uuid } from '../../domain/types'
import { Board, type BoardLayout } from '../board/Board'
import { ConfirmDialog, UndoSnackbar, useUndoWindow } from '../trash/TrashUi'
import { Editor, type EditorHandle } from './Editor'
import './editor.css'

type PendingDelete = { kind: 'note'; noteId: Uuid } | { kind: 'all' }

type Session = {
  noteId: Uuid
  version: NoteVersion | null
}

type NotesHomeProps = {
  db: TracepadDatabase
  view: BoardView
  sort: BoardSort
  layout: BoardLayout
  /** Open this note in the editor on arrival, as "Back to note" from history does. */
  openNoteId: Uuid | null
  onView: (view: BoardView) => void
  onSort: (sort: BoardSort) => void
  onLayout: (layout: BoardLayout) => void
  onHistory: (noteId: Uuid) => void
}

export function NotesHome({
  db,
  view,
  sort,
  layout,
  openNoteId,
  onView,
  onSort,
  onLayout,
  onHistory,
}: NotesHomeProps) {
  const [deviceId, setDeviceId] = useState<Uuid | null>(null)
  const [cards, setCards] = useState<BoardCard[]>([])
  const [labels, setLabels] = useState<Label[]>([])
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [undoId, setUndoId] = useState<Uuid | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const editorRef = useRef<EditorHandle>(null)
  const request = useRef(0)
  const openedOnArrival = useRef(false)
  const trashing = useRef(false)
  const expireUndo = useCallback(() => setUndoId(null), [])
  useUndoWindow(undoId, expireUndo)

  const refresh = useCallback(async () => {
    const ticket = ++request.current
    const [nextCards, nextLabels] = await Promise.all([
      listBoard(db, { view, sort }),
      listLabels(db),
    ])
    if (ticket !== request.current) return
    setCards(nextCards)
    setLabels(nextLabels)
    setReady(true)
  }, [db, view, sort])

  useEffect(() => {
    let active = true
    void ensureDeviceId(db).then((id) => {
      if (active) setDeviceId(id)
    })
    return () => {
      active = false
    }
  }, [db])

  useEffect(() => {
    setCards([])
    setReady(false)
    void refresh()
  }, [refresh])

  async function openNote(noteId: Uuid) {
    await editorRef.current?.leave()
    const listed = await getListedNote(db, noteId)
    setSession(listed ? { noteId, version: listed.version } : null)
    await refresh()
  }

  useEffect(() => {
    if (openNoteId == null || openedOnArrival.current) return
    openedOnArrival.current = true
    void openNote(openNoteId)
  })

  function startNote() {
    setSession({ noteId: crypto.randomUUID(), version: null })
  }

  async function currentDeviceId(): Promise<Uuid> {
    if (deviceId) return deviceId
    const id = await ensureDeviceId(db)
    setDeviceId(id)
    return id
  }

  async function trashSession() {
    if (trashing.current || !session) return
    trashing.current = true
    const noteId = session.noteId
    try {
      await editorRef.current?.leave()
      const moved = await moveToTrash(db, { noteId, deviceId: await currentDeviceId() })
      setSession(null)
      if (moved) setUndoId(noteId)
      await refresh()
    } finally {
      trashing.current = false
    }
  }

  async function undoTrash() {
    if (undoId == null) return
    const noteId = undoId
    setUndoId(null)
    await restoreFromTrash(db, { noteId, deviceId: await currentDeviceId() })
    await refresh()
  }

  async function restore(noteId: Uuid) {
    if (undoId === noteId) setUndoId(null)
    await restoreFromTrash(db, { noteId, deviceId: await currentDeviceId() })
    await refresh()
  }

  async function confirmPending() {
    const action = pendingDelete
    if (!action) return
    setPendingDelete(null)
    if (action.kind === 'note') {
      setUndoId((current) => (current === action.noteId ? null : current))
      await deleteNoteForever(db, { noteId: action.noteId })
    } else {
      setUndoId(null)
      await emptyTrash(db)
    }
    await refresh()
  }

  return (
    <>
      <Board
        cards={cards}
        labels={labels}
        view={view}
        sort={sort}
        layout={layout}
        createDisabled={deviceId == null}
        ready={ready}
        onView={onView}
        onSort={onSort}
        onLayout={onLayout}
        onOpen={(noteId) => void openNote(noteId)}
        onCreate={startNote}
        onRestore={(noteId) => void restore(noteId)}
        onDeleteForever={(noteId) => setPendingDelete({ kind: 'note', noteId })}
        onEmptyTrash={() => setPendingDelete({ kind: 'all' })}
        editor={
        session && deviceId ? (
          <Editor
            key={session.noteId}
            ref={editorRef}
            db={db}
            deviceId={deviceId}
            noteId={session.noteId}
            openedVersion={session.version}
            onHistory={() => onHistory(session.noteId)}
            onTrash={() => void trashSession()}
            onLeft={() => {
              setSession(null)
              void refresh()
            }}
          />
        ) : null
      }
      />
      {undoId ? <UndoSnackbar onUndo={() => void undoTrash()} /> : null}
      {pendingDelete ? (
        <ConfirmDialog
          title={pendingDelete.kind === 'note' ? 'Delete forever?' : 'Empty trash?'}
          body={
            pendingDelete.kind === 'note'
              ? 'This note will be removed.'
              : 'Every note in the trash will be removed.'
          }
          confirmLabel={pendingDelete.kind === 'note' ? 'Delete forever' : 'Empty trash'}
          onConfirm={() => void confirmPending()}
          onCancel={() => setPendingDelete(null)}
        />
      ) : null}
    </>
  )
}
