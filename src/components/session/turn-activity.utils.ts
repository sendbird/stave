import type { TodoItem } from "@/components/ai-elements/todo";
import type {
  ProviderTurnActivitySnapshot,
  ProviderTurnWorkItem,
} from "@/lib/providers/turn-status";

export type TurnActivityRowStatus =
  "pending" | "running" | "waiting" | "completed" | "failed";

/** Icon slot for a row; the renderer maps these onto lucide components. */
export type TurnActivityIconKey =
  "alert" | "pause" | "plan" | "subagent" | "tool" | "todo";

export interface TurnActivityWorkItemLike {
  status: TurnActivityRowStatus;
}

/**
 * A todo carried into the shelf. `promoted` marks a queued todo that the shelf
 * surfaces as the active one — the provider never reported it as in progress,
 * so the row labels it instead of pretending it is running.
 */
export interface TurnActivityTodo extends TodoItem {
  promoted?: boolean;
}

export interface TurnActivityItem {
  id: string;
  status: TurnActivityRowStatus;
  title: string;
  detail?: string;
  badge?: string;
  elapsedSeconds?: number;
  iconKey: TurnActivityIconKey;
}

export interface TurnActivitySummary {
  label: string;
  activeCount: number;
  completedCount: number;
  failedCount: number;
  totalCount: number;
}

export interface TurnActivityCounts {
  failedCount: number;
  waitingCount: number;
  runningCount: number;
  pendingCount: number;
  completedCount: number;
  totalCount: number;
}

/** Most urgent first: what the shelf should show before anything else. */
const TURN_ACTIVITY_STATUS_ORDER: Record<TurnActivityRowStatus, number> = {
  failed: 0,
  waiting: 1,
  running: 2,
  pending: 3,
  completed: 4,
};

export function resolveTurnActivityVisibility(args: {
  isTurnActive: boolean;
  isPlanPending: boolean;
  hasRetainedFailure?: boolean;
  hasPendingInteractionCard?: boolean;
}) {
  return (
    !args.hasPendingInteractionCard &&
    (args.hasRetainedFailure || (args.isTurnActive && !args.isPlanPending))
  );
}

export function promoteFirstPendingTodoForActiveTurn(
  todos: TurnActivityTodo[],
): TurnActivityTodo[] {
  if (
    todos.length === 0 ||
    todos.some((todo) => todo.status === "in_progress")
  ) {
    return todos;
  }
  const firstPendingIndex = todos.findIndex(
    (todo) => todo.status === "pending",
  );
  if (firstPendingIndex < 0) {
    return todos;
  }
  return todos.map((todo, index) =>
    index === firstPendingIndex
      ? { ...todo, status: "in_progress" as const, promoted: true }
      : todo,
  );
}

function resolveTodoStatus(todo: TurnActivityTodo): TurnActivityRowStatus {
  if (todo.status === "completed") {
    return "completed";
  }
  if (todo.status === "in_progress") {
    return "running";
  }
  return "pending";
}

/**
 * Flatten every tracked signal into one ranked row list. Rows are sorted by
 * status severity (failures, then blocked work, then live work, then queued
 * and finished ones); insertion order breaks ties, so a todo list keeps its
 * authored order within each bucket.
 */
export function buildTurnActivityItems(args: {
  activity: Pick<
    ProviderTurnActivitySnapshot,
    "completedAt" | "pendingInteraction" | "turnError" | "turnErrorRecoverable"
  > | null;
  idleLabel: string | null;
  isPlanPreparing: boolean;
  isStalled: boolean;
  todos: TurnActivityTodo[];
  workItems: ProviderTurnWorkItem[];
}): TurnActivityItem[] {
  const items: TurnActivityItem[] = [];
  if (args.activity?.turnError) {
    const isRecovering =
      args.activity.turnErrorRecoverable === true &&
      args.activity.completedAt == null;
    items.push({
      id: "turn-error",
      status: isRecovering ? "waiting" : "failed",
      title: isRecovering ? "Provider issue" : "Turn failed",
      detail: args.activity.turnError,
      ...(isRecovering ? { badge: "Retrying" } : {}),
      iconKey: "alert",
    });
  }
  if (args.activity?.pendingInteraction) {
    const needsApproval = args.activity.pendingInteraction === "approval";
    items.push({
      id: `interaction:${args.activity.pendingInteraction}`,
      status: "waiting",
      title: needsApproval ? "Approval needed" : "Input needed",
      detail: needsApproval ? "Review to continue" : "Reply to continue",
      iconKey: "pause",
    });
  } else if (args.isStalled) {
    items.push({
      id: "stalled",
      status: "waiting",
      title: "Activity paused",
      detail: args.idleLabel
        ? `No updates for ${args.idleLabel}`
        : "Waiting for the provider",
      iconKey: "pause",
    });
  }
  if (args.isPlanPreparing) {
    items.push({
      id: "plan",
      status: "running",
      title: "Preparing the plan",
      iconKey: "plan",
    });
  }
  for (const item of args.workItems) {
    items.push({
      id: `work:${item.id}`,
      status: item.status,
      title: item.title,
      detail: item.progressMessages.at(-1) ?? item.detail,
      ...(item.badge ? { badge: item.badge } : {}),
      ...(item.elapsedSeconds != null
        ? { elapsedSeconds: item.elapsedSeconds }
        : {}),
      iconKey: item.kind === "subagent" ? "subagent" : "tool",
    });
  }
  args.todos.forEach((todo, index) => {
    items.push({
      id: `todo:${todo.content}:${index}`,
      status: resolveTodoStatus(todo),
      title: todo.content,
      ...(todo.promoted ? { badge: "Next" } : {}),
      iconKey: "todo",
    });
  });

  return items.sort(
    (left, right) =>
      TURN_ACTIVITY_STATUS_ORDER[left.status] -
      TURN_ACTIVITY_STATUS_ORDER[right.status],
  );
}

