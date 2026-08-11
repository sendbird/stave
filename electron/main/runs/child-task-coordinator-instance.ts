import { webContents } from "electron";
import { resolveChildTaskConcurrencyLimit } from "../../../src/lib/runs/child-task";
import type { HostTaskStopArgs } from "../../host-service/protocol";
import { invokeHostService, onHostServiceEvent } from "../host-service-client";
import {
  createWorkspace,
  getTaskStatus,
  listKnownProjects,
  releaseTaskParent,
  runTask,
} from "../stave-mcp-service";
import { ensurePersistenceReady } from "../state";
import { createChildTaskCoordinator } from "./child-task-coordinator";
import { createChildTaskHostPort } from "./child-task-host-port";

/**
 * Wires the child-task coordinator to the real ledger and the real task
 * machinery. The coordinator itself stays free of both so it can be tested
 * against fakes.
 *
 * The host port lives in `child-task-host-port.ts`. It is the piece that makes
 * `runTask` resolve at the child turn's *end* (the MCP `run-task` action
 * resolves at turn start), waiting on the host's `local-mcp.task-turn-updated`
 * `done` signal with a status poll as the backstop.
 */

const host = createChildTaskHostPort({
  listKnownProjects,
  createWorkspace,
  getTaskStatus,
  startTaskTurn: (args) => runTask(args),
  stopTask: (args: HostTaskStopArgs) => invokeHostService("task.stop", args),
  releaseTaskParent,
  subscribeTaskTurnUpdated: (listener) =>
    onHostServiceEvent("local-mcp.task-turn-updated", listener),
});

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
      // A delegation changes phase whenever the child's turn ends, including
      // for delegations the renderer never started. Telling the surfaces beats
      // asking them to poll a durable record that is usually idle.
      onChange: ({ parentTaskId }) => {
        for (const contents of webContents.getAllWebContents()) {
          if (contents.isDestroyed()) {
            continue;
          }
          contents.send("runs:child-tasks-changed", { parentTaskId });
        }
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
    console.warn(
      `[child-task] restart reconciliation failed: ${String(error)}`,
    );
    return { reconciled: 0, deferred: 0 };
  }
}
