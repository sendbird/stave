/**
 * Agent run state → work queue lane. The work queue combines this with the
 * workspace's other signals and keeps the highest-priority lane, so a
 * workspace still lands in exactly one lane.
 */
import { SIDEBAR_WORK_QUEUE_LANE_ORDER, type SidebarWorkQueueLane } from "@/lib/fleet/sidebar-work-queue";
import type { AgentRunDetail } from "./api";
import {
  currentStageRecord,
  isActiveAgentRunState,
  isAutomaticAgentRunPause,
  type AgentRun,
  type AgentRunPauseReason,
  type AgentRunState,
  type StageStatus,
} from "./domain";
import { awaitsUsageReset } from "./usage-limit";

export interface AgentRunLaneInput {
  state: AgentRunState;
  pauseReason: AgentRunPauseReason | null;
  currentStageStatus: StageStatus;
  /** An open pull request from this agent run that nobody has reviewed yet. */
  hasOpenPullRequestAwaitingReview: boolean;
  /** A usage-limit pause's reservation; without a resume time the run needs the user. */
  usageLimit?: AgentRun["usageLimit"] | null;
}

/**
 * - Awaiting sign-off, blocked, stuck, a supervisor pause, a usage limit with
 *   no known reset, or stopped short of the goal: `action-required`.
 * - Running, including watching checks, or waiting for a known usage reset:
 *   `in-progress`.
 * - Ended with an open pull request awaiting review: `in-review`.
 * - Ended with nothing open: `idle`.
 * - Paused because the user took over: no opinion (`null`); the task's own
 *   state decides.
 */
export function agentRunWorkQueueLane(input: AgentRunLaneInput): SidebarWorkQueueLane | null {
  switch (input.state) {
    case "running":
      return input.currentStageStatus === "awaiting-sign-off" ||
        input.currentStageStatus === "blocked" ||
        input.currentStageStatus === "stuck"
        ? "action-required"
        : "in-progress";
    case "paused":
      if (input.pauseReason === "usage-limit") {
        return awaitsUsageReset({ usageLimit: input.usageLimit ?? undefined }) ? "in-progress" : "action-required";
      }
      // The event it waited for never came: the user decides how it goes on.
      if (input.pauseReason === "wait-expired") return "action-required";
      return input.pauseReason && isAutomaticAgentRunPause(input.pauseReason)
        ? "action-required"
        : null;
    case "stopped":
      return "action-required";
    case "completed":
    case "cancelled":
      return input.hasOpenPullRequestAwaitingReview ? "in-review" : "idle";
  }
}

/**
 * The lane each workspace's agent runs ask for, the most urgent one when a
 * workspace holds several. An ended agent run speaks only while it is the
 * workspace's newest: an agent run started after it has taken over, so an old
 * stop no longer holds the workspace in Action required. An ended agent run's
 * review lane needs its report, so ended agent runs are read as having nothing
 * open.
 */
export function agentRunLanesByWorkspace(details: Iterable<AgentRunDetail>): Record<string, SidebarWorkQueueLane> {
  const all = [...details];
  const newestByWorkspace = new Map<string, number>();
  for (const { agentRun } of all) {
    const createdAt = Date.parse(agentRun.createdAt);
    if (createdAt > (newestByWorkspace.get(agentRun.workspaceId) ?? -Infinity)) {
      newestByWorkspace.set(agentRun.workspaceId, createdAt);
    }
  }
  const lanes: Record<string, SidebarWorkQueueLane> = {};
  for (const detail of all) {
    const { agentRun } = detail;
    const superseded =
      !isActiveAgentRunState(agentRun.state) &&
      Date.parse(agentRun.createdAt) < (newestByWorkspace.get(agentRun.workspaceId) ?? -Infinity);
    if (superseded) continue;
    const lane = agentRunWorkQueueLane({
      state: agentRun.state,
      pauseReason: agentRun.pauseReason,
      currentStageStatus: currentStageRecord(detail).status,
      hasOpenPullRequestAwaitingReview: false,
      usageLimit: agentRun.usageLimit,
    });
    if (!lane) continue;
    const current = lanes[agentRun.workspaceId];
    if (!current || SIDEBAR_WORK_QUEUE_LANE_ORDER.indexOf(lane) < SIDEBAR_WORK_QUEUE_LANE_ORDER.indexOf(current)) {
      lanes[agentRun.workspaceId] = lane;
    }
  }
  return lanes;
}
