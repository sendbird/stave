import { i18n } from "@/i18n/runtime";
import { isSuccessfulProviderTurnStopReason } from "@/lib/providers/turn-stop-reason";
/**
 * Notification input builders for provider turn events.
 *
 * Extracted verbatim from `@/store/app.store` to keep the store file within the
 * max-lines ratchet. The `state` argument was `Pick<AppState, ...>`; it is now
 * the structurally identical {@link NotificationRepositoryScopeState}, so every
 * existing call site (which passes the full store state) still type-checks and
 * behaves the same.
 */
import { captureResultEvidence } from "@/lib/reviews/result-evidence";
import {
  classifyProviderTurnStopReason,
  isProviderTurnContinuationEvent,
} from "@/lib/providers/turn-status";
import { toast } from "@/lib/notifications/toast";
import type { WorkspaceSummary } from "@/lib/db/workspaces.db";
import type {
  AppNotification,
  AppNotificationCreateInput,
} from "@/lib/notifications/notification.types";
import { buildNotificationToastOptions } from "@/lib/notifications/notification.utils";
import type {
  NormalizedProviderEvent,
  ProviderId,
  RateLimitsSnapshotResponse,
} from "@/lib/providers/provider.types";
import {
  buildTaskExecutionSummary,
  buildTaskReviewArtifact,
} from "@/lib/fleet/task-execution-summary";
import { isTrustedApproval } from "@/lib/providers/trusted-tools";
import {
  findPendingApprovalMessageByRequestId,
  findPendingUserInputMessageByRequestId,
} from "@/store/provider-message.utils";
import {
  resolveRepositoryForWorkspaceId,
  resolveWorkspaceName,
  type RecentRepositoryState,
} from "@/store/repository.utils";
import type { WorkspaceSessionState } from "@/store/workspace-session-state";

/**
 * Project-scoped slice of the app store that notification bodies need in order
 * to name the owning repository and workspace.
 */
export interface NotificationRepositoryScopeState {
  repositoryPath: string | null;
  repositoryName: string | null;
  workspaces: WorkspaceSummary[];
  recentRepositories: RecentRepositoryState[];
  rateLimitsSnapshot?: RateLimitsSnapshotResponse | null;
}

function resolveTaskTitleFromSession(args: {
  session: WorkspaceSessionState;
  taskId: string;
}) {
  return (
    args.session.tasks.find((task) => task.id === args.taskId)?.title.trim() ||
    i18n.t("notifications:appNotificationBuilders.untitledTask")
  );
}

/**
 * A hard error inside a batch that then kept working and finished without a
 * failure stop is history, not a failed run. The alert would otherwise stay
 * on the workspace after a turn that completed normally.
 */
function hardErrorWasSupersededByContinuation(
  events: readonly NormalizedProviderEvent[],
) {
  let doneEvent: Extract<NormalizedProviderEvent, { type: "done" }> | undefined;
  let lastHardErrorIndex = -1;
  events.forEach((event, index) => {
    if (event.type === "error" && event.recoverable === false) {
      lastHardErrorIndex = index;
    }
    if (event.type === "done") {
      doneEvent = event;
    }
  });
  if (
    !doneEvent ||
    lastHardErrorIndex < 0 ||
    !isSuccessfulProviderTurnStopReason(doneEvent.stop_reason)
  ) {
    return false;
  }
  return events
    .slice(lastHardErrorIndex + 1)
    .some(
      (event) => event.type !== "done" && isProviderTurnContinuationEvent(event),
    );
}

