import { useTranslation } from "@/i18n";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { EditorMarkdownPreview } from "../editor-markdown-preview";
import { NotesEditor, useNotesDraftEditor } from "./workspace-information-notes-editor";
import { workspaceInformationPanelStyles as styles } from "../workspace-information-panel.styles";

/**
 * Information notes. Mount it keyed by workspace: one instance edits one
 * workspace's notes, and its unsaved draft survives panel switches.
 */
export function NotesSectionBody(props: {
  workspaceId: string;
  notes: string;
  onChange: (value: string) => void;
}) {
  const { t: tI18n } = useTranslation(["workspace"]);
  const editor = useNotesDraftEditor(props);
  const startEditing = editor.startEditing;

  if (editor.isEditing) {
    return <NotesEditor editor={editor} />;
  }

  if (!props.notes.trim()) {
    return (
      <AdsButton
        layout="host"
        type="button"
        onClick={startEditing}
        xstyle={styles.notesPlaceholder}
      >
        {tI18n("workspace:workspaceInformationNotes.addNotesMarkdownSupported")}</AdsButton>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(event) => {
        if (event.target instanceof HTMLElement && event.target.closest("a")) {
          return;
        }
        startEditing();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          startEditing();
        }
      }}
      className={sx(styles.notesPreview)}
    >
      {/* 13 is not on the type ramp; the notes preview reads at the control-text
          baseline, the same step WorkspaceSkillsPanel passes. */}
      <EditorMarkdownPreview
        content={props.notes}
        fontSize={14}
        variant="embedded"
      />
    </div>
  );
}
