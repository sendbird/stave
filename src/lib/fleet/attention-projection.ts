import type { AppNotification } from "@/lib/notifications/notification.types";
import type { WorkspacePrStatus } from "@/lib/pr-status";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { ProviderTurnActivitySnapshot } from "@/lib/providers/turn-status";
import {
  isExternallyManagedTask,
  isLegacyBranchTask,
  isTaskArchived,
  isTaskManaged,
} from "@/lib/tasks";
import {
  findLatestPendingApproval,
  findLatestPendingUserInput,
} from "@/store/provider-message.utils";
import type { ChatMessage, Task } from "@/types/chat";
import { classifyTaskStatus } from "./task-status";

export type FleetNeedKind =
  | "user-input"
  | "approval"
  | "run-failed"
  | "result-ready"
  | "pr-changes-requested"
  | "pr-checks-failed"
  | "pr-merge-conflict"
  | "pr-behind-base"
  | "pr-ready-to-merge";

export type FleetNeedSource = "live" | "notification" | "pr";

/**
 * `blocking` needs hold work up until the user acts. `review` needs are worth
 * seeing but nothing is stalled on them, so the rail can fold them away by
 * default instead of burying the items that actually block an agent.
 */
export type FleetNeedTier = "blocking" | "review";

export const FLEET_NEED_TIER: Record<FleetNeedKind, FleetNeedTier> = {
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

export function getFleetNeedTier(kind: FleetNeedKind) {
  return FLEET_NEED_TIER[kind];
}

export interface FleetNeedItem {
  id: string;
  kind: FleetNeedKind;
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
  source: FleetNeedSource;
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
  items: FleetNeedItem[];
  count: number;
  blockingItems: FleetNeedItem[];
  reviewItems: FleetNeedItem[];
  highestNeedByWorkspaceId: Record<string, FleetNeedItem | undefined>;
  needsByWorkspaceId: Record<string, FleetNeedItem[] | undefined>;
}

export const FLEET_NEED_PRIORITY: Record<FleetNeedKind, number> = {
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

const SOURCE_PRIORITY: Record<FleetNeedSource, number> = {
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

function buildInteractionNeedId(args: {
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

function buildTurnNeedId(args: {
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

function buildPrNeedId(args: {
  kind: Extract<FleetNeedKind, `pr-${string}`>;
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

export function collectFleetLiveNeeds(
  workspaces: readonly FleetLiveWorkspaceInput[],
) {
  const needs: FleetNeedItem[] = [];

  for (const workspace of workspaces) {
    for (const task of workspace.tasks) {
      if (
        isTaskArchived(task) ||
        isLegacyBranchTask(task) ||
        isExternallyManagedTask(task)
      ) {
        continue;
      }

      // A locally driven need belongs to a running turn. Without one the task is
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
          needs.push({
            ...buildLiveBase({ workspace, task }),
            id: buildInteractionNeedId({
              kind,
              workspaceId: workspace.workspaceId,
              taskId: task.id,
              requestId,
            }),
            kind,
            priority: FLEET_NEED_PRIORITY[kind],
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
          needs.push({
            ...buildLiveBase({ workspace, task }),
            id: buildInteractionNeedId({
              kind,
              workspaceId: workspace.workspaceId,
              taskId: task.id,
              requestId,
            }),
            kind,
            priority: FLEET_NEED_PRIORITY[kind],
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
        needs.push({
          ...buildLiveBase({ workspace, task }),
          id: buildTurnNeedId({
            kind,
            workspaceId: workspace.workspaceId,
            taskId: task.id,
            turnId: activeTurnId,
          }),
          kind,
          priority: FLEET_NEED_PRIORITY[kind],
          turnId: activeTurnId,
          detail: "The active provider turn needs review.",
        });
      }
    }
  }

  return needs;
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

export function collectFleetNotificationNeeds(
  notifications: readonly AppNotification[],
) {
  const needs: FleetNeedItem[] = [];

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
      if (
        notification.payload.controlMode === "managed" &&
        notification.payload.controlOwner === "external"
      ) {
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
      needs.push({
        ...base,
        id: buildInteractionNeedId({
          kind,
          workspaceId,
          taskId,
          requestId,
        }),
        kind,
        priority: FLEET_NEED_PRIORITY[kind],
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
    needs.push({
      ...base,
      id: buildTurnNeedId({ kind, workspaceId, taskId, turnId }),
      kind,
      priority: FLEET_NEED_PRIORITY[kind],
      turnId,
    });
  }

  return needs;
}

export function mapFleetPrNeedKind(
  status: WorkspacePrStatus,
): Extract<FleetNeedKind, `pr-${string}`> | null {
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

export function collectFleetPrNeeds(
  workspaces: readonly FleetPrWorkspaceInput[],
) {
  return workspaces.flatMap((workspace): FleetNeedItem[] => {
    const kind = mapFleetPrNeedKind(workspace.status);
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
        priority: FLEET_NEED_PRIORITY[kind],
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

function choosePreferredNeed(current: FleetNeedItem, candidate: FleetNeedItem) {
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

export function compareFleetNeeds(left: FleetNeedItem, right: FleetNeedItem) {
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
   * contributing needs that nobody can ever open or answer. Omit it when the
   * caller has no workspace inventory to compare against.
   */
  knownWorkspaceIds?: ReadonlySet<string>;
  /** Closed tasks resolved from cold workspace shells outside live state. */
  closedTaskKeys?: ReadonlySet<string>;
}): FleetAttentionProjection {
  const byId = new Map<string, FleetNeedItem>();
  const externalTaskKeys = new Set(
    args.liveWorkspaces.flatMap((workspace) =>
      workspace.tasks
        .filter(isExternallyManagedTask)
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
      if (isTaskArchived(task) || isLegacyBranchTask(task)) {
        closedTaskKeys.add(
          getFleetAttentionTaskKey(workspace.workspaceId, task.id),
        );
      }
    }
  }
  const knownWorkspaceIds = args.knownWorkspaceIds;
  const candidates = [
    ...collectFleetNotificationNeeds(args.notifications)
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
    ...collectFleetPrNeeds(args.prWorkspaces),
    ...collectFleetLiveNeeds(args.liveWorkspaces),
  ];

  for (const candidate of candidates) {
    const current = byId.get(candidate.id);
    byId.set(
      candidate.id,
      current ? choosePreferredNeed(current, candidate) : candidate,
    );
  }

  const items = Array.from(byId.values()).sort(compareFleetNeeds);
  const highestNeedByWorkspaceId: Record<string, FleetNeedItem | undefined> =
    {};
  const needsByWorkspaceId: Record<string, FleetNeedItem[] | undefined> = {};

  for (const item of items) {
    const existing = needsByWorkspaceId[item.workspaceId];
    if (existing) {
      existing.push(item);
    } else {
      needsByWorkspaceId[item.workspaceId] = [item];
    }
    highestNeedByWorkspaceId[item.workspaceId] ??= item;
  }

  return {
    items,
    count: items.length,
    blockingItems: items.filter(
      (item) => FLEET_NEED_TIER[item.kind] === "blocking",
    ),
    reviewItems: items.filter(
      (item) => FLEET_NEED_TIER[item.kind] === "review",
    ),
    highestNeedByWorkspaceId,
    needsByWorkspaceId,
  };
}
