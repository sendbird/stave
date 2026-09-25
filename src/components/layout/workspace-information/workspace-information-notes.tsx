import { Button as AdsButton } from "@/components/ads/components/Button";
import { useState } from "react";
import { Button, Kbd, Textarea } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { EditorMarkdownPreview } from "../editor-markdown-preview";
import { workspaceInformationPanelStyles as styles } from "../workspace-information-panel.styles";

export function NotesSectionBody(props: {
  notes: string;
  onChange: (value: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(props.notes);

  const startEditing = () => {
    setDraft(props.notes);
    setIsEditing(true);
  };

  const commit = () => {
    setIsEditing(false);
    if (draft !== props.notes) {
      props.onChange(draft);
    }
  };

  const cancel = () => {
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className={sx(styles.notesEditor)}>
        <Textarea
          autoFocus
          xstyle={styles.notesTextarea}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={(event) => {
            const length = event.currentTarget.value.length;
            event.currentTarget.setSelectionRange(length, length);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              cancel();
            } else if (
              event.key === "Enter" &&
              (event.metaKey || event.ctrlKey)
            ) {
              event.preventDefault();
              commit();
            }
          }}
          placeholder="Notes, blockers, handoff details..."
        />
        <div className={sx(styles.notesFooter)}>
          <span className={sx(styles.notesHint)}>
            Markdown ·{" "}
            <Kbd>
              {typeof navigator !== "undefined" &&
              navigator.platform.includes("Mac")
                ? "⌘"
                : "Ctrl"}
            </Kbd>
            <Kbd>Enter</Kbd> to save
          </span>
          <div className={sx(styles.notesActions)}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              xstyle={styles.notesButton}
              onClick={cancel}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              xstyle={styles.notesButton}
              onClick={commit}
              disabled={draft === props.notes}
            >
              Done
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!props.notes.trim()) {
    return (
      <AdsButton
        layout="host"
        type="button"
        onClick={startEditing}
        xstyle={styles.notesPlaceholder}
      >
        Add notes… (markdown supported)
      </AdsButton>
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
