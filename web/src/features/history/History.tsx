import { useEffect, useState } from 'react'
import type { TracepadDatabase } from '../../data/db'
import { listNoteHistory } from '../../data/history'
import { listLabels } from '../../data/labels'
import { ensureDeviceId, getListedNote, type BoardView, type ListedNote } from '../../data/notes'
import type { HistoryEvent, Label, NoteVersion, Uuid } from '../../domain/types'
import { NoteModal } from '../../ui/NoteModal'
import { BoardShell, LayoutToggle, NoteCard, cardHeading, type BoardLayout } from '../board/Board'
import '../editor/editor.css'
import { compareVersions, orderVersions, versionText, type DiffPiece } from './compare'
import './history.css'
import {
  deviceLabel,
  formatHistoryTime,
  historyEventLabel,
  mergeTimeline,
  versionPreview,
  type HistoryOrder,
} from './timeline'

type HistoryPageProps = {
  db: TracepadDatabase
  noteId: Uuid
  /** The old version shown at the top, or null for the note's title. */
  versionId: Uuid | null
  layout: BoardLayout
  onLayout: (layout: BoardLayout) => void
  onView: (view: BoardView) => void
  onOpenVersion: (versionId: Uuid) => void
  onCloseVersion: () => void
  onBackToNote: () => void
}

type Loaded = {
  localDeviceId: Uuid
  labels: Label[]
  listed: ListedNote | null
  versions: NoteVersion[]
  events: HistoryEvent[]
}

export function HistoryPage({
  db,
  noteId,
  versionId,
  layout,
  onLayout,
  onView,
  onOpenVersion,
  onCloseVersion,
  onBackToNote,
}: HistoryPageProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState(false)
  const [order, setOrder] = useState<HistoryOrder>('newest')
  const [selected, setSelected] = useState<Uuid[]>([])
  const [comparing, setComparing] = useState<{ older: NoteVersion; newer: NoteVersion } | null>(null)

  useEffect(() => {
    let active = true
    void Promise.all([ensureDeviceId(db), listLabels(db), getListedNote(db, noteId), listNoteHistory(db, noteId)])
      .then(([localDeviceId, labels, listed, history]) => {
        if (!active) return
        setLoaded({ localDeviceId, labels, listed, versions: history.versions, events: history.events })
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [db, noteId])

  const backToNote = (
    <button type="button" className="history-action history-back" onClick={onBackToNote}>
      Back to note
    </button>
  )

  if (failed || loaded == null) {
    return (
      <BoardShell labels={[]} view={null} onView={onView}>
        <div className="history">
          <p>{failed ? "Couldn't load history" : 'Loading history'}</p>
          {failed ? backToNote : null}
        </div>
      </BoardShell>
    )
  }

  const { localDeviceId, labels, listed, versions, events } = loaded
  const entries = mergeTimeline(versions, events, order)
  const opened = versionId == null ? null : (versions.find((version) => version.id === versionId) ?? null)

  function toggle(id: Uuid) {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id)
      if (current.length >= 2) return current
      return [...current, id]
    })
  }

  function compare() {
    const picked = versions.filter((version) => selected.includes(version.id))
    if (picked.length !== 2) return
    setComparing(orderVersions(picked[0], picked[1]))
  }

  if (comparing) {
    return (
      <BoardShell labels={labels} view={null} onView={onView}>
        <CompareView older={comparing.older} newer={comparing.newer} onBack={() => setComparing(null)} />
      </BoardShell>
    )
  }

  return (
    <BoardShell labels={labels} view={null} onView={onView}>
      <h2 className="take-note history-title">
        {cardHeading(listed?.version.title ?? null, listed?.version.body ?? null)}
      </h2>
      <div className="board-toolbar">
        {backToNote}
        <label htmlFor="history-sort">
          Sort
          <select
            id="history-sort"
            value={order}
            onChange={(event) => {
              const value = event.target.value
              if (value === 'newest' || value === 'oldest') setOrder(value)
            }}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </label>
        <LayoutToggle layout={layout} onLayout={onLayout} />
        <button
          type="button"
          className="history-action"
          disabled={selected.length !== 2}
          onClick={compare}
        >
          Compare
        </button>
      </div>
      {entries.length === 0 || listed == null ? (
        <p className="empty-state">No history yet</p>
      ) : (
        <ul className="board-cards history-cards" data-layout={layout} aria-label="History">
          {entries.map((entry) =>
            entry.kind === 'version' ? (
              <NoteCard
                key={entry.id}
                card={{ note: listed.note, version: entry.version, daysLeft: null }}
                open={entry.id === opened?.id}
                onOpen={() => onOpenVersion(entry.id)}
              >
                <div className="history-meta">
                  <time dateTime={entry.at}>{formatHistoryTime(entry.at)}</time>
                  <span>{deviceLabel(entry.deviceId, localDeviceId)}</span>
                  <label>
                    <input
                      type="checkbox"
                      aria-label={`Select ${versionPreview(entry.version)}`}
                      checked={selected.includes(entry.id)}
                      disabled={!selected.includes(entry.id) && selected.length >= 2}
                      onChange={() => toggle(entry.id)}
                    />{' '}
                    Select
                  </label>
                </div>
              </NoteCard>
            ) : (
              <li key={entry.id} className="history-event">
                <span className="history-kind">{historyEventLabel(entry.event.type)}</span>
                <time dateTime={entry.at}>{formatHistoryTime(entry.at)}</time>
                <span>{deviceLabel(entry.deviceId, localDeviceId)}</span>
              </li>
            ),
          )}
        </ul>
      )}
      {opened ? (
        <NoteModal label="Version" color={listed?.note.color ?? null} onClose={onCloseVersion}>
          <OldVersion version={opened} onBack={onCloseVersion} />
        </NoteModal>
      ) : null}
    </BoardShell>
  )
}

function OldVersion({ version, onBack }: { version: NoteVersion; onBack: () => void }) {
  const { title, body } = versionText(version)
  return (
    <article className="editor history-version" aria-label="Old version">
      <p className="history-version-title">{title}</p>
      <p className="history-version-body">{body}</p>
      <div className="editor-actions">
        <button type="button" onClick={onBack}>
          Back to history
        </button>
      </div>
    </article>
  )
}

function CompareView({
  older,
  newer,
  onBack,
}: {
  older: NoteVersion
  newer: NoteVersion
  onBack: () => void
}) {
  const diff = compareVersions(versionText(older), versionText(newer))
  return (
    <div className="history">
      <h2>Compare</h2>
      <div className="compare-sides">
        <section aria-label="Older version" className="compare-pane">
          <h3>Older</h3>
          <p className="compare-title">
            <DiffPieces pieces={diff.title.older} />
          </p>
          <p className="compare-body">
            <DiffPieces pieces={diff.body.older} />
          </p>
        </section>
        <section aria-label="Newer version" className="compare-pane">
          <h3>Newer</h3>
          <p className="compare-title">
            <DiffPieces pieces={diff.title.newer} />
          </p>
          <p className="compare-body">
            <DiffPieces pieces={diff.body.newer} />
          </p>
        </section>
      </div>
      <button type="button" onClick={onBack}>
        Back to history
      </button>
    </div>
  )
}

function DiffPieces({ pieces }: { pieces: DiffPiece[] }) {
  return pieces.map((piece, index) =>
    piece.mark === 'same' ? (
      <span key={index}>{piece.text}</span>
    ) : (
      <span key={index} className={piece.mark === 'added' ? 'diff-added' : 'diff-removed'}>
        {piece.text}
      </span>
    ),
  )
}
