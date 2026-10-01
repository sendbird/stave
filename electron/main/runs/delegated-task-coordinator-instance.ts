import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { webContents } from "electron";
import { resolveDelegatedTaskConcurrencyLimit } from "../../../src/lib/runs/delegated-task";
import type { HostTaskStopArgs } from "../../host-service/protocol";
import { invokeHostService, onHostServiceEvent } from "../host-service-client";
import {
  createWorkspace,
  getTaskStatus,
  listKnownRepositories,
  releaseTaskParent,
  runTask,
} from "../stave-mcp-service";
import { ensurePersistenceReady } from "../state";
import { createDelegatedTaskCoordinator } from "./delegated-task-coordinator";
import { createDelegatedTaskHostPort } from "./delegated-task-host-port";
import { applyAgentToDelegation } from "../../../src/lib/agents/delegate";
import type { AgentDelegationContext, AgentInvokeResult } from "../../../src/lib/agents/api";
import type { DelegateTaskArgs } from "../../../src/lib/runs/delegated-task";
import { findAgent, getMyStandards } from "../agents/agent-registry";
import { activeStandards } from "../../../src/lib/agents/standards";
import { ASSIGNMENT_LIMITS } from "../../../src/lib/agents/assign";

const execFileAsync = promisify(execFile);

/** `git rev-parse HEAD` at a workspace path; null when it cannot be read. */
async function readHead(workspacePath: string) {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: workspacePath, timeout: 10_000 });
    const head = stdout.trim();
    return /^[0-9a-f]{7,64}$/i.test(head) ? head : null;
  } catch {
    return null;
  }
}

/**
 * `agentConfigId` on a delegation: the agent from main's copy, limited by the
 * delegating task's own agent and its project's Agents, which the host knows.
 */
async function applyAgent(args: DelegateTaskArgs) {
  const agent = findAgent(args.agentConfigId!);
  if (!agent) return { ok: false as const, message: `No active agent "${args.agentConfigId}".` };
  const context = (await invokeHostService("agent.invoke", {
    action: "delegation-context",
    args: { parentTaskId: args.parentTaskId },
  })) as AgentInvokeResult<AgentDelegationContext>;
  if (!context.ok) return { ok: false as const, message: context.message };
  const standards = activeStandards(getMyStandards());
  const result = applyAgentToDelegation({
    args,
    agent,
    parentPermission: context.value.parentPermission,
    allowedAgentIds: context.value.allowedAgentIds,
    parentCanCall: context.value.parentCanCall,
    standards,
  });
  return result.ok
    ? { ok: true as const, args: { ...result.args, prompt: args.prompt },
        agentContentHash: result.snapshot.contentHash, snapshot: result.snapshot, standards }
    : { ok: false as const, message: result.message };
}

/**
 * Wires the delegated-task coordinator to the real ledger and the real task
 * machinery. The coordinator itself stays free of both so it can be tested
 * against fakes.
 *
 * The host port lives in `delegated-task-host-port.ts`. It is the piece that makes
 * `runTask` resolve at the child turn's *end* (the MCP `run-task` action
 * resolves at turn start), waiting on the host's `local-mcp.task-turn-updated`
 * `done` signal with a status poll as the backstop.
 */

const host = createDelegatedTaskHostPort({
  listKnownRepositories,
  createWorkspace,
  getTaskStatus,
  startTaskTurn: (args) => runTask(args),
  stopTask: (args: HostTaskStopArgs) => invokeHostService("task.stop", args),
  releaseTaskParent,
  subscribeTaskTurnUpdated: (listener) =>
    onHostServiceEvent("local-mcp.task-turn-updated", listener),
});

let coordinator: ReturnType<typeof createDelegatedTaskCoordinator> | null = null;

