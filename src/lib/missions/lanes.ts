/**
 * Mission state → work queue lane. The work queue combines this with the
 * workspace's other signals and keeps the highest-priority lane, so a
 * workspace still lands in exactly one lane.
 */
import { SIDEBAR_WORK_QUEUE_LANE_ORDER, type SidebarWorkQueueLane } from "@/lib/fleet/sidebar-work-queue";
import type { MissionDetail } from "./api";
import {
  currentStageRecord,
  isAutomaticMissionPause,
  type MissionPauseReason,
  type MissionState,
  type StageStatus,
} from "./domain";

export interface MissionLaneInput {
  state: MissionState;
  pauseReason: MissionPauseReason | null;
  currentStageStatus: StageStatus;
  /** An open pull request from this mission that nobody has reviewed yet. */
  hasOpenPullRequestAwaitingReview: boolean;
}

/**
 * - Awaiting sign-off, blocked, stuck, a supervisor pause, or stopped short of
 *   the goal: `action-required`.
 * - Running, including watching checks: `in-progress`.
 * - Ended with an open pull request awaiting review: `in-review`.
 * - Ended with nothing open: `idle`.
 * - Paused because the user took over: no opinion (`null`); the task's own
 *   state decides.
 */
export function missionWorkQueueLane(input: MissionLaneInput): SidebarWorkQueueLane | null {
  switch (input.state) {
    case "running":
      return input.currentStageStatus === "awaiting-sign-off" ||
        input.currentStageStatus === "blocked" ||
        input.currentStageStatus === "stuck"
        ? "action-required"
        : "in-progress";
    case "paused":
      return input.pauseReason && isAutomaticMissionPause(input.pauseReason)
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
 * The lane each workspace's missions ask for, the most urgent one when a
 * workspace holds several. An ended mission's review lane needs its report,
 * so ended missions are read as having nothing open.
 */
export function missionLanesByWorkspace(details: Iterable<MissionDetail>): Record<string, SidebarWorkQueueLane> {
  const lanes: Record<string, SidebarWorkQueueLane> = {};
  for (const detail of details) {
    const { mission } = detail;
    const lane = missionWorkQueueLane({
      state: mission.state,
      pauseReason: mission.pauseReason,
      currentStageStatus: currentStageRecord(detail).status,
      hasOpenPullRequestAwaitingReview: false,
    });
    if (!lane) continue;
    const current = lanes[mission.workspaceId];
    if (!current || SIDEBAR_WORK_QUEUE_LANE_ORDER.indexOf(lane) < SIDEBAR_WORK_QUEUE_LANE_ORDER.indexOf(current)) {
      lanes[mission.workspaceId] = lane;
    }
  }
  return lanes;
}
