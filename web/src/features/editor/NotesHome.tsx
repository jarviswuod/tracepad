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
import { Board } from '../board/Board'
import { Editor, type EditorHandle } from './Editor'
import './editor.css'

type Session = {
  noteId: Uuid
  version: NoteVersion | null
}

export function NotesHome({ db }: { db: TracepadDatabase }) {
  const [deviceId, setDeviceId] = useState<Uuid | null>(null)
  const [cards, setCards] = useState<BoardCard[]>([])
  const [labels, setLabels] = useState<Label[]>([])
  const [view, setView] = useState<BoardView>({ kind: 'notes' })
  const [sort, setSort] = useState<BoardSort>('edited')
  const [layout, setLayout] = useState<'grid' | 'list'>('grid')
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const editorRef = useRef<EditorHandle>(null)
  const request = useRef(0)

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
      onView={setView}
      onSort={setSort}
      onLayout={setLayout}
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
