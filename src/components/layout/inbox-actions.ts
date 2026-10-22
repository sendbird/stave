import {
  unreadNotificationIds,
  type FleetInboxEntry,
} from "@/lib/fleet/inbox-model";
import { useAppStore } from "@/store/app.store";

/**
 * Marks every unread notification behind an entry as read. Opening an entry
 * is reading it, wherever it was opened, so Fleet and the bell agree on its
 * read state afterwards. An entry no notification speaks for has nothing to
 * mark.
 */
export function markInboxEntryRead(
  entry: Pick<FleetInboxEntry, "notifications"> | null | undefined,
) {
  if (!entry) {
    return;
  }
  const { markNotificationRead } = useAppStore.getState();
  for (const id of unreadNotificationIds(entry)) {
    void markNotificationRead({ id });
  }
}

export type InboxOpenResult =
  | { status: "opened" }
  | { status: "archived-task"; taskId: string; taskTitle: string };

/**
 * Opens what an entry names, the same way from Fleet and the bell: through its
 * notification when one speaks for it (a delegated child's request opens its
 * root task), otherwise the item's task, or its workspace for a pull request
 * row. Opening reads the entry.
 */
export async function openInboxEntry(
  entry: FleetInboxEntry,
): Promise<InboxOpenResult> {
  markInboxEntryRead(entry);
  const state = useAppStore.getState();
  const notification = entry.notifications[0];
  if (notification) {
    return state.openNotificationContext({
      notificationId: notification.id,
      targetSurface: "task",
    });
  }
  const item = entry.item;
  if (!item) {
    return { status: "opened" };
  }
  if (item.taskId) {
    await state.focusTaskAttention({
      repositoryPath: item.repositoryPath,
      workspaceId: item.workspaceId,
      taskId: item.taskId,
    });
    return { status: "opened" };
  }
  if (useAppStore.getState().repositoryPath !== item.repositoryPath) {
    await useAppStore.getState().openRepository({ repositoryPath: item.repositoryPath });
  }
  if (useAppStore.getState().activeWorkspaceId !== item.workspaceId) {
    await useAppStore.getState().switchWorkspace({ workspaceId: item.workspaceId });
  }
  return { status: "opened" };
}
