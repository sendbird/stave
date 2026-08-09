import type { FleetAttentionKind } from "./attention-projection";
import { getFleetAttentionTier } from "./attention-projection";
import type { FleetTaskStatus } from "./task-status";
import { hasFleetTaskAttentionStatus } from "./task-status";

/**
 * Sidebar work queue: the lane model behind the workspace list at the top of
 * the left sidebar.
 *
 * used by: `src/components/layout/ProjectWorkspaceSidebar.tsx` (replaces the
 * flat "Active workspaces" list), `tests/fleet-sidebar-work-queue.test.ts`.
 *
 * The flat list ranked workspaces but never said *why* one outranked another,
 * so a stalled agent and a workspace you merely visited yesterday looked the
 * same. Lanes name the reason. This module is pure: it takes per-workspace
 * signals that the sidebar already computes and returns grouped entries, so it
 * adds no store subscription, no persistence, and no IPC.
 */
export type SidebarWorkQueueLane =
  | "action-required"
  | "in-progress"
  | "in-review"
  | "idle";

/** Fixed display order; also the classification priority order. */
export const SIDEBAR_WORK_QUEUE_LANE_ORDER: readonly SidebarWorkQueueLane[] = [
  "action-required",
  "in-progress",
  "in-review",
  "idle",
] as const;

/**
 * The last lane is `idle`, not `done`. Lanes are derived from attention items
 * and task runtime state only — a merged PR and a workspace nobody has touched
 * are both "no pending work" and are indistinguishable here without
 * subscribing this section to PR status. "Idle" is true for both; "Done" would
 * be a claim the data does not support.
 */
export const SIDEBAR_WORK_QUEUE_LANE_LABEL: Record<
  SidebarWorkQueueLane,
  string
> = {
  "action-required": "Action required",
  "in-progress": "In progress",
  "in-review": "In review",
  idle: "Idle",
};

/**
 * Per-workspace inputs. `attentionKind` is the workspace's highest-priority
 * Fleet attention item (it already folds PR state into attention kinds, which
 * is why this module never reads PR status directly). `status` is the
 * workspace's leading task status.
 */
export interface SidebarWorkQueueSignals {
  attentionKind?: FleetAttentionKind;
  status?: FleetTaskStatus;
}

/**
 * Lane priority, highest first:
 *
 * 1. `action-required` — something is blocked on the user: a blocking
 *    attention item (a question, an approval, a failed run, a PR that cannot
 *    merge) or a live task sitting in a waiting/error state. The live status
 *    matters on its own because a user who already read the notification still
 *    has a stalled agent in front of them.
 * 2. `in-progress` — an agent is running. Checked before review because a
 *    running turn is the truthful present tense: a workspace with both a
 *    finished result and a new turn in flight is in progress, not waiting for
 *    review.
 * 3. `in-review` — finished work nobody has looked at (a completed run, a PR
 *    that is merely ready or behind base). Nothing is stalled.
 * 4. `idle` — nothing pending.
 */
export function classifySidebarWorkQueueLane(
  signals: SidebarWorkQueueSignals,
): SidebarWorkQueueLane {
  const status = signals.status ?? "idle";
  const attentionTier = signals.attentionKind
    ? getFleetAttentionTier(signals.attentionKind)
    : undefined;

  if (
    attentionTier === "blocking" ||
    hasFleetTaskAttentionStatus(status) ||
    status === "error"
  ) {
    return "action-required";
  }
  if (status === "running") {
    return "in-progress";
  }
  if (attentionTier === "review") {
    return "in-review";
  }
  return "idle";
}

export interface SidebarWorkQueueGroup<T> {
  lane: SidebarWorkQueueLane;
  label: string;
  entries: T[];
}

/**
 * Groups already-ranked entries into lanes.
 *
 * Entry selection, dismissal, and capping stay upstream in
 * `buildSidebarActiveWorkspaceEntries` — this only adds the lane axis, so the
 * two concerns can be tested and changed independently. Input order is
 * preserved inside each lane (callers pass a ranked list), a workspace can
 * appear in exactly one lane, and empty lanes are dropped so the sidebar never
 * renders a bare header.
 */
export function buildSidebarWorkQueueLanes<T extends { workspaceId: string }>(args: {
  entries: readonly T[];
  signalsByWorkspaceId: Record<string, SidebarWorkQueueSignals | undefined>;
}): SidebarWorkQueueGroup<T>[] {
  const entriesByLane = new Map<SidebarWorkQueueLane, T[]>();
  const seen = new Set<string>();

  for (const entry of args.entries) {
    if (seen.has(entry.workspaceId)) {
      continue;
    }
    seen.add(entry.workspaceId);
    const lane = classifySidebarWorkQueueLane(
      args.signalsByWorkspaceId[entry.workspaceId] ?? {},
    );
    const bucket = entriesByLane.get(lane);
    if (bucket) {
      bucket.push(entry);
    } else {
      entriesByLane.set(lane, [entry]);
    }
  }

  return SIDEBAR_WORK_QUEUE_LANE_ORDER.flatMap((lane) => {
    const entries = entriesByLane.get(lane);
    if (!entries?.length) {
      return [];
    }
    return [{ lane, label: SIDEBAR_WORK_QUEUE_LANE_LABEL[lane], entries }];
  });
}
