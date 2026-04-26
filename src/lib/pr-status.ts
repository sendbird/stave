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
  | "ready_to_merge"
  | "merged"
  | "closed_unmerged";

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
}

/** Cached PR info stored per workspace. */
export interface WorkspacePrInfo {
  /** Null means "no PR exists for this branch". */
  pr: GitHubPrPayload | null;
  /** Derived single-enum status. */
  derived: WorkspacePrStatus;
  /** Epoch-ms of last successful fetch. */
  lastFetched: number;
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
  if (pr.mergeable === "CONFLICTING") return "merge_conflict";
  if (pr.mergeStateStatus === "BEHIND") return "behind_base";
  if (pr.reviewDecision === "CHANGES_REQUESTED") return "changes_requested";

  // 4. Checks
  if (pr.checksRollup === "FAILURE") return "checks_failed";
  if (pr.checksRollup === "PENDING") return "checks_pending";

  // 5. Review gate
  if (
    pr.reviewDecision === "REVIEW_REQUIRED" ||
    pr.reviewDecision === "" ||
    pr.reviewDecision === null
  ) {
    return "review_required";
  }

  // 6. All green
  return "ready_to_merge";
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
  no_pr:             { icon: "GitPullRequestCreateArrow", tone: "neutral",   label: "No PR" },
  draft:             { icon: "GitPullRequestDraft",       tone: "neutral",   label: "Draft" },
  review_required:   { icon: "GitPullRequest",            tone: "open",      label: "Review required" },
  changes_requested: { icon: "GitPullRequest",            tone: "danger",    label: "Changes requested" },
  checks_pending:    { icon: "GitPullRequest",            tone: "attention", label: "Checks running" },
  checks_failed:     { icon: "GitPullRequest",            tone: "danger",    label: "Checks failed" },
  merge_conflict:    { icon: "GitCompareArrows",          tone: "danger",    label: "Merge conflict" },
  behind_base:       { icon: "GitBranch",                 tone: "attention", label: "Behind base" },
  ready_to_merge:    { icon: "GitMerge",                  tone: "open",      label: "Ready to merge" },
  merged:            { icon: "GitMerge",                  tone: "done",      label: "Merged" },
  closed_unmerged:   { icon: "GitPullRequestClosed",      tone: "closed",    label: "Closed" },
};

/** GitHub-style foreground classes for status icons. */
export const PR_TONE_ICON_CLASS: Record<PrStatusTone, string> = {
  neutral:   "text-[#59636e] dark:text-[#8b949e]",
  open:      "text-[#1a7f37] dark:text-[#3fb950]",
  attention: "text-[#9a6700] dark:text-[#d29922]",
  danger:    "text-[#d1242f] dark:text-[#f85149]",
  done:      "text-[#8250df] dark:text-[#a371f7]",
  closed:    "text-[#d1242f] dark:text-[#f85149]",
};

/** GitHub-style muted label classes for status badges/buttons. */
export const PR_TONE_BADGE_CLASS: Record<PrStatusTone, string> = {
  neutral:   "border-[#d0d7de] bg-[#f6f8fa] text-[#57606a] hover:bg-[#eef1f4] dark:border-[#6e768166] dark:bg-[#6e76811a] dark:text-[#8b949e] dark:hover:bg-[#6e768126]",
  open:      "border-[#1a7f37]/25 bg-[#dafbe1] text-[#1a7f37] hover:bg-[#c4f1cf] dark:border-[#2ea04366] dark:bg-[#2ea04326] dark:text-[#3fb950] dark:hover:bg-[#2ea04333]",
  attention: "border-[#d4a72c66] bg-[#fff8c5] text-[#9a6700] hover:bg-[#fff1a8] dark:border-[#bb800966] dark:bg-[#bb800926] dark:text-[#d29922] dark:hover:bg-[#bb800933]",
  danger:    "border-[#ff818266] bg-[#ffebe9] text-[#cf222e] hover:bg-[#ffd8d3] dark:border-[#f8514966] dark:bg-[#f851491a] dark:text-[#f85149] dark:hover:bg-[#f8514926]",
  done:      "border-[#c297ff66] bg-[#fbefff] text-[#8250df] hover:bg-[#f3e8ff] dark:border-[#a371f766] dark:bg-[#a371f726] dark:text-[#a371f7] dark:hover:bg-[#a371f733]",
  closed:    "border-[#ff818266] bg-[#ffebe9] text-[#cf222e] hover:bg-[#ffd8d3] dark:border-[#f8514966] dark:bg-[#f851491a] dark:text-[#f85149] dark:hover:bg-[#f8514926]",
};

/** Styling for the create-PR trigger when the branch has no linked PR yet. */
export const PR_CREATE_BUTTON_CLASS =
  "border-primary/30 bg-primary/10 text-foreground hover:bg-primary/15 shadow-sm";

// ---------------------------------------------------------------------------
// Action config – primary + secondary actions per status
// ---------------------------------------------------------------------------

export type PrAction =
  | "create_pr"
  | "create_draft"
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
    primary: { key: "create_pr", label: "Create PR" },
    secondary: [{ key: "create_draft", label: "Create Draft", variant: "outline" }],
  },
  draft: {
    primary: { key: "mark_ready", label: "Mark Ready" },
    secondary: [{ key: "open_github", label: "Open on GitHub", variant: "ghost" }, { key: "refresh", label: "Refresh", variant: "ghost" }],
  },
  review_required: {
    primary: null,
    secondary: [{ key: "open_github", label: "Open on GitHub", variant: "ghost" }, { key: "refresh", label: "Refresh", variant: "ghost" }],
  },
  changes_requested: {
    primary: null,
    secondary: [{ key: "update_branch", label: "Update Branch", variant: "outline" }, { key: "open_github", label: "Open on GitHub", variant: "ghost" }, { key: "refresh", label: "Refresh", variant: "ghost" }],
  },
  checks_pending: {
    primary: null,
    secondary: [{ key: "open_github", label: "Open on GitHub", variant: "ghost" }, { key: "refresh", label: "Refresh", variant: "ghost" }],
  },
  checks_failed: {
    primary: null,
    secondary: [{ key: "open_github", label: "Open on GitHub", variant: "ghost" }, { key: "refresh", label: "Refresh", variant: "ghost" }],
  },
  merge_conflict: {
    primary: null,
    secondary: [{ key: "open_github", label: "Open on GitHub", variant: "ghost" }, { key: "refresh", label: "Refresh", variant: "ghost" }],
  },
  behind_base: {
    primary: { key: "update_branch", label: "Update Branch" },
    secondary: [{ key: "open_github", label: "Open on GitHub", variant: "ghost" }, { key: "refresh", label: "Refresh", variant: "ghost" }],
  },
  ready_to_merge: {
    primary: { key: "merge", label: "Merge PR" },
    secondary: [{ key: "open_github", label: "Open on GitHub", variant: "ghost" }, { key: "refresh", label: "Refresh", variant: "ghost" }],
  },
  merged: {
    primary: null,
    secondary: [{ key: "open_github", label: "View on GitHub", variant: "ghost" }],
  },
  closed_unmerged: {
    primary: null,
    secondary: [{ key: "open_github", label: "View on GitHub", variant: "ghost" }],
  },
};