export function buildTaskTurnCompletedNotificationInput(args: {
  state: NotificationRepositoryScopeState;
  session: WorkspaceSessionState;
  workspaceId: string;
  taskId: string;
  turnId: string;
  provider: ProviderId;
  events: NormalizedProviderEvent[];
}): AppNotificationCreateInput | null {
  const doneEvent = [...args.events]
    .reverse()
    .find(
      (event): event is Extract<NormalizedProviderEvent, { type: "done" }> =>
        event.type === "done",
    );
  if (!doneEvent) {
    return null;
  }
  const receipt = [...(args.session.messagesByTask[args.taskId] ?? [])]
    .reverse()
    .find((message) => message.role === "assistant" && message.turnId === args.turnId)
    ?.terminalReceipt;
  if (receipt?.completedAt ? receipt.outcome !== "completed" : (
    classifyProviderTurnStopReason(doneEvent.stop_reason) !== "completed" ||
    (args.events.some((event) => event.type === "error" && !event.recoverable) &&
      !hardErrorWasSupersededByContinuation(args.events))
  )) return null;
  if (args.session.activeTurnIdsByTask[args.taskId]) {
    return null;
  }

  const repository = resolveRepositoryForWorkspaceId({
    state: {
      repositoryPath: args.state.repositoryPath,
      repositoryName: args.state.repositoryName,
      workspaces: args.state.workspaces,
      recentRepositories: args.state.recentRepositories,
    },
    workspaceId: args.workspaceId,
  });
  const workspaceName = resolveWorkspaceName({
    state: {
      workspaces: args.state.workspaces,
      recentRepositories: args.state.recentRepositories,
    },
    workspaceId: args.workspaceId,
  });
  const taskTitle = resolveTaskTitleFromSession({
    session: args.session,
    taskId: args.taskId,
  });
  const executionSummary = buildTaskExecutionSummary({
    taskId: args.taskId,
    providerId: args.provider,
    messages: args.session.messagesByTask[args.taskId] ?? [],
    rateLimits: args.state.rateLimitsSnapshot,
  });
  const reviewArtifact = buildTaskReviewArtifact(executionSummary);
  const reviewFacts = reviewArtifact.facts.slice(0, 2);

  return {
    id: crypto.randomUUID(),
    kind: "task.turn_completed",
    title: taskTitle,
    body: i18n.t("notifications:appNotificationBuilders.runFinished", { workspaceName, reviewFacts: reviewFacts.length > 0 ? ` ${reviewFacts.join(" · ")}.` : "" }),
    repositoryPath: repository?.repositoryPath ?? null,
    repositoryName: repository?.repositoryName ?? null,
    workspaceId: args.workspaceId,
    workspaceName,
    taskId: args.taskId,
    taskTitle,
    turnId: args.turnId,
    providerId: args.provider,
    action: null,
    payload: {
      stopReason: doneEvent.stop_reason ?? null,
      executionSummaryProvenance: Object.fromEntries(
        Object.entries(executionSummary).map(([key, metric]) => [
          key,
          metric.provenance,
        ]),
      ),
      reviewArtifact,
      resultEvidence: captureResultEvidence(args.session.messagesByTask[args.taskId] ?? [], args.turnId),
    },
    dedupeKey: `task.turn_completed:${args.turnId}`,
  };
}

