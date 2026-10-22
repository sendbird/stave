import { useMemo } from "react";
import { useAsync, type AsyncState } from "@/components/ads/utils/async";
import { useRunTurnMessages } from "@/components/session/RunTurnDialog";
import type { StageFacts } from "@/lib/agent-runs/domain";
import type { ScmReviewBase } from "@/lib/review/review-diff-contract";
import {
  classifyStageFiles,
  reviewFileStatus,
  turnReviewFiles,
  type ReviewFile,
  type ReviewScope,
  type ReviewScopeLimit,
} from "@/lib/review/review-scope";

export interface ReviewData {
  files: ReviewFile[];
  limits: ReviewScopeLimit[];
  /** The commit the scope compares against, and the ref it came from. */
  baseSha: string | null;
  baseRef: string | null;
  headSha: string | null;
  /** The turn is no longer in the task's saved history. */
  missing?: boolean;
  /** Turn scope: each file's content before and after the turn. */
  contents?: ReadonlyMap<string, { oldContent: string; newContent: string }>;
}

export type ReviewReadFailure = "no-workspace" | "no-stage-start" | "unavailable" | "failed" | "outside" | "changed" | "too-large";

/** Why a review read failed; the boundary turns it into words. */
export class ReviewReadError extends Error {
  constructor(readonly reason: ReviewReadFailure, readonly detail = "") {
    super(detail || reason);
  }
}

/** The edits a turn's agent reported, from the conversation or its saved history. */
export function useTurnReviewData(args: { workspaceId: string; taskId: string; turnId: string }): { state: AsyncState<ReviewData>; refresh: () => void } {
  const run = useRunTurnMessages(args);
  const { turnId } = args;
  const messages = run.status === "ready" ? run.messages : run.status === "missing" ? null : undefined;
  const failure = run.status === "failed" ? run.message : undefined;
  const state = useMemo((): AsyncState<ReviewData> => {
    if (failure !== undefined) return { status: "error", error: new ReviewReadError("failed", failure) };
    if (messages === undefined) return { status: "pending" };
    if (messages === null) return { status: "ready", data: { files: [], limits: ["reported-edits-only"], baseSha: null, baseRef: null, headSha: null, missing: true } };
    const { files, limits } = turnReviewFiles(messages, turnId);
    return {
      status: "ready",
      data: {
        files: files.map(({ oldContent: _old, newContent: _new, ...file }) => file),
        limits,
        baseSha: null,
        baseRef: null,
        headSha: null,
        contents: new Map(files.map((file) => [file.path, { oldContent: file.oldContent, newContent: file.newContent }])),
      },
    };
  }, [failure, messages, turnId]);
  return { state, refresh: run.retry };
}

/**
 * A stage, branch or uncommitted scope: the host's diff against the scope's
 * base. A stage's files are marked as its own or changed after it.
 */
export function useDiffReviewData(args: {
  scope: Exclude<ReviewScope, { kind: "turn" }>;
  cwd: string | null;
  stage?: { startHeadSha: string | null; facts: StageFacts | null } | null;
}): { state: AsyncState<ReviewData>; refresh: () => void } {
  const { scope, cwd, stage } = args;
  const base: ScmReviewBase | null = scope.kind === "stage"
    ? stage?.startHeadSha ? { kind: "commit", sha: stage.startHeadSha } : null
    : scope.kind === "branch" ? { kind: "merge-base" } : { kind: "head" };
  const baseKey = base ? JSON.stringify(base) : "";
  const facts = stage?.facts ?? null;
  const factsKey = facts?.changedPaths ? `${facts.changedPaths.length}:${facts.changedPaths.join("\n")}:${facts.changedPathsTruncated ? 1 : 0}` : "none";
  return useAsync(async () => {
    if (!cwd) throw new ReviewReadError("no-workspace");
    if (!base) throw new ReviewReadError("no-stage-start");
    const read = typeof window === "undefined" ? undefined : window.api?.sourceControl?.getReviewDiff;
    if (!read) throw new ReviewReadError("unavailable");
    const result = await read({ cwd, base });
    if (!result.ok) throw new ReviewReadError("failed", result.stderr);
    const files: ReviewFile[] = result.files.map((file) => ({
      path: file.path,
      ...(file.oldPath ? { oldPath: file.oldPath } : {}),
      status: reviewFileStatus(file.status),
      ...(file.untracked ? { untracked: true } : {}),
      additions: file.additions,
      deletions: file.deletions,
    }));
    const classified = scope.kind === "stage" ? classifyStageFiles(files, facts) : { files, limits: [] };
    return { ...classified, baseSha: result.baseSha, baseRef: result.baseRef, headSha: result.headSha };
    // The base and the stage's recorded paths (by value) are what the read depends on.
  }, [cwd, scope.kind, baseKey, factsKey]);
}

/** One file's content in a scope, read when it is opened. */
export function useReviewFileContent(args: { cwd: string | null; data: ReviewData; file: ReviewFile | null }): { state: AsyncState<{ oldContent: string; newContent: string }>; refresh: () => void } {
  const { cwd, data, file } = args;
  const fromTurn = file ? data.contents?.get(file.path) : undefined;
  return useAsync(async () => {
    if (!file) return { oldContent: "", newContent: "" };
    if (data.contents) {
      if (!fromTurn) throw new ReviewReadError("failed");
      return fromTurn;
    }
    if (!cwd) throw new ReviewReadError("no-workspace");
    const read = typeof window === "undefined" ? undefined : window.api?.sourceControl?.getReviewFileDiff;
    if (!read || !data.baseSha) throw new ReviewReadError("unavailable");
    const result = await read({ cwd, baseSha: data.baseSha, path: file.path, ...(file.oldPath ? { oldPath: file.oldPath } : {}), ...(file.untracked ? { untracked: true } : {}) });
    if (!result.ok) throw new ReviewReadError(result.code ?? "failed", result.stderr);
    return { oldContent: result.oldContent, newContent: result.newContent };
  }, [cwd, data, file?.path, file?.oldPath, fromTurn]);
}
