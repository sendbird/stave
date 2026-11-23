/**
 * The bell's views. All, Unread and Errors filter the live inbox (every Fleet
 * item and the notifications still unread); History holds what was read and
 * has no item left.
 */
export type NotificationView = "all" | "unread" | "errors" | "history";

export function getNextNotificationView(args: {
  isOpening: boolean;
  previousView: NotificationView;
}): NotificationView {
  return args.isOpening ? "unread" : args.previousView;
}
