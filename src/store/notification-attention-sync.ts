import {
  findSettledInteractionNotificationIds,
  findUnreadTurnNotificationIdsForTask,
  findUnresolvedInteractionNotificationIdsForTurn,
  hasUnresolvedInteractionNotificationForTask,
} from "@/lib/notifications/attention-reconcile";
import type { AppNotification } from "@/lib/notifications/notification.types";
import {
  findPendingApprovalNotificationIds,
  findPendingUserInputNotificationIds,
} from "@/lib/notifications/notification-state";
import type { ChatMessage } from "@/types/chat";

/**
 * Keeps durable notifications aligned with the task window, which owns every
 * interaction. Fleet and the notification center only mirror what is left, so a
 * need must never outlive the request or result it describes.
 */
export interface NotificationAttentionSyncDeps {
  getNotifications: () => AppNotification[];
  markRead: (args: { id: string; resolvedAt?: string }) => Promise<void>;
  /** Minimal view of what the task window currently shows. */
  getReviewSurface: () => {
    activeWorkspaceId: string;
    visibleTaskId: string | null;
    windowFocused: boolean;
  };
}

export function createNotificationAttentionSync(
  deps: NotificationAttentionSyncDeps,
) {
  const settle = (ids: readonly string[]) => {
    if (ids.length === 0) {
      return Promise.resolve();
    }
    const resolvedAt = new Date().toISOString();
    return Promise.all(
      ids.map((id) => deps.markRead({ id, resolvedAt })),
    ).then(() => undefined);
  };

  return {
    /** Settles a single request that can no longer be answered. */
    settleNotification: (notificationId: string) => settle([notificationId]),

    /** Settles an approval the user just answered in the task window. */
    settleAnsweredApproval: (args: {
      taskId: string;
      messageId: string;
      requestId: string;
    }) =>
      settle(
        findPendingApprovalNotificationIds({
          notifications: deps.getNotifications(),
          ...args,
        }),
      ),

    /** Settles a question the user just answered in the task window. */
    settleAnsweredUserInput: (args: {
      taskId: string;
      messageId: string;
      requestId: string;
    }) =>
      settle(
        findPendingUserInputNotificationIds({
          notifications: deps.getNotifications(),
          ...args,
        }),
      ),

    /**
     * Drops interaction needs the task window already settled, plus everything
     * tied to a turn that ended without an answer.
     */
    syncTaskInteractions: (args: {
      taskId: string;
      messages: readonly ChatMessage[];
      endedTurnId?: string;
    }) => {
      const notifications = deps.getNotifications();
      if (
        !hasUnresolvedInteractionNotificationForTask({
          notifications,
          taskId: args.taskId,
        })
      ) {
        return;
      }
      const ids = new Set(
        findSettledInteractionNotificationIds({
          notifications,
          taskId: args.taskId,
          messages: args.messages,
        }),
      );
      if (args.endedTurnId) {
        for (const id of findUnresolvedInteractionNotificationIdsForTurn({
          notifications,
          taskId: args.taskId,
          turnId: args.endedTurnId,
        })) {
          ids.add(id);
        }
      }
      void settle([...ids]);
    },

    /** Reviewing a task in the task window clears its turn outcomes. */
    markTaskReviewed: (taskId: string) => {
      for (const id of findUnreadTurnNotificationIdsForTask({
        notifications: deps.getNotifications(),
        taskId,
      })) {
        void deps.markRead({ id });
      }
    },

    /**
     * Marks a turn outcome as reviewed when it lands on the task the user is
     * already watching, so it never queues up as an unseen result.
     */
    noteTurnOutcome: (notification: AppNotification) => {
      if (
        notification.kind !== "task.turn_completed" &&
        notification.kind !== "task.turn_failed"
      ) {
        return;
      }
      const taskId = notification.taskId?.trim();
      const surface = deps.getReviewSurface();
      if (
        !taskId ||
        !surface.windowFocused ||
        surface.visibleTaskId !== taskId ||
        (notification.workspaceId &&
          notification.workspaceId !== surface.activeWorkspaceId)
      ) {
        return;
      }
      void deps.markRead({ id: notification.id });
    },
  };
}

export type NotificationAttentionSync = ReturnType<
  typeof createNotificationAttentionSync
>;
