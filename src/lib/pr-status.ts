import { i18n } from "@/i18n/runtime";
// ---------------------------------------------------------------------------
// PR Status – types, derivation, and visual config
// ---------------------------------------------------------------------------

/** Simplified status derived from GitHub PR fields. */
export type WorkspacePrStatus =
  | "no_pr"
  | "draft"
  | "review_required"
  | "changes_requested"
  | "checks_pending"
  | "checks_failed"
  | "merge_conflict"
  | "behind_base"
  | "blocked"
  | "ready_to_merge"
  | "merged"
  | "closed_unmerged";

/** Merge strategy used when Create PR queues GitHub auto-merge. */
export type PrMergeMethod = "default" | "merge" | "squash" | "rebase";

/**
 * Strategy actually handed to `gh pr merge`. "default" is not usable there:
 * without a TTY the CLI requires one of --merge/--rebase/--squash.
 */
export type ConcretePrMergeMethod = Exclude<PrMergeMethod, "default">;

/** Raw payload returned by the `scm:get-pr-status` IPC handler. */
export interface GitHubPrPayload {
  number: number;
  title: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  isDraft: boolean;
  url: string;
  reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | "" | null;
  mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
  mergeStateStatus:
    | "BEHIND"
    | "BLOCKED"
    | "CLEAN"
    | "DIRTY"
    | "DRAFT"
    | "HAS_HOOKS"
    | "UNKNOWN"
    | "UNSTABLE";
  checksRollup: "SUCCESS" | "FAILURE" | "PENDING" | null;
  mergedAt: string | null;
  baseRefName: string;
  headRefName: string;
  /**
   * Head commit of the PR. Optional because payloads cached before this field
   * existed are still valid; attached PR context treats "unknown" as fresh
   * rather than inventing staleness. Read by
   * `src/lib/pr-context.ts#isPrContextAttachmentStale`.
   */
  headRefOid?: string | null;
}

/** Cached PR info stored per workspace. */
export interface WorkspacePrInfo {
  /** Null means "no PR exists for this branch". */
  pr: GitHubPrPayload | null;
  /** Derived single-enum status. */
  derived: WorkspacePrStatus;
  /** Epoch-ms of last successful fetch. */
  lastFetched: number;
  /**
   * Why the most recent refresh failed (gh missing, unauthenticated, network).
   * `pr`/`derived` keep the last known value so the UI can say "status may be
   * stale" instead of pretending the branch has no PR.
   */
  lastError?: string;
}

// ---------------------------------------------------------------------------
// Derivation – priority-ordered mapping from raw GitHub fields to enum
// ---------------------------------------------------------------------------

export function derivePrStatus(pr: GitHubPrPayload): WorkspacePrStatus {
  // 1. Terminal states
  if (pr.mergedAt || pr.state === "MERGED") return "merged";
  if (pr.state === "CLOSED") return "closed_unmerged";

  // 2. Draft
  if (pr.isDraft) return "draft";

  // 3. Blocking conditions (highest urgency first)
  if (pr.mergeable === "CONFLICTING" || pr.mergeStateStatus === "DIRTY") {
    return "merge_conflict";
  }
  if (pr.mergeStateStatus === "BEHIND") return "behind_base";
  if (pr.reviewDecision === "CHANGES_REQUESTED") return "changes_requested";

  // 4. Checks. A failure in the rollup wins over anything still running.
  // UNSTABLE means a non-required check is *not passing* — GitHub reports it
  // for checks that are still running as well as for failed ones — so it only
  // signals a failure once the rollup no longer has pending checks.
  if (pr.checksRollup === "FAILURE") return "checks_failed";
  if (pr.checksRollup === "PENDING") return "checks_pending";
  if (pr.mergeStateStatus === "UNSTABLE") return "checks_failed";

  // 5. GitHub's own merge gate. `mergeStateStatus` already folds in branch
  // protection (required reviewers, conversation resolution, required checks
  // that never reported, rulesets), so it decides whether "Merge PR" can work.
  switch (pr.mergeStateStatus) {
    case "CLEAN":
    case "HAS_HOOKS":
      // An explicit review request still shows as review-required; an empty
      // decision means the repository does not require reviews at all.
      return pr.reviewDecision === "REVIEW_REQUIRED"
        ? "review_required"
        : "ready_to_merge";
    case "BLOCKED":
      return pr.reviewDecision === "APPROVED" ? "blocked" : "review_required";
    default:
      break;
  }

  // 6. UNKNOWN: GitHub is still computing mergeability (typically right after a
  // push). Never claim readiness from stale review data alone.
  if (pr.reviewDecision === "APPROVED") return "checks_pending";
  return "review_required";
}

