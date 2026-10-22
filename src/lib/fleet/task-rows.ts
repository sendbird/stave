import { i18n } from "@/i18n/runtime";
import type { ProviderTurnActivitySnapshot } from "@/lib/providers/turn-status";
import type { ChatMessage, Task } from "@/types/chat";
import type { FleetAttentionItem, FleetAttentionKind } from "./attention-projection";
import { classifyTaskStatus, type FleetDisplayStatus } from "./task-status";
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
  activity: ProviderTurnActivitySnapshot | null;
  activeTurnId: string | null;
  rank: WorkAttentionRank;
}

export function getFleetTaskRowKey(row: Pick<FleetTaskRow, "repositoryPath" | "workspaceId" | "task">) {
  return JSON.stringify([row.repositoryPath, row.workspaceId, row.task.id]);
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
      const status: FleetDisplayStatus = session
        ? classifyTaskStatus({
            task,
            messages: session.messagesByTask[task.id] ?? [],
            activeTurnId,
            activity,
          })
        : "unknown";
      return { task, activeTurnId, activity, status };
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
    for (const { task, activeTurnId, activity, status } of views) {
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
        activity,
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
 * (`hasFleetLiveTask`), so a turn waiting on your answer still counts.
 */
export function isFleetTaskRowInFlight(row: Pick<FleetTaskRow, "activeTurnId" | "status">) {
  return Boolean(row.activeTurnId) && row.status !== "idle" && row.status !== "unknown";
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
