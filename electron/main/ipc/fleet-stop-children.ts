import { isTaskManaged } from "../../../src/lib/tasks";
import { findTarsResponsibility } from "../../../src/lib/tars/ownership";
import type { SqliteStore } from "../../persistence/sqlite-store";
import type { FleetTaskControlArgs, FleetStopChildrenResult } from "../../../src/lib/fleet/host-control";
import type { getDelegatedTaskCoordinator } from "../runs/delegated-task-coordinator-instance";

export async function stopFleetChildren(store: Pick<SqliteStore, "loadWorkspaceShell" | "tars" | "getRunAggregate">, coordinator: ReturnType<typeof getDelegatedTaskCoordinator>, args: FleetTaskControlArgs): Promise<FleetStopChildrenResult> {
  const parent = store.loadWorkspaceShell({ workspaceId: args.workspaceId })?.tasks.find((task) => task.id === args.taskId);
  if (!parent) return { ok: false, stopped: 0, skipped: [], reason: "not-found" };
  if (isTaskManaged({ controlMode: parent.controlMode ?? "interactive" })) return { ok: false, stopped: 0, skipped: [], reason: "managed" };
  if (findTarsResponsibility(store.tars.snapshot().responsibilities, args)) return { ok: false, stopped: 0, skipped: [], reason: "owner-managed" };
  const children = await coordinator.list({ parentTaskId: args.taskId, includeFinished: false });
  const skipped: { taskId: string; reason: string }[] = [];
  let stopped = 0;
  for (const child of children) {
    if (!store.getRunAggregate({ runId: child.runId, stepId: child.stepId })) {
      skipped.push({ taskId: child.delegatedTaskId, reason: "not-found" });
      continue;
    }
    try {
      const result = await coordinator.stop({ parentTaskId: args.taskId, delegationKey: child.delegationKey });
      if (result.accepted) {
        stopped += 1;
        if (result.message) skipped.push({ taskId: child.delegatedTaskId, reason: "partial-stop" });
      }
      else skipped.push({ taskId: child.delegatedTaskId, reason: result.reason ?? "refused" });
    } catch {
      skipped.push({ taskId: child.delegatedTaskId, reason: "failed" });
    }
  }
  return { ok: true, stopped, skipped };
}
