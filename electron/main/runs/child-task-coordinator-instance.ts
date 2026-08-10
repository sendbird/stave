import { resolveChildTaskConcurrencyLimit } from "../../../src/lib/runs/child-task";
import { buildChildTaskRuntimeOptions } from "../../../src/lib/runs/child-task-runtime";
import type { HostTaskStopArgs } from "../../host-service/protocol";
import { invokeHostService } from "../host-service-client";
import {
  createWorkspace,
  getTaskStatus,
  listKnownProjects,
  runTask,
} from "../stave-mcp-service";
import { ensurePersistenceReady } from "../state";
import {
  createChildTaskCoordinator,
  type ChildTaskHostPort,
} from "./child-task-coordinator";

/**
 * Wires the child-task coordinator to the real ledger and the real task
 * machinery. The coordinator itself stays free of both so it can be tested
 * against fakes.
 */

const host: ChildTaskHostPort = {
  async resolveWorkspace({ workspaceId }) {
    const projects = await listKnownProjects();
    for (const project of projects) {
      const workspace = project.workspaces.find(
        (candidate) => candidate.id === workspaceId,
      );
      if (workspace) {
        return {
          workspaceId,
          workspacePath: workspace.path,
          projectPath: project.projectPath,
        };
      }
    }
    return null;
  },

  async createWorkspace({ projectPath, name, fromBranch }) {
    const created = await createWorkspace({
      projectPath,
      name,
      mode: "branch",
      ...(fromBranch ? { fromBranch } : {}),
    });
    return {
      workspaceId: created.workspaceId,
      workspacePath: created.workspacePath,
      projectPath: created.projectPath,
    };
  },

  async getTaskStatus({ workspaceId, taskId }) {
    try {
      const status = await getTaskStatus({ workspaceId, taskId });
      return {
        ok: true,
        activeTurnId: status.activeTurnId,
        latestTurnId: status.latestTurnId,
        latestTurnCompletedAt: status.latestTurnCompletedAt,
        latestTurnError: status.latestTurnError,
      };
    } catch (error) {
      // The host runtime throws `Task not found:` / `Workspace not found:` for
      // something that genuinely no longer exists. Anything else — a host
      // service that is still starting, a dropped request — must not be read
      // as an absent child.
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        reason: /\bnot found\b/i.test(message) ? "missing" : "unavailable",
      };
    }
  },

  async runTask({
    workspaceId,
    taskId,
    title,
    prompt,
    providerId,
    model,
    permissionProfile,
  }) {
    const result = await runTask({
      workspaceId,
      taskId,
      prompt,
      ...(title ? { title } : {}),
      provider: providerId,
      runtimeOptions: buildChildTaskRuntimeOptions({
        providerId,
        model,
        permissionProfile,
      }),
    });
    return { turnId: result.turnId };
  },

  async stopTask(args: HostTaskStopArgs) {
    return invokeHostService("task.stop", args);
  },
};

let coordinator: ReturnType<typeof createChildTaskCoordinator> | null = null;

export function getChildTaskCoordinator() {
  if (!coordinator) {
    coordinator = createChildTaskCoordinator({
      getLedger: ensurePersistenceReady,
      host,
      concurrencyLimit: resolveChildTaskConcurrencyLimit(
        process.env.STAVE_CHILD_TASK_CONCURRENCY,
      ),
      onError: (error, context) => {
        console.warn(
          `[child-task] ${context.scope} failed for ${context.runId}: ${String(error)}`,
        );
      },
    });
  }
  return coordinator;
}

/**
 * Restart recovery. Runs after persistence is ready: every active delegation is
 * compared against its live child task so a restart never silently loses one.
 * Delegations whose task machinery is not reachable yet are deferred and picked
 * up by the next child-task read or write.
 */
export async function reconcileChildTasks() {
  try {
    return await getChildTaskCoordinator().reconcile();
  } catch (error) {
    console.warn(`[child-task] restart reconciliation failed: ${String(error)}`);
    return { reconciled: 0, deferred: 0 };
  }
}
