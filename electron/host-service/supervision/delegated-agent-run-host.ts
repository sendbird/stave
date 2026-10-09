import { DelegatedAgentRunStartSchema, buildDelegatedAgentRunInput, type DelegatedAgentRunStart } from "../../../src/lib/agent-runs/delegated-run";
import type { AgentAssignment } from "../../../src/lib/agents/assign";
import type { AgentRunRuntime } from "./agent-run-runtime";

/** Main-only preparation; it creates an idle child before the existing supervisor. */
export async function prepareDelegatedAgentRun(args: {
  start: DelegatedAgentRunStart;
  runtime: AgentRunRuntime;
  assignmentForTask: (taskId: string) => AgentAssignment | null;
  createTask: (args: { workspaceId: string; taskId: string; parentTaskId: string; title: string; provider: "claude-code" | "codex"; model: string }) => Promise<unknown>;
}) {
  const start = DelegatedAgentRunStartSchema.parse(args.start);
  if (!args.runtime.isDelegatedExecutionCurrent(start.agentRunId, start.taskId, start.authority))
    throw new Error("The delegation is no longer admitted; no child task was created.");
  const assignment = args.assignmentForTask(start.taskId);
  if (!assignment || assignment.role !== "delegate" || assignment.workspaceId !== start.workspaceId ||
      assignment.agentContentHash !== start.authority.agentContentHash || assignment.agentConfigId !== start.authority.agentConfigId ||
      assignment.requestId !== `delegated:${start.authority.executionId}`)
    throw new Error("The admitted delegated Agent snapshot is unavailable.");
  const reservation = args.runtime.reserveChildResources({ parentTaskId: start.authority.parentTaskId,
    childRunId: start.agentRunId, executionId: start.authority.executionId, requestedTurns: start.maxTurns, providerId: start.authority.permissionPolicy.providerId, model: start.model, expectedRootRunId: start.authority.resourceRootRunId });
  try {
  await args.createTask({ workspaceId: start.workspaceId, taskId: start.taskId, parentTaskId: start.authority.parentTaskId,
    title: start.title, provider: start.authority.permissionPolicy.providerId, model: start.model });
  return args.runtime.prepareDelegatedAgentRun({ agentRunId: start.agentRunId, model: start.model, authority: start.authority,
    input: buildDelegatedAgentRunInput({ start: { ...start, maxTurns: reservation?.capacity ?? start.maxTurns }, agent: assignment.agent, now: new Date() }),
    ...(reservation ? { resourceLink: reservation.link } : {}) });
  } catch (error) { if (reservation) args.runtime.releaseChildResources(reservation.link); throw error; }
}
