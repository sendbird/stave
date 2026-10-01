import type { FleetInteractionControlIdentity } from "@/lib/fleet/control-plane";
import type { ProviderId } from "@/lib/providers/provider.types";
import {
  getNotificationInteractionMessageId,
  getNotificationInteractionRequestId,
} from "./attention-reconcile";
import type { AppNotification } from "./notification.types";
import { isNotificationAttentionKind } from "./notification.types";

/**
 * A delegated child's approval or question is stored under the child, which
 * owns the request, while its payload names the root of the delegation chain:
 * the task the person is working in. The host writes these fields
 * (`electron/host-service/delegated-attention.ts`); this module is how the
 * renderer reads them, so the root's composer can answer the request and
 * opening the notification lands on the root instead of the child.
 */
export interface DelegatedAttentionRoot {
  taskId: string;
  workspaceId: string | null;
  workspaceName: string | null;
  taskTitle: string | null;
}

function readId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getDelegatedAttentionRoot(
  notification: Pick<AppNotification, "kind" | "taskId" | "payload">,
): DelegatedAttentionRoot | null {
  if (!isNotificationAttentionKind(notification.kind)) {
    return null;
  }
  // A child published before root attribution still names its parent.
  const taskId =
    readId(notification.payload.rootTaskId) ??
    readId(notification.payload.parentTaskId);
  if (!taskId || taskId === notification.taskId?.trim()) {
    return null;
  }
  return {
    taskId,
    workspaceId: readId(notification.payload.rootWorkspaceId),
    workspaceName: readId(notification.payload.rootWorkspaceName),
    taskTitle: readId(notification.payload.rootTaskTitle),
  };
}

/**
 * Where activating a notification should land. A delegated child's request
 * resolves to its root task; everything else keeps its own target. The root's
 * workspace falls back to what the renderer already knows about the task.
 */
export function resolveNotificationOpenTarget<
  T extends Pick<
    AppNotification,
    "kind" | "taskId" | "taskTitle" | "workspaceId" | "workspaceName" | "payload"
  >,
>(notification: T, taskWorkspaceIdById: Record<string, string>): T {
  const root = getDelegatedAttentionRoot(notification);
  if (!root) {
    return notification;
  }
  return {
    ...notification,
    taskId: root.taskId,
    taskTitle: root.taskTitle ?? notification.taskTitle,
    workspaceId: root.workspaceId ?? taskWorkspaceIdById[root.taskId] ?? null,
    workspaceName: root.workspaceName,
  };
}

export interface DelegatedInteractionRequest {
  notificationId: string;
  /** The child's request, as the identity-checked respond path expects it. */
  identity: FleetInteractionControlIdentity & { turnId: string };
  childTaskTitle: string;
  providerId: ProviderId | null;
  createdAt: string;
}

/**
 * Open requests raised anywhere below `rootTaskId`, oldest first so the one
 * closest to auto-denying is answered first. The root's own requests are not
 * included: its composer already renders them.
 */
export function selectDelegatedInteractionRequests(args: {
  notifications: readonly AppNotification[];
  rootTaskId: string;
  repositoryPath: string | null;
  now: number;
}): DelegatedInteractionRequest[] {
  const requests: DelegatedInteractionRequest[] = [];
  for (const notification of args.notifications) {
    if (
      notification.resolvedAt ||
      (notification.expiresAt && Date.parse(notification.expiresAt) <= args.now) ||
      notification.repositoryPath !== args.repositoryPath ||
      getDelegatedAttentionRoot(notification)?.taskId !== args.rootTaskId
    ) {
      continue;
    }
    const workspaceId = readId(notification.workspaceId);
    const taskId = readId(notification.taskId);
    const turnId = readId(notification.turnId);
    const requestId = getNotificationInteractionRequestId(notification);
    if (!args.repositoryPath || !workspaceId || !taskId || !turnId || !requestId) {
      continue;
    }
    requests.push({
      notificationId: notification.id,
      identity: {
        repositoryPath: args.repositoryPath,
        workspaceId,
        taskId,
        turnId,
        kind:
          notification.kind === "task.approval_requested"
            ? "approval"
            : "user-input",
        requestId,
        messageId: getNotificationInteractionMessageId(notification),
      },
      childTaskTitle: readId(notification.taskTitle) ?? "Delegated task",
      providerId: notification.providerId,
      createdAt: notification.createdAt,
    });
  }
  return requests.sort((left, right) =>
    left.createdAt === right.createdAt
      ? left.notificationId.localeCompare(right.notificationId)
      : left.createdAt.localeCompare(right.createdAt),
  );
}
