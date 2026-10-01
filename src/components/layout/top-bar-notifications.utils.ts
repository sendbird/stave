import { getDelegatedAttentionRoot } from "@/lib/notifications/delegated-attention";
import { buildNotificationDetail } from "@/lib/notifications/notification.utils";
import type {
  AppNotification,
  AppNotificationAction,
} from "@/lib/notifications/notification.types";

export type NotificationView = "unread" | "history";

export function getNextNotificationView(args: {
  isOpening: boolean;
  previousView: NotificationView;
}): NotificationView {
  return args.isOpening ? "unread" : args.previousView;
}

export function shouldShowNotificationApprovalActions(args: {
  unread: boolean;
  action: AppNotificationAction | null | undefined;
}) {
  return args.unread && args.action?.type === "approval";
}

/**
 * What a notification row names. A delegated child's request reads as the root
 * task's — the task it opens — with the child named ahead of the request.
 */
export function describeNotificationRow(notification: AppNotification) {
  const root = getDelegatedAttentionRoot(notification);
  const detail = buildNotificationDetail(notification);
  const childTitle = notification.taskTitle?.trim();
  return {
    taskId: root?.taskId ?? notification.taskId,
    title: root?.taskTitle ?? notification.taskTitle ?? notification.title,
    detail: root && childTitle ? [childTitle, detail].filter(Boolean).join(" · ") : detail,
    workspaceName: root ? root.workspaceName : notification.workspaceName,
  };
}
