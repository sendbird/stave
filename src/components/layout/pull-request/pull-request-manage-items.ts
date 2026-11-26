import type { GitHubPrManageDetails } from "@/lib/github-pr-manage";
import type { WorkspacePrStatus } from "@/lib/pr-status";

/** Where a pull request is in its life; the manage menu offers different actions for each. */
export type PullRequestLifecycle = "open" | "closed" | "merged";

export type PullRequestManageItem =
  | "edit"
  | "convert_to_draft"
  | "auto_merge_on"
  | "auto_merge_off"
  | "auto_merge_checking"
  | "close"
  | "reopen"
  | "archive_workspace";

/**
 * Whether GitHub has auto-merge queued: read from the pull request itself, so
 * it is `checking` until that read returns and `unknown` when it fails.
 */
export type PullRequestAutoMergeState = "on" | "off" | "checking" | "unknown";

/** Null when the workspace has no pull request. */
export function pullRequestLifecycleFromStatus(status: WorkspacePrStatus): PullRequestLifecycle | null {
  if (status === "no_pr") return null;
  if (status === "merged") return "merged";
  if (status === "closed_unmerged") return "closed";
  return "open";
}

export function pullRequestLifecycleFromState(state: GitHubPrManageDetails["state"]): PullRequestLifecycle {
  return state === "MERGED" ? "merged" : state === "CLOSED" ? "closed" : "open";
}

/**
 * The manage actions to show, in menu order.
 *
 * - open: edit, convert to draft (unless already a draft), auto-merge on/off
 *   by its real state, close;
 * - closed without merging: reopen;
 * - merged: archive the workspace, when the menu belongs to one.
 */
export function resolvePullRequestManageItems(args: {
  lifecycle: PullRequestLifecycle | null;
  isDraft: boolean;
  autoMerge: PullRequestAutoMergeState;
  /** The menu belongs to a workspace that can be archived after the merge. */
  hasWorkspace: boolean;
}): PullRequestManageItem[] {
  if (args.lifecycle === "merged") return args.hasWorkspace ? ["archive_workspace"] : [];
  if (args.lifecycle === "closed") return ["reopen"];
  if (args.lifecycle !== "open") return [];
  const autoMerge: PullRequestManageItem[] =
    args.autoMerge === "on" ? ["auto_merge_off"]
      : args.autoMerge === "off" ? ["auto_merge_on"]
        : args.autoMerge === "checking" ? ["auto_merge_checking"]
          : [];
  return ["edit", ...(args.isDraft ? [] : ["convert_to_draft" as const]), ...autoMerge, "close"];
}

/**
 * Once-per-workspace memory for the "merged, archive this workspace?" toast.
 * `observe` answers true exactly once per workspace: the first time it sees
 * that workspace's pull request go from an open status to merged. A pull
 * request that is already merged when first seen (app start, switching to an
 * old workspace) never qualifies.
 */
export function createMergedArchiveToastTracker() {
  const lastStatus = new Map<string, WorkspacePrStatus>();
  const shown = new Set<string>();
  return {
    observe(workspaceId: string, status: WorkspacePrStatus): boolean {
      if (!workspaceId) return false;
      const previous = lastStatus.get(workspaceId);
      lastStatus.set(workspaceId, status);
      if (status !== "merged" || shown.has(workspaceId)) return false;
      if (previous === undefined || pullRequestLifecycleFromStatus(previous) !== "open") return false;
      shown.add(workspaceId);
      return true;
    },
  };
}

export interface PullRequestEditSnapshot {
  title: string;
  body: string;
  reviewers: readonly string[];
}

const sameHandle = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const includesHandle = (handles: readonly string[], handle: string) => handles.some((other) => sameHandle(other, handle));

/**
 * What saving the edit dialog should send, given the pull request as it was
 * when the dialog opened (`baseline`), what the person typed (`draft`) and the
 * pull request as it is now (`remote`).
 *
 * - A field the person did not touch follows the remote value and is not sent.
 * - A field the person changed is sent, unless it already equals the remote.
 * - A field both sides changed is a `conflict`: nothing is sent and the
 *   person's text is kept, so the dialog can warn before overwriting. Saving
 *   again with `remote` as the new baseline sends it.
 * - Reviewers merge instead of conflicting: only the requests the person added
 *   or removed are applied on top of the current ones.
 */
export function planPullRequestEdit(args: {
  baseline: PullRequestEditSnapshot;
  draft: PullRequestEditSnapshot;
  remote: PullRequestEditSnapshot;
}) {
  const { baseline, draft, remote } = args;
  const field = (key: "title" | "body") => {
    const touched = draft[key] !== baseline[key];
    return {
      value: touched ? draft[key] : remote[key],
      conflict: touched && remote[key] !== baseline[key] && draft[key] !== remote[key],
      send: touched && draft[key] !== remote[key],
    };
  };
  const title = field("title");
  const body = field("body");
  const add = draft.reviewers.filter((handle) => !includesHandle(baseline.reviewers, handle) && !includesHandle(remote.reviewers, handle));
  const remove = remote.reviewers.filter((handle) => includesHandle(baseline.reviewers, handle) && !includesHandle(draft.reviewers, handle));
  const conflict = { title: title.conflict, body: body.conflict };
  const blocked = conflict.title || conflict.body;
  return {
    conflict,
    /** The person's text for touched fields, the remote text for the rest. */
    draft: {
      title: title.value,
      body: body.value,
      reviewers: [...remote.reviewers.filter((handle) => !includesHandle(remove, handle)), ...add],
    },
    edit: blocked || !(title.send || body.send)
      ? null
      : { ...(title.send ? { title: draft.title } : {}), ...(body.send ? { body: draft.body } : {}) },
    reviewers: blocked ? { add: [], remove: [] } : { add, remove },
  };
}
