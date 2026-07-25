import type { AppNotification } from "@/lib/notifications/notification.types";
import {
  isNotificationHistoryClearable,
  isNotificationPendingAttention,
  sortNotificationsNewestFirst,
} from "@/lib/notifications/notification.types";

export function mergeNotificationIntoList(args: {
  notifications: AppNotification[];
  notification: AppNotification;
}) {
  return sortNotificationsNewestFirst([
    args.notification,
    ...args.notifications.filter((item) => item.id !== args.notification.id),
  ]);
}

export function markNotificationReadInList(args: {
  notifications: AppNotification[];
  id: string;
  readAt: string;
  resolvedAt?: string;
  expiresAt: string;
}) {
  return args.notifications.map((notification) => {
    if (notification.id !== args.id) {
      return notification;
    }
    const readAt = notification.readAt ?? args.readAt;
    const resolvedAt = notification.resolvedAt ?? args.resolvedAt ?? null;
    const expiresAt = isNotificationPendingAttention({
      ...notification,
      resolvedAt,
    })
      ? null
      : (notification.expiresAt ?? args.expiresAt);
    if (
      notification.readAt === readAt &&
      notification.resolvedAt === resolvedAt &&
      notification.expiresAt === expiresAt
    ) {
      return notification;
    }
    return {
      ...notification,
      readAt,
      resolvedAt,
      expiresAt,
    };
  });
}

export function findPendingApprovalNotificationIds(args: {
  notifications: AppNotification[];
  taskId: string;
  messageId: string;
  requestId: string;
}) {
  return args.notifications.flatMap((notification) => {
    if (notification.resolvedAt) {
      return [];
    }
    const action = notification.action;
    if (action?.type !== "approval" || action.requestId !== args.requestId) {
      return [];
    }
    if (action.messageId) {
      return action.messageId === args.messageId ? [notification.id] : [];
    }
    return notification.taskId?.trim() === args.taskId.trim()
      ? [notification.id]
      : [];
  });
}

export function findPendingUserInputNotificationIds(args: {
  notifications: AppNotification[];
  taskId: string;
  messageId: string;
  requestId: string;
}) {
  return args.notifications.flatMap((notification) => {
    if (
      notification.kind !== "task.user_input_requested" ||
      notification.resolvedAt ||
      notification.taskId?.trim() !== args.taskId.trim() ||
      notification.payload.requestId !== args.requestId
    ) {
      return [];
    }
    const notificationMessageId = notification.payload.messageId;
    if (
      typeof notificationMessageId === "string" &&
      notificationMessageId !== args.messageId
    ) {
      return [];
    }
    return [notification.id];
  });
}

export function markAllNotificationsReadInList(args: {
  notifications: AppNotification[];
  readAt: string;
  expiresAt: string;
}) {
  let changed = false;
  const nextNotifications = args.notifications.map((notification) => {
    if (notification.readAt) {
      return notification;
    }
    changed = true;
    return {
      ...notification,
      readAt: args.readAt,
      expiresAt: isNotificationPendingAttention(notification)
        ? null
        : (notification.expiresAt ?? args.expiresAt),
    };
  });
  return changed ? nextNotifications : args.notifications;
}

export function clearNotificationHistoryInList(args: {
  notifications: AppNotification[];
  notificationIds: ReadonlySet<string>;
}) {
  return args.notifications.filter(
    (notification) =>
      !args.notificationIds.has(notification.id) ||
      !isNotificationHistoryClearable(notification),
  );
}

export function getNotificationHistoryClearableIds(
  notifications: AppNotification[],
) {
  return new Set(
    notifications
      .filter(isNotificationHistoryClearable)
      .map((notification) => notification.id),
  );
}
