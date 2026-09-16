import type { ProviderId } from "@/lib/providers/provider.types";

export type AppNotificationKind =
  | "task.turn_completed"
  | "task.turn_failed"
  | "task.approval_requested"
  | "task.user_input_requested";

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
  resolvedAt?: string | null;
  expiresAt?: string | null;
}

export interface AppNotificationCreateInput extends Omit<
  AppNotification,
  "createdAt" | "readAt"
> {
  createdAt?: string;
  readAt?: string | null;
  dedupeKey?: string | null;
}

export const DEFAULT_READ_NOTIFICATION_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;

/**
 * Hard cap on retained notification history. Anything past the newest entries
 * is deleted automatically. Unresolved attention notifications are exempt:
 * their request is still answerable, so dropping one would strand the task.
 */
export const MAX_NOTIFICATION_HISTORY = 50;

export function isNotificationAttentionKind(kind: AppNotificationKind) {
  return (
    kind === "task.approval_requested" || kind === "task.user_input_requested"
  );
}

export function isNotificationPendingAttention(
  notification: Pick<AppNotification, "kind" | "resolvedAt">,
) {
  return (
    isNotificationAttentionKind(notification.kind) && !notification.resolvedAt
  );
}

export function isNotificationHistoryClearable(
  notification: Pick<AppNotification, "readAt" | "resolvedAt">,
) {
  return Boolean(notification.readAt || notification.resolvedAt);
}

export function buildNotificationExpiresAt(args: {
  readAt: string;
  retentionMs?: number;
}) {
  const readAtMs = Date.parse(args.readAt);
  const baseMs = Number.isFinite(readAtMs) ? readAtMs : Date.now();
  return new Date(
    baseMs + (args.retentionMs ?? DEFAULT_READ_NOTIFICATION_RETENTION_MS),
  ).toISOString();
}

export function isNotificationUnread(
  notification: Pick<AppNotification, "readAt">,
) {
  return !notification.readAt;
}

export function workspaceHasActiveTurns(args: {
  activeTurnIdsByTask: Record<string, string | undefined>;
}) {
  return Object.values(args.activeTurnIdsByTask).some((turnId) =>
    Boolean(turnId),
  );
}

export function sortNotificationsNewestFirst<
  T extends Pick<AppNotification, "createdAt" | "id">,
>(notifications: T[]) {
  return [...notifications].sort((left, right) => {
    if (left.createdAt === right.createdAt) {
      return right.id.localeCompare(left.id);
    }
    return right.createdAt.localeCompare(left.createdAt);
  });
}

/**
 * Keeps the newest `limit` notifications plus every unresolved attention
 * notification, and drops the rest. Returned newest-first.
 */
export function trimNotificationsToHistoryLimit<
  T extends Pick<AppNotification, "createdAt" | "id" | "kind" | "resolvedAt">,
>(notifications: T[], limit: number = MAX_NOTIFICATION_HISTORY) {
  const maxHistory = Math.max(1, limit);
  const kept: T[] = [];
  let retained = 0;
  for (const notification of sortNotificationsNewestFirst(notifications)) {
    if (isNotificationPendingAttention(notification)) {
      kept.push(notification);
      continue;
    }
    if (retained < maxHistory) {
      kept.push(notification);
      retained += 1;
    }
  }
  return kept;
}
