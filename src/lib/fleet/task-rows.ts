import { i18n } from "@/i18n/runtime";
import type { ProviderTurnActivitySnapshot } from "@/lib/providers/turn-status";
import type { ChatMessage, Task } from "@/types/chat";
import type { FleetAttentionItem, FleetAttentionKind } from "./attention-projection";
import { sameData, shareList } from "./attention-sharing";
import { classifyTaskStatus, resolveFleetTaskSurfaceStatus, type FleetDisplayStatus } from "./task-status";
import {
  compareWithinWorkQueueLane,
  rankWorkAttention,
  WORK_QUEUE_LANE_ORDER,
  type WorkAttentionRank,
} from "./work-attention-order";
import {
  classifyFleetWorkspaceActivity,
  FLEET_BOARD_FILTER_OPTIONS,
  hasFleetLiveTask,
  resolveFleetWorkspaceActivityAt,
  selectFleetOpenTasks,
  type FleetBoardFilter,
  type FleetWorkspaceActivity,
} from "./workspace-activity";

/** One workspace as the table reads it: its live session, or its stored task list. */
export interface FleetTaskTableWorkspace {
  repositoryPath: string;
  repositoryName: string;
  workspaceId: string;
  workspaceName: string;
  workspaceBranch?: string | null;
  isActive: boolean;
  /** When the user last switched into the workspace, if recorded. */
  lastActiveAt: string | null;
  /** The workspace has at least one attention item. */
  hasAttentionItems: boolean;
  /** Present when the workspace is open or cached: live status is known. */
  session: {
    tasks: readonly Task[];
    messagesByTask: Record<string, ChatMessage[]>;
    activeTurnIdsByTask: Record<string, string | undefined>;
    openTaskTabIds?: readonly string[] | null;
  } | null;
  /** The stored task list of a workspace nobody has opened. */
  storedTasks: readonly Task[] | null;
  storedOpenTaskTabIds?: readonly string[] | null;
}

export interface FleetTaskRow {
  key: string;
  repositoryPath: string;
  repositoryName: string;
  workspaceId: string;
  workspaceName: string;
  workspaceBranch: string | null;
  workspaceActivity: FleetWorkspaceActivity;
  task: Task;
  status: FleetDisplayStatus;
  /** The task's most urgent attention item, if any: what it needs from you. */
  need: FleetAttentionItem | null;
  /** When the wait behind `need` began; null when no source recorded one. */
  waitingSince: string | null;
  /**
   * The task's running turn. Its activity changes with every streamed event,
   * so it is not part of the row: the row's activity line reads it itself.
   */
  activeTurnId: string | null;
  rank: WorkAttentionRank;
}

export function getFleetTaskRowKey(row: Pick<FleetTaskRow, "repositoryPath" | "workspaceId" | "task">) {
  return JSON.stringify([row.repositoryPath, row.workspaceId, row.task.id]);
}

// Statuses by the messages array they were read from: a streamed chunk
// replaces only its own task's array, so every other task's status is reused.
const statusCache = new WeakMap<readonly ChatMessage[], Map<string, FleetDisplayStatus>>();
const NO_MESSAGES: ChatMessage[] = [];

function classifyTaskStatusCached(args: {
  task: Task;
  messages: readonly ChatMessage[] | undefined;
  activeTurnId: string | null;
  activity: ProviderTurnActivitySnapshot | null;
}): FleetDisplayStatus {
  const messages = args.messages ?? NO_MESSAGES;
  // Everything else the classification reads.
  const signature = [
    args.task.archivedAt ?? "",
    args.activeTurnId ?? "",
    args.activity?.turnId ?? "",
    args.activity?.stalledAt ?? "",
    args.activity?.pendingInteraction ?? "",
  ].join("\u0000");
  let byInputs = statusCache.get(messages);
  if (!byInputs) {
    byInputs = new Map();
    statusCache.set(messages, byInputs);
  }
  const cached = byInputs.get(signature);
  if (cached) return cached;
  const status = classifyTaskStatus({
    task: args.task,
    messages: messages as ChatMessage[],
    activeTurnId: args.activeTurnId,
    activity: args.activity,
  });
  byInputs.set(signature, status);
  return status;
}

