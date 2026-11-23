import type { ChatMessage } from "@/types/chat";
import type { AppNotification } from "./notification.types";
import { isNotificationAttentionKind } from "./notification.types";
import { canAnswerUserInputWithoutTurn } from "./interaction-policy";

/**
 * Fleet is an auxiliary surface: the task window stays the authoritative place
 * to answer a question, resolve an approval, or review a finished turn. These
 * helpers let the store keep durable notifications in sync with what already
 * happened in the task window, so a need never survives the interaction it
 * describes.
 */

function normalizeId(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

export function getNotificationInteractionRequestId(
  notification: Pick<AppNotification, "kind" | "action" | "payload">,
) {
  if (notification.kind === "task.approval_requested") {
    return notification.action?.type === "approval"
      ? normalizeId(notification.action.requestId)
      : null;
  }
  if (notification.kind === "task.user_input_requested") {
    const requestId = notification.payload.requestId;
    return typeof requestId === "string" ? normalizeId(requestId) : null;
  }
  return null;
}

export function getNotificationInteractionMessageId(
  notification: Pick<AppNotification, "kind" | "action" | "payload">,
) {
  if (notification.kind === "task.approval_requested") {
    return notification.action?.type === "approval"
      ? normalizeId(notification.action.messageId)
      : null;
  }
  if (notification.kind === "task.user_input_requested") {
    const messageId = notification.payload.messageId;
    return typeof messageId === "string" ? normalizeId(messageId) : null;
  }
  return null;
}

export function findPendingNotificationInteraction(
  notification: Pick<AppNotification, "kind" | "action" | "payload">,
  parts: readonly unknown[],
) {
  const requestId = getNotificationInteractionRequestId(notification);
  if (!requestId) return undefined;
  const isApproval = notification.kind === "task.approval_requested";
  return parts.find((part): part is { delivery?: unknown } =>
    part !== null && typeof part === "object" &&
    "type" in part && part.type === (isApproval ? "approval" : "user_input") &&
    "state" in part && part.state === (isApproval ? "approval-requested" : "input-requested") &&
    "requestId" in part && part.requestId === requestId);
}

/** Use the anchored message when available, falling back to the recorded delivery. */
export function isDurableUserInputNotification(
  notification: Pick<AppNotification, "kind" | "action" | "payload">,
  parts?: readonly unknown[],
) {
  if (notification.kind !== "task.user_input_requested") return false;
  const requestId = getNotificationInteractionRequestId(notification);
  if (!requestId) return false;
  if (!parts) return canAnswerUserInputWithoutTurn({ requestId, delivery: notification.payload.delivery });
  const part = findPendingNotificationInteraction(notification, parts);
  return Boolean(part && canAnswerUserInputWithoutTurn({ requestId, delivery: part.delivery }));
}

export interface TaskInteractionSnapshot {
  /** Request ids that are still waiting for the user inside the task window. */
  pendingRequestIds: Set<string>;
  /** Message ids present in the loaded window, used to avoid guessing. */
  loadedMessageIds: Set<string>;
}

export function collectTaskInteractionSnapshot(
  messages: readonly ChatMessage[],
): TaskInteractionSnapshot {
  const pendingRequestIds = new Set<string>();
  const loadedMessageIds = new Set<string>();

  for (const message of messages) {
    loadedMessageIds.add(message.id);
    for (const part of message.parts) {
      if (part.type === "approval" && part.state === "approval-requested") {
        pendingRequestIds.add(part.requestId);
        continue;
      }
      if (part.type === "user_input" && part.state === "input-requested") {
        pendingRequestIds.add(part.requestId);
      }
    }
  }

  return { pendingRequestIds, loadedMessageIds };
}

function isUnresolvedInteractionForTask(args: {
  notification: AppNotification;
  taskId: string;
}) {
  return (
    isNotificationAttentionKind(args.notification.kind) &&
    !args.notification.resolvedAt &&
    normalizeId(args.notification.taskId) === normalizeId(args.taskId)
  );
}

/**
 * Returns durable interaction notifications whose request is no longer pending
 * in the task window, so they can be marked resolved.
 *
 * A notification is only considered settled when its anchor message is part of
 * the loaded window. Otherwise the request may simply live in a page that is
 * not hydrated yet and the notification is left untouched.
 */
export function findSettledInteractionNotificationIds(args: {
  notifications: readonly AppNotification[];
  taskId: string;
  messages: readonly ChatMessage[];
}) {
  const taskId = normalizeId(args.taskId);
  if (!taskId) {
    return [];
  }
  const snapshot = collectTaskInteractionSnapshot(args.messages);

  return args.notifications.flatMap((notification) => {
    if (!isUnresolvedInteractionForTask({ notification, taskId })) {
      return [];
    }
    const requestId = getNotificationInteractionRequestId(notification);
    if (!requestId || snapshot.pendingRequestIds.has(requestId)) {
      return [];
    }
    const messageId = getNotificationInteractionMessageId(notification);
    if (messageId) {
      return snapshot.loadedMessageIds.has(messageId) ? [notification.id] : [];
    }
    return snapshot.loadedMessageIds.size > 0 ? [notification.id] : [];
  });
}

/**
 * Returns durable interaction notifications tied to a turn that can no longer
 * accept an answer, because the turn completed, failed, or was aborted.
 */
export function findUnresolvedInteractionNotificationIdsForTurn(args: {
  notifications: readonly AppNotification[];
  taskId: string;
  turnId: string;
  messages?: readonly ChatMessage[];
}) {
  const taskId = normalizeId(args.taskId);
  const turnId = normalizeId(args.turnId);
  if (!taskId || !turnId) {
    return [];
  }

  const messagesById = new Map(args.messages?.map((message) => [message.id, message]));
  return args.notifications.flatMap((notification) => {
    if (!isUnresolvedInteractionForTask({ notification, taskId }) ||
        normalizeId(notification.turnId) !== turnId) {
      return [];
    }
    const messageId = getNotificationInteractionMessageId(notification);
    const message = messageId ? messagesById.get(messageId) : undefined;
    return isDurableUserInputNotification(notification, message?.parts) ? [] : [notification.id];
  });
}

export function hasUnresolvedInteractionNotificationForTask(args: {
  notifications: readonly AppNotification[];
  taskId: string;
}) {
  const taskId = normalizeId(args.taskId);
  if (!taskId) {
    return false;
  }
  return args.notifications.some((notification) =>
    isUnresolvedInteractionForTask({ notification, taskId }),
  );
}

/**
 * Returns unread turn outcome notifications for a task, so opening that task in
 * the task window counts as reviewing its result.
 */
export function findUnreadTurnNotificationIdsForTask(args: {
  notifications: readonly AppNotification[];
  taskId: string;
}) {
  const taskId = normalizeId(args.taskId);
  if (!taskId) {
    return [];
  }

  return args.notifications.flatMap((notification) =>
    !notification.readAt &&
    (notification.kind === "task.turn_completed" ||
      notification.kind === "task.turn_failed") &&
    normalizeId(notification.taskId) === taskId
      ? [notification.id]
      : [],
  );
}
