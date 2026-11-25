import { useState } from "react";
import type { Label, Uuid } from "../../domain/types";
import { SideLink } from "../../ui/SideLink";
import { EditLabelsDialog } from "./EditLabelsDialog";

type LabelSectionProps = {
  labels: Label[];
  currentLabelId: Uuid | null;
  onOpen: (labelId: Uuid) => void;
  onCreate?: (name: string) => Promise<boolean>;
  onRename?: (labelId: Uuid, name: string) => Promise<boolean>;
  onDelete?: (labelId: Uuid) => void;
};

/** Label names in the side list, then "Edit labels" when create, rename and delete are available. */
export function LabelSection({
  labels,
  currentLabelId,
  onOpen,
  onCreate,
  onRename,
  onDelete,
}: LabelSectionProps) {
  const [editing, setEditing] = useState(false);
  const tools =
    onCreate && onRename && onDelete ? { onCreate, onRename, onDelete } : null;

  return (
    <>
      <ul className="side-label-list" aria-label="Labels">
        {labels.map((label) => (
          <li key={label.id}>
            <SideLink
              label={label.name}
              icon="labels"
              current={currentLabelId === label.id}
              onClick={() => onOpen(label.id)}
            />
          </li>
        ))}
        {tools ? (
          <li>
            <SideLink label="Edit labels" icon="edit" onClick={() => setEditing(true)} />
          </li>
        ) : null}
      </ul>
      {tools && editing ? (
        <EditLabelsDialog
          labels={labels}
          onCreate={tools.onCreate}
          onRename={tools.onRename}
          onDelete={tools.onDelete}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </>
  );
}