function mostUrgentByTask(items: readonly FleetAttentionItem[]) {
  const byTask = new Map<string, FleetAttentionItem>();
  for (const item of items) {
    if (!item.taskId) continue;
    const key = JSON.stringify([item.workspaceId, item.taskId]);
    const current = byTask.get(key);
    if (!current || item.priority < current.priority) byTask.set(key, item);
  }
  return byTask;
}

/**
 * Every open task of every workspace as one row: its state, what it needs from
 * you and since when, and its live turn. Rows follow the shared Work queue
 * lanes; inside a lane the longest wait comes first, then the shared order.
 * A workspace's activity (live, recent, dormant) is decided as its card
 * decides it, so the two layouts agree on what is in flight.
 */
export function buildFleetTaskRows(args: {
  workspaces: readonly FleetTaskTableWorkspace[];
  attentionItems: readonly FleetAttentionItem[];
  providerTurnActivityByTask: Record<string, ProviderTurnActivitySnapshot | undefined>;
  nowMs: number;
}): FleetTaskRow[] {
  const needs = mostUrgentByTask(args.attentionItems);
  const rows: FleetTaskRow[] = [];
  for (const workspace of args.workspaces) {
    const session = workspace.session;
    const activeTurnIdsByTask = session?.activeTurnIdsByTask ?? {};
    const tasks = session?.tasks ?? workspace.storedTasks ?? [];
    const openTasks = selectFleetOpenTasks(tasks, {
      openTaskTabIds: session ? session.openTaskTabIds : workspace.storedOpenTaskTabIds,
      activeTurnIdsByTask: session?.activeTurnIdsByTask,
    });
    const views = openTasks.map((task) => {
      const activeTurnId = activeTurnIdsByTask[task.id] ?? null;
      const snapshot = args.providerTurnActivityByTask[task.id] ?? null;
      const activity = activeTurnId && snapshot?.turnId === activeTurnId ? snapshot : null;
      const rawStatus: FleetDisplayStatus = session
        ? classifyTaskStatusCached({
            task,
            messages: session.messagesByTask[task.id],
            activeTurnId,
            activity,
          })
        : "unknown";
      const need = needs.get(JSON.stringify([workspace.workspaceId, task.id]));
      const status = resolveFleetTaskSurfaceStatus({ status: rawStatus,
        hasCurrentFailure: args.attentionItems.some((item) => item.workspaceId === workspace.workspaceId && item.taskId === task.id && item.kind === "run-failed"),
        activeTurnId });
      return { task, activeTurnId, status };
    });
    const workspaceActivity = classifyFleetWorkspaceActivity({
      activityAt: resolveFleetWorkspaceActivityAt({
        lastActiveAt: workspace.lastActiveAt,
        openTasks,
      }),
      nowMs: args.nowMs,
      hasLiveTask: hasFleetLiveTask({
        rows: views.map((view) => ({ taskId: view.task.id, status: view.status })),
        activeTurnIdsByTask,
      }),
      hasAttentionItems: workspace.hasAttentionItems,
      isActiveWorkspace: workspace.isActive,
    });
    for (const { task, activeTurnId, status } of views) {
      const need = needs.get(JSON.stringify([workspace.workspaceId, task.id])) ?? null;
      const base = {
        repositoryPath: workspace.repositoryPath,
        workspaceId: workspace.workspaceId,
        task,
      };
      rows.push({
        ...base,
        key: getFleetTaskRowKey(base),
        repositoryName: workspace.repositoryName,
        workspaceName: workspace.workspaceName,
        workspaceBranch: workspace.workspaceBranch ?? null,
        workspaceActivity,
        status,
        need,
        waitingSince: need ? (need.waitingSince ?? null) : null,
        activeTurnId,
        rank: rankWorkAttention({
          attentionKind: need?.kind,
          status: status === "unknown" ? undefined : status,
          isActive: workspace.isActive,
          activityAt: task.updatedAt,
        }),
      });
    }
  }
  return rows.sort(compareFleetTaskRows);
}

