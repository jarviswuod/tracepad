import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Label, NoteKind, Uuid } from "../../domain/types";
import { IconButton } from "../../ui/icons";
import { NOTE_COLORS } from "./colors";
import { formatEditedDate } from "./editedDate";
import "./labels.css";

type Panel = "closed" | "menu" | "reminder" | "labels" | "colors";

type NotePinButtonProps = {
  isPinned: boolean;
  onPin: (pinned: boolean) => void;
};

/** Pin or Unpin on the title's line. The word is the accessible name. */
export function NotePinButton({ isPinned, onPin }: NotePinButtonProps) {
  const label = isPinned ? "Unpin" : "Pin";
  return (
    <IconButton
      className="editor-pin"
      label={label}
      icon={isPinned ? "pinFilled" : "pin"}
      onClick={() => onPin(!isPinned)}
    />
  );
}

type NoteContentEndProps = {
  labels: Label[];
  activeLabelIds: Uuid[];
  updatedAt: string;
};

/** Label chips and the edited date, after the body. Labels stay in the shared order. */
export function NoteContentEnd({
  labels,
  activeLabelIds,
  updatedAt,
}: NoteContentEndProps) {
  const chips = labels.filter((label) => activeLabelIds.includes(label.id));
  return (
    <div className="note-content-end">
      <div className="note-open-chips">
        {chips.map((label) => (
          <span key={label.id} className="note-open-chip">
            {label.name}
          </span>
        ))}
      </div>
      <time className="note-edited" dateTime={updatedAt}>
        {formatEditedDate(updatedAt)}
      </time>
    </div>
  );
}

type NoteToolbarBase = {
  isArchived: boolean;
  onArchive: (archived: boolean) => void;
  /** The reminder form. Called with a close function when Remind me is open. */
  renderReminder: (close: () => void) => ReactNode;
};

type NoteToolbarProps = NoteToolbarBase &
  (
    | { scope: "create" }
    | {
        scope: "note";
        /** The card row has its own Remind me, so More leaves that item out. */
        includeRemind?: boolean;
        trashed: boolean;
        color: string | null;
        labels: Label[];
        activeLabelIds: Uuid[];
        onColor: (color: string | null) => void;
        onToggleLabel: (labelId: Uuid, on: boolean) => void;
        onAddLabel: (name: string) => void;
        onHistory: () => void;
        onDelete: () => void;
        onRestore: () => void;
        onDeleteForever: () => void;
        /** Open note only. The card's More leaves this out. */
        onChecklist?: () => void;
        checklistKind?: NoteKind;
      }
  );

/**
 * More, and Close from the modal. Remind me and Archive live in More.
 * An open note also lists Show checkboxes, or Hide checkboxes on a checklist.
 * On Take a note, More lists only Remind me and Archive. A trashed note has
 * Restore and Delete forever, and no More.
 */
