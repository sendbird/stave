import type { PersistenceNotificationCreateInput } from "./types";
import type { TarsResponsibility } from "../../src/lib/tars/types";

const MANAGED_KINDS = new Set(["task.turn_completed", "task.turn_failed", "agent_run.completed", "agent_run.blocked", "agent_run.stuck"]);

/** Keep internal updates as read history; Tars announces the outcome or decision. */
export function manageTarsNotification(notification: PersistenceNotificationCreateInput, deps: {
  responsibilities: readonly TarsResponsibility[];
  parentTask: (taskId: string) => string | null;
  now?: () => string;
}): PersistenceNotificationCreateInput {
  // Only persisted ownership, never a caller's payload flag, can silence delivery.
  if (notification.payload?.tarsManaged !== undefined) notification = { ...notification, payload: { ...notification.payload, tarsManaged: false } };
  if (!notification.taskId || !MANAGED_KINDS.has(notification.kind)) return notification;
  const visited = new Set<string>();
  let taskId: string | null = notification.taskId;
  while (taskId && !visited.has(taskId)) {
    visited.add(taskId);
    const owner = deps.responsibilities.find(row => row.taskId === taskId && row.state !== "takenOver" && row.state !== "paused" && row.state !== "cancelled" &&
      (row.state !== "completed" || Boolean(row.agentRunId && notification.payload?.agentRunId === row.agentRunId) || Boolean(notification.createdAt && notification.createdAt <= row.updatedAt)));
    if (owner) return { ...notification, readAt: notification.readAt ?? (deps.now ?? (() => new Date().toISOString()))(),
      payload: { ...notification.payload, tarsManaged: true, responsibilityId: owner.id } };
    taskId = deps.parentTask(taskId);
  }
  return notification;
}

/** Resolve ownership from the durable delegation ledger, including unloaded workspaces. */
export function manageStoredTarsNotification(notification: PersistenceNotificationCreateInput,
  tars: Pick<import("./tars-store").TarsStore, "snapshot">,
  ledger: Pick<import("./run-ledger-store").RunLedgerStore, "listAggregatesByOwnedTask">) {
  return manageTarsNotification(notification, {
    responsibilities: tars.snapshot().responsibilities,
    parentTask: taskId => {
      const owner = ledger.listAggregatesByOwnedTask({ taskId, limit: 20 })
        .find(({ run }) => run.kind === "delegated-task" && run.origin.kind === "task");
      return owner?.run.origin.kind === "task" ? owner.run.origin.id : null;
    },
  });
}
