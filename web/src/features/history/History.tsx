import { useEffect, useState } from 'react'
import type { TracepadDatabase } from '../../data/db'
import { listNoteHistory } from '../../data/history'
import type { NoteVersion, Uuid } from '../../domain/types'
import { compareVersions, orderVersions, versionText, type DiffPiece } from './compare'
import './history.css'
import {
  deviceLabel,
  formatHistoryTime,
  historyEventLabel,
  mergeTimeline,
  versionPreview,
  type TimelineEntry,
} from './timeline'

type HistoryPanelProps = {
  db: TracepadDatabase
  noteId: Uuid
  localDeviceId: Uuid
  onBack: () => void
}

type View =
  | { name: 'timeline' }
  | { name: 'version'; version: NoteVersion }
  | { name: 'compare'; older: NoteVersion; newer: NoteVersion }

export function HistoryPanel({ db, noteId, localDeviceId, onBack }: HistoryPanelProps) {
  const [view, setView] = useState<View>({ name: 'timeline' })

  return (
    <>
      <div hidden={view.name !== 'timeline'}>
        <Timeline
          db={db}
          noteId={noteId}
          localDeviceId={localDeviceId}
          onBack={onBack}
          onOpen={(version) => setView({ name: 'version', version })}
          onCompare={(older, newer) => setView({ name: 'compare', older, newer })}
        />
      </div>
      {view.name === 'version' ? (
        <OldVersion version={view.version} onBack={() => setView({ name: 'timeline' })} />
      ) : null}
      {view.name === 'compare' ? (
        <CompareView older={view.older} newer={view.newer} onBack={() => setView({ name: 'timeline' })} />
      ) : null}
    </>
  )
}

function Timeline({
  db,
  noteId,
  localDeviceId,
  onBack,
  onOpen,
  onCompare,
}: HistoryPanelProps & {
  onOpen: (version: NoteVersion) => void
  onCompare: (older: NoteVersion, newer: NoteVersion) => void
}) {
  const [entries, setEntries] = useState<TimelineEntry[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [selected, setSelected] = useState<string[]>([])

  useEffect(() => {
    let active = true
    void listNoteHistory(db, noteId)
      .then((history) => {
        if (!active) return
        setEntries(mergeTimeline(history.versions, history.events))
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [db, noteId])

  if (failed) {
    return (
      <div className="history">
        <p>Couldn't load history</p>
        <button type="button" onClick={onBack}>
          Back to note
        </button>
      </div>
    )
  }
  if (entries == null) {
    return (
      <div className="history">
        <p>Loading history</p>
      </div>
    )
  }

  const loaded = entries

  function toggle(id: string) {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id)
      if (current.length >= 2) return current
      return [...current, id]
    })
  }

  function compare() {
    const versions = loaded
      .filter(
        (entry): entry is Extract<TimelineEntry, { kind: 'version' }> =>
          entry.kind === 'version' && selected.includes(entry.id),
      )
      .map((entry) => entry.version)
    if (versions.length !== 2) return
    const ordered = orderVersions(versions[0], versions[1])
    onCompare(ordered.older, ordered.newer)
  }

  return (
    <div className="history">
      <div className="history-toolbar">
        <h2>History</h2>
        <button type="button" onClick={onBack}>
          Back to note
        </button>
      </div>
      {loaded.length === 0 ? (
        <p>No history yet</p>
      ) : (
        <ol aria-label="History" className="history-list">
          {loaded.map((entry) => (
            <li key={entry.id} className="history-entry" data-kind={entry.kind}>
              <span className="history-kind">
                {entry.kind === 'version' ? 'Version' : historyEventLabel(entry.event.type)}
              </span>
              {entry.kind === 'version' ? (
                <span className="history-preview">{versionPreview(entry.version)}</span>
              ) : null}
              <time dateTime={entry.at} className="history-time">
                {formatHistoryTime(entry.at)}
              </time>
              <span className="history-device">{deviceLabel(entry.deviceId, localDeviceId)}</span>
              {entry.kind === 'version' ? (
                <VersionActions
                  preview={versionPreview(entry.version)}
                  checked={selected.includes(entry.id)}
                  disabled={!selected.includes(entry.id) && selected.length >= 2}
                  onOpen={() => onOpen(entry.version)}
                  onToggle={() => toggle(entry.id)}
                />
              ) : null}
            </li>
          ))}
        </ol>
      )}
      <button type="button" disabled={selected.length !== 2} onClick={compare}>
        Compare
      </button>
    </div>
  )
}

function VersionActions({
  preview,
  checked,
  disabled,
  onOpen,
  onToggle,
}: {
  preview: string
  checked: boolean
  disabled: boolean
  onOpen: () => void
  onToggle: () => void
}) {
  return (
    <>
      <button type="button" aria-label={`Open ${preview}`} onClick={onOpen}>
        Open
      </button>
      <label>
        <input
          type="checkbox"
          aria-label={`Select ${preview}`}
          checked={checked}
          disabled={disabled}
          onChange={onToggle}
        />{' '}
        Select
      </label>
    </>
  )
}

function OldVersion({ version, onBack }: { version: NoteVersion; onBack: () => void }) {
  const { title, body } = versionText(version)
  return (
    <article className="history history-readonly" aria-label="Old version">
      <p>Read-only</p>
      <input aria-label="Title" value={title} readOnly />
      <textarea aria-label="Body" value={body} readOnly />
      <button type="button" onClick={onBack}>
        Back to history
      </button>
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
