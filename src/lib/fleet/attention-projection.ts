import { i18n } from "@/i18n/runtime";
import { isSupervisedTaskTurn } from "./agent-run-attention";
import type { AppNotification } from "@/lib/notifications/notification.types";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { currentStageRecord } from "@/lib/agent-runs/domain";
import { projectAgentRunStages, summarizePreviousStage } from "@/lib/agent-runs/agent-run-view";
import { awaitsUsageReset } from "@/lib/agent-runs/usage-limit";
import { describeAgentRunNotification } from "@/lib/agent-runs/notifications";
import { resolveAgentRunAttentionSince } from "@/lib/agent-runs/attention-since";
import type { ResultReview } from "@/lib/reviews/result-review";
import type { WorkspacePrStatus } from "@/lib/pr-status";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { ProviderTurnActivitySnapshot } from "@/lib/providers/turn-status";
import {
  isDelegatedTask,
  isExternallyManagedTask,
  isTaskArchived,
  isTaskManaged,
} from "@/lib/tasks";
import {
  findLatestPendingApproval,
  findLatestPendingUserInput,
} from "@/store/provider-message.utils";
import {
  approvalInteractionId,
  userInputInteractionId,
} from "@/lib/work-graph/work-graph-reducer";
import type { ChatMessage, Task } from "@/types/chat";
import { classifyTaskStatus } from "./task-status";

export type FleetAttentionKind =
  | "user-input"
  | "approval"
  | "run-failed"
  | "turn-stalled"
  | "result-ready"
  | "pr-changes-requested"
  | "pr-checks-failed"
  | "pr-merge-conflict"
  | "pr-behind-base"
  | "pr-ready-to-merge"
  | "agent-run-sign-off"
  | "agent-run-blocked"
  | "agent-run-stuck";

export type FleetAttentionSource = "live" | "notification" | "result" | "pr" | "agentRun";

/**
 * `blocking` items hold work up until the user acts. `review` items are worth
 * seeing but nothing is stalled on them, so the rail can fold them away by
 * default instead of burying the items that actually block an agent.
 */
export type FleetAttentionTier = "blocking" | "review";

export const FLEET_ATTENTION_TIER: Record<
  FleetAttentionKind,
  FleetAttentionTier
> = {
  "user-input": "blocking",
  approval: "blocking",
  "run-failed": "blocking",
  // Silence and PR status do not establish that an agent needs a user answer.
  "turn-stalled": "review",
  "pr-changes-requested": "review",
  "pr-checks-failed": "review",
  "pr-merge-conflict": "review",
  "pr-behind-base": "review",
  "result-ready": "review",
  "pr-ready-to-merge": "review",
  "agent-run-sign-off": "blocking",
  "agent-run-blocked": "blocking",
  "agent-run-stuck": "blocking",
};

export function getFleetAttentionTier(kind: FleetAttentionKind) {
  return FLEET_ATTENTION_TIER[kind];
}

export interface FleetAttentionItem {
  id: string;
  kind: FleetAttentionKind;
  priority: number;
  repositoryPath: string;
  repositoryName: string;
  workspaceId: string;
  workspaceName: string;
  taskId?: string;
  taskTitle?: string;
  turnId?: string;
  requestId?: string;
  notificationId?: string;
  /** The message holding the pending request part, when a source named it. */
  messageId?: string;
  resultReview?: ResultReview;
  providerId?: ProviderId;
  /**
   * A coarse timestamp every source can supply (a live row uses the task's last
   * update). It only breaks ties; it is not when the wait began.
   */
  createdAt: string;
  /**
   * When the wait behind this item began, from the source that observed it:
   * the work graph's `raisedAt` for a live request, the notification's or the
   * result's `createdAt`, or the agent run event that stopped the stage.
   * Absent when no source recorded the start (pull request rows), so a row
   * shows no waiting time instead of a guessed one.
   */
  waitingSince?: string;
  source: FleetAttentionSource;
  detail?: string;
  prStatus?: WorkspacePrStatus;
  prUrl?: string;
  /** The stage attempt an agent run row acts on; stale once the agent run moves. */
  agentRunStage?: { agentRunId: string; stageId: string; attempt: number };
}

