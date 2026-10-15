import { z } from "zod";
import { i18n } from "../../../src/i18n/runtime";
import { AgentRunCommandError, currentStageRecord, EMPTY_STAGE_FACTS, workflowStageAt, type AgentRunAggregate, type AgentRunChange } from "../../../src/lib/agent-runs/domain";
import { scriptVerificationProblem } from "../../../src/lib/agent-runs/workspace-check";
import { WORKSPACE_SCRIPT_TIMEOUT_MS, type FrozenWorkspaceScript, type ScriptVerification } from "../../../src/lib/agent-runs/verification-contract";
import type { AgentConfig } from "../../../src/lib/agents/schema";
import type { AgentRunStageGrant } from "../../providers/agent-run-grants";

export const RunWorkspaceScriptInputSchema = z.object({ scriptId: z.string().trim().min(1).max(120) }).strict();
export interface WorkspaceScriptReceipt extends ScriptVerification {
  exitCode: number;
  verified: boolean;
  outputTail: string;
  reason?: string;
}
export interface WorkspaceCheckDependencies {
  taskAgent?: (taskId: string) => AgentConfig | null;
  listWorkspaceActionScripts?: (workspaceId: string) => Promise<FrozenWorkspaceScript[]>;
  runWorkspaceScript?: (args: { workspaceId: string; scriptId: string; expectedDefinitionHash: string; signal: AbortSignal }) => Promise<{
    exitCode: number; output: string; verification: ScriptVerification;
    definitionHash: string; executedCommands: string; commandsTruncated: boolean;
  }>;
}

/** Process execution stays outside the supervisor queue. Abort also fences late
 * results, including a runner that returns after its reservation was released. */
export function createStageScriptRunner(deps: WorkspaceCheckDependencies & {
  enqueue: <T>(operation: () => T | Promise<T>) => Promise<T>;
  requireGrant: (key: string) => { grant: AgentRunStageGrant; aggregate: AgentRunAggregate };
  isDelegated: (aggregate: AgentRunAggregate) => boolean;
  applyChange: (change: AgentRunChange) => unknown;
  setTimeout?: typeof globalThis.setTimeout;
  clearTimeout?: typeof globalThis.clearTimeout;
}) {
  const running = new Map<string, { controller: AbortController; stageId: string; attempt: number }>();
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
  function abort(agentRunId: string) {
    running.get(agentRunId)?.controller.abort(new Error("The workspace script was stopped with its run."));
  }
  const run = async ({ agentRunKey, scriptId }: { agentRunKey: string; scriptId: string }): Promise<WorkspaceScriptReceipt> => {
    const input = RunWorkspaceScriptInputSchema.parse({ scriptId });
    const admitted = await deps.enqueue(async () => {
      const current = context(agentRunKey);
      if (running.has(current.aggregate.agentRun.id)) refuse("A workspace script is already running for this run. Wait for its result.");
      if (!deps.runWorkspaceScript || !deps.listWorkspaceActionScripts) refuse("Workspace script execution is unavailable.");
      const scripts = await deps.listWorkspaceActionScripts!(current.aggregate.agentRun.workspaceId);
      const script = scripts.find((entry) => entry.scriptId === input.scriptId);
      if (!script) return refuse(`Unknown workspace action script: ${input.scriptId}.`);
      const definitions = current.aggregate.agentRun.workflow.stages.flatMap((stage) => stage.kind === "ai" ? (stage.acceptanceCriteria ?? []).flatMap((criterion) => criterion.scriptDefinitions ?? []) : []);
      const frozen = definitions.find((entry) => entry.scriptId === input.scriptId);
      if (!frozen) return refuse(`Script ${input.scriptId} has no definition frozen at admission. Start a new run with a readable workspace revision.`);
      if (script.definitionHash !== frozen.definitionHash) return refuse(`Script ${input.scriptId} definition changed after this run started. Restore the admitted definition or start a new run.`);
      const owned = { controller: new AbortController(), stageId: current.record.stageId, attempt: current.record.attempt };
      running.set(current.aggregate.agentRun.id, owned);
      return { ...current, owned, frozen };
    });
    const { controller } = admitted.owned;
    const { signal } = controller;
    const timer = (deps.setTimeout ?? globalThis.setTimeout)(() => controller.abort(new Error("The workspace script was stopped after 30 minutes.")), WORKSPACE_SCRIPT_TIMEOUT_MS);
    timer.unref?.();
    let onAbort = () => {};
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
    try {
      const startedAt = Date.now();
      const execution = Promise.resolve().then(() => {
        signal.throwIfAborted();
        return deps.runWorkspaceScript!({ workspaceId: admitted.aggregate.agentRun.workspaceId, scriptId: input.scriptId, expectedDefinitionHash: admitted.frozen.definitionHash, signal });
      });
      const result = await Promise.race([execution, aborted]);
      signal.throwIfAborted();
      if (result.definitionHash !== admitted.frozen.definitionHash) refuse("The executed script definition did not match the admitted check.");
      const check = { source: "stave" as const, type: "run-script" as const, scriptId: input.scriptId, exitCode: result.exitCode,
        verification: result.verification, outputTail: result.output.slice(-2_000), durationMs: Math.max(0, Date.now() - startedAt),
        definitionHash: result.definitionHash, executedCommands: result.executedCommands.slice(0, 2_000), commandsTruncated: result.commandsTruncated || result.executedCommands.length > 2_000 };
      await deps.enqueue(() => {
        signal.throwIfAborted();
        const { aggregate, record } = context(agentRunKey);
        if (record.stageId !== admitted.record.stageId || record.attempt !== admitted.record.attempt || aggregate.agentRun.id !== admitted.aggregate.agentRun.id)
          refuse("The run has moved on from this script's stage.");
        deps.applyChange({ agentRun: aggregate.agentRun, events: [], upserts: [{ ...record, facts: {
          ...(record.facts ?? EMPTY_STAGE_FACTS),
          workspaceScripts: [...(record.facts?.workspaceScripts ?? []), check].slice(-50),
          workspaceRevision: check.verification.completedRevision,
        } }] });
      });
      const reason = scriptVerificationProblem(check.verification) ?? (check.exitCode !== 0 ? i18n.t("agentRuns:workspaceCheck.failed", { exitCode: check.exitCode }) : undefined);
      return { exitCode: check.exitCode, verified: !reason, ...check.verification, outputTail: check.outputTail, ...(reason ? { reason } : {}) };
    } finally {
      (deps.clearTimeout ?? globalThis.clearTimeout)(timer);
      signal.removeEventListener("abort", onAbort);
      if (running.get(admitted.aggregate.agentRun.id) === admitted.owned) running.delete(admitted.aggregate.agentRun.id);
    }
  };
  return {
    run, abort,
    stop: () => { for (const id of running.keys()) abort(id); },
    onChange: (change: AgentRunChange) => {
      const owned = running.get(change.agentRun.id);
      if (owned && (change.agentRun.state !== "running" || change.agentRun.workflow.stages[change.agentRun.currentStageIndex]?.id !== owned.stageId ||
        change.upserts.some((stage) => stage.stageId === owned.stageId && (stage.attempt !== owned.attempt || ["completed", "skipped", "cancelled"].includes(stage.status))))) abort(change.agentRun.id);
    },
  };
}
