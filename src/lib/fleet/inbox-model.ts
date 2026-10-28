import { getDelegatedAttentionRoot } from "@/lib/notifications/delegated-attention";
import { agentRunNotificationAttentionId } from "./agent-run-attention";
import {
  isNotificationUnread,
  type AppNotification,
  type AppNotificationKind,
} from "@/lib/notifications/notification.types";
import { buildNotificationDetail } from "@/lib/notifications/notification.utils";
import { PR_STATUS_VISUAL } from "@/lib/pr-status";
import {
  getFleetAttentionTier,
  type FleetAttentionItem,
  type FleetAttentionKind,
  type FleetAttentionTier,
} from "./attention-projection";

/**
 * One inbox for Fleet and the notification bell.
 *
 * Every attention item is one entry, carrying the notifications that speak
 * for it; a notification that no item stands for (a finished turn already
 * reviewed, a request answered elsewhere, a run that completed) is an entry of
 * its own. Both surfaces draw these entries with the same row, so an entry has
 * one title, one kind and one read state wherever it is shown. Read state
 * lives on notifications: an entry is unread while any of its notifications is
 * unread, and an item no notification speaks for has no read state at all
 * (Fleet keeps no read store of its own). The bell's History lists every read
 * notification, so `Clear history` removes exactly what it shows.
 */
export type FleetInboxTier = FleetAttentionTier | "history";

export interface FleetInboxEntry {
  /** The attention item's id, or `notification:<id>` for a history entry. */
  id: string;
  item: FleetAttentionItem | null;
  /** The notifications that speak for this entry, newest first. */
  notifications: readonly AppNotification[];
  kind: FleetAttentionKind;
  tier: FleetInboxTier;
  /**
   * The task the entry names. A delegated child's request reads as its root
   * task — the task that opens and answers it — with the child named in the
   * detail.
   */
  title: string;
  detail: string | null;
  repositoryPath: string | null;
  repositoryName: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
  taskId: string | null;
  /** When the wait (or the event) began, for the row's time. */
  at: string;
  unread: boolean;
  /** A failure the bell's Errors filter collects. */
  error: boolean;
}

/** What a notification is, as the attention kind its row wears. */
const NOTIFICATION_ENTRY_KIND: Record<AppNotificationKind, FleetAttentionKind> = {
  "task.turn_completed": "result-ready",
  "task.turn_failed": "run-failed",
  "task.approval_requested": "approval",
  "task.user_input_requested": "user-input",
  "agent_run.sign_off_requested": "agent-run-sign-off",
  "agent_run.blocked": "agent-run-blocked",
  "agent_run.stuck": "agent-run-stuck",
  "agent_run.completed": "result-ready",
};

/** Kinds the Errors filter collects: something failed or cannot proceed. */
const ERROR_KINDS: ReadonlySet<FleetAttentionKind> = new Set([
  "run-failed",
  "pr-changes-requested",
  "pr-checks-failed",
  "pr-merge-conflict",
  "agent-run-blocked",
  "agent-run-stuck",
]);

