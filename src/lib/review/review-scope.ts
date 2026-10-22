import type { ChatMessage, CodeDiffPart } from "@/types/chat";

/**
 * What Review compares. Each scope names its base and what it cannot show, so
 * a review never reads as covering more than it does.
 *
 * - `turn`: the edits a turn's agent reported (its code_diff parts). An edit
 *   made through a shell command is never reported, so it is not here.
 * - `stage`: an agent run stage's changes, the git diff since the stage's
 *   start commit (working tree, untracked files included). The paths the
 *   stage recorded when it reported tell its own files from files changed
 *   after it; a later edit to one of the stage's own files cannot be
 *   separated from the stage's edit.
 * - `branch`: everything since the branch left the default branch (the
 *   merge-base), working tree included.
 * - `uncommitted`: the working tree against HEAD.
 */
export const REVIEW_SCOPE_KINDS = ["turn", "stage", "branch", "uncommitted"] as const;
export type ReviewScopeKind = (typeof REVIEW_SCOPE_KINDS)[number];

export type ReviewScope =
  | { kind: "turn"; taskId: string; turnId: string }
  | { kind: "stage"; agentRunId: string; stageId: string; attempt: number }
  | { kind: "branch" }
  | { kind: "uncommitted" };

export type ReviewFileStatus = "added" | "modified" | "deleted" | "renamed" | "copied";

/** Where a stage-scope file's change came from. */
export type ReviewFileOrigin = "stage" | "after-stage" | "unknown";

export interface ReviewFile {
  path: string;
  oldPath?: string;
  status: ReviewFileStatus;
  /** Not yet known to git: created in the working tree and never added. */
  untracked?: boolean;
  additions: number | null;
  deletions: number | null;
  /** Stage scope only. */
  origin?: ReviewFileOrigin;
}

/** A limit a scope states next to its files. */
export type ReviewScopeLimit =
  /** Turn: only the edits the agent reported; shell edits are missing. */
  | "reported-edits-only"
  /** Stage: a later edit to one of the stage's own files reads as the stage's. */
  | "later-edits-merge"
  /** Stage: the stage recorded no paths (it ran before Stave recorded them), so its files cannot be told from later ones. */
  | "no-recorded-paths"
  /** Stage: the stage changed more files than it recorded; files past the list are not attributed. */
  | "paths-truncated";

/** Git name-status letters (`M`, `A`, `R100`, ...) as a review status. */
export function reviewFileStatus(code: string): ReviewFileStatus {
  switch (code.trim().charAt(0).toUpperCase()) {
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    default:
      return "modified";
  }
}

export interface StageScopeFacts {
  changedPaths?: readonly string[];
  changedPathsTruncated?: boolean;
}

/**
 * The stage scope's files, each marked as the stage's own or changed after
 * it, and the limits that apply. A file the stage recorded stays the stage's
 * even when it was edited again later: the two cannot be separated.
 */
export function classifyStageFiles(files: readonly ReviewFile[], facts: StageScopeFacts | null | undefined): { files: ReviewFile[]; limits: ReviewScopeLimit[] } {
  const recorded = facts?.changedPaths;
  if (!recorded) return { files: files.map((file) => ({ ...file, origin: "unknown" })), limits: ["no-recorded-paths", "later-edits-merge"] };
  const own = new Set(recorded);
  const truncated = facts?.changedPathsTruncated === true;
  return {
    files: files.map((file) => ({
      ...file,
      origin: own.has(file.path) || (file.oldPath !== undefined && own.has(file.oldPath)) ? "stage" : truncated ? "unknown" : "after-stage",
    })),
    limits: truncated ? ["later-edits-merge", "paths-truncated"] : ["later-edits-merge"],
  };
}

/** One turn's reported edit of a file: the last one wins, as the turn left it. */
export interface TurnReviewFile extends ReviewFile {
  oldContent: string;
  newContent: string;
}

/**
 * The turn scope: the files a turn's agent reported editing, from its
 * code_diff parts, with the content before and after the turn.
 */
export function turnReviewFiles(messages: readonly ChatMessage[], turnId: string): { files: TurnReviewFile[]; limits: ReviewScopeLimit[] } {
  const byPath = new Map<string, { first: CodeDiffPart; last: CodeDiffPart }>();
  for (const message of messages) {
    if (message.turnId !== turnId) continue;
    for (const part of message.parts) {
      if (part.type !== "code_diff") continue;
      const seen = byPath.get(part.filePath);
      byPath.set(part.filePath, { first: seen?.first ?? part, last: part });
    }
  }
  const files = [...byPath.entries()].map(([path, { first, last }]) => {
    const oldContent = first.oldContent;
    const newContent = last.newContent;
    const status: ReviewFileStatus = oldContent === "" && newContent !== "" ? "added" : newContent === "" && oldContent !== "" ? "deleted" : "modified";
    return { path, status, additions: null, deletions: null, oldContent, newContent };
  });
  return { files: files.sort((left, right) => left.path.localeCompare(right.path)), limits: ["reported-edits-only"] };
}

/** The scopes Review offers: a stage only when the task has an agent run, a turn only when one has ended. */
export function availableReviewScopes(args: { hasAgentRun: boolean; hasTurn: boolean }): ReviewScopeKind[] {
  return REVIEW_SCOPE_KINDS.filter((kind) => (kind === "stage" ? args.hasAgentRun : kind === "turn" ? args.hasTurn : true));
}

/**
 * The scope Review opens on: the stage when it was opened from a sign-off,
 * otherwise the task's latest turn (D13), and the uncommitted changes when
 * the task has no turn yet.
 */
export function defaultReviewScope(args: {
  stage?: { agentRunId: string; stageId: string; attempt: number };
  latestTurn?: { taskId: string; turnId: string };
}): ReviewScope {
  if (args.stage) return { kind: "stage", ...args.stage };
  if (args.latestTurn) return { kind: "turn", ...args.latestTurn };
  return { kind: "uncommitted" };
}

/** Whether two scopes are the same review, for keeping a selection across refreshes. */
export function sameReviewScope(left: ReviewScope, right: ReviewScope): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "turn" && right.kind === "turn") return left.taskId === right.taskId && left.turnId === right.turnId;
  if (left.kind === "stage" && right.kind === "stage") return left.agentRunId === right.agentRunId && left.stageId === right.stageId && left.attempt === right.attempt;
  return true;
}