export interface FleetLiveWorkspaceInput {
  repositoryPath: string;
  repositoryName: string;
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
  repositoryPath: string;
  repositoryName: string;
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
  /**
   * Items the user snoozed and their deadline has not passed yet. They are kept
   * out of `items` and every count derived from it, but still returned so the
   * rail can say how many rows it is hiding and offer to bring them back.
   */
  snoozedItems: FleetAttentionItem[];
  highestAttentionByWorkspaceId: Record<string, FleetAttentionItem | undefined>;
  attentionItemsByWorkspaceId: Record<string, FleetAttentionItem[] | undefined>;
}

export const FLEET_ATTENTION_PRIORITY: Record<FleetAttentionKind, number> = {
  "user-input": 0,
  approval: 1,
  // An agent run waiting on the user is a request like an approval.
  "agent-run-sign-off": 1,
  "agent-run-blocked": 1,
  "agent-run-stuck": 2,
  "run-failed": 2,
  "turn-stalled": 2,
  "pr-changes-requested": 3,
  "pr-checks-failed": 3,
  "pr-merge-conflict": 3,
  "pr-behind-base": 3,
  "result-ready": 4,
  "pr-ready-to-merge": 5,
};

const SOURCE_PRIORITY: Record<FleetAttentionSource, number> = {
  live: 0,
  agentRun: 0,
  notification: 1,
  result: 1,
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

/** A valid ISO timestamp, or undefined; never the epoch placeholder. */
function normalizeOptionalTimestamp(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return undefined;
  }
  const timestamp = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > 0
    ? new Date(timestamp).toISOString()
    : undefined;
}

function earliestTimestamp(left?: string, right?: string) {
  if (!left) return right;
  if (!right) return left;
  return left.localeCompare(right) <= 0 ? left : right;
}

/**
 * When the live turn raised this request, read from its work graph. Only the
 * snapshot of the turn the request belongs to counts: a later turn's graph
 * says nothing about an earlier request.
 */
