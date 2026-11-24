import { useState } from 'react'
import { Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import type { TracepadDatabase } from '../data/db'
import type { BoardSort, BoardView } from '../data/notes'
import type { Uuid } from '../domain/types'
import type { BoardLayout } from '../features/board/Board'
import { NotesHome } from '../features/editor/NotesHome'
import { HistoryPage } from '../features/history/History'

type BoardSettings = {
  view: BoardView
  sort: BoardSort
  layout: BoardLayout
  onView: (view: BoardView) => void
  onSort: (sort: BoardSort) => void
  onLayout: (layout: BoardLayout) => void
}

type BoardLocationState = { openNoteId?: Uuid } | null
type HistoryLocationState = { fromHistory?: boolean } | null

/** The board at `/`, a note's history at `/history/<note>`, an old version at `/history/<note>/<version>`. */
export function AppRoutes({ db }: { db: TracepadDatabase }) {
  // Board settings live here so history opens in the board's layout and returns to the same view.
  const [view, setView] = useState<BoardView>({ kind: 'notes' })
  const [sort, setSort] = useState<BoardSort>('edited')
  const [layout, setLayout] = useState<BoardLayout>('grid')
  const settings: BoardSettings = {
    view,
    sort,
    layout,
    onView: setView,
    onSort: setSort,
    onLayout: setLayout,
  }

  return (
    <Routes>
      <Route path="/" element={<BoardRoute db={db} settings={settings} />} />
      <Route path="/history/:noteId/:versionId?" element={<HistoryRoute db={db} settings={settings} />} />
    </Routes>
  )
}

function BoardRoute({ db, settings }: { db: TracepadDatabase; settings: BoardSettings }) {
  const navigate = useNavigate()
  const location = useLocation()
  const openNoteId = (location.state as BoardLocationState)?.openNoteId ?? null

  return (
    <NotesHome
      db={db}
      {...settings}
      openNoteId={openNoteId}
      onHistory={(noteId) => navigate(`/history/${noteId}`)}
    />
  )
}

function HistoryRoute({ db, settings }: { db: TracepadDatabase; settings: BoardSettings }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { noteId, versionId } = useParams()
  if (!noteId) return null

  const base = `/history/${noteId}`
  const fromHistory = (location.state as HistoryLocationState)?.fromHistory === true

  return (
    <HistoryPage
      key={noteId}
      db={db}
      noteId={noteId}
      versionId={versionId ?? null}
      layout={settings.layout}
      onLayout={settings.onLayout}
      onView={(next) => {
        settings.onView(next)
        navigate('/')
      }}
      onOpenVersion={(id) => {
        // Switching from one open version to another keeps a single entry, so back returns to the list.
        if (versionId != null) navigate(`${base}/${id}`, { replace: true, state: location.state })
        else navigate(`${base}/${id}`, { state: { fromHistory: true } })
      }}
      onCloseVersion={() => {
        if (fromHistory) navigate(-1)
        else navigate(base, { replace: true })
      }}
      onBackToNote={() => navigate('/', { state: { openNoteId: noteId } })}
    />
  )
}
