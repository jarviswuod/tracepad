import type { TracepadDatabase } from '../../data/db'
import type { BoardCard } from '../../data/notes'
import type { Label, Uuid } from '../../domain/types'
import { NotePinButton, NoteToolbar } from '../labels/NoteMeta'
import { ReminderControl } from '../reminders/ReminderControl'

type CardActionsProps = {
  card: BoardCard
  db: TracepadDatabase
  deviceId: Uuid
  labels: Label[]
  onPin: (pinned: boolean) => void
  onArchive: (archived: boolean) => void
  onColor: (color: string | null) => void
  onToggleLabel: (labelId: Uuid, on: boolean) => void
  onAddLabel: (name: string) => void
  onHistory: () => void
  onDelete: () => void
  onReminderChanged: () => void
}

/** Pin, Remind me, and More on a closed card. More has no Remind me of its own. */
export function CardActions({
  card,
  db,
  deviceId,
  labels,
  onPin,
  onArchive,
  onColor,
  onToggleLabel,
  onAddLabel,
  onHistory,
  onDelete,
  onReminderChanged,
}: CardActionsProps) {
  return (
    <>
      <NotePinButton isPinned={card.note.isPinned} onPin={onPin} />
      <ReminderControl db={db} noteId={card.note.id} deviceId={deviceId} onChanged={onReminderChanged} />
      <NoteToolbar
        scope="note"
        includeRemind={false}
        trashed={false}
        isArchived={card.note.isArchived}
        color={card.note.color}
        labels={labels}
        activeLabelIds={card.labels.map((label) => label.id)}
        onArchive={onArchive}
        onColor={onColor}
        onToggleLabel={onToggleLabel}
        onAddLabel={onAddLabel}
        onHistory={onHistory}
        onDelete={onDelete}
        onRestore={() => undefined}
        onDeleteForever={() => undefined}
        renderReminder={() => null}
      />
    </>
  )
}
