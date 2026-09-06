import { Button as AdsButton } from "@/components/ads/components/Button";
import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Circle, ClipboardList } from "lucide-react";
import { Loader } from "@/components/ui/loader";
import { cx, sx } from "@/components/ads/utils/stylex";
import { transition } from "@/components/ads/recipes/transition";
import { getStatusBadge, type ToolState } from "./tool";
import { todoStyles as s } from "./todo.styles";

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
            status: (["pending", "in_progress", "completed"].includes(
              item.status as string,
            )
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

function TodoItemIcon({
  status,
  finalized,
}: {
  status: TodoStatus;
  finalized: boolean;
}) {
  if (status === "completed") {
    return <CheckCircle2 className={sx(s.itemIcon, s.itemIconSuccess)} />;
  }
  if (status === "in_progress") {
    // Once the tool part is finalized, stop the spinner — the item was still
    // in-progress at the time of the last TodoWrite snapshot but the turn has
    // since ended.
    if (finalized) {
      return <Circle className={sx(s.itemIcon, s.itemIconMuted)} />;
    }
    return (
      <Loader
        aria-hidden
        className={sx(s.itemIconLoader)}
        size="xs"
        variant="steps"
      />
    );
  }
  return <Circle className={sx(s.itemIcon, s.itemIconMuted)} />;
}

function deriveOverallState(
  todos: TodoItem[],
  toolState?: ToolState,
): ToolState {
  // When the tool part has been finalized (output-available / output-error),
  // honour that state regardless of individual todo-item statuses — otherwise
  // items left as "in_progress" at the time of finalization would keep the card
  // in an eternal loading state.
  if (toolState === "output-error") return "output-error";
  if (toolState === "output-available") return "output-available";

  // Still streaming — derive from individual items.
  if (toolState === "input-streaming") return "input-streaming";
  if (todos.some((t) => t.status === "in_progress")) return "input-streaming";
  if (todos.length > 0 && todos.every((t) => t.status === "completed"))
    return "output-available";
  return "input-available";
}

export function TodoCard({
  input,
  state,
  defaultOpen = true,
  className,
}: {
  input: string;
  output?: string;
  state?: ToolState;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { todos, completedCount } = useMemo(
    () => getTodoProgress({ input }),
    [input],
  );
  const displayState = deriveOverallState(todos, state);
  const finalized =
    displayState === "output-available" || displayState === "output-error";

  return (
    <section className={cx(sx(s.root), className)}>
      <AdsButton
        layout="host"
        type="button"
        className={sx(s.header, open && s.headerOpen)}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={sx(s.headerLabel)}>
          <ClipboardList className={sx(s.headerIcon)} />
          Todo
          {todos.length > 0 && (
            <span className={sx(s.headerCount)}>
              {completedCount}/{todos.length}
            </span>
          )}
        </span>
        <span className={sx(s.headerMeta)}>
          {getStatusBadge(displayState)}
          <ChevronDown className={sx(s.chevron, transition.transform, open && s.chevronOpen)} />
        </span>
      </AdsButton>
      {open && (
        <div className={sx(s.body)}>
          {todos.length === 0 ? (
            <p className={sx(s.empty)}>No todos.</p>
          ) : (
            <ol className={sx(s.list)}>
              {todos.map((todo, idx) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: order is stable for todo list
                <li key={idx} className={sx(s.item)}>
                  <TodoItemIcon status={todo.status} finalized={finalized} />
                  <span
                    className={sx(
                      s.itemText,
                      todo.status === "completed" && s.itemTextCompleted,
                      todo.status === "in_progress" &&
                        (finalized
                          ? s.itemTextInProgressFinalized
                          : s.itemTextInProgress),
                      todo.status === "pending" && s.itemTextPending,
                    )}
                  >
                    {todo.content}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