export function NoteToolbar(props: NoteToolbarProps) {
  const { isArchived, onArchive, renderReminder } = props;
  const [panel, setPanel] = useState<Panel>("closed");
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const open = panel !== "closed";

  useEffect(() => {
    if (panel !== "labels") return;
    labelInputRef.current?.focus();
  }, [panel]);

  useLayoutEffect(() => {
    if (!open) return;
    const popup = rootRef.current?.querySelector<HTMLElement>(".note-more-panel");
    if (!popup) return;
    popup.style.maxHeight = "";
    popup.style.overflowY = "";
    const box = popup.getBoundingClientRect();
    if (box.top < 8) {
      popup.style.maxHeight = `${Math.max(80, box.bottom - 8)}px`;
      popup.style.overflowY = "auto";
    }
  }, [open, panel]);

  useEffect(() => {
    if (!open) return;

    function shut(event: Event) {
      const target = event.target;
      if (!(target instanceof Node) || rootRef.current?.contains(target))
        return;
      setPanel("closed");
      setQuery("");
      const dialog = rootRef.current?.closest('[role="dialog"]');
      if (!dialog?.contains(target)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setPanel("closed");
      setQuery("");
    }

    document.addEventListener("pointerdown", shut, true);
    document.addEventListener("mousedown", shut, true);
    document.addEventListener("click", shut, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", shut, true);
      document.removeEventListener("mousedown", shut, true);
      document.removeEventListener("click", shut, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  if (props.scope === "note" && props.trashed) {
    return (
      <>
        <IconButton label="Restore" icon="restore" onClick={props.onRestore} />
        <IconButton
          label="Delete forever"
          icon="delete"
          onClick={props.onDeleteForever}
        />
      </>
    );
  }

  const note = props.scope === "note" ? props : null;
  const showRemind = props.scope === "create" || props.includeRemind !== false;
  const trimmed = query.trim();
  const needle = trimmed.toLowerCase();
  const filtered =
    note == null
      ? []
      : needle === ""
        ? note.labels
        : note.labels.filter((label) =>
            label.name.toLowerCase().includes(needle),
          );
  const showCreate = note != null && needle !== "" && filtered.length === 0;

  function toggleMore() {
    setQuery("");
    setPanel((current) => (current === "closed" ? "menu" : "closed"));
  }

  function closePanel() {
    setPanel("closed");
    setQuery("");
  }

  return (
    <div className="note-more" ref={rootRef}>
      <IconButton
        label="More"
        icon="more"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={toggleMore}
      />
      {panel === "menu" ? (
        <div className="note-more-panel" role="menu" aria-label="More">
          {showRemind ? (
            <IconButton
              role="menuitem"
              className="note-menu-item"
              label="Remind me"
              icon="remind"
              onClick={() => setPanel("reminder")}
            />
          ) : null}
          <IconButton
            role="menuitem"
            className="note-menu-item"
            label={isArchived ? "Unarchive" : "Archive"}
            icon={isArchived ? "unarchive" : "archive"}
            onClick={() => {
              closePanel();
              onArchive(!isArchived);
            }}
          />
          {props.scope === "note" ? (
            <>
              <IconButton
                role="menuitem"
                className="note-menu-item"
                label="Change labels"
                icon="labels"
                onClick={() => setPanel("labels")}
              />
              <IconButton
                role="menuitem"
                className="note-menu-item"
                label="Colors"
                icon="colors"
                onClick={() => setPanel("colors")}
              />
              {props.onChecklist ? (
                <IconButton
                  role="menuitem"
                  className="note-menu-item"
                  label={
                    props.checklistKind === "checklist"
                      ? "Hide checkboxes"
                      : "Show checkboxes"
                  }
                  icon={
                    props.checklistKind === "checklist"
                      ? "checklistOff"
                      : "checklistOn"
                  }
                  onClick={() => {
                    closePanel();
                    props.onChecklist?.();
                  }}
                />
              ) : null}
              <IconButton
                role="menuitem"
                className="note-menu-item"
                label="Version history"
                icon="history"
                onClick={() => {
                  closePanel();
                  props.onHistory();
                }}
              />
              <IconButton
                role="menuitem"
                className="note-menu-item"
                label="Delete note"
                icon="delete"
                onClick={() => {
                  closePanel();
                  props.onDelete();
                }}
              />
            </>
          ) : null}
        </div>
      ) : null}
      {panel === "reminder" ? (
        <div className="note-more-panel note-reminder-panel">
          {renderReminder(closePanel)}
        </div>
      ) : null}
      {note && panel === "labels" ? (
        <div className="note-more-panel" role="group" aria-label="Label note">
          <p className="note-panel-heading">Label note</p>
          <input
            ref={labelInputRef}
            className="note-label-field"
            aria-label="Enter label name"
            placeholder="Enter label name"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <ul className="note-label-scroll">
            {filtered.map((label) => (
              <li key={label.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={note.activeLabelIds.includes(label.id)}
                    onChange={(event) =>
                      note.onToggleLabel(label.id, event.target.checked)
                    }
                  />
                  {label.name}
                </label>
              </li>
            ))}
          </ul>
          {showCreate ? (
            <button
              type="button"
              className="note-create-label"
              onClick={() => {
                setQuery("");
                note.onAddLabel(trimmed);
              }}
            >
              {`Create "${trimmed}"`}
            </button>
          ) : null}
        </div>
      ) : null}
      {note && panel === "colors" ? (
        <div
          className="note-more-panel note-color-panel"
          role="group"
          aria-label="Colors"
        >
          <div className="color-choices">
            {NOTE_COLORS.map((swatch) => (
              <button
                key={swatch.name}
                type="button"
                className="color-swatch"
                title={swatch.name}
                aria-label={`${swatch.name} color`}
                aria-pressed={note.color === swatch.value}
                style={{ backgroundColor: swatch.value ?? "#ffffff" }}
                onClick={() => note.onColor(swatch.value)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