export function buildTaskTurnFailedNotificationInput(args: {
  state: NotificationRepositoryScopeState;
  session: WorkspaceSessionState;
  workspaceId: string;
  taskId: string;
  turnId: string;
  provider: ProviderId;
  events: NormalizedProviderEvent[];
}): AppNotificationCreateInput | null {
  const errorEvent = [...args.events]
    .reverse()
    .find(
      (event): event is Extract<NormalizedProviderEvent, { type: "error" }> =>
        event.type === "error" && event.recoverable === false,
    );
  const failedDone = args.events.find((event) => event.type === "done" &&
    classifyProviderTurnStopReason(event.stop_reason) === "failed");
  const receipt = [...(args.session.messagesByTask[args.taskId] ?? [])]
    .reverse()
    .find((message) => message.role === "assistant" && message.turnId === args.turnId)
    ?.terminalReceipt;
  if (receipt?.completedAt && receipt.outcome !== "failed") return null;
  if (!errorEvent && !failedDone && receipt?.outcome !== "failed") {
    return null;
  }
  if (args.session.activeTurnIdsByTask[args.taskId]) {
    return null;
  }
  if (!receipt?.completedAt && !failedDone && hardErrorWasSupersededByContinuation(args.events)) {
    return null;
  }

  const repository = resolveRepositoryForWorkspaceId({
    state: {
      repositoryPath: args.state.repositoryPath,
      repositoryName: args.state.repositoryName,
      workspaces: args.state.workspaces,
      recentRepositories: args.state.recentRepositories,
    },
    workspaceId: args.workspaceId,
  });
  const workspaceName = resolveWorkspaceName({
    state: {
      workspaces: args.state.workspaces,
      recentRepositories: args.state.recentRepositories,
    },
    workspaceId: args.workspaceId,
  });
  const taskTitle = resolveTaskTitleFromSession({
    session: args.session,
    taskId: args.taskId,
  });

  return {
    id: crypto.randomUUID(),
    kind: "task.turn_failed",
    title: taskTitle,
    body: i18n.t("notifications:appNotificationBuilders.runFailed", { workspaceName }),
    repositoryPath: repository?.repositoryPath ?? null,
    repositoryName: repository?.repositoryName ?? null,
    workspaceId: args.workspaceId,
    workspaceName,
    taskId: args.taskId,
    taskTitle,
    turnId: args.turnId,
    providerId: args.provider,
    action: null,
    payload: {
      message: errorEvent?.message ?? i18n.t("notifications:appNotificationBuilders.theProviderStoppedBeforeCompleting"),
      resultEvidence: captureResultEvidence(args.session.messagesByTask[args.taskId] ?? [], args.turnId),
    },
    dedupeKey: `task.turn_failed:${args.turnId}`,
  };
}

export function buildApprovalNotificationInputs(args: {
  state: NotificationRepositoryScopeState;
  session: WorkspaceSessionState;
  workspaceId: string;
  taskId: string;
  turnId: string;
  provider: ProviderId;
  events: NormalizedProviderEvent[];
  trustedTools?: readonly string[] | null;
}): AppNotificationCreateInput[] {
  const approvalEvents = args.events.filter(
    (event): event is Extract<NormalizedProviderEvent, { type: "approval" }> =>
      event.type === "approval" &&
      !isTrustedApproval({
        trustedTools: args.trustedTools,
        toolName: event.toolName,
        input: event.input,
      }),
  );
  if (approvalEvents.length === 0) {
    return [];
  }

  const repository = resolveRepositoryForWorkspaceId({
    state: {
      repositoryPath: args.state.repositoryPath,
      repositoryName: args.state.repositoryName,
      workspaces: args.state.workspaces,
      recentRepositories: args.state.recentRepositories,
    },
    workspaceId: args.workspaceId,
  });
  const workspaceName = resolveWorkspaceName({
    state: {
      workspaces: args.state.workspaces,
      recentRepositories: args.state.recentRepositories,
    },
    workspaceId: args.workspaceId,
  });
  const taskTitle = resolveTaskTitleFromSession({
    session: args.session,
    taskId: args.taskId,
  });
  const taskMessages = args.session.messagesByTask[args.taskId] ?? [];

  return approvalEvents.flatMap((event) => {
    const location = findPendingApprovalMessageByRequestId({
      messages: taskMessages,
      requestId: event.requestId,
    });
    if (!location) {
      return [];
    }

    return [
      {
        id: crypto.randomUUID(),
        kind: "task.approval_requested",
        title: taskTitle,
        body: `${event.toolName}: ${event.description}`,
        repositoryPath: repository?.repositoryPath ?? null,
        repositoryName: repository?.repositoryName ?? null,
        workspaceId: args.workspaceId,
        workspaceName,
        taskId: args.taskId,
        taskTitle,
        turnId: args.turnId,
        providerId: args.provider,
        action: {
          type: "approval",
          requestId: event.requestId,
          messageId: location.messageId,
        },
        payload: {
          toolName: event.toolName,
          description: event.description,
        },
        dedupeKey: `task.approval_requested:${args.turnId}:${event.requestId}`,
      } satisfies AppNotificationCreateInput,
    ];
  });
}

