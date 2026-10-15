import { z } from "zod";
import { AgentRunCommandError, currentStageRecord, EMPTY_STAGE_FACTS, workflowStageAt, type AgentRunAggregate, type AgentRunChange } from "../../../src/lib/agent-runs/domain";
import { revisionsMatch, type ScriptVerification } from "../../../src/lib/agent-runs/verification-contract";
import type { AgentConfig } from "../../../src/lib/agents/schema";
import type { AgentRunStageGrant } from "../../providers/agent-run-grants";

export const RunWorkspaceScriptInputSchema = z.object({ scriptId: z.string().trim().min(1).max(120) }).strict();
export interface WorkspaceScriptReceipt extends ScriptVerification {
  exitCode: number;
  verified: boolean;
  outputTail: string;
}
export interface WorkspaceCheckDependencies {
  taskAgent?: (taskId: string) => AgentConfig | null;
  listWorkspaceActionScripts?: (workspaceId: string) => Promise<string[]>;
  runWorkspaceScript?: (args: { workspaceId: string; scriptId: string }) => Promise<{ exitCode: number; output: string; verification: ScriptVerification }>;
}

/** Keep the supervisor queue free while the process runs. The per-run reservation
 * refuses overlaps; admission and recording still use the supervisor queue. */
export function createStageScriptRunner(deps: WorkspaceCheckDependencies & {
  enqueue: <T>(operation: () => T | Promise<T>) => Promise<T>;
  requireGrant: (key: string) => { grant: AgentRunStageGrant; aggregate: AgentRunAggregate };
  isDelegated: (aggregate: AgentRunAggregate) => boolean;
  applyChange: (change: AgentRunChange) => unknown;
}) {
  const running = new Set<string>();
  const refuse = (message: string): never => { throw new AgentRunCommandError("refused", message); };
  function context(key: string) {
    const current = deps.requireGrant(key);
    const { grant, aggregate } = current;
    const record = currentStageRecord(aggregate);
    if (record.stageId !== grant.stageId || record.attempt !== grant.attempt) refuse("The run has moved on from this turn's stage.");
    if (aggregate.agentRun.state !== "running" || !["running", "blocked", "stuck"].includes(record.status)) refuse("The current run stage is not running.");
    if (deps.isDelegated(aggregate)) refuse("Workspace scripts require a primary run.");
    const agent = deps.taskAgent?.(grant.taskId);
    if (!agent) return refuse("Assign a write-capable agent before running a workspace script.");
    if (agent.permission === "read-only") refuse("A read-only agent cannot run workspace scripts.");
    if (workflowStageAt(aggregate.agentRun, aggregate.agentRun.currentStageIndex).kind !== "ai") refuse("Workspace scripts require an AI Work stage, not an action stage.");
    return { ...current, record };
  }
  return async ({ agentRunKey, scriptId }: { agentRunKey: string; scriptId: string }): Promise<WorkspaceScriptReceipt> => {
    const input = RunWorkspaceScriptInputSchema.parse({ scriptId });
    const admitted = await deps.enqueue(async () => {
      const current = context(agentRunKey);
      if (running.has(current.aggregate.agentRun.id)) refuse("A workspace script is already running for this run. Wait for its result.");
      if (!deps.runWorkspaceScript || !deps.listWorkspaceActionScripts) refuse("Workspace script execution is unavailable.");
      const ids = await deps.listWorkspaceActionScripts!(current.aggregate.agentRun.workspaceId);
      if (!ids.includes(input.scriptId)) refuse(`Unknown workspace action script: ${input.scriptId}.`);
      running.add(current.aggregate.agentRun.id);
      return current;
    });
    try {
      const startedAt = Date.now();
      const result = await deps.runWorkspaceScript!({ workspaceId: admitted.aggregate.agentRun.workspaceId, scriptId: input.scriptId });
      const check = { source: "stave" as const, type: "run-script" as const, scriptId: input.scriptId, exitCode: result.exitCode,
        verification: result.verification, outputTail: result.output.slice(-2_000), durationMs: Math.max(0, Date.now() - startedAt) };
      await deps.enqueue(() => {
        const { aggregate, record } = context(agentRunKey);
        if (record.stageId !== admitted.record.stageId || record.attempt !== admitted.record.attempt || aggregate.agentRun.id !== admitted.aggregate.agentRun.id)
          refuse("The run has moved on from this script's stage.");
        deps.applyChange({ agentRun: aggregate.agentRun, events: [], upserts: [{ ...record, facts: {
          ...(record.facts ?? EMPTY_STAGE_FACTS),
          workspaceScripts: [...(record.facts?.workspaceScripts ?? []), check].slice(-50),
          workspaceRevision: check.verification.completedRevision,
        } }] });
      });
      return { exitCode: check.exitCode, verified: check.exitCode === 0 && revisionsMatch(check.verification.sourceRevision, check.verification.completedRevision),
        ...check.verification, outputTail: check.outputTail };
    } finally { running.delete(admitted.aggregate.agentRun.id); }
  };
}
