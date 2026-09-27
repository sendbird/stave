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
