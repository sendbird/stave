import type { FleetAttentionKind } from "./attention-projection";
import { FLEET_ATTENTION_PRIORITY, getFleetAttentionTier } from "./attention-projection";
import type { FleetTaskStatus } from "./task-status";
import { hasFleetTaskAttentionStatus } from "./task-status";

/**
 * The one ordering rule for "things to do". The sidebar Work queue, the Fleet
 * board (the Work queue's full view) and the Agents surface all order their
 * rows with this module, so a workspace or task that needs you is first
 * everywhere for the same reason.
 *
 * used by: `src/lib/fleet/sidebar-work-queue.ts` and
 * `src/components/layout/RepositoryWorkspaceSidebar.utils.ts` (Work queue),
 * `src/lib/fleet/fleet-board-order.ts` and
 * `src/components/layout/FleetWorkspaceCard.tsx` (Fleet board cards and rows),
 * `src/lib/agents/agent-work.ts` and `src/components/agents/AgentActivity.tsx`
 * (Agents); `tests/work-attention-order.test.ts`.
 *
 * The rule, highest first:
 *
 * 1. Lane: `action-required`, then `in-progress`, then `in-review`, then
 *    `idle` (see `classifyWorkQueueLane`).
 * 2. Inside a lane: the workspace you are in, then the most urgent attention
 *    item that is shown as a reason (`workQueueAttentionPriority`), then the
 *    live task status, then the most recent activity.
 */
export type WorkQueueLane =
  | "action-required"
  | "in-progress"
  | "in-review"
  | "idle";

/** Fixed display order; also the classification priority order. */
export const WORK_QUEUE_LANE_ORDER: readonly WorkQueueLane[] = [
  "action-required",
  "in-progress",
  "in-review",
  "idle",
] as const;

/**
 * Inputs to the lane. `attentionKind` is the row's highest-priority Fleet
 * attention item (it already folds PR state into attention kinds). `status` is
 * the row's leading task status. `agentRunLane` is the lane an agent run asks
 * for (`agentRunWorkQueueLane` in `src/lib/agent-runs/lanes.ts`).
 */
export interface WorkQueueSignals {
  attentionKind?: FleetAttentionKind;
  status?: FleetTaskStatus;
  agentRunLane?: WorkQueueLane | null;
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
 *
 * An agent run lane competes with these: the higher-priority of the two wins.
 */
export function classifyWorkQueueLane(signals: WorkQueueSignals): WorkQueueLane {
  const taskLane = classifyTaskSignals(signals);
  const agentRunLane = signals.agentRunLane;
  if (!agentRunLane) return taskLane;
  return WORK_QUEUE_LANE_ORDER.indexOf(agentRunLane) <
    WORK_QUEUE_LANE_ORDER.indexOf(taskLane)
    ? agentRunLane
    : taskLane;
}

function classifyTaskSignals(signals: WorkQueueSignals): WorkQueueLane {
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

/**
 * The attention kind a row leads with. A finished result (`result-ready`) is
 * not shown as a leading reason, so it must not pull a row up the order either:
 * a reviewed-later result would otherwise outrank a live row with no visible
 * reason for it.
 */
export function getWorkQueueLeadingAttentionKind(attentionKind?: FleetAttentionKind) {
  return attentionKind === "result-ready" ? undefined : attentionKind;
}

/** The urgency an attention kind adds inside a lane, or none. */
export function workQueueAttentionPriority(attentionKind?: FleetAttentionKind) {
  const leading = getWorkQueueLeadingAttentionKind(attentionKind);
  return leading ? FLEET_ATTENTION_PRIORITY[leading] : undefined;
}

/** Live task status rank inside a lane: waiting on you, failed, running, idle. */
export const WORK_QUEUE_STATUS_RANK: Record<FleetTaskStatus, number> = {
  "waiting-input": 0,
  "waiting-approval": 0,
  error: 1,
  running: 2,
  idle: 3,
};

/** One row as the rule sees it. Every field but `lane` is optional. */
export interface WorkAttentionRank {
  lane: WorkQueueLane;
  /** The workspace the user is standing in. */
  isActive?: boolean;
  /** From `workQueueAttentionPriority`; lower is more urgent. */
  attentionPriority?: number;
  status?: FleetTaskStatus;
  /** ISO time of the row's latest activity; newer first. */
  activityAt?: string | null;
}

/**
 * Order inside one lane. Attention priority is compared, not subtracted: two
 * rows with no attention item are both `Infinity`, and `Infinity - Infinity` is
 * NaN, which silently voids every tiebreak below it.
 */
export function compareWithinWorkQueueLane(
  left: Omit<WorkAttentionRank, "lane">,
  right: Omit<WorkAttentionRank, "lane">,
) {
  const leftActive = Boolean(left.isActive);
  if (leftActive !== Boolean(right.isActive)) {
    return leftActive ? -1 : 1;
  }
  const leftAttention = left.attentionPriority ?? Number.POSITIVE_INFINITY;
  const rightAttention = right.attentionPriority ?? Number.POSITIVE_INFINITY;
  if (leftAttention !== rightAttention) {
    return leftAttention < rightAttention ? -1 : 1;
  }
  const statusDelta =
    WORK_QUEUE_STATUS_RANK[left.status ?? "idle"] -
    WORK_QUEUE_STATUS_RANK[right.status ?? "idle"];
  if (statusDelta !== 0) {
    return statusDelta;
  }
  return (right.activityAt ?? "").localeCompare(left.activityAt ?? "");
}

/** The whole rule: lane first, then the order inside the lane. */
export function compareWorkAttention(left: WorkAttentionRank, right: WorkAttentionRank) {
  const laneDelta =
    WORK_QUEUE_LANE_ORDER.indexOf(left.lane) -
    WORK_QUEUE_LANE_ORDER.indexOf(right.lane);
  return laneDelta !== 0 ? laneDelta : compareWithinWorkQueueLane(left, right);
}

/** Builds a rank from raw signals, so every surface derives it the same way. */
export function rankWorkAttention(
  args: WorkQueueSignals & Omit<WorkAttentionRank, "lane" | "attentionPriority">,
): WorkAttentionRank {
  return {
    lane: classifyWorkQueueLane(args),
    isActive: args.isActive,
    attentionPriority: workQueueAttentionPriority(args.attentionKind),
    status: args.status,
    activityAt: args.activityAt,
  };
}

/**
 * Sorts a copy of `items` by the rule. Ties keep their input order (the sort
 * is stable), so a caller's fallback order survives for equal rows.
 */
export function orderByWorkAttention<T>(
  items: readonly T[],
  rankOf: (item: T) => WorkAttentionRank,
): T[] {
  return items
    .map((item) => ({ item, rank: rankOf(item) }))
    .sort((left, right) => compareWorkAttention(left.rank, right.rank))
    .map((entry) => entry.item);
}