/**
 * `next` with each row equal to one of `previous` replaced by it, and
 * `previous` itself when every row is equal: a streamed chunk that changes no
 * row keeps the table's rows (and every row component) as they were.
 */
export function shareFleetTaskRows(
  previous: readonly FleetTaskRow[],
  next: readonly FleetTaskRow[],
): FleetTaskRow[] {
  const byKey = new Map(previous.map((row) => [row.key, row]));
  return shareList(previous, next, (row) => {
    const before = byKey.get(row.key);
    return before && sameData(before, row, 2) ? before : row;
  });
}

/** What the search field matches for a row, as a card matches its workspace. */
export function fleetTaskRowSearchText(row: FleetTaskRow): readonly string[] {
  return [row.task.title, row.workspaceName, row.workspaceBranch ?? "", row.repositoryName];
}

/** Lane, then the longest wait, then the shared order inside the lane. */
export function compareFleetTaskRows(left: FleetTaskRow, right: FleetTaskRow) {
  const laneDelta =
    WORK_QUEUE_LANE_ORDER.indexOf(left.rank.lane) -
    WORK_QUEUE_LANE_ORDER.indexOf(right.rank.lane);
  if (laneDelta !== 0) return laneDelta;
  if (left.waitingSince !== right.waitingSince) {
    if (!left.waitingSince) return 1;
    if (!right.waitingSince) return -1;
    return left.waitingSince.localeCompare(right.waitingSince);
  }
  return compareWithinWorkQueueLane(left.rank, right.rank);
}

/** The board's chips plus two the table adds. */
export type FleetTaskTableFilter = FleetBoardFilter | "needs-answer" | "stalled";

/** The table's chips: the board's, then the two only rows can answer. */
export const FLEET_TABLE_FILTER_OPTIONS: ReadonlyArray<{
  value: FleetTaskTableFilter;
  label: string;
  hint: string;
}> = [
  ...FLEET_BOARD_FILTER_OPTIONS,
  {
    value: "needs-answer",
    get label() { return i18n.t("fleet:workspaceActivity.needsAnswer"); },
    get hint() { return i18n.t("fleet:workspaceActivity.aRequestWaitsForYourAnswer"); },
  },
  {
    value: "stalled",
    get label() { return i18n.t("fleet:workspaceActivity.stalled"); },
    get hint() { return i18n.t("fleet:workspaceActivity.aTurnHasGoneQuiet"); },
  },
];

/** Whether a filter only exists in the table (the cards fall back to Active). */
export function isTableOnlyFilter(
  filter: FleetTaskTableFilter,
): filter is "needs-answer" | "stalled" {
  return filter === "needs-answer" || filter === "stalled";
}

const ANSWER_KINDS: ReadonlySet<FleetAttentionKind> = new Set([
  "approval",
  "user-input",
  "agent-run-sign-off",
]);

/**
 * The task's own turn is in flight: the per-task form of the cards' rule
 * (`hasFleetLiveTask`). Waiting for an answer is not active execution.
 */
export function isFleetTaskRowInFlight(row: Pick<FleetTaskRow, "activeTurnId" | "status">) {
  return Boolean(row.activeTurnId) && (row.status === "running" || row.status === "stalled");
}

export function matchesFleetTaskTableFilter(row: FleetTaskRow, filter: FleetTaskTableFilter) {
  switch (filter) {
    case "all":
      return true;
    case "active":
      return row.workspaceActivity !== "dormant";
    case "running":
      return isFleetTaskRowInFlight(row);
    case "blocked":
      return row.rank.lane === "action-required";
    case "needs-answer":
      return Boolean(row.need && ANSWER_KINDS.has(row.need.kind));
    case "stalled":
      return row.status === "stalled" || row.need?.kind === "turn-stalled";
  }
}
