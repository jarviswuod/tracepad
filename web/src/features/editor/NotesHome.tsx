import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
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
  listSearchSources,
  setArchived,
  setNoteColor,
  setPinned,
  type BoardCard,
  type BoardSort,
  type BoardView,
} from '../../data/notes'
import { deleteNoteForever, emptyTrash, moveToTrash, restoreFromTrash } from '../../data/trash'
import type { SearchOptions } from '../../domain/search'
import type { Label, NoteVersion, Uuid } from '../../domain/types'
import { NoteModal } from '../../ui/NoteModal'
import { Board, type BoardLayout } from '../board/Board'
import { labelPath, pathsMatch, viewFromPath } from '../board/viewPath'
import { searchBoardCards } from '../search/filterBoard'
import { readSearchQuery } from '../search/searchUrl'
import { ConfirmDialog, UndoSnackbar, useUndoWindow } from '../trash/TrashUi'
import { NoteContentEnd, NotePinButton, NoteToolbar } from '../labels/NoteMeta'
import { ReminderControl } from '../reminders/ReminderControl'
import { Editor, type EditorHandle } from './Editor'
import './editor.css'

type PendingDelete = { kind: 'note'; noteId: Uuid } | { kind: 'all' }

function searchOptionsFor(view: BoardView, query: string, includeArchived: boolean): SearchOptions {
  if (view.kind === 'archive') return { query, includeArchived, labelId: null, page: 'archive' }
  if (view.kind === 'trash') return { query, includeArchived, labelId: null, page: 'trash' }
  if (view.kind === 'label') return { query, includeArchived, labelId: view.labelId, page: 'label' }
  return { query, includeArchived, labelId: null, page: 'home' }
}

type Session = {
  noteId: Uuid
  /** Null for a new note from "Take a note", which stays inline. A saved note opens in a modal. */
  version: NoteVersion | null
  color: string | null
  isPinned: boolean
  isArchived: boolean
  isTrashed: boolean
  updatedAt: string
}

type NotesHomeProps = {
  db: TracepadDatabase
  sort: BoardSort
  layout: BoardLayout
  /** Open this note in the editor on arrival, as "Back to note" from history does. */
  openNoteId: Uuid | null
  onSort: (sort: BoardSort) => void
  onLayout: (layout: BoardLayout) => void
  onHistory: (noteId: Uuid) => void
}

