import { i18n, useTranslation } from "@/i18n";
import { useEffect, useRef } from "react";
import { MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/aui/components/Button";
import { DiffViewer } from "@/components/aui/components/DiffViewer";
import { FileChangeSummary, type FileChangeKind } from "@/components/aui/components/FileChangeSummary";
import { sx } from "@/components/aui/utils/stylex";
import { paneHost } from "@/components/panes/pane-host-controller";
import { AsyncBoundary } from "@/components/system/AsyncBoundary";
import { useDiffLineHighlighter } from "@/components/session/message/diff-highlighter";
import { DIFF_CONTEXT_LINES, useDiffViewerMode } from "@/components/session/message/diff-viewer-options";
import { languageFromFilePath } from "@/lib/syntax-highlight";
import type { ReviewFile, ReviewFileStatus, ReviewScope } from "@/lib/review/review-scope";
import { useAppStore } from "@/store/app.store";
import { useTaskReviewModeStore } from "@/store/task-review-mode-store";
import type { ReviewCommentSide } from "@/types/review";
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

/** A line a comment row asked to see: the side it was written on, and a nonce so the same line can be asked twice. */
export interface ReviewDiffReveal {
  line: number;
  side: ReviewCommentSide;
  nonce: number;
}

/**
 * The diff row that shows `line` on `side`, or the nearest shown row when an
 * unchanged run around it is folded. A unified row carries its old and new
 * line numbers in two line-number cells; a split row holds two halves, the
 * original side first, each with one line-number cell.
 */
export function findReviewDiffRow(root: ParentNode, line: number, side: ReviewCommentSide): HTMLElement | null {
  const cell = side === "original" ? 0 : 1;
  let nearest: { row: HTMLElement; distance: number } | null = null;
  for (const holder of Array.from(root.querySelectorAll<HTMLElement>("div:has(> [data-aui-slot='line-number'])"))) {
    const numbers = holder.querySelectorAll(":scope > [data-aui-slot='line-number']");
    const splitHalf = numbers.length === 1 ? holder : null;
    if (splitHalf && splitHalf.parentElement?.children[cell] !== splitHalf) continue;
    const row = splitHalf?.parentElement ?? holder;
    const number = Number((splitHalf ? numbers[0] : numbers[cell])?.textContent ?? "");
    if (!Number.isInteger(number) || number < 1) continue;
    const distance = Math.abs(number - line);
    if (distance === 0) return row;
    if (!nearest || distance < nearest.distance) nearest = { row, distance };
  }
  return nearest?.row ?? null;
}

export function ReviewDiffPane(props: {
  taskId: string;
  workspaceId: string;
  scope: ReviewScope;
  cwd: string | null;
  data: ReviewData;
  file: ReviewFile;
  onShown?: () => void;
  /** Scrolls to a commented line once the diff shows. */
  reveal?: ReviewDiffReveal | null;
  /** The file's working-tree text once read, for the sent comments' check. */
  onContent?: (path: string, content: string) => void;
}) {
  useTranslation();
  const { file } = props;
  const content = useReviewFileContent({ cwd: props.cwd, data: props.data, file });
  const language = languageFromFilePath(file.path);
  const highlighter = useDiffLineHighlighter(language);
  const layout = useDiffViewerMode();
  const onShown = useRef(props.onShown);
  onShown.current = props.onShown;
  const onContent = useRef(props.onContent);
  onContent.current = props.onContent;
  const shown = isReviewDiffShown(content.state);
  useEffect(() => {
    if (shown) onShown.current?.();
  }, [shown, file.path]);
  const readContent = content.state.status === "ready" && !content.state.data.binary ? content.state.data.newContent : null;
  useEffect(() => {
    if (readContent !== null) onContent.current?.(file.path, readContent);
  }, [file.path, readContent]);
  const rootRef = useRef<HTMLDivElement>(null);
  const { reveal } = props;
  useEffect(() => {
    if (!reveal || !shown) return;
    const frame = window.requestAnimationFrame(() => {
      const row = rootRef.current ? findReviewDiffRow(rootRef.current, reveal.line, reveal.side) : null;
      if (!row) return;
      row.scrollIntoView({ block: "center" });
      // The row takes focus so the keyboard and a screen reader land on the line.
      row.tabIndex = -1;
      row.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [reveal, shown]);
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
    <div ref={rootRef} className={sx(styles.section)}>
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
          : <DiffViewer ref={layout.ref} aria-label={i18n.t("review:diff.ariaLabel", { path: file.path })} before={diff.oldContent} after={diff.newContent} mode={layout.mode} granularity="word" context={DIFF_CONTEXT_LINES} highlighter={highlighter} language={language} xstyle={styles.diffBody} />}
      </AsyncBoundary>
    </div>
  );
}
