import { useCallback, useEffect, useRef, useState } from 'react'
import type { TracepadDatabase } from '../../data/db'
import {
  addLabelToNote,
  createLabel,
  deleteLabel,
  listActiveLabelIds,
  listLabels,
  removeLabelFromNote,
  renameLabel,
} from '../../data/labels'
import {
  ensureDeviceId,
  getListedNote,
  listBoard,
  setArchived,
  setNoteColor,
  setPinned,
  type BoardCard,
  type BoardSort,
  type BoardView,
} from '../../data/notes'
import { deleteNoteForever, emptyTrash, moveToTrash, restoreFromTrash } from '../../data/trash'
import type { Label, NoteVersion, Uuid } from '../../domain/types'
import { NoteModal } from '../../ui/NoteModal'
import { Board, type BoardLayout } from '../board/Board'
import { ConfirmDialog, UndoSnackbar, useUndoWindow } from '../trash/TrashUi'
import { NoteMeta } from '../labels/NoteMeta'
import { Editor, type EditorHandle } from './Editor'
import './editor.css'

type PendingDelete = { kind: 'note'; noteId: Uuid } | { kind: 'all' }

type Session = {
  noteId: Uuid
  /** Null for a new note from "Take a note", which stays inline. A saved note opens in a modal. */
  version: NoteVersion | null
  color: string | null
  isPinned: boolean
  isArchived: boolean
  isTrashed: boolean
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
  const [activeLabelIds, setActiveLabelIds] = useState<Uuid[]>([])
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [undoId, setUndoId] = useState<Uuid | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const editorRef = useRef<EditorHandle>(null)
  const openIdRef = useRef<Uuid | null>(null)
  const viewRef = useRef(view)
  const sortRef = useRef(sort)
  viewRef.current = view
  sortRef.current = sort
  const request = useRef(0)
  const openedOnArrival = useRef(false)
  const trashing = useRef(false)
  const expireUndo = useCallback(() => setUndoId(null), [])
  useUndoWindow(undoId, expireUndo)

  const refresh = useCallback(async () => {
    const ticket = ++request.current
    const openId = openIdRef.current
    try {
      const [nextCards, nextLabels, nextActive] = await Promise.all([
        listBoard(db, { view: viewRef.current, sort: sortRef.current }),
        listLabels(db),
        openId ? listActiveLabelIds(db, openId) : Promise.resolve([]),
      ])
      if (ticket !== request.current) return
      setCards(nextCards)
      setLabels(nextLabels)
      setActiveLabelIds(nextActive)
      setReady(true)
    } catch {
      // A view change can still be reading when the screen unmounts and the database closes.
      if (ticket !== request.current) return
    }
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
    setCards([])
    setReady(false)
    void refresh()
  }, [refresh, view, sort])

  async function openNote(noteId: Uuid) {
    await editorRef.current?.leave()
    const listed = await getListedNote(db, noteId)
    openIdRef.current = listed ? noteId : null
    setSession(
      listed
        ? {
            noteId,
            version: listed.version,
            color: listed.note.color,
            isPinned: listed.note.isPinned,
            isArchived: listed.note.isArchived,
            isTrashed: listed.note.trashedAt != null,
          }
        : null,
    )
    await refresh()
  }

  useEffect(() => {
    if (openNoteId == null || openedOnArrival.current) return
    openedOnArrival.current = true
    void openNote(openNoteId)
  })

  function startNote() {
    openIdRef.current = null
    setSession({
      noteId: crypto.randomUUID(),
      version: null,
      color: null,
      isPinned: false,
      isArchived: false,
      isTrashed: false,
    })
  }

  async function currentDeviceId(): Promise<Uuid> {
    if (deviceId) return deviceId
    const id = await ensureDeviceId(db)
    setDeviceId(id)
    return id
  }

  async function changePin(pinned: boolean) {
    const current = session
    if (!current?.version) return
    const changed = await setPinned(db, { noteId: current.noteId, pinned, deviceId: await currentDeviceId() })
    if (!changed) return
    setSession((next) => (next?.noteId === current.noteId ? { ...next, isPinned: pinned } : next))
    await refresh()
  }

  async function changeArchive(archived: boolean) {
    const current = session
    if (!current?.version) return
    const changed = await setArchived(db, {
      noteId: current.noteId,
      archived,
      deviceId: await currentDeviceId(),
    })
    if (!changed) return
    setSession((next) => (next?.noteId === current.noteId ? { ...next, isArchived: archived } : next))
    await refresh()
  }

  async function changeColor(color: string | null) {
    const current = session
    if (!current?.version) return
    const changed = await setNoteColor(db, { noteId: current.noteId, color })
    if (!changed) return
    setSession((next) => (next?.noteId === current.noteId ? { ...next, color } : next))
    await refresh()
  }

  async function toggleLabel(labelId: Uuid, on: boolean) {
    const current = session
    if (!current?.version) return
    const device = await currentDeviceId()
    if (on) await addLabelToNote(db, { noteId: current.noteId, labelId, deviceId: device })
    else await removeLabelFromNote(db, { noteId: current.noteId, labelId, deviceId: device })
    await refresh()
  }

  async function addLabelByName(name: string) {
    const current = session
    if (!current?.version) return
    const trimmed = name.trim()
    if (trimmed === '') return
    const existing = labels.find((label) => label.name.toLowerCase() === trimmed.toLowerCase())
    const label = existing ?? (await createLabel(db, { name: trimmed }))
    if (!label) return
    await addLabelToNote(db, {
      noteId: current.noteId,
      labelId: label.id,
      deviceId: await currentDeviceId(),
    })
    await refresh()
  }

  async function createFromSidebar(name: string): Promise<boolean> {
    const created = await createLabel(db, { name })
    await refresh()
    return created != null
  }

  async function renameFromSidebar(labelId: Uuid, name: string): Promise<boolean> {
    const renamed = await renameLabel(db, { labelId, name })
    await refresh()
    return renamed != null
  }

  async function deleteFromSidebar(labelId: Uuid) {
    await deleteLabel(db, { labelId, deviceId: await currentDeviceId() })
    await refresh()
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

  async function restoreOpenNote() {
    const noteId = session?.noteId
    if (noteId == null) return
    await restore(noteId)
    await editorRef.current?.close()
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

  const editor =
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
        trashed={session.isTrashed}
        onRestore={() => void restoreOpenNote()}
        actions={
          session.version ? (
            <NoteMeta
              isPinned={session.isPinned}
              isArchived={session.isArchived}
              color={session.color}
              labels={labels}
              activeLabelIds={activeLabelIds}
              onPin={(pinned) => void changePin(pinned)}
              onArchive={(archived) => void changeArchive(archived)}
              onColor={(color) => void changeColor(color)}
              onToggleLabel={(labelId, on) => void toggleLabel(labelId, on)}
              onAddLabel={(name) => void addLabelByName(name)}
            />
          ) : null
        }
        onLeft={() => {
          openIdRef.current = null
          setSession(null)
          void refresh()
        }}
      />
    ) : null
  const opened = session?.version != null ? session : null

  return (
    <>
      <Board
        cards={cards}
        labels={labels}
        view={view}
        sort={sort}
        layout={layout}
        editor={opened ? null : editor}
        openNoteId={opened?.noteId ?? null}
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
        onCreateLabel={createFromSidebar}
        onRenameLabel={renameFromSidebar}
        onDeleteLabel={(labelId) => void deleteFromSidebar(labelId)}
      />
      {opened && editor ? (
        <NoteModal
          label="Note"
          color={opened.color}
          onClose={() => void editorRef.current?.close()}
          returnFocusTo={() => document.querySelector<HTMLElement>(`.note-card[data-note-id="${opened.noteId}"]`)}
        >
          {editor}
        </NoteModal>
      ) : null}
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
