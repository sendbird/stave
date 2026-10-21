import { useTranslation } from "@/i18n";
import { useState } from "react";
import { Button, Kbd, Textarea } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { workspaceInformationPanelStyles as styles } from "../workspace-information-panel.styles";
import {
  clearNotesDraft,
  readNotesDraft,
  resolveNotesCommit,
  writeNotesDraft,
} from "./notes-draft";

/**
 * Editing state for one workspace's notes whose unsaved text outlives the
 * editor: switching panels or workspaces unmounts it, and the draft is picked
 * up again on return. Done notices notes that changed underneath (an agent
 * writing notes meanwhile) and lets the user choose instead of overwriting.
 */
export function useNotesDraftEditor(args: {
  workspaceId: string;
  notes: string;
  onChange: (value: string) => void;
}) {
  const [savedDraft] = useState(() => {
    const stored = readNotesDraft(args.workspaceId);
    // A draft that already matches the saved notes has nothing left to keep.
    if (stored && stored.text === args.notes) {
      clearNotesDraft(args.workspaceId);
      return null;
    }
    return stored;
  });
  const [isEditing, setIsEditing] = useState(savedDraft !== null);
  const [draft, setDraft] = useState(savedDraft?.text ?? args.notes);
  const [baseNotes, setBaseNotes] = useState(savedDraft?.baseNotes ?? args.notes);
  // A restored draft whose starting point is no longer the saved notes says
  // so up front instead of hiding the newer notes behind the editor.
  const [conflict, setConflict] = useState(
    savedDraft !== null && savedDraft.baseNotes !== args.notes,
  );

  const finish = () => {
    clearNotesDraft(args.workspaceId);
    setConflict(false);
    setIsEditing(false);
  };

  return {
    isEditing,
    draft,
    conflict,
    canCommit: draft !== args.notes && !conflict,
    startEditing: () => {
      setDraft(args.notes);
      setBaseNotes(args.notes);
      setConflict(false);
      setIsEditing(true);
      writeNotesDraft(args.workspaceId, { text: args.notes, baseNotes: args.notes });
    },
    updateDraft: (text: string) => {
      setDraft(text);
      writeNotesDraft(args.workspaceId, { text, baseNotes });
    },
    commit: () => {
      const decision = resolveNotesCommit({
        draft,
        baseNotes,
        currentNotes: args.notes,
      });
      if (decision === "conflict") {
        setConflict(true);
        return;
      }
      if (decision === "save") {
        args.onChange(draft);
      }
      finish();
    },
    overwrite: () => {
      args.onChange(draft);
      finish();
    },
    cancel: finish,
  };
}

export function NotesEditor(props: {
  editor: ReturnType<typeof useNotesDraftEditor>;
}) {
  const { t: tI18n } = useTranslation(["workspace"]);
  const { editor } = props;
  return (
    <div className={sx(styles.notesEditor)}>
      <Textarea
        autoFocus
        xstyle={styles.notesTextarea}
        value={editor.draft}
        onChange={(event) => editor.updateDraft(event.target.value)}
        onFocus={(event) => {
          const length = event.currentTarget.value.length;
          event.currentTarget.setSelectionRange(length, length);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            editor.cancel();
          } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            editor.commit();
          }
        }}
        placeholder={tI18n("workspace:workspaceInformationNotes.notesBlockersHandoffDetails")}
      />
      {editor.conflict ? (
        <div role="alert" className={sx(styles.notesConflict)}>
          <span>{tI18n("workspace:workspaceInformationNotes.changedWhileEditing")}</span>
          <div className={sx(styles.notesActions)}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              xstyle={styles.notesButton}
              onClick={editor.cancel}
            >
              {tI18n("workspace:workspaceInformationNotes.discardMyChanges")}</Button>
            <Button
              type="button"
              size="sm"
              xstyle={styles.notesButton}
              onClick={editor.overwrite}
            >
              {tI18n("workspace:workspaceInformationNotes.saveMyVersion")}</Button>
          </div>
        </div>
      ) : null}
      <div className={sx(styles.notesFooter)}>
        <span className={sx(styles.notesHint)}>
          Markdown ·{" "}
          <Kbd>
            {typeof navigator !== "undefined" && navigator.platform.includes("Mac")
              ? "⌘"
              : "Ctrl"}
          </Kbd>
          <Kbd>Enter</Kbd> {tI18n("workspace:workspaceInformationNotes.toSave")}</span>
        <div className={sx(styles.notesActions)}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            xstyle={styles.notesButton}
            onClick={editor.cancel}
          >
            {tI18n("workspace:workspaceInformationNotes.cancel")}</Button>
          <Button
            type="button"
            size="sm"
            xstyle={styles.notesButton}
            onClick={editor.commit}
            disabled={!editor.canCommit}
          >
            {tI18n("workspace:workspaceInformationNotes.done")}</Button>
        </div>
      </div>
    </div>
  );
}
