/**
 * Builds the assign runtime from the host service's real dependencies and
 * routes `agent.invoke`, so `electron/host-service.ts` only wires it.
 *
 * Used by: `electron/host-service.ts`.
 */
import type { AgentInvokeResult, HostAgentAction } from "../../../src/lib/agents/api";
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
        const agent = runtime.agentForTask(taskId);
        return agent ? taskAgentRuntimeOptions({ agent, providerId, base: runtimeOptions }) : {};
      });
    },
  };
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
      case "list-assignments": {
        const value = (args ?? {}) as { agentConfigId?: string; limit?: number };
        return { ok: true, value: runtime.list(value) };
      }
    }
  } catch (error) {
    if (error instanceof AssignError) return { ok: false, code: error.code, message: error.message };
    return { ok: false, code: "failed", message: error instanceof Error ? error.message : "The agent request failed." };
  }
}
