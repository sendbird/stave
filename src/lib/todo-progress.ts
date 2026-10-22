/**
 * The todo list a TodoWrite-style tool call carries in its input, and the
 * progress it reports. Pure: the transcript's plan row, the turn activity
 * shelf and agent flow views read the same list the same way.
 */
export type TodoStatus = "pending" | "in_progress" | "completed";

export interface TodoItem {
  content: string;
  status: TodoStatus;
}

export interface TodoProgress {
  todos: TodoItem[];
  totalCount: number;
  completedCount: number;
  hasPendingTodos: boolean;
  hasInProgressTodos: boolean;
}

const TODO_STATUSES: readonly string[] = ["pending", "in_progress", "completed"];

export function parseTodoInput(args: { input: string }): { todos: TodoItem[] } {
  try {
    const parsed = JSON.parse(args.input) as Record<string, unknown>;
    if (Array.isArray(parsed.todos)) {
      return {
        todos: parsed.todos
          .filter(
            (item): item is Record<string, unknown> =>
              typeof item === "object" && item !== null,
          )
          .map((item) => ({
            content:
              typeof item.content === "string"
                ? item.content
                : String(item.content ?? ""),
            status: (TODO_STATUSES.includes(item.status as string)
              ? item.status
              : "pending") as TodoStatus,
          })),
      };
    }
  } catch {
    /* fall through */
  }
  return { todos: [] };
}

export function getTodoProgress(args: { input: string }): TodoProgress {
  const { todos } = parseTodoInput(args);
  const completedCount = todos.filter(
    (todo) => todo.status === "completed",
  ).length;

  return {
    todos,
    totalCount: todos.length,
    completedCount,
    hasPendingTodos: todos.some((todo) => todo.status === "pending"),
    hasInProgressTodos: todos.some((todo) => todo.status === "in_progress"),
  };
}
