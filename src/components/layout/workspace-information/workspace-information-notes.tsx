import { useTranslation } from "@/i18n";
import { Button as AuiButton } from "@/components/aui/components/Button";
import { sx } from "@/components/aui/utils/stylex";
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
      <AuiButton
        layout="host"
        type="button"
        onClick={startEditing}
        xstyle={styles.notesPlaceholder}
      >
        {tI18n("workspace:workspaceInformationNotes.addNotesMarkdownSupported")}</AuiButton>
    );
  }

  // Not a button: a focused link keeps Enter, and the Edit button starts editing.
  return (
    <div className={sx(styles.notesPreviewGroup)}>
      <div
        onClick={(event) => {
          const onLink = event.target instanceof HTMLElement && event.target.closest("a");
          // A click that ends a text selection is a copy, not a request to edit.
          if (!onLink && window.getSelection()?.isCollapsed !== false) startEditing();
        }}
        className={sx(styles.notesPreview)}
      >
        {/* 13 is not on the type ramp; the notes preview reads at the control-text
            baseline, the same step WorkspaceSkillsPanel passes. */}
        <EditorMarkdownPreview content={props.notes} fontSize={14} variant="embedded" lineBreaks="preserve" />
      </div>
      <AuiButton type="button" variant="quiet" size="sm" xstyle={styles.notesEditButton}
        aria-label={tI18n("workspace:workspaceInformationNotes.editNotes")} onClick={startEditing}>
        {tI18n("workspace:workspaceInformationNotes.edit")}
      </AuiButton>
    </div>
  );
}
