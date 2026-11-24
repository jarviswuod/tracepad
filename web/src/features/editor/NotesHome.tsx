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
import type { Label, NoteVersion, Uuid } from '../../domain/types'
import { Board, type BoardLayout } from '../board/Board'
import { Editor, type EditorHandle } from './Editor'
import './editor.css'

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
  const editorRef = useRef<EditorHandle>(null)
  const request = useRef(0)
  const openedOnArrival = useRef(false)

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

  return (
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
            onLeft={() => {
              setSession(null)
              void refresh()
            }}
          />
        ) : null
      }
    />
  )
}
