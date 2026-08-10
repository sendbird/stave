import type { AppNotification } from "@/lib/notifications/notification.types";
import type { WorkspacePrStatus } from "@/lib/pr-status";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { ProviderTurnActivitySnapshot } from "@/lib/providers/turn-status";
import {
  isDelegatedChildTask,
  isExternallyManagedTask,
  isTaskArchived,
  isTaskManaged,
} from "@/lib/tasks";
import {
  findLatestPendingApproval,
  findLatestPendingUserInput,
} from "@/store/provider-message.utils";
import type { ChatMessage, Task } from "@/types/chat";
import { classifyTaskStatus } from "./task-status";

export type FleetAttentionKind =
  | "user-input"
  | "approval"
  | "run-failed"
  | "result-ready"
  | "pr-changes-requested"
  | "pr-checks-failed"
  | "pr-merge-conflict"
  | "pr-behind-base"
  | "pr-ready-to-merge";

export type FleetAttentionSource = "live" | "notification" | "pr";

/**
 * `blocking` items hold work up until the user acts. `review` items are worth
 * seeing but nothing is stalled on them, so the rail can fold them away by
 * default instead of burying the items that actually block an agent.
 */
export type FleetAttentionTier = "blocking" | "review";

export const FLEET_ATTENTION_TIER: Record<FleetAttentionKind, FleetAttentionTier> = {
  "user-input": "blocking",
  approval: "blocking",
  "run-failed": "blocking",
  "pr-changes-requested": "blocking",
  "pr-checks-failed": "blocking",
  "pr-merge-conflict": "blocking",
  "pr-behind-base": "review",
  "result-ready": "review",
  "pr-ready-to-merge": "review",
};

export function getFleetAttentionTier(kind: FleetAttentionKind) {
  return FLEET_ATTENTION_TIER[kind];
}

export interface FleetAttentionItem {
  id: string;
  kind: FleetAttentionKind;
  priority: number;
  projectPath: string;
  projectName: string;
  workspaceId: string;
  workspaceName: string;
  taskId?: string;
  taskTitle?: string;
  turnId?: string;
  requestId?: string;
  notificationId?: string;
  providerId?: ProviderId;
  createdAt: string;
  source: FleetAttentionSource;
  detail?: string;
  prStatus?: WorkspacePrStatus;
  prUrl?: string;
}

export interface FleetLiveWorkspaceInput {
  projectPath: string;
  projectName: string;
  workspaceId: string;
  workspaceName: string;
  tasks: readonly Task[];
  messagesByTask: Record<string, ChatMessage[]>;
  activeTurnIdsByTask: Record<string, string | undefined>;
  providerTurnActivityByTask: Record<
    string,
    ProviderTurnActivitySnapshot | undefined
  >;
}

export interface FleetPrWorkspaceInput {
  projectPath: string;
  projectName: string;
  workspaceId: string;
  workspaceName: string;
  status: WorkspacePrStatus;
  url?: string | null;
  updatedAt: string;
}

export interface FleetAttentionProjection {
  items: FleetAttentionItem[];
  count: number;
  blockingItems: FleetAttentionItem[];
  reviewItems: FleetAttentionItem[];
  highestAttentionByWorkspaceId: Record<string, FleetAttentionItem | undefined>;
  attentionItemsByWorkspaceId: Record<string, FleetAttentionItem[] | undefined>;
}

export const FLEET_ATTENTION_PRIORITY: Record<FleetAttentionKind, number> = {
  "user-input": 0,
  approval: 1,
  "run-failed": 2,
  "pr-changes-requested": 3,
  "pr-checks-failed": 3,
  "pr-merge-conflict": 3,
  "pr-behind-base": 3,
  "result-ready": 4,
  "pr-ready-to-merge": 5,
};

const SOURCE_PRIORITY: Record<FleetAttentionSource, number> = {
  live: 0,
  notification: 1,
  pr: 2,
};

const EPOCH_TIMESTAMP = new Date(0).toISOString();

function normalizeTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString()
    : EPOCH_TIMESTAMP;
}

