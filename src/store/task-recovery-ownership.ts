import { isActiveAgentRunState } from "@/lib/agent-runs/domain";
import { tarsHoldsTask } from "@/store/tars-owned-control";

const ASSIGNMENT_READ_LIMIT = 500;

type Assignments = Awaited<ReturnType<NonNullable<NonNullable<Window["api"]>["agents"]>["listAssignments"]>>;
type AgentRuns = Awaited<ReturnType<NonNullable<NonNullable<Window["api"]>["agentRuns"]>["list"]>>;

/**
 * Ownership reads shared by every task evaluated in one pass, so a startup
 * with several interrupted tasks reads assignments once and runs once per
 * workspace.
 */
export function createTaskOwnershipReads() {
  let assignments: Promise<Assignments | undefined> | undefined;
  const runs = new Map<string, Promise<AgentRuns | undefined>>();
  const failed = { ok: false } as never;
  return {
    assignments: () => (assignments ??= Promise.resolve(window.api?.agents?.listAssignments({ limit: ASSIGNMENT_READ_LIMIT })).catch(() => failed)),
    runs: (workspaceId: string) => {
      let read = runs.get(workspaceId);
      if (!read) {
        read = Promise.resolve(window.api?.agentRuns?.list({ workspaceId, includeActive: true })).catch(() => failed);
        runs.set(workspaceId, read);
      }
      return read;
    },
  };
}
export type TaskOwnershipReads = ReturnType<typeof createTaskOwnershipReads>;

/**
 * Whether an agent run, an assignment or Tars owns the task. "unreadable"
 * means ownership could not be established; it never counts as free.
 */
export async function readTaskOwnership(args: {
  taskId: string;
  workspaceId: string;
  reads?: TaskOwnershipReads;
}): Promise<"owned" | "free" | "unreadable"> {
  const reads = args.reads ?? createTaskOwnershipReads();
  const [assignments, runs] = await Promise.all([reads.assignments(), reads.runs(args.workspaceId)]);
  if ((window.api?.agents && !assignments?.ok) || (window.api?.agentRuns && !runs?.ok)) return "unreadable";
  // A full page that does not mention the task may have cut its assignment off.
  if (assignments?.ok && assignments.value.length >= ASSIGNMENT_READ_LIMIT && !assignments.value.some(row => row.taskId === args.taskId)) {
    return "unreadable";
  }
  const owned = Boolean(assignments?.ok && assignments.value.some(row => row.taskId === args.taskId && !row.endedAt)) ||
    Boolean(runs?.ok && runs.agentRuns.some(run => run.leadTaskId === args.taskId && isActiveAgentRunState(run.state))) ||
    await tarsHoldsTask({ taskId: args.taskId, workspaceId: args.workspaceId });
  return owned ? "owned" : "free";
}