export function getDelegatedTaskCoordinator() {
  if (!coordinator) {
    coordinator = createDelegatedTaskCoordinator({
      getLedger: ensurePersistenceReady,
      host,
      applyAgent,
      recordAgentAssignment: async ({ snapshot, standards, executionId, target, repositoryPath, prompt, model }) => {
        const result = await invokeHostService("agent.invoke", {
          action: "record-task",
          args: {
            requestId: `delegated:${executionId}`, taskId: target.taskId, workspaceId: target.workspaceId,
            repositoryPath, agent: snapshot.agent, role: "delegate",
            // History has a bounded description; the actual turn keeps the full user prompt.
            assignment: prompt.slice(0, ASSIGNMENT_LIMITS.assignment),
            providerId: target.providerId, model: model ?? null, ...(standards ? { standards } : {}),
          },
        }) as AgentInvokeResult<unknown>;
        if (!result.ok) throw new Error(result.message);
      },
      resolvePermissionPolicy: async (args) => {
        let agentPermission = args.agentPermission;
        if (args.agentConfigId) {
          const context = await invokeHostService("agent.invoke", { action: "delegation-context", args: { parentTaskId: args.parentTaskId } }) as AgentInvokeResult<AgentDelegationContext>;
          if (!context.ok) throw new Error(context.message);
          if (context.value.allowedAgentIds && !context.value.allowedAgentIds.includes(args.agentConfigId)) throw new Error("The delegated agent is no longer permitted by this project.");
          if (context.value.parentCanCall && !context.value.parentCanCall.includes(args.agentConfigId)) throw new Error("The parent agent can no longer call this delegated agent.");
          if (!agentPermission) {
            const saved = await invokeHostService("agent.invoke", {
              action: "delegation-context", args: { parentTaskId: args.delegatedTaskId },
            }) as AgentInvokeResult<AgentDelegationContext>;
            if (!saved.ok || !saved.value.parentPermission) throw new Error("The delegated Agent snapshot is unavailable. Retry to select a version explicitly.");
            agentPermission = saved.value.parentPermission;
          }
        }
        return invokeHostService("local-mcp.invoke", { action: "resolve-delegation-policy", args: {
          parentTaskId: args.parentTaskId, delegatedTaskId: args.delegatedTaskId, providerId: args.providerId,
          permissionProfile: args.permissionProfile, ...(agentPermission ? { permissionCeiling: agentPermission } : {}),
          ...(args.access ? { access: args.access } : {}),
          ...(args.requestedProfile ? { requestedProfile: args.requestedProfile } : {}),
        } }) as Promise<import("../../../src/lib/runs/delegation-policy").DelegationPermissionPolicy>;
      },
      resolveParentDefaults: (args) =>
        invokeHostService("local-mcp.invoke", { action: "resolve-delegation-defaults", args }) as Promise<{
          providerId: "claude-code" | "codex";
          effort?: import("../../../src/lib/runs/delegated-task").DelegatedTaskEffort;
        } | null>,
      readHead,
      concurrencyLimit: resolveDelegatedTaskConcurrencyLimit(
        process.env.STAVE_DELEGATED_TASK_CONCURRENCY,
      ),
      onError: (error, context) => {
        console.warn(
          `[delegated-task] ${context.scope} failed for ${context.runId}: ${String(error)}`,
        );
      },
      // A delegation changes phase whenever the child's turn ends, including
      // for delegations the renderer never started. Telling the surfaces beats
      // asking them to poll a durable record that is usually idle.
      onChange: ({ parentTaskId }) => {
        for (const contents of webContents.getAllWebContents()) {
          if (contents.isDestroyed()) {
            continue;
          }
          contents.send("delegations:changed", { parentTaskId });
        }
      },
    });
  }
  return coordinator;
}

/**
 * Restart recovery. Runs after persistence is ready: every active delegation is
 * compared against its live delegated task so a restart never silently loses one.
 * Delegations whose task machinery is not reachable yet are deferred and picked
 * up by the next delegated-task read or write.
 */
export async function reconcileDelegatedTasks() {
  try {
    return await getDelegatedTaskCoordinator().reconcile();
  } catch (error) {
    console.warn(
      `[delegated-task] restart reconciliation failed: ${String(error)}`,
    );
    return { reconciled: 0, deferred: 0 };
  }
}