/** Short explanation for statuses where the label alone is not actionable. */
export function describePrStatusHint(pr: GitHubPrPayload): string | null {
  const status = derivePrStatus(pr);
  if (status === "blocked") {
    return i18n.t("sourceControl:prStatus.gitHubBranchProtectionIsStillBlockingThis");
  }
  if (status === "checks_pending" && pr.checksRollup !== "PENDING") {
    return i18n.t("sourceControl:prStatus.gitHubIsStillComputingMergeabilityForThe");
  }
  if (status === "review_required" && pr.mergeStateStatus === "BLOCKED") {
    return i18n.t("sourceControl:prStatus.gitHubRequiresAnApprovingReviewBeforeThis");
  }
  return null;
}

// ---------------------------------------------------------------------------
// Visual config – icon name, GitHub-style tone, short label
// ---------------------------------------------------------------------------

export type PrStatusTone = "neutral" | "open" | "attention" | "danger" | "done" | "closed";

export interface PrStatusVisual {
  /** Lucide icon name (must match the React import). */
  icon: string;
  /** GitHub-style semantic tone for icon and badge treatment. */
  tone: PrStatusTone;
  /** Human-readable short label. */
  label: string;
}

export const PR_STATUS_VISUAL: Record<WorkspacePrStatus, PrStatusVisual> = {
  no_pr:             { icon: "GitPullRequestCreateArrow", tone: "neutral",   get label() { return i18n.t("sourceControl:prStatus.noPR"); } },
  draft:             { icon: "GitPullRequestDraft",       tone: "neutral",   get label() { return i18n.t("sourceControl:prStatus.draft"); } },
  review_required:   { icon: "GitPullRequest",            tone: "open",      get label() { return i18n.t("sourceControl:prStatus.reviewRequired"); } },
  changes_requested: { icon: "GitPullRequest",            tone: "danger",    get label() { return i18n.t("sourceControl:prStatus.changesRequested"); } },
  checks_pending:    { icon: "GitPullRequest",            tone: "attention", get label() { return i18n.t("sourceControl:prStatus.checksRunning"); } },
  checks_failed:     { icon: "GitPullRequest",            tone: "danger",    get label() { return i18n.t("sourceControl:prStatus.checksFailed"); } },
  merge_conflict:    { icon: "GitCompareArrows",          tone: "danger",    get label() { return i18n.t("sourceControl:prStatus.mergeConflict"); } },
  behind_base:       { icon: "GitBranch",                 tone: "attention", get label() { return i18n.t("sourceControl:prStatus.behindBase"); } },
  blocked:           { icon: "GitPullRequest",            tone: "attention", get label() { return i18n.t("sourceControl:prStatus.mergeBlocked"); } },
  ready_to_merge:    { icon: "GitMerge",                  tone: "open",      get label() { return i18n.t("sourceControl:prStatus.readyToMerge"); } },
  merged:            { icon: "GitMerge",                  tone: "done",      get label() { return i18n.t("sourceControl:prStatus.merged"); } },
  closed_unmerged:   { icon: "GitPullRequestClosed",      tone: "closed",    get label() { return i18n.t("sourceControl:prStatus.closed"); } },
};

/**
 * Semantic tone is the whole visual contract this module publishes. Mapping a
 * tone to Git service-token StyleX is a UI concern and lives in
 * `src/components/layout/pr-status.styles.ts`; no class string leaves `src/lib`.
 */

// ---------------------------------------------------------------------------
// Action config – primary + secondary actions per status
// ---------------------------------------------------------------------------

export type PrAction =
  | "create_pr"
  | "mark_ready"
  | "merge"
  | "update_branch"
  | "open_github"
  | "refresh";

