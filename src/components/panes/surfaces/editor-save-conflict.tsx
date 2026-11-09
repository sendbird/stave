import * as stylex from "@stylexjs/stylex";
import { DiffEditor } from "@monaco-editor/react";
import type { editor as MonacoEditorApi } from "monaco-editor";
import { useLayoutEffect, useRef, useState } from "react";
import { Banner } from "@/components/aui/components/Banner";
import { Button } from "@/components/aui/components/Button";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import {
  buildDiffEditorModelPath,
  releaseDiffEditorModels,
} from "@/components/layout/editor-main-panel.utils";
import { i18n } from "@/i18n";
import { workspaceFsAdapter } from "@/lib/fs";
import { useBundledMonaco } from "@/lib/monaco/bundled-monaco";
import { toast } from "@/lib/notifications/toast";
import { useAppStore } from "@/store/app.store";
import type { EditorTab } from "@/types/chat";

/** The disk copy a Compare view shows, and the conflict it was read for. */
export interface EditorSaveConflictCompareState {
  diskContent: string;
  conflictRevision: string | null;
}

/**
 * Shown while a tab's file changed on disk under unsaved edits. Saving stays
 * blocked until the user picks a version here, so a second Cmd+S cannot
 * silently overwrite the change that arrived on disk.
 */
export function EditorSaveConflictBanner({
  tab,
  comparing,
  onCompareChange,
}: {
  tab: EditorTab;
  comparing: boolean;
  onCompareChange: (next: EditorSaveConflictCompareState | null) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  function handleCompare() {
    if (comparing) {
      onCompareChange(null);
      return;
    }
    void run(async () => {
      const disk = await workspaceFsAdapter.readFile({ filePath: tab.filePath });
      if (!disk || disk.tooLarge) {
        toast.error(i18n.t("editor:saveConflict.reloadFailed"), {
          description: tab.filePath,
        });
        return;
      }
      onCompareChange({
        diskContent: disk.content,
        conflictRevision: tab.conflictRevision ?? null,
      });
    });
  }

  function resolve(resolution: "keep-mine" | "reload") {
    void run(async () => {
      onCompareChange(null);
      await useAppStore
        .getState()
        .resolveEditorTabConflict({ tabId: tab.id, resolution });
    });
  }

  return (
    <div className={sx(styles.host)}>
      <Banner
        data-testid="editor-save-conflict"
        tone="warning"
        title={i18n.t("editor:saveConflict.title")}
        action={
          <>
            <Button
              size="sm"
              variant="outlined"
              aria-pressed={comparing}
              disabled={busy}
              onClick={handleCompare}
            >
              {comparing
                ? i18n.t("editor:saveConflict.hideCompare")
                : i18n.t("editor:saveConflict.compare")}
            </Button>
            <Button
              size="sm"
              variant="outlined"
              disabled={busy}
              onClick={() => resolve("keep-mine")}
            >
              {i18n.t("editor:saveConflict.keepMine")}
            </Button>
            <Button
              size="sm"
              variant="outlined"
              disabled={busy}
              onClick={() => resolve("reload")}
            >
              {i18n.t("editor:saveConflict.reload")}
            </Button>
          </>
        }
      >
        {comparing
          ? i18n.t("editor:saveConflict.compareDescription")
          : i18n.t("editor:saveConflict.description")}
      </Banner>
    </div>
  );
}

/**
 * Read-only Monaco diff of the disk copy (original) against the tab's unsaved
 * content (modified). It owns its own model pair, released on unmount the
 * same way the editor surface releases its diff models.
 */
export function EditorSaveConflictCompare({
  tab,
  diskContent,
  theme,
  options,
}: {
  tab: EditorTab;
  diskContent: string;
  theme: string;
  options: MonacoEditorApi.IDiffEditorConstructionOptions;
}) {
  const monacoReady = useBundledMonaco();
  const diffEditorRef = useRef<MonacoEditorApi.IStandaloneDiffEditor | null>(
    null,
  );
  useLayoutEffect(
    () => () => {
      releaseDiffEditorModels(diffEditorRef.current);
      diffEditorRef.current = null;
    },
    [],
  );
  if (!monacoReady) {
    return <div className={sx(styles.pending)} aria-busy="true" />;
  }
  const conflictTabId = `${tab.id}#save-conflict`;
  return (
    <DiffEditor
      height="100%"
      loading={<div className={sx(styles.pending)} aria-busy="true" />}
      keepCurrentOriginalModel
      keepCurrentModifiedModel
      language={tab.language}
      original={diskContent}
      modified={tab.content}
      originalModelPath={buildDiffEditorModelPath({
        filePath: tab.filePath,
        tabId: conflictTabId,
        side: "original",
      })}
      modifiedModelPath={buildDiffEditorModelPath({
        filePath: tab.filePath,
        tabId: conflictTabId,
        side: "modified",
      })}
      theme={theme}
      options={{ ...options, readOnly: true, originalEditable: false }}
      onMount={(editor) => {
        diffEditorRef.current = editor;
      }}
    />
  );
}

const styles = stylex.create({
  host: {
    flexShrink: 0,
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-8"],
    backgroundColor: vars["--aui-color-surface"],
  },
  pending: {
    height: "100%",
    backgroundColor: "var(--editor)",
  },
});