function resolveLiveRaisedAt(args: {
  activity: ProviderTurnActivitySnapshot | undefined;
  activeTurnId: string | undefined;
  interactionId: string;
}) {
  const { activity } = args;
  if (!activity || !args.activeTurnId || activity.turnId !== args.activeTurnId) {
    return undefined;
  }
  return normalizeOptionalTimestamp(
    activity.workGraph?.interactionsById[args.interactionId]?.raisedAt,
  );
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
  kind: "run-failed" | "turn-stalled" | "result-ready";
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
 * Delegated delegated tasks are the one carve-out. They are externally managed only
 * because the delegated-task coordinator creates them that way — nothing outside
 * Stave is watching them, the person who owns the parent task is the only one
 * who can answer, and an unanswered child approval auto-denies after a few
 * minutes. So a child's request stays visible, attributed to the delegated task
 * itself and routed to the workspace the child actually runs in.
 */
export function isFleetAttentionSuppressedTask(
  task: Pick<Task, "controlMode" | "controlOwner" | "parentTaskId">,
) {
  return isExternallyManagedTask(task) && !isDelegatedTask(task);
}

/**
 * The notification-payload equivalent of `isFleetAttentionSuppressedTask`, kept
 * so the two paths state the same rule in the same vocabulary.
 *
 * This is only a cheap early-out, not the enforcement point: interaction
 * payloads are not currently written with the control fields, so in practice it
 * declines to suppress and the decision falls to `externalTaskKeys` in
 * `buildFleetAttentionProjection`, which reads live task state. That is the
 * load-bearing filter, and it is where the delegated-task carve-out actually takes
 * effect. If a payload ever does carry the control fields, a delegated child is
 * still exempted here rather than silently suppressed.
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
    repositoryPath: args.workspace.repositoryPath,
    repositoryName: args.workspace.repositoryName,
    workspaceId: args.workspace.workspaceId,
    workspaceName: args.workspace.workspaceName,
    taskId: args.task.id,
    taskTitle: args.task.title.trim() || i18n.t("fleet:attentionProjection.untitledTask"),
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
      const messages = workspace.messagesByTask[task.id] ?? [];
      const activity = workspace.providerTurnActivityByTask[task.id];
      const canAnswerRequest = Boolean(activeTurnId) || isTaskManaged(task);
      const pendingInput = canAnswerRequest ? findLatestPendingUserInput({ messages }) : null;
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
            messageId: pendingInput.messageId,
            detail: pendingInput.part.questions[0]?.question || pendingInput.part.questions[0]?.header,
            turnId: activeTurnId,
            waitingSince: resolveLiveRaisedAt({
              activity,
              activeTurnId,
              interactionId: userInputInteractionId(requestId),
            }),
          });
          continue;
        }
      }

      const pendingApproval = canAnswerRequest ? findLatestPendingApproval({ messages }) : null;
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
            messageId: pendingApproval.messageId,
            turnId: activeTurnId,
            waitingSince: resolveLiveRaisedAt({
              activity,
              activeTurnId,
              interactionId: approvalInteractionId(requestId),
            }),
            detail: `${pendingApproval.part.toolName}: ${pendingApproval.part.description}`,
          });
          continue;
        }
      }

      const turnStatus = classifyTaskStatus({ task, messages, activeTurnId, activity: activity ?? null });
      const failedMessage = messages.at(-1);
      const failedTurnId = failedMessage?.turnId ?? activeTurnId;
      if (failedTurnId && turnStatus === "error") {
        const kind = "run-failed" as const;
        attentionItems.push({
          ...buildLiveBase({ workspace, task }),
          id: buildTurnAttentionId({
            kind,
            workspaceId: workspace.workspaceId,
            taskId: task.id,
            turnId: failedTurnId,
          }),
          kind,
          priority: FLEET_ATTENTION_PRIORITY[kind],
          turnId: failedTurnId,
          messageId: failedMessage?.id,
          createdAt: normalizeTimestamp(failedMessage?.terminalReceipt?.completedAt ?? failedMessage?.completedAt ?? task.updatedAt),
          detail: failedMessage?.terminalReceipt?.error ??
            failedMessage?.parts.findLast((part): part is Extract<ChatMessage["parts"][number], { type: "system_event" }> => part.type === "system_event" && part.content.trimStart().toLowerCase().startsWith("[error]"))?.content ??
            i18n.t("fleet:attentionProjection.theActiveProviderTurnNeedsReview"),
        });
      } else if (activeTurnId && turnStatus === "stalled") {
        // A turn that went quiet is its own need, never a failure. The row
        // says how long it has been quiet from `waitingSince`, the turn's last
        // reported event.
        const kind = "turn-stalled" as const;
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
          waitingSince:
            activity?.turnId === activeTurnId
              ? normalizeOptionalTimestamp(activity.lastEventAt)
              : undefined,
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

/** Approvals name the message on their action; questions in the payload. */
function getNotificationMessageId(notification: AppNotification) {
  if (notification.kind === "task.approval_requested") {
    return normalizeRequired(notification.action?.messageId) ?? undefined;
  }
  if (notification.kind === "task.user_input_requested" || notification.kind === "task.turn_failed") {
    const messageId = notification.payload.messageId;
    return typeof messageId === "string"
      ? (normalizeRequired(messageId) ?? undefined)
      : undefined;
  }
  return undefined;
}

export function collectFleetNotificationAttentionItems(
  notifications: readonly AppNotification[],
) {
  const attentionItems: FleetAttentionItem[] = [];

  for (const notification of notifications) {
    const repositoryPath = normalizeRequired(notification.repositoryPath);
    const workspaceId = normalizeRequired(notification.workspaceId);
    const taskId = normalizeRequired(notification.taskId);
    if (!repositoryPath || !workspaceId || !taskId) {
      continue;
    }

    const base = {
      repositoryPath,
      repositoryName:
        normalizeRequired(notification.repositoryName) ??
        i18n.t("fleet:attentionProjection.repository"),
      workspaceId,
      workspaceName:
        normalizeRequired(notification.workspaceName) ??
        i18n.t("fleet:attentionProjection.workspace"),
      taskId,
      taskTitle:
        normalizeRequired(notification.taskTitle) ??
        normalizeRequired(notification.title) ??
        i18n.t("fleet:attentionProjection.untitledTask"),
      notificationId: notification.id,
      providerId: notification.providerId ?? undefined,
      createdAt: normalizeTimestamp(notification.createdAt),
      waitingSince: normalizeOptionalTimestamp(notification.createdAt),
      source: "notification" as const,
      detail: (notification.kind === "task.turn_failed" && typeof notification.payload.message === "string"
        ? normalizeRequired(notification.payload.message) : null) ?? normalizeRequired(notification.body) ?? undefined,
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
        messageId: getNotificationMessageId(notification),
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
      messageId: getNotificationMessageId(notification),
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
    case "blocked":
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
        repositoryPath: workspace.repositoryPath,
        repositoryName: workspace.repositoryName,
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

function choosePreferredNeed(
  current: FleetAttentionItem,
  candidate: FleetAttentionItem,
) {
  const preferred =
    SOURCE_PRIORITY[candidate.source] < SOURCE_PRIORITY[current.source]
      ? candidate
      : current;
  const fallback = preferred === candidate ? current : candidate;
  return {
    ...fallback,
    ...preferred,
    notificationId: preferred.notificationId ?? fallback.notificationId,
    messageId: preferred.messageId ?? fallback.messageId,
    detail: preferred.detail ?? fallback.detail,
    // Every source that saw the request start observed the same wait; the
    // earliest observation is the closest to when it really began.
    waitingSince: earliestTimestamp(preferred.waitingSince, fallback.waitingSince),
    createdAt:
      preferred.createdAt.localeCompare(fallback.createdAt) <= 0
        ? preferred.createdAt
        : fallback.createdAt,
  };
}

export interface FleetAgentRunInput {
  repositoryPath: string;
  repositoryName: string;
  workspaceId: string;
  workspaceName: string;
  detail: AgentRunDetail;
  taskTitle?: string;
}

/** "Verify next · Build done · 4 files +82 −17 · 1 verified by Stave". */
function describeSignOffDetail(detail: AgentRunDetail, stageTitle: string) {
  const rows = projectAgentRunStages(detail, new Date(detail.agentRun.updatedAt));
  const summary = summarizePreviousStage(rows[detail.agentRun.currentStageIndex - 1]);
  return summary ? `${stageTitle} next · ${summary}` : `${stageTitle} next`;
}

/** An agent run stopped for the user: a sign-off, a blocker or a stuck stage. */
export function collectFleetAgentRunAttentionItems(
  inputs: readonly FleetAgentRunInput[],
): FleetAttentionItem[] {
  const newestRunByTask = new Map<string, number>();
  for (const { workspaceId, detail } of inputs) {
    const key = getFleetAttentionTaskKey(workspaceId, detail.agentRun.leadTaskId);
    newestRunByTask.set(key, Math.max(newestRunByTask.get(key) ?? -Infinity, Date.parse(detail.agentRun.createdAt)));
  }
  return inputs.flatMap((input): FleetAttentionItem[] => {
    const { agentRun } = input.detail;
    // Deleted tasks and bounded child outcomes have nobody to ask. An expired
    // primary run does need a new instruction, until a newer run takes over.
    const expiredNeedsDecision = agentRun.state === "stopped" && agentRun.stopReason === "expired" &&
      Date.parse(agentRun.createdAt) >= (newestRunByTask.get(getFleetAttentionTaskKey(input.workspaceId, agentRun.leadTaskId)) ?? -Infinity);
    if (agentRun.state !== "running" && agentRun.state !== "paused" && !expiredNeedsDecision) return [];
    const record = currentStageRecord(input.detail);
    const pausedNeedsDecision = agentRun.state === "paused" &&
      agentRun.pauseReason !== "paused-by-user" && agentRun.pauseReason !== "taken-over" &&
      !(agentRun.pauseReason === "usage-limit" && awaitsUsageReset(agentRun));
    if (agentRun.state !== "running" && !pausedNeedsDecision && !expiredNeedsDecision) return [];
    const kind = pausedNeedsDecision || expiredNeedsDecision ? "agent-run-blocked" :
      record.status === "awaiting-sign-off"
        ? "agent-run-sign-off"
        : record.status === "blocked"
          ? "agent-run-blocked"
          : record.status === "stuck"
            ? "agent-run-stuck"
            : null;
    if (!kind) return [];
    const stage = agentRun.workflow.stages[agentRun.currentStageIndex]!;
    const episodeId = kind === "agent-run-sign-off" ? undefined : describeAgentRunNotification(input.detail, {
      repositoryPath: input.repositoryPath, repositoryName: input.repositoryName,
      workspaceName: input.workspaceName, taskTitle: input.taskTitle ?? null,
    })?.id;
    return [
      {
        id: ["agent-run", kind, agentRun.id, record.stageId, record.attempt,
          ...(episodeId ? [episodeId] : [])].join(":"),
        kind,
        priority: FLEET_ATTENTION_PRIORITY[kind],
        source: "agentRun",
        repositoryPath: input.repositoryPath,
        repositoryName: input.repositoryName,
        workspaceId: input.workspaceId,
        workspaceName: input.workspaceName,
        taskId: agentRun.leadTaskId,
        taskTitle: input.taskTitle,
        providerId: agentRun.fingerprint.providerId,
        createdAt: normalizeTimestamp(agentRun.updatedAt),
        waitingSince: normalizeOptionalTimestamp(resolveAgentRunAttentionSince(input.detail)),
        detail: expiredNeedsDecision
          ? agentRun.reasonDetail ?? i18n.t("agentRuns:agentRunStatus.expired")
          : pausedNeedsDecision
          ? agentRun.reasonDetail ?? record.detail ?? i18n.t("fleet:attention.agentRunPausedNeedsAttention")
          : kind === "agent-run-sign-off"
            ? describeSignOffDetail(input.detail, stage.title)
            : i18n.t("fleet:attention.agentRunNeedsAttention", { stage: stage.title, detail: record.detail ?? i18n.t(kind === "agent-run-stuck" ? "fleet:attention.stoppedMoving" : "fleet:attention.needsYou") }),
        agentRunStage: { agentRunId: agentRun.id, stageId: record.stageId, attempt: record.attempt },
      },
    ];
  });
}

/** Urgency first; inside one urgency, whatever has waited longest. */
export function compareFleetAttentionItems(
  left: FleetAttentionItem,
  right: FleetAttentionItem,
) {
  if (left.priority !== right.priority) {
    return left.priority - right.priority;
  }
  const leftSince = left.waitingSince ?? left.createdAt;
  const rightSince = right.waitingSince ?? right.createdAt;
  if (leftSince !== rightSince) {
    return leftSince.localeCompare(rightSince);
  }
  return left.id.localeCompare(right.id);
}

/** A result stays in history, but only the task's current turn asks for attention. */
function currentTerminalAttentionFilter(args: {
  notifications: readonly AppNotification[];
  resultReviews?: readonly ResultReview[];
  liveWorkspaces: readonly FleetLiveWorkspaceInput[];
  agentRuns?: readonly FleetAgentRunInput[];
  suppressedOutcomeTaskKeys?: ReadonlySet<string>;
}) {
  const taskKey = (workspaceId: string, taskId: string) => getFleetAttentionTaskKey(workspaceId, taskId);
  const observedTurns = new Map<string, Map<string, { time: number; priority: number }>>();
  const observe = (workspaceId: string, taskId: string, turnId: string, createdAt: string, priority: number) => {
    const key = taskKey(workspaceId, taskId);
    const turns = observedTurns.get(key) ?? new Map<string, { time: number; priority: number }>();
    const time = Date.parse(createdAt);
    const current = turns.get(turnId);
    if (Number.isFinite(time) && (!current || priority < current.priority ||
        (priority === current.priority && time > current.time))) turns.set(turnId, { time, priority });
    observedTurns.set(key, turns);
  };
  // Read/reviewed rows still establish that an older failure has been superseded.
  for (const result of args.resultReviews ?? []) observe(result.workspaceId, result.taskId, result.turnId, result.createdAt, 1);
  for (const notification of args.notifications) {
    if ((notification.kind === "task.turn_failed" || notification.kind === "task.turn_completed") &&
        notification.workspaceId && notification.taskId && notification.turnId) {
      observe(notification.workspaceId, notification.taskId, notification.turnId, notification.createdAt, 2);
    }
  }
  // A delayed notification's insertion time must not reorder known turn history.
  for (const workspace of args.liveWorkspaces) {
    for (const task of workspace.tasks) {
      for (const message of workspace.messagesByTask[task.id] ?? []) {
        const completedAt = message.terminalReceipt?.completedAt ?? message.completedAt;
        if (message.role === "assistant" && message.turnId && completedAt) {
          observe(workspace.workspaceId, task.id, message.turnId, completedAt, 0);
        }
      }
    }
  }
  const liveByTask = new Map(args.liveWorkspaces.flatMap((workspace) => workspace.tasks.map((task) =>
    [taskKey(workspace.workspaceId, task.id), { workspace, task }] as const)));
  return (item: FleetAttentionItem) => {
    if ((item.kind !== "run-failed" && item.kind !== "result-ready") || !item.taskId || !item.turnId) return true;
    const key = taskKey(item.workspaceId, item.taskId);
    const live = liveByTask.get(key);
    // Managed outcomes go to their controller; their unanswered cards still
    // reach the user through the independent interaction projection. Live state
    // wins over a stale cold shell when a task is detached to interactive use.
    if (live ? isExternallyManagedTask(live.task) : args.suppressedOutcomeTaskKeys?.has(key)) return false;
    // The supervisor owns retries and asks explicitly when it needs a decision.
    if (args.agentRuns?.some(({ workspaceId, detail }) => workspaceId === item.workspaceId &&
        isSupervisedTaskTurn(detail, item.taskId!, item.turnId!))) return false;
    const turns = observedTurns.get(key);
    const observedTime = turns?.get(item.turnId)?.time ?? Date.parse(item.createdAt);
    if (turns && [...turns.values()].some(({ time }) => time > observedTime)) return false;
    if (!live) return true;
    const activeTurnId = live.workspace.activeTurnIdsByTask[item.taskId];
    if (activeTurnId && activeTurnId !== item.turnId) return false;
    const messages = live.workspace.messagesByTask[item.taskId] ?? [];
    const matchingIndex = messages.findLastIndex((message) => message.turnId === item.turnId);
    if (matchingIndex >= 0) {
      if (messages.slice(matchingIndex + 1).some((message) => message.role === "user" ||
        (message.role === "assistant" && message.turnId && message.turnId !== item.turnId))) return false;
      const message = messages[matchingIndex]!;
      if (item.kind === "run-failed") {
        if (message.terminalReceipt?.completedAt && message.terminalReceipt.outcome !== "failed") return false;
        const error = message.parts.findLast((part) => part.type === "system_event" && part.content.trimStart().toLowerCase().startsWith("[error]"));
        item.messageId ??= message.id;
        item.detail = message.terminalReceipt?.error ?? (error?.type === "system_event" ? error.content : undefined) ?? item.detail;
      }
    } else {
      // Hydration can have an older transcript than the durable result. A
      // different turn id alone is not evidence that the result is obsolete.
      const latest = messages.at(-1);
      const latestAt = latest?.startedAt ?? latest?.terminalReceipt?.completedAt ?? latest?.completedAt;
      if (latestAt && Date.parse(latestAt) > observedTime) return false;
    }
    return true;
  };
}

export function buildFleetAttentionProjection(args: {
  notifications: readonly AppNotification[];
  /** When supplied, durable results own terminal attention, regardless of reads. */
  resultReviews?: readonly ResultReview[];
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
  /** Cold externally managed tasks whose terminal outcomes belong to their controller. */
  suppressedOutcomeTaskKeys?: ReadonlySet<string>;
  /** Agent runs across workspaces; running ones that wait on the user become rows. */
  agentRuns?: readonly FleetAgentRunInput[];
  /**
   * Attention ids with an unexpired snooze. Filtering happens after the merge so
   * one snooze covers an item no matter which source wins for it on this pass.
   */
  snoozedAttentionIds?: ReadonlySet<string>;
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
  const delegatedTaskKeys = new Set(args.liveWorkspaces.flatMap((workspace) => workspace.tasks
    .filter(isDelegatedTask).map((task) => getFleetAttentionTaskKey(workspace.workspaceId, task.id))));
  const knownWorkspaceIds = args.knownWorkspaceIds;
  const candidates = [
    ...[
      ...collectFleetNotificationAttentionItems(args.notifications).filter(
        (item) =>
          args.resultReviews === undefined ||
          (item.kind !== "result-ready" && item.kind !== "run-failed"),
      ),
      ...(args.resultReviews ?? [])
        .filter((result) => !result.reviewedAt)
        .map((result): FleetAttentionItem => {
          const kind =
            result.outcome === "failed" ? "run-failed" : "result-ready";
          return {
            id: buildTurnAttentionId({ kind, ...result }),
            kind,
            priority: FLEET_ATTENTION_PRIORITY[kind],
            source: "result",
            repositoryPath: result.repositoryPath,
            repositoryName: result.repositoryName,
            workspaceId: result.workspaceId,
            workspaceName: result.workspaceName,
            taskId: result.taskId,
            taskTitle: result.taskTitle,
            turnId: result.turnId,
            createdAt: result.createdAt,
            waitingSince: normalizeOptionalTimestamp(result.createdAt),
            detail: result.summary,
            resultReview: result,
          };
        }),
    ]
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
    ...collectFleetLiveAttentionItems(args.liveWorkspaces).filter((item) =>
      item.kind !== "run-failed" || (args.resultReviews === undefined
        ? !args.notifications.some((notification) => notification.kind === "task.turn_failed" &&
          notification.workspaceId === item.workspaceId && notification.taskId === item.taskId &&
          notification.turnId === item.turnId && Boolean(notification.readAt || notification.resolvedAt))
        : args.resultReviews.some((result) => result.workspaceId === item.workspaceId && result.taskId === item.taskId &&
          result.turnId === item.turnId && !result.reviewedAt))),
    ...collectFleetAgentRunAttentionItems(
      (args.agentRuns ?? []).filter(
        (input) => (!knownWorkspaceIds || knownWorkspaceIds.has(input.workspaceId)) &&
          !closedTaskKeys.has(getFleetAttentionTaskKey(input.workspaceId, input.detail.agentRun.leadTaskId)) &&
          !(input.detail.agentRun.state === "stopped" && delegatedTaskKeys.has(getFleetAttentionTaskKey(input.workspaceId, input.detail.agentRun.leadTaskId))),
      ),
    ),
  ];

  const isCurrentTerminalAttention = currentTerminalAttentionFilter(args);
  for (const candidate of candidates.filter(isCurrentTerminalAttention)) {
    const current = byId.get(candidate.id);
    byId.set(
      candidate.id,
      current ? choosePreferredNeed(current, candidate) : candidate,
    );
  }

  const merged = Array.from(byId.values()).sort(compareFleetAttentionItems);
  const snoozedAttentionIds = args.snoozedAttentionIds;
  const items = snoozedAttentionIds
    ? merged.filter((item) => !snoozedAttentionIds.has(item.id))
    : merged;
  const snoozedItems = snoozedAttentionIds
    ? merged.filter((item) => snoozedAttentionIds.has(item.id))
    : [];
  const highestAttentionByWorkspaceId: Record<
    string,
    FleetAttentionItem | undefined
  > = {};
  const attentionItemsByWorkspaceId: Record<
    string,
    FleetAttentionItem[] | undefined
  > = {};

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
    snoozedItems,
    highestAttentionByWorkspaceId,
    attentionItemsByWorkspaceId,
  };
}
