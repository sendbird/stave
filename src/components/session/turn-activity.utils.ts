import type { TodoItem } from "@/components/ai-elements/todo";

export type TurnActivityRowStatus =
  "pending" | "running" | "waiting" | "completed" | "failed";

export interface TurnActivityWorkItemLike {
  status: TurnActivityRowStatus;
}

export interface TurnActivitySummary {
  label: string;
  activeCount: number;
  completedCount: number;
  failedCount: number;
  totalCount: number;
}

export function resolveTurnActivityVisibility(args: {
  isTurnActive: boolean;
  isPlanPending: boolean;
  hasRetainedFailure?: boolean;
}) {
  return args.hasRetainedFailure || (args.isTurnActive && !args.isPlanPending);
}

export function promoteFirstPendingTodoForActiveTurn(todos: TodoItem[]) {
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
      ? { ...todo, status: "in_progress" as const }
      : todo,
  );
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
