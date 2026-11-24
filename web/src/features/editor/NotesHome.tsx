import { useCallback, useEffect, useRef, useState } from 'react'
import type { TracepadDatabase } from '../../data/db'
import { ensureDeviceId, listNotes, type ListedNote } from '../../data/notes'
import type { NoteVersion, Uuid } from '../../domain/types'
import { Editor, type EditorHandle } from './Editor'
import './editor.css'

type Session = {
  noteId: Uuid
  version: NoteVersion | null
}

export function NotesHome({ db }: { db: TracepadDatabase }) {
  const [deviceId, setDeviceId] = useState<Uuid | null>(null)
  const [notes, setNotes] = useState<ListedNote[]>([])
  const [session, setSession] = useState<Session | null>(null)
  const editorRef = useRef<EditorHandle>(null)

  const refresh = useCallback(async () => {
    setNotes(await listNotes(db))
  }, [db])

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
    const listed = await listNotes(db)
    setNotes(listed)
    const found = listed.find((item) => item.note.id === noteId)
    setSession(found ? { noteId, version: found.version } : null)
  }

  function startNote() {
    setSession({ noteId: crypto.randomUUID(), version: null })
  }

  return (
    <div className="notes-home">
      {session && deviceId ? (
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
      ) : (
        <button type="button" onClick={startNote} disabled={deviceId == null}>
          Take a note
        </button>
      )}
      <ul className="note-list" aria-label="Notes">
        {notes.map(({ note, version }) => {
          const name = [version.title, version.body].filter((part) => part != null && part !== '').join(', ')
          return (
            <li key={note.id}>
              <button
                type="button"
                data-note-id={note.id}
                aria-label={name || 'Untitled'}
                onClick={() => void openNote(note.id)}
              >
                <span className="note-title">{version.title ?? 'Untitled'}</span>
                {version.body ? <span className="note-body">{version.body}</span> : null}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
