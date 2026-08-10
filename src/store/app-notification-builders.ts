/**
 * Notification input builders for provider turn events.
 *
 * Extracted verbatim from `@/store/app.store` to keep the store file within the
 * max-lines ratchet. The `state` argument was `Pick<AppState, ...>`; it is now
 * the structurally identical {@link NotificationProjectScopeState}, so every
 * existing call site (which passes the full store state) still type-checks and
 * behaves the same.
 */
import { createElement } from "react";
import { toast, type ExternalToast } from "sonner";
import type { TaskHeartbeatSummary } from "@/lib/automation/task-supervisor";
import type { WorkspaceSummary } from "@/lib/db/workspaces.db";
import type {
  AppNotification,
  AppNotificationCreateInput,
} from "@/lib/notifications/notification.types";
import { workspaceHasActiveTurns } from "@/lib/notifications/notification.types";
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
  resolveProjectForWorkspaceId,
  resolveWorkspaceName,
  type RecentProjectState,
} from "@/store/project.utils";
import type { WorkspaceSessionState } from "@/store/workspace-session-state";

/**
 * Project-scoped slice of the app store that notification bodies need in order
 * to name the owning project and workspace.
 */
export interface NotificationProjectScopeState {
  projectPath: string | null;
  projectName: string | null;
  workspaces: WorkspaceSummary[];
  recentProjects: RecentProjectState[];
  rateLimitsSnapshot?: RateLimitsSnapshotResponse | null;
  /**
   * Optional so the existing structural call sites (which pass the whole store
   * state) keep type-checking, and so tests can omit it. A turn-completed
   * notification that came from a heartbeat should say the run was supervised.
   */
  taskHeartbeatSummariesByTaskId?: Record<string, TaskHeartbeatSummary>;
}

const OPEN_NOTIFICATION_ACTION_BUTTON_STYLE = {
  position: "absolute",
  inset: 0,
  height: "auto",
  margin: 0,
  padding: 0,
  borderRadius: "inherit",
  background: "transparent",
} satisfies NonNullable<ExternalToast["actionButtonStyle"]>;

function resolveTaskTitleFromSession(args: {
  session: WorkspaceSessionState;
  taskId: string;
}) {
  return (
    args.session.tasks.find((task) => task.id === args.taskId)?.title.trim() ||
    "Untitled Task"
  );
}

export function buildTaskTurnCompletedNotificationInput(args: {
  state: NotificationProjectScopeState;
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
  if (
    workspaceHasActiveTurns({
      activeTurnIdsByTask: args.session.activeTurnIdsByTask,
    })
  ) {
    return null;
  }

  const project = resolveProjectForWorkspaceId({
    state: {
      projectPath: args.state.projectPath,
      projectName: args.state.projectName,
      workspaces: args.state.workspaces,
      recentProjects: args.state.recentProjects,
    },
    workspaceId: args.workspaceId,
  });
  const workspaceName = resolveWorkspaceName({
    state: {
      workspaces: args.state.workspaces,
      recentProjects: args.state.recentProjects,
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
    heartbeat: args.state.taskHeartbeatSummariesByTaskId?.[args.taskId] ?? null,
  });
  const reviewArtifact = buildTaskReviewArtifact(executionSummary);
  const reviewFacts = reviewArtifact.facts.slice(0, 2);

  return {
    id: crypto.randomUUID(),
    kind: "task.turn_completed",
    title: taskTitle,
    body: `Latest run finished in ${workspaceName}.${reviewFacts.length > 0 ? ` ${reviewFacts.join(" · ")}.` : ""}`,
    projectPath: project?.projectPath ?? null,
    projectName: project?.projectName ?? null,
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
    },
    dedupeKey: `task.turn_completed:${args.turnId}`,
  };
}

export function buildTaskTurnFailedNotificationInput(args: {
  state: NotificationProjectScopeState;
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
  if (!errorEvent) {
    return null;
  }
  if (
    workspaceHasActiveTurns({
      activeTurnIdsByTask: args.session.activeTurnIdsByTask,
    })
  ) {
    return null;
  }

  const project = resolveProjectForWorkspaceId({
    state: {
      projectPath: args.state.projectPath,
      projectName: args.state.projectName,
      workspaces: args.state.workspaces,
      recentProjects: args.state.recentProjects,
    },
    workspaceId: args.workspaceId,
  });
  const workspaceName = resolveWorkspaceName({
    state: {
      workspaces: args.state.workspaces,
      recentProjects: args.state.recentProjects,
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
    body: `Latest run failed in ${workspaceName}.`,
    projectPath: project?.projectPath ?? null,
    projectName: project?.projectName ?? null,
    workspaceId: args.workspaceId,
    workspaceName,
    taskId: args.taskId,
    taskTitle,
    turnId: args.turnId,
    providerId: args.provider,
    action: null,
    payload: {
      message: errorEvent.message,
    },
    dedupeKey: `task.turn_failed:${args.turnId}`,
  };
}

export function buildApprovalNotificationInputs(args: {
  state: NotificationProjectScopeState;
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

  const project = resolveProjectForWorkspaceId({
    state: {
      projectPath: args.state.projectPath,
      projectName: args.state.projectName,
      workspaces: args.state.workspaces,
      recentProjects: args.state.recentProjects,
    },
    workspaceId: args.workspaceId,
  });
  const workspaceName = resolveWorkspaceName({
    state: {
      workspaces: args.state.workspaces,
      recentProjects: args.state.recentProjects,
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
        projectPath: project?.projectPath ?? null,
        projectName: project?.projectName ?? null,
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
    return `${event.questions.length} questions`;
  }
  return "User input requested";
}

export function buildUserInputNotificationInputs(args: {
  state: NotificationProjectScopeState;
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

  const project = resolveProjectForWorkspaceId({
    state: {
      projectPath: args.state.projectPath,
      projectName: args.state.projectName,
      workspaces: args.state.workspaces,
      recentProjects: args.state.recentProjects,
    },
    workspaceId: args.workspaceId,
  });
  const workspaceName = resolveWorkspaceName({
    state: {
      workspaces: args.state.workspaces,
      recentProjects: args.state.recentProjects,
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
        projectPath: project?.projectPath ?? null,
        projectName: project?.projectName ?? null,
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
            label: createElement(
              "span",
              { className: "sr-only" },
              `Open task: ${notification.taskTitle?.trim() || title}`,
            ),
            onClick: options.onOpen,
          },
          actionButtonStyle: OPEN_NOTIFICATION_ACTION_BUTTON_STYLE,
        }
      : {};
  const resolvedToastOptions = {
    ...toastOptions,
    ...openAction,
  };

  if (tone === "success") {
    return toast.success(title, resolvedToastOptions);
  }

  return toast.warning(title, resolvedToastOptions);
}
