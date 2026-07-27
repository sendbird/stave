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

/**
 * The shelf stays mounted for the whole turn. It deliberately does not react to
 * pending approval/user-input cards: unmounting there replayed the shelf's
 * enter/exit animation on every interaction, which read as a flicker. The
 * duplicate row is suppressed in `buildTurnActivityItems` instead.
 */
export function resolveTurnActivityVisibility(args: {
  isTurnActive: boolean;
  isPlanPending: boolean;
  hasRetainedFailure?: boolean;
}) {
  return Boolean(
    args.hasRetainedFailure || (args.isTurnActive && !args.isPlanPending),
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
 * Flatten every tracked signal into one row list, in a stable order: turn-level
 * signals first, then provider work in the order it started, then todos in
 * their authored order.
 *
 * Rows are deliberately NOT sorted by status. Re-ranking on every status change
 * made rows swap places while work landed — and provider events flush once per
 * animation frame, so that churned continuously. Severity now only decides the
 * collapsed header's featured row (`resolveTurnActivityFeaturedItem`).
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
  /**
   * A chat-level approval/user-input card is already on screen, so the shelf
   * skips its own row rather than saying the same thing twice.
   */
  hasPendingInteractionCard?: boolean;
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
    if (!args.hasPendingInteractionCard) {
      const needsApproval = args.activity.pendingInteraction === "approval";
      items.push({
        id: `interaction:${args.activity.pendingInteraction}`,
        status: "waiting",
        title: needsApproval ? "Approval needed" : "Input needed",
        detail: needsApproval ? "Review to continue" : "Reply to continue",
        iconKey: "pause",
      });
    }
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

  return items;
}

/**
 * Pick the row the collapsed header should name: the most urgent one, with
 * insertion order breaking ties. This is the only place status severity is
 * allowed to reorder anything — the list itself stays in insertion order so
 * rows never swap places mid-turn.
 */
export function resolveTurnActivityFeaturedItem(
  items: TurnActivityItem[],
): TurnActivityItem | null {
  let featured: TurnActivityItem | null = null;
  for (const item of items) {
    if (
      featured == null ||
      TURN_ACTIVITY_STATUS_ORDER[item.status] <
        TURN_ACTIVITY_STATUS_ORDER[featured.status]
    ) {
      featured = item;
    }
  }
  return featured;
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

/** Whether any row still represents outstanding work rather than a result. */
export function hasOutstandingTurnActivity(counts: TurnActivityCounts) {
  return (
    counts.failedCount +
      counts.waitingCount +
      counts.runningCount +
      counts.pendingCount >
    0
  );
}

/**
 * The shelf headline.
 *
 * Attention states own the header in both the collapsed and expanded state —
 * they name themselves better than a row title or a count can, and the shelf now
 * stays mounted behind interaction cards, so a collapsed header must not bury
 * "waiting for you" under whichever tool happens to be running.
 *
 * Counts only earn the slot while something is still outstanding: once every
 * tracked row has finished, `formatTurnActivityCountsLabel` degrades to a bare
 * `5 done`, which sat there reading like a finished turn for the whole
 * final-response stream. The completed ratio is rendered separately in the
 * header, so the label falls back to naming the state instead.
 */
export function resolveTurnActivityHeadline(args: {
  expanded: boolean;
  needsAttention: boolean;
  counts: TurnActivityCounts;
  countsLabel: string | null;
  featuredItem: TurnActivityItem | null;
  summaryLabel: string;
}) {
  if (args.needsAttention) {
    return args.summaryLabel;
  }
  if (!args.expanded) {
    return args.featuredItem?.title ?? args.summaryLabel;
  }
  if (!hasOutstandingTurnActivity(args.counts)) {
    return args.summaryLabel;
  }
  return args.countsLabel ?? args.summaryLabel;
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