export function getNotificationEntryKind(kind: AppNotificationKind) {
  return NOTIFICATION_ENTRY_KIND[kind];
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function notificationRequestId(notification: AppNotification) {
  if (notification.kind === "task.approval_requested") {
    return readString(notification.action?.requestId);
  }
  if (notification.kind === "task.user_input_requested") {
    return readString(notification.payload.requestId);
  }
  return null;
}

/** Whether a notification speaks for an attention item. */
export function notificationBelongsToItem(
  item: FleetAttentionItem,
  notification: AppNotification,
) {
  if (item.notificationId && item.notificationId === notification.id) {
    return true;
  }
  const sameTask =
    Boolean(item.taskId) &&
    notification.workspaceId?.trim() === item.workspaceId &&
    notification.taskId?.trim() === item.taskId;
  switch (item.kind) {
    case "approval":
    case "user-input":
      return (
        sameTask &&
        getNotificationEntryKind(notification.kind) === item.kind &&
        Boolean(item.requestId) &&
        notificationRequestId(notification) === item.requestId
      );
    case "run-failed":
    case "result-ready": {
      const turnId = item.turnId ?? item.resultReview?.turnId;
      return (
        sameTask &&
        Boolean(turnId) &&
        notification.turnId?.trim() === turnId &&
        (notification.kind === "task.turn_completed" ||
          notification.kind === "task.turn_failed")
      );
    }
    case "agent-run-sign-off":
    case "agent-run-blocked":
    case "agent-run-stuck": {
      const stage = item.agentRunStage;
      if (!stage || getNotificationEntryKind(notification.kind) !== item.kind) {
        return false;
      }
      const stageId = readString(notification.payload.stageId);
      const attempt = readNumber(notification.payload.attempt);
      return (
        readString(notification.payload.agentRunId) === stage.agentRunId &&
        (stageId === null || stageId === stage.stageId) &&
        (attempt === null || attempt === stage.attempt)
      );
    }
    case "turn-stalled":
    case "pr-changes-requested":
    case "pr-checks-failed":
    case "pr-merge-conflict":
    case "pr-behind-base":
    case "pr-ready-to-merge":
      return false;
  }
}

function newestFirst(left: AppNotification, right: AppNotification) {
  return right.createdAt.localeCompare(left.createdAt);
}

/** Title and detail, with a delegated child's request read as its root task. */
function describeEntry(args: {
  title: string;
  detail: string | null;
  workspaceName: string | null;
  notification: AppNotification | null;
}) {
  const root = args.notification
    ? getDelegatedAttentionRoot(args.notification)
    : null;
  if (!root) {
    return { title: args.title, detail: args.detail, workspaceName: args.workspaceName, rootTaskId: null };
  }
  const childTitle = args.notification?.taskTitle?.trim() || args.title;
  return {
    title: root.taskTitle ?? args.title,
    detail: [childTitle, args.detail].filter(Boolean).join(" · ") || null,
    workspaceName: root.workspaceName ?? args.workspaceName,
    rootTaskId: root.taskId,
  };
}

function itemEntry(
  item: FleetAttentionItem,
  notifications: AppNotification[],
): FleetInboxEntry {
  const primary = notifications[0] ?? null;
  const described = describeEntry({
    title: item.taskTitle?.trim() || item.workspaceName,
    detail: item.prStatus
      ? PR_STATUS_VISUAL[item.prStatus].label
      : (item.detail ?? (primary ? buildNotificationDetail(primary) : null)),
    workspaceName: item.workspaceName,
    notification: primary,
  });
  return {
    id: item.id,
    item,
    notifications,
    kind: item.kind,
    tier: getFleetAttentionTier(item.kind),
    title: described.title,
    detail: described.detail,
    repositoryPath: item.repositoryPath,
    repositoryName: item.repositoryName,
    workspaceId: item.workspaceId,
    workspaceName: described.workspaceName,
    taskId: described.rootTaskId ?? item.taskId ?? null,
    at: item.waitingSince ?? item.createdAt,
    unread: notifications.some(isNotificationUnread),
    error: ERROR_KINDS.has(item.kind),
  };
}

function historyEntry(notification: AppNotification): FleetInboxEntry {
  const kind = getNotificationEntryKind(notification.kind);
  const described = describeEntry({
    title: notification.taskTitle?.trim() || notification.title,
    detail: buildNotificationDetail(notification),
    workspaceName: notification.workspaceName,
    notification,
  });
  return {
    id: `notification:${notification.id}`,
    item: null,
    notifications: [notification],
    kind,
    tier: "history",
    title: described.title,
    detail: described.detail,
    repositoryPath: notification.repositoryPath,
    repositoryName: notification.repositoryName,
    workspaceId: notification.workspaceId,
    workspaceName: described.workspaceName,
    taskId: described.rootTaskId ?? notification.taskId,
    at: notification.createdAt,
    unread: isNotificationUnread(notification),
    error: ERROR_KINDS.has(kind),
  };
}

export interface FleetInbox {
  /** One entry per attention item, in the projection's order. */
  itemEntries: FleetInboxEntry[];
  /** Notifications no item stands for, read or not, newest first. */
  unlinkedEntries: FleetInboxEntry[];
  /** Every read notification, newest first: the bell's History. */
  historyEntries: FleetInboxEntry[];
  entryByItemId: ReadonlyMap<string, FleetInboxEntry>;
}

export function buildFleetInbox(args: {
  items: readonly FleetAttentionItem[];
  notifications: readonly AppNotification[];
  /** Hidden rows still own their notifications; snoozing must cover the bell too. */
  snoozedItems?: readonly FleetAttentionItem[];
  /** The projection has already selected the current outcomes. */
  attentionAuthoritative?: boolean;
  /** Run episodes whose current state has actually loaded, rather than guessed. */
  knownAgentRunIds?: ReadonlySet<string>;
  /** Persisted active snoozes, including episodes no longer in the run cache. */
  snoozedAttentionIds?: ReadonlySet<string>;
}): FleetInbox {
  const claimed = new Set<string>();
  for (const item of args.snoozedItems ?? []) {
    for (const notification of args.notifications) {
      if (notificationBelongsToItem(item, notification)) claimed.add(notification.id);
    }
  }
  const itemEntries = args.items.map((item) => {
    const linked = args.notifications
      .filter((notification) => notificationBelongsToItem(item, notification))
      .sort(newestFirst);
    for (const notification of linked) claimed.add(notification.id);
    return itemEntry(item, linked);
  });
  const sorted = [...args.notifications].sort(newestFirst);
  const unlinkedById = new Map(
    sorted
      .filter((notification) => !claimed.has(notification.id))
      .filter((notification) => !args.snoozedAttentionIds?.has(agentRunNotificationAttentionId(notification) ?? ""))
      .filter((notification) => !args.attentionAuthoritative ||
        (notification.kind !== "task.turn_completed" && notification.kind !== "task.turn_failed"))
      .filter((notification) => notification.kind === "agent_run.completed" || !notification.kind.startsWith("agent_run.") ||
        typeof notification.payload.agentRunId !== "string" ||
        !args.knownAgentRunIds?.has(notification.payload.agentRunId))
      .map((notification) => [notification.id, historyEntry(notification)]),
  );
  return {
    itemEntries,
    unlinkedEntries: [...unlinkedById.values()],
    historyEntries: sorted
      .filter((notification) => !isNotificationUnread(notification))
      .map(
        (notification) =>
          unlinkedById.get(notification.id) ?? historyEntry(notification),
      ),
    entryByItemId: new Map(itemEntries.map((entry) => [entry.id, entry])),
  };
}

export const EMPTY_FLEET_INBOX: FleetInbox = {
  itemEntries: [],
  unlinkedEntries: [],
  historyEntries: [],
  entryByItemId: new Map(),
};

/** Count actual hidden rows, retaining notification-backed cold run episodes. */
export function countHiddenFleetAttention(args: {
  snoozedItems: readonly FleetAttentionItem[];
  notifications: readonly AppNotification[];
  activeIds: ReadonlySet<string>;
  knownAgentRunIds: ReadonlySet<string>;
}) {
  const hidden = new Set(args.snoozedItems.map((item) => item.id));
  for (const notification of args.notifications) {
    const id = agentRunNotificationAttentionId(notification);
    if (id && args.activeIds.has(id) && isNotificationUnread(notification) && !notification.resolvedAt &&
        !args.knownAgentRunIds.has(String(notification.payload.agentRunId))) hidden.add(id);
  }
  return hidden.size;
}

/**
 * Requests an agent is blocked on until someone answers — approvals,
 * questions and sign-offs — the count a workspace row shows.
 */
export function countUnansweredInteractions(
  items: readonly Pick<FleetAttentionItem, "kind">[] | undefined,
) {
  return (items ?? []).filter(
    (item) =>
      item.kind === "approval" ||
      item.kind === "user-input" ||
      item.kind === "agent-run-sign-off",
  ).length;
}

export type FleetInboxFilter = "all" | "unread" | "errors";

/**
 * The bell's live list: every item entry, then the notifications no item
 * stands for that are still unread. Read ones are under History.
 */
export function selectBellEntries(inbox: FleetInbox, filter: FleetInboxFilter) {
  const live = [
    ...inbox.itemEntries,
    ...inbox.unlinkedEntries.filter((entry) => entry.unread),
  ];
  switch (filter) {
    case "all":
      return live;
    case "unread":
      return live.filter((entry) => entry.unread);
    case "errors":
      return live.filter((entry) => entry.error);
  }
}

/** Every read notification, newest first. */
export function selectBellHistory(inbox: FleetInbox) {
  return inbox.historyEntries;
}

/** The unread notifications behind entries, for "opening marks it read". */
export function unreadNotificationIds(entry: Pick<FleetInboxEntry, "notifications">) {
  return entry.notifications
    .filter(isNotificationUnread)
    .map((notification) => notification.id);
}
