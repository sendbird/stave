/**
 * Builds the assign runtime from the host service's real dependencies and
 * routes `agent.invoke`, so `electron/host-service.ts` only wires it.
 *
 * Used by: `electron/host-service.ts`.
 */
import type { AgentDelegationContext, AgentInvokeResult, HostAgentAction } from "../../../src/lib/agents/api";
import { RecordTaskAgentInputSchema } from "../../../src/lib/agents/assign";
import { listAgents, normalizeCustomAgents } from "../../../src/lib/agents/library";
import { activeStandards, normalizeMyStandards } from "../../../src/lib/agents/standards";
import type { AgentConfig } from "../../../src/lib/agents/schema";
import { taskAgentRuntimeOptions } from "../../../src/lib/agents/runtime-options";
import { setTaskRuntimeOptionsResolver } from "../../providers/runtime";
import * as localMcpRuntime from "../local-mcp-runtime";
import { ensureHostServicePersistenceReady } from "../persistence";
import { runSupervisedTurn } from "../supervised-turn";
import { AssignError, createAssignRuntime, type AssignRuntime } from "./assign-runtime";

export function createHostAssignRuntime(args: {
  emitChanged: (event: { assignmentId: string; state: string }) => void;
}): AssignRuntime & { start: () => void } {
  const persistence = ensureHostServicePersistenceReady();
  const runtime = createAssignRuntime({
    store: persistence.agentAssignments,
    createWorktree: async ({ repositoryPath, name, label }) => {
      // Creating a workspace on a branch that already has one returns that
      // workspace; the ids known before tell intake it was not new.
      const repositories = await localMcpRuntime.listKnownRepositories();
      const known = new Set(repositories.flatMap((repository) => repository.workspaces.map((workspace) => workspace.id)));
      const created = await localMcpRuntime.createWorkspace({ repositoryPath, name, label, mode: "branch" });
      return { workspaceId: created.workspaceId, existed: known.has(created.workspaceId) };
    },
    createIdleTask: (task) => localMcpRuntime.createIdleTask(task),
    runFirstTurn: (turn) => runSupervisedTurn(turn),
    emitChanged: (row) => args.emitChanged({ assignmentId: row.id, state: row.state }),
  });
  return {
    ...runtime,
    start() {
      runtime.recover();
      // Every later turn of an assigned task runs as the same agent version.
      setTaskRuntimeOptionsResolver(({ taskId, providerId, runtimeOptions }) => {
        const task = runtime.taskAgent(taskId);
        return task
          ? taskAgentRuntimeOptions({ agent: task.agent, providerId, base: runtimeOptions, standards: task.standards })
          : {};
      });
    },
  };
}

/** The host's copy of the renderer's custom agents, for projects and missions. */
let hostCustomAgents: AgentConfig[] = [];
/** The user's standards, when on; a project mission's task starts with them. */
let hostStandards: string | undefined;

export function hostMyStandards() {
  return hostStandards;
}

export function hostAgents(): AgentConfig[] {
  return listAgents({ custom: hostCustomAgents, activeOnly: true });
}

/**
 * Looks up the project a task works for, when it does. Set by the project
 * host so this module does not import project persistence.
 */
let projectAgentsForTask: (taskId: string) => string[] | null = () => null;

export function setProjectAgentsLookup(lookup: (taskId: string) => string[] | null) {
  projectAgentsForTask = lookup;
}

export async function invokeAgentAction(
  runtime: AssignRuntime,
  action: HostAgentAction,
  args: unknown,
): Promise<AgentInvokeResult<unknown>> {
  try {
    switch (action) {
      case "assign":
        return { ok: true, value: await runtime.assign(args) };
      case "record-task": {
        const value = RecordTaskAgentInputSchema.parse(args);
        return {
          ok: true,
          value: runtime.recordTaskAgent({
            requestId: value.requestId,
            taskId: value.taskId,
            workspaceId: value.workspaceId,
            repositoryPath: value.repositoryPath,
            agent: value.agent,
            providerId: value.providerId,
            model: value.model ?? null,
            assignment: value.assignment,
            ...(value.standards ? { standards: value.standards } : {}),
          }),
        };
      }
      case "list-assignments": {
        const value = (args ?? {}) as { agentConfigId?: string; limit?: number };
        return { ok: true, value: runtime.list(value) };
      }
      case "sync-agents": {
        const payload = (args ?? {}) as { customAgents?: unknown; myStandards?: unknown };
        hostCustomAgents = normalizeCustomAgents(payload.customAgents).agents;
        hostStandards = activeStandards(normalizeMyStandards(payload.myStandards));
        return { ok: true, value: { count: hostCustomAgents.length } };
      }
      case "delegation-context": {
        const taskId = String((args as { parentTaskId?: unknown } | null)?.parentTaskId ?? "");
        const value: AgentDelegationContext = {
          parentPermission: runtime.agentForTask(taskId)?.permission ?? null,
          allowedAgentIds: projectAgentsForTask(taskId),
        };
        return { ok: true, value };
      }
    }
  } catch (error) {
    if (error instanceof AssignError) return { ok: false, code: error.code, message: error.message };
    return { ok: false, code: "failed", message: error instanceof Error ? error.message : "The agent request failed." };
  }
}