function normalizeRequired(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function buildInteractionAttentionId(args: {
  kind: "user-input" | "approval";
  workspaceId: string;
  taskId: string;
  requestId: string;
}) {
  return [
    "interaction",
    args.kind,
    args.workspaceId,
    args.taskId,
    args.requestId,
  ].join(":");
}

function buildTurnAttentionId(args: {
  kind: "run-failed" | "result-ready";
  workspaceId: string;
  taskId: string;
  turnId: string;
}) {
  return ["turn", args.kind, args.workspaceId, args.taskId, args.turnId].join(
    ":",
  );
}

export function getFleetAttentionTaskKey(workspaceId: string, taskId: string) {
  return JSON.stringify([workspaceId, taskId]);
}

/**
 * Externally managed tasks are deliberately kept out of Fleet attention: their
 * interaction requests are answered by whoever drives them from outside Stave,
 * so showing them here would ask the user for something the app cannot route.
 *
 * Delegated child tasks are the one carve-out. They are externally managed only
 * because the child-task coordinator creates them that way — nothing outside
 * Stave is watching them, the person who owns the parent task is the only one
 * who can answer, and an unanswered child approval auto-denies after a few
 * minutes. So a child's request stays visible, attributed to the child task
 * itself and routed to the workspace the child actually runs in.
 */
export function isFleetAttentionSuppressedTask(
  task: Pick<Task, "controlMode" | "controlOwner" | "parentTaskId">,
) {
  return isExternallyManagedTask(task) && !isDelegatedChildTask(task);
}

/**
 * The notification-payload equivalent of `isFleetAttentionSuppressedTask`. A
 * notification outlives the live task state it was raised from, so it carries
 * its own copy of the control fields and of the delegation link. Rows written
 * before the link existed simply have no `parentTaskId` and keep the old
 * suppressed behavior.
 */
function isSuppressedInteractionNotification(notification: AppNotification) {
  if (
    notification.payload.controlMode !== "managed" ||
    notification.payload.controlOwner !== "external"
  ) {
    return false;
  }
  const parentTaskId = notification.payload.parentTaskId;
  return !(typeof parentTaskId === "string" && normalizeRequired(parentTaskId));
}

function buildPrNeedId(args: {
  kind: Extract<FleetAttentionKind, `pr-${string}`>;
  workspaceId: string;
}) {
  return ["pr", args.kind, args.workspaceId].join(":");
}

function buildLiveBase(args: {
  workspace: FleetLiveWorkspaceInput;
  task: Task;
}) {
  return {
    projectPath: args.workspace.projectPath,
    projectName: args.workspace.projectName,
    workspaceId: args.workspace.workspaceId,
    workspaceName: args.workspace.workspaceName,
    taskId: args.task.id,
    taskTitle: args.task.title.trim() || "Untitled task",
    providerId: args.task.provider,
    createdAt: normalizeTimestamp(args.task.updatedAt),
    source: "live" as const,
  };
}

export function collectFleetLiveAttentionItems(
  workspaces: readonly FleetLiveWorkspaceInput[],
) {
  const attentionItems: FleetAttentionItem[] = [];

  for (const workspace of workspaces) {
    for (const task of workspace.tasks) {
      if (isTaskArchived(task) || isFleetAttentionSuppressedTask(task)) {
        continue;
      }

      // A locally driven item belongs to a running turn. Without one the task is
      // done and any leftover pending part is history, not an open request.
      // Managed tasks are the exception: their requests are answered through the
      // host, so they stay actionable without a renderer turn.
      const activeTurnId = workspace.activeTurnIdsByTask[task.id];
      if (!activeTurnId && !isTaskManaged(task)) {
        continue;
      }

      const messages = workspace.messagesByTask[task.id] ?? [];
      const pendingInput = findLatestPendingUserInput({ messages });
      if (pendingInput) {
        const requestId = normalizeRequired(pendingInput.part.requestId);
        if (requestId) {
          const kind = "user-input" as const;
          attentionItems.push({
            ...buildLiveBase({ workspace, task }),
            id: buildInteractionAttentionId({
              kind,
              workspaceId: workspace.workspaceId,
              taskId: task.id,
              requestId,
            }),
            kind,
            priority: FLEET_ATTENTION_PRIORITY[kind],
            requestId,
            turnId: activeTurnId,
          });
          continue;
        }
      }

      const pendingApproval = findLatestPendingApproval({ messages });
      if (pendingApproval) {
        const requestId = normalizeRequired(pendingApproval.part.requestId);
        if (requestId) {
          const kind = "approval" as const;
          attentionItems.push({
            ...buildLiveBase({ workspace, task }),
            id: buildInteractionAttentionId({
              kind,
              workspaceId: workspace.workspaceId,
              taskId: task.id,
              requestId,
            }),
            kind,
            priority: FLEET_ATTENTION_PRIORITY[kind],
            requestId,
            turnId: activeTurnId,
            detail: `${pendingApproval.part.toolName}: ${pendingApproval.part.description}`,
          });
          continue;
        }
      }

      if (
        activeTurnId &&
        classifyTaskStatus({
          task,
          messages,
          activeTurnId,
          activity: workspace.providerTurnActivityByTask[task.id] ?? null,
        }) === "error"
      ) {
        const kind = "run-failed" as const;
        attentionItems.push({
          ...buildLiveBase({ workspace, task }),
          id: buildTurnAttentionId({
            kind,
            workspaceId: workspace.workspaceId,
            taskId: task.id,
            turnId: activeTurnId,
          }),
          kind,
          priority: FLEET_ATTENTION_PRIORITY[kind],
          turnId: activeTurnId,
          detail: "The active provider turn needs review.",
        });
      }
    }
  }

  return attentionItems;
}

function getNotificationRequestId(notification: AppNotification) {
  if (notification.kind === "task.approval_requested") {
    return normalizeRequired(notification.action?.requestId);
  }
  if (notification.kind === "task.user_input_requested") {
    const requestId = notification.payload.requestId;
    return typeof requestId === "string" ? normalizeRequired(requestId) : null;
  }
  return null;
}

export function collectFleetNotificationAttentionItems(
  notifications: readonly AppNotification[],
) {
  const attentionItems: FleetAttentionItem[] = [];

  for (const notification of notifications) {
    const projectPath = normalizeRequired(notification.projectPath);
    const workspaceId = normalizeRequired(notification.workspaceId);
    const taskId = normalizeRequired(notification.taskId);
    if (!projectPath || !workspaceId || !taskId) {
      continue;
    }

    const base = {
      projectPath,
      projectName: normalizeRequired(notification.projectName) ?? "Project",
      workspaceId,
      workspaceName:
        normalizeRequired(notification.workspaceName) ?? "Workspace",
      taskId,
      taskTitle:
        normalizeRequired(notification.taskTitle) ??
        normalizeRequired(notification.title) ??
        "Untitled task",
      notificationId: notification.id,
      providerId: notification.providerId ?? undefined,
      createdAt: normalizeTimestamp(notification.createdAt),
      source: "notification" as const,
      detail: normalizeRequired(notification.body) ?? undefined,
    };

    if (
      notification.kind === "task.approval_requested" ||
      notification.kind === "task.user_input_requested"
    ) {
      if (isSuppressedInteractionNotification(notification)) {
        continue;
      }
      if (notification.resolvedAt) {
        continue;
      }
      const requestId = getNotificationRequestId(notification);
      if (!requestId) {
        continue;
      }
      const kind =
        notification.kind === "task.approval_requested"
          ? ("approval" as const)
          : ("user-input" as const);
      attentionItems.push({
        ...base,
        id: buildInteractionAttentionId({
          kind,
          workspaceId,
          taskId,
          requestId,
        }),
        kind,
        priority: FLEET_ATTENTION_PRIORITY[kind],
        requestId,
        turnId: notification.turnId ?? undefined,
      });
      continue;
    }

    if (notification.readAt) {
      continue;
    }
    const turnId = normalizeRequired(notification.turnId);
    if (!turnId) {
      continue;
    }
    const kind =
      notification.kind === "task.turn_failed"
        ? ("run-failed" as const)
        : ("result-ready" as const);
    attentionItems.push({
      ...base,
      id: buildTurnAttentionId({ kind, workspaceId, taskId, turnId }),
      kind,
      priority: FLEET_ATTENTION_PRIORITY[kind],
      turnId,
    });
  }

  return attentionItems;
}

export function mapFleetPrAttentionKind(
  status: WorkspacePrStatus,
): Extract<FleetAttentionKind, `pr-${string}`> | null {
  switch (status) {
    case "changes_requested":
      return "pr-changes-requested";
    case "checks_failed":
      return "pr-checks-failed";
    case "merge_conflict":
      return "pr-merge-conflict";
    case "behind_base":
      return "pr-behind-base";
    case "ready_to_merge":
      return "pr-ready-to-merge";
    case "no_pr":
    case "draft":
    case "review_required":
    case "checks_pending":
    case "merged":
    case "closed_unmerged":
      return null;
  }
}

export function collectFleetPrAttentionItems(
  workspaces: readonly FleetPrWorkspaceInput[],
) {
  return workspaces.flatMap((workspace): FleetAttentionItem[] => {
    const kind = mapFleetPrAttentionKind(workspace.status);
    if (!kind) {
      return [];
    }
    return [
      {
        id: buildPrNeedId({
          kind,
          workspaceId: workspace.workspaceId,
        }),
        kind,
        priority: FLEET_ATTENTION_PRIORITY[kind],
        projectPath: workspace.projectPath,
        projectName: workspace.projectName,
        workspaceId: workspace.workspaceId,
        workspaceName: workspace.workspaceName,
        createdAt: normalizeTimestamp(workspace.updatedAt),
        source: "pr",
        prStatus: workspace.status,
        prUrl: normalizeRequired(workspace.url) ?? undefined,
      },
    ];
  });
}

function choosePreferredNeed(current: FleetAttentionItem, candidate: FleetAttentionItem) {
  const preferred =
    SOURCE_PRIORITY[candidate.source] < SOURCE_PRIORITY[current.source]
      ? candidate
      : current;
  const fallback = preferred === candidate ? current : candidate;
  return {
    ...fallback,
    ...preferred,
    notificationId: preferred.notificationId ?? fallback.notificationId,
    detail: preferred.detail ?? fallback.detail,
    createdAt:
      preferred.createdAt.localeCompare(fallback.createdAt) <= 0
        ? preferred.createdAt
        : fallback.createdAt,
  };
}

export function compareFleetAttentionItems(left: FleetAttentionItem, right: FleetAttentionItem) {
  if (left.priority !== right.priority) {
    return left.priority - right.priority;
  }
  if (left.createdAt !== right.createdAt) {
    return left.createdAt.localeCompare(right.createdAt);
  }
  return left.id.localeCompare(right.id);
}

export function buildFleetAttentionProjection(args: {
  notifications: readonly AppNotification[];
  liveWorkspaces: readonly FleetLiveWorkspaceInput[];
  prWorkspaces: readonly FleetPrWorkspaceInput[];
  /**
   * Every workspace the app currently knows about. Notification rows outlive the
   * workspace they belong to, so without this guard an archived workspace keeps
   * contributing items that nobody can ever open or answer. Omit it when the
   * caller has no workspace inventory to compare against.
   */
  knownWorkspaceIds?: ReadonlySet<string>;
  /** Closed tasks resolved from cold workspace shells outside live state. */
  closedTaskKeys?: ReadonlySet<string>;
}): FleetAttentionProjection {
  const byId = new Map<string, FleetAttentionItem>();
  const externalTaskKeys = new Set(
    args.liveWorkspaces.flatMap((workspace) =>
      workspace.tasks
        .filter(isFleetAttentionSuppressedTask)
        .map((task) =>
          getFleetAttentionTaskKey(workspace.workspaceId, task.id),
        ),
    ),
  );
  // A notification outlives the task it was raised for. Once that task is
  // archived the request behind it is settled by definition, so the row is
  // history rather than an open ask and must not keep the attention count up.
  const closedTaskKeys = new Set(args.closedTaskKeys ?? []);
  for (const workspace of args.liveWorkspaces) {
    for (const task of workspace.tasks) {
      if (isTaskArchived(task)) {
        closedTaskKeys.add(
          getFleetAttentionTaskKey(workspace.workspaceId, task.id),
        );
      }
    }
  }
  const knownWorkspaceIds = args.knownWorkspaceIds;
  const candidates = [
    ...collectFleetNotificationAttentionItems(args.notifications)
      .filter(
        (item) => !knownWorkspaceIds || knownWorkspaceIds.has(item.workspaceId),
      )
      .filter(
        (item) =>
          !item.taskId ||
          !closedTaskKeys.has(
            getFleetAttentionTaskKey(item.workspaceId, item.taskId),
          ),
      )
      .filter(
        (item) =>
          (item.kind !== "approval" && item.kind !== "user-input") ||
          !item.taskId ||
          !externalTaskKeys.has(
            getFleetAttentionTaskKey(item.workspaceId, item.taskId),
          ),
      ),
    ...collectFleetPrAttentionItems(args.prWorkspaces),
    ...collectFleetLiveAttentionItems(args.liveWorkspaces),
  ];

  for (const candidate of candidates) {
    const current = byId.get(candidate.id);
    byId.set(
      candidate.id,
      current ? choosePreferredNeed(current, candidate) : candidate,
    );
  }

  const items = Array.from(byId.values()).sort(compareFleetAttentionItems);
  const highestAttentionByWorkspaceId: Record<string, FleetAttentionItem | undefined> =
    {};
  const attentionItemsByWorkspaceId: Record<string, FleetAttentionItem[] | undefined> = {};

  for (const item of items) {
    const existing = attentionItemsByWorkspaceId[item.workspaceId];
    if (existing) {
      existing.push(item);
    } else {
      attentionItemsByWorkspaceId[item.workspaceId] = [item];
    }
    highestAttentionByWorkspaceId[item.workspaceId] ??= item;
  }

  return {
    items,
    count: items.length,
    blockingItems: items.filter(
      (item) => FLEET_ATTENTION_TIER[item.kind] === "blocking",
    ),
    reviewItems: items.filter(
      (item) => FLEET_ATTENTION_TIER[item.kind] === "review",
    ),
    highestAttentionByWorkspaceId,
    attentionItemsByWorkspaceId,
  };
}
