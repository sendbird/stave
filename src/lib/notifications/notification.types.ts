import type { ProviderId } from "@/lib/providers/provider.types";

export type AppNotificationKind =
  | "task.turn_completed"
  | "task.approval_requested";

export interface AppNotificationApprovalAction {
  type: "approval";
  requestId: string;
  messageId?: string | null;
}

export type AppNotificationAction = AppNotificationApprovalAction;

export interface AppNotification {
  id: string;
  kind: AppNotificationKind;
  title: string;
  body: string;
  projectPath: string | null;
  projectName: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
  taskId: string | null;
  taskTitle: string | null;
  turnId: string | null;
  providerId: ProviderId | null;
  action: AppNotificationAction | null;
  payload: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
}

export interface AppNotificationCreateInput extends Omit<AppNotification, "createdAt" | "readAt"> {
  createdAt?: string;
  readAt?: string | null;
  dedupeKey?: string | null;
}

export function isNotificationUnread(notification: Pick<AppNotification, "readAt">) {
  return !notification.readAt;
}

export function workspaceHasActiveTurns(args: {
  activeTurnIdsByTask: Record<string, string | undefined>;
}) {
  return Object.values(args.activeTurnIdsByTask).some((turnId) => Boolean(turnId));
}

export function sortNotificationsNewestFirst<T extends Pick<AppNotification, "createdAt" | "id">>(notifications: T[]) {
  return [...notifications].sort((left, right) => {
    if (left.createdAt === right.createdAt) {
      return right.id.localeCompare(left.id);
    }
    return right.createdAt.localeCompare(left.createdAt);
  });
}
