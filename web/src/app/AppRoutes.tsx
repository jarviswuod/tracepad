import { useEffect, useState } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import type { TracepadDatabase } from '../data/db'
import type { BoardSort } from '../data/notes'
import type { Uuid } from '../domain/types'
import type { BoardLayout } from '../features/board/Board'
import { boardReturnPath } from '../features/board/viewPath'
import { NotesHome } from '../features/editor/NotesHome'
import { HistoryPage } from '../features/history/History'

type BoardSettings = {
  sort: BoardSort
  layout: BoardLayout
  onSort: (sort: BoardSort) => void
  onLayout: (layout: BoardLayout) => void
}

type BoardLocationState = { openNoteId?: Uuid } | null
type HistoryLocationState = { fromHistory?: boolean; boardPath?: string } | null

/** Notes at `/home`, the other views on their own paths, history at `/history/<note>/<version>`. */
export function AppRoutes({ db }: { db: TracepadDatabase }) {
  // Sort and layout stay here, off the URL, so history keeps the board's layout.
  const [sort, setSort] = useState<BoardSort>('edited')
  const [layout, setLayout] = useState<BoardLayout>('grid')
  const settings: BoardSettings = { sort, layout, onSort: setSort, onLayout: setLayout }

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/home" replace />} />
      <Route element={<BoardRoute db={db} settings={settings} />}>
        <Route path="/home" element={<Outlet />} />
        <Route path="/archive" element={<Outlet />} />
        <Route path="/trash" element={<Outlet />} />
        <Route path="/reminders" element={<Outlet />} />
        <Route path="/label/:name" element={<Outlet />} />
      </Route>
      <Route path="/history/:noteId/:versionId?" element={<HistoryRoute db={db} settings={settings} />} />
    </Routes>
  )
}

function BoardRoute({ db, settings }: { db: TracepadDatabase; settings: BoardSettings }) {
  const navigate = useNavigate()
  const location = useLocation()
  const openNoteId = (location.state as BoardLocationState)?.openNoteId ?? null

  useEffect(() => {
    if (openNoteId == null) return
    // A refresh keeps this history state, and the board's arrival ref starts over,
    // so the note would open again. Replace the entry once the id has been used.
    // The timer lets strict mode finish replaying the effect before the entry changes.
    const path = `${location.pathname}${location.search}${location.hash}`
    const timer = window.setTimeout(() => {
      navigate(path, { replace: true, state: null })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [openNoteId, location.pathname, location.search, location.hash, navigate])

  return (
    <>
      <NotesHome
        db={db}
        sort={settings.sort}
        layout={settings.layout}
        openNoteId={openNoteId}
        onSort={settings.onSort}
        onLayout={settings.onLayout}
        onHistory={(noteId) => navigate(`/history/${noteId}`, { state: { boardPath: location.pathname } })}
      />
      <Outlet />
    </>
  )
}

function HistoryRoute({ db, settings }: { db: TracepadDatabase; settings: BoardSettings }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { noteId, versionId } = useParams()
  if (!noteId) return null

  const base = `/history/${noteId}`
  const state = (location.state ?? null) as HistoryLocationState
  const fromHistory = state?.fromHistory === true
  const boardPath = boardReturnPath(state?.boardPath)

  return (
    <HistoryPage
      key={noteId}
      db={db}
      noteId={noteId}
      versionId={versionId ?? null}
      layout={settings.layout}
      onLayout={settings.onLayout}
      onOpenVersion={(id) => {
        const next = { fromHistory: true, boardPath: state?.boardPath }
        // Switching from one open version to another keeps a single entry, so back returns to the list.
        if (versionId != null) navigate(`${base}/${id}`, { replace: true, state: location.state })
        else navigate(`${base}/${id}`, { state: next })
      }}
      onCloseVersion={() => {
        if (fromHistory) navigate(-1)
        else navigate(base, { replace: true, state: state?.boardPath ? { boardPath: state.boardPath } : null })
      }}
      onBackToNote={() => navigate(boardPath, { state: { openNoteId: noteId } })}
    />
  )
}