export function NotesHome({ db, sort, layout, openNoteId, onSort, onLayout, onHistory }: NotesHomeProps) {
  const [deviceId, setDeviceId] = useState<Uuid | null>(null)
  const [cards, setCards] = useState<BoardCard[]>([])
  const [sources, setSources] = useState<BoardCard[]>([])
  const [labels, setLabels] = useState<Label[]>([])
  const [activeLabelIds, setActiveLabelIds] = useState<Uuid[]>([])
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [undoId, setUndoId] = useState<Uuid | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const editorRef = useRef<EditorHandle>(null)
  const openIdRef = useRef<Uuid | null>(null)
  const pathRef = useRef(location.pathname)
  const sortRef = useRef(sort)
  pathRef.current = location.pathname
  sortRef.current = sort
  const view = viewFromPath(location.pathname, labels) ?? { kind: 'notes' as const }
  const { text: searchQuery, includeArchived } = readSearchQuery(location.search)
  const request = useRef(0)
  const arrivalId = useRef<Uuid | null>(null)
  const trashing = useRef(false)
  const expireUndo = useCallback(() => setUndoId(null), [])
  useUndoWindow(undoId, expireUndo)

  const refresh = useCallback(async () => {
    const ticket = ++request.current
    const openId = openIdRef.current
    const path = pathRef.current
    try {
      const nextLabels = await listLabels(db)
      const nextView = viewFromPath(path, nextLabels) ?? { kind: 'notes' as const }
      const [nextCards, nextActive, listedOpen, nextSources] = await Promise.all([
        listBoard(db, { view: nextView, sort: sortRef.current }),
        openId ? listActiveLabelIds(db, openId) : Promise.resolve([] as Uuid[]),
        openId ? getListedNote(db, openId) : Promise.resolve(null),
        listSearchSources(db, sortRef.current),
      ])
      if (ticket !== request.current || pathRef.current !== path) return
      setCards(nextCards)
      setSources(nextSources)
      setLabels(nextLabels)
      setActiveLabelIds(nextActive)
      if (listedOpen) {
        setSession((current) => {
          if (!current || current.noteId !== listedOpen.note.id) return current
          if (current.updatedAt === listedOpen.note.updatedAt) return current
          return { ...current, updatedAt: listedOpen.note.updatedAt }
        })
      }
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
  }, [refresh, location.pathname, sort])

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
            updatedAt: listed.note.updatedAt,
          }
        : null,
    )
    await refresh()
  }

  useEffect(() => {
    if (openNoteId == null) {
      arrivalId.current = null
      return
    }
    if (arrivalId.current === openNoteId) return
    arrivalId.current = openNoteId
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
      updatedAt: new Date().toISOString(),
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
    if (!renamed) return false
    const open = view.kind === 'label' && view.labelId === labelId
    const nextPath = labelPath(renamed.name)
    if (open && !pathsMatch(location.pathname, nextPath)) {
      setLabels((current) => current.map((label) => (label.id === labelId ? renamed : label)))
      navigate(`${nextPath}${location.search}`, { replace: true })
      return true
    }
    await refresh()
    return true
  }

  async function deleteFromSidebar(labelId: Uuid) {
    const open = view.kind === 'label' && view.labelId === labelId
    await deleteLabel(db, { labelId, deviceId: await currentDeviceId() })
    if (open) {
      navigate(`/home${location.search}`)
      return
    }
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
      if (openIdRef.current === action.noteId) {
        try {
          await editorRef.current?.leave()
        } finally {
          openIdRef.current = null
          setSession(null)
        }
      }
      setUndoId((current) => (current === action.noteId ? null : current))
      await deleteNoteForever(db, { noteId: action.noteId })
    } else {
      setUndoId(null)
      await emptyTrash(db)
    }
    await refresh()
  }

  const searching = searchQuery.trim() !== ''
  // Reminders already lists its notes, including archived ones. Search those.
  const shownCards = !searching
    ? cards
    : view.kind === 'reminders'
      ? searchBoardCards(cards, { query: searchQuery, includeArchived: true, labelId: null })
      : searchBoardCards(sources, searchOptionsFor(view, searchQuery, includeArchived))

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
        showFooter={session.version == null}
        expandBody={session.version != null}
        titleAside={
          session.version ? (
            <NotePinButton isPinned={session.isPinned} onPin={(pinned) => void changePin(pinned)} />
          ) : null
        }
        actions={
          session.version ? (
            <NoteContentEnd labels={labels} activeLabelIds={activeLabelIds} updatedAt={session.updatedAt} />
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
  const showArchivedBar =
    searching &&
    includeArchived &&
    opened != null &&
    opened.isArchived &&
    (view.kind === 'notes' || view.kind === 'label')

  return (
    <>
      <Board
        cards={shownCards}
        labels={labels}
        view={view}
        sort={sort}
        layout={layout}
        editor={opened ? null : editor}
        openNoteId={opened?.noteId ?? null}
        createDisabled={deviceId == null}
        ready={ready}
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
        searching={searching}
      />
      {opened && editor ? (
        <NoteModal
          label="Note"
          color={opened.color}
          archivedBar={showArchivedBar}
          onClose={() => void editorRef.current?.close()}
          returnFocusTo={() => document.querySelector<HTMLElement>(`.note-card[data-note-id="${opened.noteId}"]`)}
          toolbar={
            <>
              {deviceId && !opened.isTrashed ? (
                <ReminderControl
                  db={db}
                  noteId={opened.noteId}
                  deviceId={deviceId}
                  onChanged={() => void refresh()}
                />
              ) : null}
              <NoteToolbar
                trashed={opened.isTrashed}
                isArchived={opened.isArchived}
                color={opened.color}
                labels={labels}
                activeLabelIds={activeLabelIds}
                onArchive={(archived) => void changeArchive(archived)}
                onColor={(color) => void changeColor(color)}
                onToggleLabel={(labelId, on) => void toggleLabel(labelId, on)}
                onAddLabel={(name) => void addLabelByName(name)}
                onHistory={() => {
                  const noteId = opened.noteId
                  void editorRef.current?.leave().then(
                    () => onHistory(noteId),
                    () => undefined,
                  )
                }}
                onDelete={() => void trashSession()}
                onRestore={() => void restoreOpenNote()}
                onDeleteForever={() => setPendingDelete({ kind: 'note', noteId: opened.noteId })}
              />
            </>
          }
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
