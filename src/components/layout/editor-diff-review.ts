import type { editor as MonacoEditorApi } from "monaco-editor";
import type { ReviewComment, ReviewCommentDraft } from "@/types/review";

export interface DiffReviewCommentTarget {
  line?: number;
}

export interface DiffReviewThread {
  line: number;
  comments: ReviewComment[];
  draft: ReviewCommentDraft | null;
}

export interface ModifiedDiffLineChange {
  modifiedStartLineNumber: number;
  modifiedEndLineNumber: number;
}

export interface DiffReviewHoverLineArgs {
  line?: number;
  isLineTarget: boolean;
  commentableLines: ReadonlySet<number>;
  threadLines: ReadonlySet<number>;
}

export interface TaskReviewDraftState {
  taskId: string;
  draft: ReviewCommentDraft;
}

export function shouldRenderDiffEditorSurface(args: {
  diffMode: boolean;
  originalContent: string | undefined;
}) {
  return args.diffMode && args.originalContent !== undefined;
}

interface Disposable {
  dispose(): void;
}

export function getModifiedDiffEditorLine(
  diffEditor: MonacoEditorApi.IStandaloneDiffEditor | null,
): number | undefined {
  const lineNumber = diffEditor?.getModifiedEditor().getPosition()?.lineNumber;
  if (
    typeof lineNumber !== "number" ||
    !Number.isInteger(lineNumber) ||
    lineNumber < 1
  ) {
    return undefined;
  }
  return lineNumber;
}

export function collectModifiedDiffCommentableLines(
  changes: readonly ModifiedDiffLineChange[] | null,
) {
  if (!changes) {
    return [];
  }

  const lines = new Set<number>();
  for (const change of changes) {
    if (change.modifiedEndLineNumber < 1) {
      continue;
    }
    const start = Math.max(1, change.modifiedStartLineNumber);
    const end = Math.max(start, change.modifiedEndLineNumber);
    for (let line = start; line <= end; line += 1) {
      lines.add(line);
    }
  }
  return [...lines].sort((left, right) => left - right);
}

export function resolveDiffReviewHoverLine(
  args: DiffReviewHoverLineArgs,
): number | undefined {
  if (
    !args.isLineTarget ||
    typeof args.line !== "number" ||
    !Number.isInteger(args.line) ||
    args.line < 1
  ) {
    return undefined;
  }
  return args.commentableLines.has(args.line) || args.threadLines.has(args.line)
    ? args.line
    : undefined;
}

export function resolveTaskReviewDraft(
  state: TaskReviewDraftState | null,
  activeTaskId: string,
): ReviewCommentDraft | null {
  return state?.taskId === activeTaskId ? state.draft : null;
}

function isInlineModifiedLine(
  line: number | undefined,
  lineCount: number,
): line is number {
  return (
    typeof line === "number" &&
    Number.isInteger(line) &&
    line >= 1 &&
    line <= lineCount
  );
}

export function buildDiffReviewThreads(args: {
  comments: ReviewComment[];
  draft: ReviewCommentDraft | null;
  lineCount: number;
}): DiffReviewThread[] {
  const threads = new Map<number, DiffReviewThread>();
  const ensureThread = (line: number) => {
    const current = threads.get(line);
    if (current) {
      return current;
    }
    const next: DiffReviewThread = { line, comments: [], draft: null };
    threads.set(line, next);
    return next;
  };

  for (const comment of args.comments) {
    const line = comment.line;
    if (
      comment.side === "original" ||
      !isInlineModifiedLine(line, args.lineCount)
    ) {
      continue;
    }
    ensureThread(line).comments.push(comment);
  }

  if (
    args.draft?.side === "modified" &&
    isInlineModifiedLine(args.draft.line, args.lineCount)
  ) {
    ensureThread(args.draft.line).draft = args.draft;
  }

  return [...threads.values()]
    .map((thread) => ({
      ...thread,
      comments: [...thread.comments].sort((left, right) => {
        const createdCompare = left.createdAt.localeCompare(right.createdAt);
        return createdCompare !== 0
          ? createdCompare
          : left.id.localeCompare(right.id);
      }),
    }))
    .sort((left, right) => left.line - right.line);
}

export function registerDiffReviewCommentAction(args: {
  editor: MonacoEditorApi.IStandaloneCodeEditor;
  onAddComment: (target: DiffReviewCommentTarget) => void;
}): Disposable {
  return args.editor.addAction({
    id: "stave.diffReview.addComment",
    label: "Add Review Comment",
    contextMenuGroupId: "navigation",
    contextMenuOrder: 1.5,
    run: (editor) => {
      const lineNumber = editor.getPosition()?.lineNumber;
      args.onAddComment({
        line:
          typeof lineNumber === "number" &&
          Number.isInteger(lineNumber) &&
          lineNumber >= 1
            ? lineNumber
            : undefined,
      });
    },
  });
}