/** Split finished rows out so they can be tucked behind a disclosure. */
export function partitionTurnActivityItems(items: TurnActivityItem[]) {
  const active: TurnActivityItem[] = [];
  const completed: TurnActivityItem[] = [];
  for (const item of items) {
    if (item.status === "completed") {
      completed.push(item);
    } else {
      active.push(item);
    }
  }
  return { active, completed };
}

export function countTurnActivityItems(
  items: TurnActivityItem[],
): TurnActivityCounts {
  const counts: TurnActivityCounts = {
    failedCount: 0,
    waitingCount: 0,
    runningCount: 0,
    pendingCount: 0,
    completedCount: 0,
    totalCount: items.length,
  };
  for (const item of items) {
    if (item.status === "failed") {
      counts.failedCount += 1;
    } else if (item.status === "waiting") {
      counts.waitingCount += 1;
    } else if (item.status === "running") {
      counts.runningCount += 1;
    } else if (item.status === "pending") {
      counts.pendingCount += 1;
    } else {
      counts.completedCount += 1;
    }
  }
  return counts;
}

/** `2 running · 1 waiting · 3 done` — the expanded-state headline. */
export function formatTurnActivityCountsLabel(counts: TurnActivityCounts) {
  const segments = [
    counts.failedCount > 0 ? `${counts.failedCount} failed` : null,
    counts.waitingCount > 0 ? `${counts.waitingCount} waiting` : null,
    counts.runningCount > 0 ? `${counts.runningCount} running` : null,
    counts.pendingCount > 0 ? `${counts.pendingCount} queued` : null,
    counts.completedCount > 0 ? `${counts.completedCount} done` : null,
  ].filter((segment): segment is string => segment !== null);
  return segments.length > 0 ? segments.join(" · ") : null;
}

/** Worst status among rows the collapsed header hides, for the `+N` badge. */
export function resolveTurnActivityHiddenSeverity(
  items: TurnActivityItem[],
): "failed" | "waiting" | "default" {
  if (items.some((item) => item.status === "failed")) {
    return "failed";
  }
  if (items.some((item) => item.status === "waiting")) {
    return "waiting";
  }
  return "default";
}

export function resolveTurnActivitySummary(args: {
  pendingInteraction: "approval" | "user_input" | null;
  isStalled: boolean;
  isPlanPreparing: boolean;
  workItems: TurnActivityWorkItemLike[];
  todos: TodoItem[];
}): TurnActivitySummary {
  const completedWorkCount = args.workItems.filter(
    (item) => item.status === "completed",
  ).length;
  const failedWorkCount = args.workItems.filter(
    (item) => item.status === "failed",
  ).length;
  const activeWorkCount = args.workItems.filter(
    (item) =>
      item.status === "running" ||
      item.status === "waiting" ||
      item.status === "pending",
  ).length;
  const completedTodoCount = args.todos.filter(
    (todo) => todo.status === "completed",
  ).length;
  const activeTodoCount = args.todos.filter(
    (todo) => todo.status !== "completed",
  ).length;
  const completedCount = completedWorkCount + completedTodoCount;
  const activeCount =
    activeWorkCount + activeTodoCount + (args.isPlanPreparing ? 1 : 0);
  const totalCount =
    args.workItems.length + args.todos.length + (args.isPlanPreparing ? 1 : 0);

  if (args.pendingInteraction === "approval") {
    return {
      label: "Waiting for approval",
      activeCount,
      completedCount,
      failedCount: failedWorkCount,
      totalCount,
    };
  }
  if (args.pendingInteraction === "user_input") {
    return {
      label: "Waiting for your input",
      activeCount,
      completedCount,
      failedCount: failedWorkCount,
      totalCount,
    };
  }
  if (args.isStalled) {
    return {
      label: "Activity paused",
      activeCount,
      completedCount,
      failedCount: failedWorkCount,
      totalCount,
    };
  }
  if (args.isPlanPreparing) {
    return {
      label: "Preparing the plan",
      activeCount,
      completedCount,
      failedCount: failedWorkCount,
      totalCount,
    };
  }
  if (failedWorkCount > 0) {
    return {
      label:
        failedWorkCount === 1
          ? "1 activity failed"
          : `${failedWorkCount} activities failed`,
      activeCount,
      completedCount,
      failedCount: failedWorkCount,
      totalCount,
    };
  }
  if (activeWorkCount > 0) {
    return {
      label:
        activeWorkCount === 1
          ? "1 background activity"
          : `${activeWorkCount} background activities`,
      activeCount,
      completedCount,
      failedCount: failedWorkCount,
      totalCount,
    };
  }
  if (activeTodoCount > 0) {
    return {
      label:
        activeTodoCount === 1
          ? "1 task in progress"
          : `${activeTodoCount} tasks in progress`,
      activeCount,
      completedCount,
      failedCount: failedWorkCount,
      totalCount,
    };
  }

  return {
    label: "Working on your request",
    activeCount,
    completedCount,
    failedCount: failedWorkCount,
    totalCount,
  };
}
