import type { AgentAssignment, AssignmentState } from "./assign";
import type { FleetTaskStatus } from "@/lib/fleet/task-status";

/**
 * The Activity summary of one agent, derived from its assignment rows and the
 * live Fleet status of the tasks those rows started. Pure so the header's
 * counts are decided and tested here, and the component can memoize the result
 * outside any zustand selector — the selector only ever returns the raw store
 * slices, never a fresh object built from them.
 *
 * "Running", "needs you" and "couldn't start" come from two sources that do
 * not overlap: an assignment's own start state carries "couldn't start"
 * (`failed`), while whether a started task is running or waiting is the live
 * Fleet status of its task id, exactly as the sidebar's `collectAgentsWithWork`
 * derives it. An assignment with no live status (a cold workspace) counts only
 * toward the total and "last used".
 */

export interface AgentActivitySummary {
  /** Every recorded assignment for this agent. */
  total: number;
  /** Tasks whose live Fleet status is `running`. */
  running: number;
  /** Tasks waiting for the user (input or approval). */
  needsYou: number;
  /** Assignments whose start failed (`failed`), which never became a task. */
  couldntStart: number;
  /** ISO time of the newest assignment, or null when there are none. */
  lastUsedAt: string | null;
}

function needsYou(status: FleetTaskStatus): boolean {
  return status === "waiting-input" || status === "waiting-approval";
}

export function summarizeAgentActivity(args: {
  assignments: readonly AgentAssignment[];
  /** Live Fleet status by task id, for the tasks the assignments started. */
  statusByTaskId: Readonly<Record<string, FleetTaskStatus | undefined>>;
}): AgentActivitySummary {
  let running = 0;
  let waiting = 0;
  let couldntStart = 0;
  let lastUsedAt: string | null = null;

  for (const assignment of args.assignments) {
    if (!lastUsedAt || assignment.createdAt > lastUsedAt) {
      lastUsedAt = assignment.createdAt;
    }
    if (assignment.state === "failed") {
      couldntStart += 1;
      continue;
    }
    const status = assignment.taskId ? args.statusByTaskId[assignment.taskId] : undefined;
    if (status === "running") running += 1;
    else if (status && needsYou(status)) waiting += 1;
  }

  return {
    total: args.assignments.length,
    running,
    needsYou: waiting,
    couldntStart,
    lastUsedAt,
  };
}

/** UI: filter chips for the Work list, matched against an assignment's own state. */
export const AGENT_ACTIVITY_FILTERS = ["all", "started", "failed", "interrupted"] as const;
export type AgentActivityFilter = (typeof AGENT_ACTIVITY_FILTERS)[number];

export const AGENT_ACTIVITY_FILTER_LABELS: Readonly<Record<AgentActivityFilter, string>> = {
  all: "All",
  started: "Started",
  failed: "Couldn't start",
  interrupted: "Interrupted",
};

export function matchesAgentActivityFilter(state: AssignmentState, filter: AgentActivityFilter): boolean {
  if (filter === "all") return true;
  if (filter === "started") return state === "started" || state === "preparing";
  return state === filter;
}
