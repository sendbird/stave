import { i18n, useTranslation } from "@/i18n";
import { useEffect, useRef } from "react";
import { MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { DiffViewer } from "@/components/ads/components/DiffViewer";
import { FileChangeSummary, type FileChangeKind } from "@/components/ads/components/FileChangeSummary";
import { sx } from "@/components/ads/utils/stylex";
import { paneHost } from "@/components/panes/pane-host-controller";
import { AsyncBoundary } from "@/components/system/AsyncBoundary";
import { useDiffLineHighlighter } from "@/components/session/message/diff-highlighter";
import { languageFromFilePath } from "@/lib/syntax-highlight";
import type { ReviewFile, ReviewFileStatus, ReviewScope } from "@/lib/review/review-scope";
import { useAppStore } from "@/store/app.store";
import { useTaskReviewModeStore } from "@/store/task-review-mode-store";
import { describeReviewReadError } from "./review-errors";
import { reviewStyles as styles } from "./review.styles";
import { useReviewFileContent, type ReviewData } from "./useReviewData";

/**
 * The selected file's diff in the scope. Comments are written in the editor's
 * diff, where they anchor to lines; Review lists them in its inspector too,
 * because the editor's comment zones are not reachable by screen readers.
 */
/** Whether a file's diff has been shown: its content read, or its binary marker. A refused or failed read has not. */
export function isReviewDiffShown(state: { status: string }): boolean {
  return state.status === "ready";
}

/** The header's file glyph: a copy is a new file, a deletion is a removed one. */
const CHANGE_KIND: Record<ReviewFileStatus, FileChangeKind> = { added: "added", modified: "modified", deleted: "removed", renamed: "renamed", copied: "added" };

/** Unchanged lines kept around each change; longer unchanged runs collapse behind Expand. */
const DIFF_CONTEXT_LINES = 3;

export function ReviewDiffPane(props: { taskId: string; workspaceId: string; scope: ReviewScope; cwd: string | null; data: ReviewData; file: ReviewFile; onShown?: () => void }) {
  useTranslation();
  const { file } = props;
  const content = useReviewFileContent({ cwd: props.cwd, data: props.data, file });
  const language = languageFromFilePath(file.path);
  const highlighter = useDiffLineHighlighter(language);
  const onShown = useRef(props.onShown);
  onShown.current = props.onShown;
  const shown = isReviewDiffShown(content.state);
  useEffect(() => {
    if (shown) onShown.current?.();
  }, [shown, file.path]);
  const comment = async () => {
    if (content.state.status !== "ready") return;
    const { oldContent, newContent } = content.state.data;
    // A turn's edit is a snapshot of that turn; the other scopes end at the working tree.
    const editorTabId = props.scope.kind === "turn" ? `chat-diff:review:${props.scope.turnId}:${file.path}` : `scm-diff:${file.path}`;
    // Switching workspaces while the file is read must not open this diff in the other one.
    const isStale = () => useAppStore.getState().activeWorkspaceId !== props.workspaceId;
    await useAppStore.getState().openDiffInEditor({ editorTabId, filePath: file.path, oldContent, newContent, isStale });
    if (isStale()) return;
    // The editor offers "Back to Review" on this task and scope.
    useTaskReviewModeStore.getState().rememberEditorOrigin({ workspaceId: props.workspaceId, editorTabId, taskId: props.taskId, scope: props.scope });
    // Bring the editor forward even when its tab was already the active one,
    // as after Back to Review: opening the same diff again selects nothing new.
    paneHost.openSurface({ kind: "editor", editorTabId });
  };
  return (
    <div className={sx(styles.section)}>
      {/* Stays at the top of the diff column while the diff scrolls, so the file and its comment action stay in reach. */}
      <div className={sx(styles.diffHeader)}>
        <div className={sx(styles.diffTitle)}>
          {/* The same path, glyph and +N −M header as the chat's file diffs; counts are omitted when unknown (a turn's edits). */}
          <FileChangeSummary path={file.path} kind={CHANGE_KIND[file.status]} directoryDepth={Infinity} {...(file.additions !== null ? { added: file.additions } : {})} {...(file.deletions !== null ? { removed: file.deletions } : {})} />
          {file.oldPath ? <span className={sx(styles.diffRenamed)} title={file.oldPath}>{i18n.t("review:diff.renamedFrom", { from: file.oldPath })}</span> : null}
        </div>
        <Button size="xs" variant="outline" xstyle={styles.diffAction} disabled={content.state.status !== "ready"} onClick={() => void comment()}>
          <MessageSquarePlus aria-hidden />
          {i18n.t("review:diff.comment")}
        </Button>
      </div>
      <AsyncBoundary state={content.state} onRetry={content.refresh} describeError={describeReviewReadError}>
        {(diff) => diff.binary
          ? <p className={sx(styles.note)}>{i18n.t("review:diff.binary")}</p>
          : diff.oldContent === diff.newContent
          ? <p className={sx(styles.note)}>{i18n.t("review:diff.noTextChange")}</p>
          // Shared Shiki highlighter, as in the chat's file diffs; plain text until it loads.
          // Long unchanged runs collapse so the first change is on screen in a large file.
          : <DiffViewer aria-label={i18n.t("review:diff.ariaLabel", { path: file.path })} before={diff.oldContent} after={diff.newContent} mode="unified" granularity="word" context={DIFF_CONTEXT_LINES} highlighter={highlighter} language={language} xstyle={styles.diffBody} />}
      </AsyncBoundary>
    </div>
  );
}