export function findTrustedApprovalResponses(args: {
  session: WorkspaceSessionState;
  taskId: string;
  events: NormalizedProviderEvent[];
  trustedTools?: readonly string[] | null;
}) {
  const taskMessages = args.session.messagesByTask[args.taskId] ?? [];
  return args.events.flatMap((event) => {
    if (
      event.type !== "approval" ||
      !isTrustedApproval({
        trustedTools: args.trustedTools,
        toolName: event.toolName,
        input: event.input,
      })
    ) {
      return [];
    }
    const location = findPendingApprovalMessageByRequestId({
      messages: taskMessages,
      requestId: event.requestId,
    });
    return location
      ? [{ messageId: location.messageId, requestId: event.requestId }]
      : [];
  });
}

function formatUserInputQuestionSummary(
  event: Extract<NormalizedProviderEvent, { type: "user_input" }>,
) {
  const firstQuestion = event.questions[0];
  const questionText =
    firstQuestion?.header.trim() || firstQuestion?.question.trim() || "";
  if (questionText) {
    return questionText;
  }
  if (event.questions.length > 1) {
    return i18n.t("notifications:appNotificationBuilders.questions", { count: event.questions.length });
  }
  return i18n.t("notifications:appNotificationBuilders.userInputRequested");
}

export function buildUserInputNotificationInputs(args: {
  state: NotificationRepositoryScopeState;
  session: WorkspaceSessionState;
  workspaceId: string;
  taskId: string;
  turnId: string;
  provider: ProviderId;
  events: NormalizedProviderEvent[];
}): AppNotificationCreateInput[] {
  const userInputEvents = args.events.filter(
    (
      event,
    ): event is Extract<NormalizedProviderEvent, { type: "user_input" }> =>
      event.type === "user_input",
  );
  if (userInputEvents.length === 0) {
    return [];
  }

  const repository = resolveRepositoryForWorkspaceId({
    state: {
      repositoryPath: args.state.repositoryPath,
      repositoryName: args.state.repositoryName,
      workspaces: args.state.workspaces,
      recentRepositories: args.state.recentRepositories,
    },
    workspaceId: args.workspaceId,
  });
  const workspaceName = resolveWorkspaceName({
    state: {
      workspaces: args.state.workspaces,
      recentRepositories: args.state.recentRepositories,
    },
    workspaceId: args.workspaceId,
  });
  const taskTitle = resolveTaskTitleFromSession({
    session: args.session,
    taskId: args.taskId,
  });
  const taskMessages = args.session.messagesByTask[args.taskId] ?? [];

  return userInputEvents.flatMap((event) => {
    const location = findPendingUserInputMessageByRequestId({
      messages: taskMessages,
      requestId: event.requestId,
    });
    if (!location) {
      return [];
    }

    const question = formatUserInputQuestionSummary(event);
    return [
      {
        id: crypto.randomUUID(),
        kind: "task.user_input_requested",
        title: taskTitle,
        body: `${event.toolName}: ${question}`,
        repositoryPath: repository?.repositoryPath ?? null,
        repositoryName: repository?.repositoryName ?? null,
        workspaceId: args.workspaceId,
        workspaceName,
        taskId: args.taskId,
        taskTitle,
        turnId: args.turnId,
        providerId: args.provider,
        action: null,
        payload: {
          toolName: event.toolName,
          question,
          questionCount: event.questions.length,
          requestId: event.requestId,
          messageId: location.messageId,
        },
        dedupeKey: `task.user_input_requested:${args.turnId}:${event.requestId}`,
      } satisfies AppNotificationCreateInput,
    ];
  });
}

export function showNotificationToast(
  notification: AppNotification,
  options: { onOpen?: () => void } = {},
) {
  const { tone, title, ...toastOptions } =
    buildNotificationToastOptions(notification);
  const openAction =
    options.onOpen && notification.taskId?.trim()
      ? {
          action: {
            label: i18n.t("notifications:appNotificationBuilders.openTask"),
            onClick: options.onOpen,
          },
        }
      : {};
  const resolvedToastOptions = {
    ...toastOptions,
    ...openAction,
  };

  if (tone === "success") {
    return toast.success(title, resolvedToastOptions);
  }

  return tone === "error"
    ? toast.error(title, resolvedToastOptions)
    : toast.warning(title, resolvedToastOptions);
}
