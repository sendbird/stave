import { i18n } from "@/i18n/runtime";
import type { AppNotification } from "@/lib/notifications/notification.types";

const STOP_REASON_LABELS: Record<string, string> = {
  get end_turn() { return i18n.t("notifications:notificationUtils.completedNormally"); },
  get max_tokens() { return i18n.t("notifications:notificationUtils.tokenLimitReached"); },
  get tool_use() { return i18n.t("notifications:notificationUtils.pausedOnToolCall"); },
  get stop_sequence() { return i18n.t("notifications:notificationUtils.stopSequenceHit"); },
  get error() { return i18n.t("notifications:notificationUtils.endedWithError"); },
};

export const NOTIFICATION_TOAST_DURATIONS_MS = {
  turnCompleted: 4000,
  turnFailed: 8000,
  approvalRequested: 8000,
  userInputRequested: 8000,
  agentRunAttention: 10000,
  agentRunCompleted: 6000,
} as const;

export interface NotificationToastOptions {
  tone: "success" | "warning" | "error";
  title: string;
  description?: string;
  duration: number;
  closeButton: true;
  dismissible: true;
}

export function formatNotificationStopReason(
  stopReason: unknown,
): string | null {
  if (typeof stopReason !== "string") {
    return null;
  }

  const normalizedStopReason = stopReason.trim();
  if (!normalizedStopReason) {
    return null;
  }

  return STOP_REASON_LABELS[normalizedStopReason] ?? normalizedStopReason;
}

export function formatApprovalNotificationDetail(
  payload: Record<string, unknown>,
): string | null {
  const toolName =
    typeof payload.toolName === "string" ? payload.toolName.trim() : "";
  const description =
    typeof payload.description === "string" ? payload.description.trim() : "";

  if (toolName && description) {
    return `${toolName}: ${description}`;
  }
  if (toolName) {
    return toolName;
  }
  if (description) {
    return description;
  }

  return null;
}

export function formatUserInputNotificationDetail(
  payload: Record<string, unknown>,
): string | null {
  const toolName =
    typeof payload.toolName === "string" ? payload.toolName.trim() : "";
  const question =
    typeof payload.question === "string" ? payload.question.trim() : "";
  const questionCount =
    typeof payload.questionCount === "number" && payload.questionCount > 1
      ? payload.questionCount
      : null;
  const detail = question || (questionCount ? i18n.t("notifications:notificationUtils.questions", { count: questionCount }) : "");

  if (toolName && detail) {
    return `${toolName}: ${detail}`;
  }
  if (toolName) {
    return toolName;
  }
  if (detail) {
    return detail;
  }

  return null;
}

export function buildNotificationDetail(
  notification: Pick<AppNotification, "kind" | "payload">,
): string | null {
  if (notification.kind === "task.turn_completed") {
    return formatNotificationStopReason(notification.payload.stopReason);
  }
  if (notification.kind === "task.turn_failed") {
    const message = notification.payload.message;
    return typeof message === "string" && message.trim() ? message.trim() : null;
  }
  if (notification.kind === "task.approval_requested") {
    return formatApprovalNotificationDetail(notification.payload);
  }
  if (notification.kind === "task.user_input_requested") {
    return formatUserInputNotificationDetail(notification.payload);
  }
  if (notification.kind.startsWith("agent_run.")) {
    const detail = notification.payload.detail;
    return typeof detail === "string" && detail.trim() ? detail.trim() : null;
  }

  return null;
}

export function buildNotificationToastOptions(
  notification: Pick<
    AppNotification,
    "kind" | "payload" | "taskTitle" | "workspaceName"
  > &
    Partial<Pick<AppNotification, "title">>,
): NotificationToastOptions {
  const label =
    notification.taskTitle?.trim() ||
    notification.workspaceName?.trim() ||
    i18n.t("notifications:notificationUtils.task");
  const description = buildNotificationDetail(notification) ?? undefined;

  if (notification.kind === "task.turn_completed") {
    return {
      tone: "success",
      title: label,
      description,
      duration: NOTIFICATION_TOAST_DURATIONS_MS.turnCompleted,
      closeButton: true,
      dismissible: true,
    };
  }

  if (notification.kind === "task.turn_failed") {
    return {
      tone: "error",
      title: i18n.t("notifications:notificationUtils.runFailed", { label }),
      description,
      duration: NOTIFICATION_TOAST_DURATIONS_MS.turnFailed,
      closeButton: true,
      dismissible: true,
    };
  }

  if (notification.kind === "task.approval_requested") {
    return {
      tone: "warning",
      title: i18n.t("notifications:notificationUtils.approvalNeeded", { label }),
      description,
      duration: NOTIFICATION_TOAST_DURATIONS_MS.approvalRequested,
      closeButton: true,
      dismissible: true,
    };
  }

  if (notification.kind === "agent_run.completed") {
    return {
      tone: "success",
      title: notification.title ?? label,
      description,
      duration: NOTIFICATION_TOAST_DURATIONS_MS.agentRunCompleted,
      closeButton: true,
      dismissible: true,
    };
  }

  if (
    notification.kind === "agent_run.sign_off_requested" ||
    notification.kind === "agent_run.blocked" ||
    notification.kind === "agent_run.stuck"
  ) {
    return {
      tone: notification.kind === "agent_run.sign_off_requested" ? "warning" : "error",
      title: notification.title ?? label,
      description,
      duration: NOTIFICATION_TOAST_DURATIONS_MS.agentRunAttention,
      closeButton: true,
      dismissible: true,
    };
  }

  return {
    tone: "warning",
    title: i18n.t("notifications:notificationUtils.inputNeeded", { label }),
    description,
    duration: NOTIFICATION_TOAST_DURATIONS_MS.userInputRequested,
    closeButton: true,
    dismissible: true,
  };
}
