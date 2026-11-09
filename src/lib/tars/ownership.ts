import { isActiveAgentRunState, type AgentRunEvent } from "../agent-runs/domain";
import type { AgentRunDetail } from "../agent-runs/api";
import type { TarsControlOperation } from "./conversation";
import type { TarsResponsibility, TarsSnapshot, TarsState } from "./types";

/** What a Fleet row or a task view knows about the work it shows. */
export interface TarsOwnershipTarget {
  taskId?: string | null;
  /**
   * The task's active agent run: its id, null when it has none, or left out
   * while unknown. When known, only the responsibility's own run is Tars's;
   * another run on the same task (yours, after Tars lost it) never is.
   */
  agentRunId?: string | null;
  /** That run's workflow id, which names the responsibility that started it. */
  agentRunWorkflowId?: string | null;
  /** The task's workspace; it must be the responsibility's execution workspace when both are known. */
  workspaceId?: string | null;
}

/** The workflow id of a run Tars starts for a responsibility (`electron/host-service/tars-execution.ts`). */
export function tarsWorkflowId(responsibilityId: string) {
  return `tars-${responsibilityId}`;
}

/** A run's own marker that Tars started it, readable without the Tars snapshot. */
export function isTarsWorkflowId(workflowId: string | null | undefined) {
  return Boolean(workflowId && /^tars-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(workflowId));
}

/** The responsibility a control must name, at the revision it was resolved from. */
export interface TarsOwner {
  responsibilityId: string;
  revision: number;
  state: TarsState;
  title: string;
}

/** An intent another surface expresses about the work: stop it, continue it, or make it yours. */
export type TarsOwnedIntent = "pause" | "resume" | "takeover";

/**
 * States in which Tars holds the work. Ended work belongs to no one; work you
 * took over is yours until you hand it back, so its controls act directly.
 */
const NOT_HELD: ReadonlySet<TarsState> = new Set(["completed", "cancelled", "takenOver"]);

function matches(row: TarsResponsibility, target: TarsOwnershipTarget) {
  if (!target.taskId) return Boolean(target.agentRunId) && row.agentRunId === target.agentRunId;
  if (row.taskId !== target.taskId) return false;
  if (target.workspaceId && row.executionWorkspaceId && row.executionWorkspaceId !== target.workspaceId) return false;
  // An unknown run leaves the task to decide; a known one must be the responsibility's own.
  if (target.agentRunId === undefined) return true;
  if (row.agentRunId) return row.agentRunId === target.agentRunId;
  // Tars has not recorded its run yet: a run on the task is its own only when its workflow says so.
  return !target.agentRunId || !target.agentRunWorkflowId || target.agentRunWorkflowId === tarsWorkflowId(row.id);
}

/** The task's active agent run among the runs a surface holds, or null for none. */
export function findActiveTaskRun(details: Readonly<Record<string, AgentRunDetail>>, workspaceId: string, taskId: string): AgentRunDetail | null {
  for (const detail of Object.values(details)) {
    const run = detail.agentRun;
    if (run.workspaceId === workspaceId && run.leadTaskId === taskId && isActiveAgentRunState(run.state)) return detail;
  }
  return null;
}

/** The ownership target of a task given its active run: a detail, null for none, undefined while unknown. */
export function tarsTaskTarget(taskId: string, workspaceId: string, run: AgentRunDetail | null | undefined): TarsOwnershipTarget {
  if (run === undefined) return { taskId, workspaceId };
  return { taskId, workspaceId, agentRunId: run?.agentRun.id ?? null, agentRunWorkflowId: run?.agentRun.workflow.id ?? null };
}

/**
 * Whether a turn of the run is the user's own, as the host records it (a
 * `user-turn`, or a turn linked as a user reply). An unrecorded turn is not:
 * it may be the run's automatic turn that the run's events have not caught up with.
 */
export function isRecordedUserTurn(events: readonly AgentRunEvent[] | undefined, turnId: string | null | undefined) {
  if (!events || !turnId) return false;
  return events.some((event) => event.detail.turnId === turnId &&
    (event.kind === "user-turn" || (event.kind === "turn-linked" && event.detail.reason === "user-reply")));
}

/**
 * The responsibility that holds this task or run, or null. Returns the
 * snapshot's own row so a store selector can return it without a new object.
 */
export function findTarsResponsibility(
  responsibilities: readonly TarsResponsibility[] | null | undefined,
  target: TarsOwnershipTarget,
): TarsResponsibility | null {
  if (!responsibilities || (!target.taskId && !target.agentRunId)) return null;
  return responsibilities.find((row) => !NOT_HELD.has(row.state) && matches(row, target)) ?? null;
}

export function toTarsOwner(row: TarsResponsibility | null): TarsOwner | null {
  return row ? { responsibilityId: row.id, revision: row.revision, state: row.state, title: row.title } : null;
}

/** Whether an active Tars responsibility owns this task or run, with the id and revision to control it. */
export function resolveTarsOwner(
  snapshot: Pick<TarsSnapshot, "responsibilities"> | null | undefined,
  target: TarsOwnershipTarget,
): TarsOwner | null {
  return toTarsOwner(findTarsResponsibility(snapshot?.responsibilities, target));
}

/**
 * The Tars control an intent becomes, or null when it needs none. A stop of
 * work Tars holds is Tars's pause, except work Tars already paused: there it
 * only stops your own turn. Taking over is Tars's takeover, never a cancel.
 * Either way the task's run is never cancelled while Tars holds the work.
 */
export function tarsOperationFor(owner: Pick<TarsOwner, "state"> | null, intent: TarsOwnedIntent): TarsControlOperation | null {
  if (!owner || NOT_HELD.has(owner.state)) return null;
  if (intent === "pause") return owner.state === "paused" ? null : "pause";
  // Only work Tars itself paused continues through Tars; any other wait (a usage limit) is the run's own.
  if (intent === "resume") return owner.state === "paused" ? "resume" : null;
  return "takeover";
}
