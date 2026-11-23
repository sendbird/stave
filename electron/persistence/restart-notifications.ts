import {
  findPendingNotificationInteraction,
  getNotificationInteractionMessageId,
  isDurableUserInputNotification,
} from "../../src/lib/notifications/attention-reconcile";
import { isDelegatedTask } from "../../src/lib/tasks";
import type { NotificationStore } from "./notification-store";
import type { SqliteStore } from "./sqlite-store";
import type { PersistenceTaskRow } from "./types";

/** Main calls this before the renderer or host can admit any new turns. */
export function recoverInterruptedTaskNotifications(
  store: Pick<SqliteStore, "loadWorkspaceShell" | "loadTaskMessagesPage">,
  notifications: NotificationStore,
) {
  const tasksByWorkspace = new Map<string, Map<string, PersistenceTaskRow>>();
  notifications.settleInterruptedTaskNotifications((notification) => {
    const { workspaceId, taskId, payload } = notification;
    let task: PersistenceTaskRow | undefined;
    if (workspaceId && taskId) {
      let tasks = tasksByWorkspace.get(workspaceId);
      if (!tasks) {
        const shell = store.loadWorkspaceShell({ workspaceId });
        tasks = new Map(shell?.tasks.map((item) => [item.id, item]));
        tasksByWorkspace.set(workspaceId, tasks);
      }
      task = tasks.get(taskId);
    }
    const hostOwned = task
      ? task.controlMode === "managed" || isDelegatedTask(task)
      : payload.controlMode === "managed" ||
        (typeof payload.parentTaskId === "string" && Boolean(payload.parentTaskId.trim()));
    if (!hostOwned && notification.kind !== "task.user_input_requested") return false;

    const messageId = getNotificationInteractionMessageId(notification);
    const page = workspaceId && taskId && messageId
      ? store.loadTaskMessagesPage({ workspaceId, taskId, messageId, limit: 1 })
      : null;
    const parts = page?.messages.find((item) => item.id === messageId)?.parts;
    if (hostOwned) {
      // Without the anchor, leave the verdict to the host that owns the request.
      return !parts || Boolean(findPendingNotificationInteraction(notification, parts));
    }
    return isDurableUserInputNotification(notification, parts);
  });
}