export interface PrActionConfig {
  key: PrAction;
  label: string;
  variant?: "default" | "outline" | "ghost" | "destructive";
}

export const PR_STATUS_ACTIONS: Record<WorkspacePrStatus, { primary: PrActionConfig | null; secondary: PrActionConfig[] }> = {
  no_pr: {
    primary: { key: "create_pr", get label() { return i18n.t("sourceControl:prStatus.createPR"); } },
    secondary: [],
  },
  draft: {
    primary: { key: "mark_ready", get label() { return i18n.t("sourceControl:prStatus.markReady"); } },
    secondary: [{ key: "open_github", get label() { return i18n.t("sourceControl:prStatus.openOnGitHub"); }, variant: "ghost" }, { key: "refresh", get label() { return i18n.t("sourceControl:prStatus.refresh"); }, variant: "ghost" }],
  },
  review_required: {
    primary: null,
    secondary: [{ key: "open_github", get label() { return i18n.t("sourceControl:prStatus.openOnGitHub"); }, variant: "ghost" }, { key: "refresh", get label() { return i18n.t("sourceControl:prStatus.refresh"); }, variant: "ghost" }],
  },
  changes_requested: {
    primary: null,
    secondary: [{ key: "update_branch", get label() { return i18n.t("sourceControl:prStatus.updateBranch"); }, variant: "outline" }, { key: "open_github", get label() { return i18n.t("sourceControl:prStatus.openOnGitHub"); }, variant: "ghost" }, { key: "refresh", get label() { return i18n.t("sourceControl:prStatus.refresh"); }, variant: "ghost" }],
  },
  checks_pending: {
    primary: null,
    secondary: [{ key: "open_github", get label() { return i18n.t("sourceControl:prStatus.openOnGitHub"); }, variant: "ghost" }, { key: "refresh", get label() { return i18n.t("sourceControl:prStatus.refresh"); }, variant: "ghost" }],
  },
  checks_failed: {
    primary: null,
    secondary: [{ key: "open_github", get label() { return i18n.t("sourceControl:prStatus.openOnGitHub"); }, variant: "ghost" }, { key: "refresh", get label() { return i18n.t("sourceControl:prStatus.refresh"); }, variant: "ghost" }],
  },
  merge_conflict: {
    primary: null,
    secondary: [{ key: "open_github", get label() { return i18n.t("sourceControl:prStatus.openOnGitHub"); }, variant: "ghost" }, { key: "refresh", get label() { return i18n.t("sourceControl:prStatus.refresh"); }, variant: "ghost" }],
  },
  behind_base: {
    primary: { key: "update_branch", get label() { return i18n.t("sourceControl:prStatus.updateBranch"); } },
    secondary: [{ key: "open_github", get label() { return i18n.t("sourceControl:prStatus.openOnGitHub"); }, variant: "ghost" }, { key: "refresh", get label() { return i18n.t("sourceControl:prStatus.refresh"); }, variant: "ghost" }],
  },
  blocked: {
    primary: null,
    secondary: [{ key: "open_github", get label() { return i18n.t("sourceControl:prStatus.openOnGitHub"); }, variant: "ghost" }, { key: "refresh", get label() { return i18n.t("sourceControl:prStatus.refresh"); }, variant: "ghost" }],
  },
  ready_to_merge: {
    primary: { key: "merge", get label() { return i18n.t("sourceControl:prStatus.mergePR"); } },
    secondary: [{ key: "open_github", get label() { return i18n.t("sourceControl:prStatus.openOnGitHub"); }, variant: "ghost" }, { key: "refresh", get label() { return i18n.t("sourceControl:prStatus.refresh"); }, variant: "ghost" }],
  },
  merged: {
    primary: null,
    secondary: [{ key: "open_github", get label() { return i18n.t("sourceControl:prStatus.viewOnGitHub"); }, variant: "ghost" }],
  },
  closed_unmerged: {
    primary: null,
    secondary: [{ key: "open_github", get label() { return i18n.t("sourceControl:prStatus.viewOnGitHub"); }, variant: "ghost" }],
  },
};
