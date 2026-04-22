import type { AppNotificationAction } from "@/lib/notifications/notification.types";

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
