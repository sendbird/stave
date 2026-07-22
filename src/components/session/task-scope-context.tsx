import { createContext, useContext, type ReactNode } from "react";
import { useAppStore } from "@/store/app.store";

/**
 * Task id the surrounding session surface is scoped to.
 *
 * `ChatArea` sets this from its explicit `taskId` prop so every descendant
 * (message list, prompt input, plan viewer, todo floater, ...) reads and
 * mutates state for the panel's own task — not whichever task happens to be
 * globally active while multiple task panels are visible in split panes.
 *
 * `null` means "no explicit scope": consumers fall back to the store's
 * global `activeTaskId` (legacy single-surface behavior).
 */
const TaskIdContext = createContext<string | null>(null);

export function TaskScopeProvider(props: {
  taskId: string | null;
  children: ReactNode;
}) {
  return (
    <TaskIdContext.Provider value={props.taskId}>
      {props.children}
    </TaskIdContext.Provider>
  );
}

/**
 * Resolve the task id this component should operate on.
 *
 * Returns the surrounding `TaskScopeProvider` value when present, otherwise
 * subscribes to the store's `activeTaskId`. The selector returns a primitive
 * and, when a scope is set, a constant — so scoped consumers never re-render
 * on global active-task changes.
 */
export function useScopedTaskId(): string {
  const scopedTaskId = useContext(TaskIdContext);
  return useAppStore((state) => scopedTaskId ?? state.activeTaskId);
}
