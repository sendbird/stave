import { create } from "zustand";
import { sameReviewScope, type ReviewScope } from "@/lib/review/review-scope";

/**
 * Whether a task's surface shows its conversation or Review, the scope Review
 * looks at, and the files read in each scope. Session state only: a restart
 * opens every task on its conversation (D13).
 */
export type TaskSurfaceMode = "conversation" | "review";

export interface TaskReviewEntry {
  mode: TaskSurfaceMode;
  /** The scope chosen or opened on; absent means Review's default for the task. */
  scope?: ReviewScope;
}

/** A scope's key for the files read in it. */
export function reviewScopeKey(scope: ReviewScope): string {
  switch (scope.kind) {
    case "turn":
      return `turn:${scope.turnId}`;
    case "stage":
      return `stage:${scope.agentRunId}:${scope.stageId}:${scope.attempt}`;
    case "branch":
    case "uncommitted":
      return scope.kind;
  }
}

interface TaskReviewModeState {
  byTask: Readonly<Record<string, TaskReviewEntry | undefined>>;
  /** Paths read in Review, by task and then scope key. */
  readByTask: Readonly<Record<string, Readonly<Record<string, readonly string[]>> | undefined>>;
  /** Shows Review, on `scope` when an entry point names one. */
  openReview: (taskId: string, scope?: ReviewScope) => void;
  showConversation: (taskId: string) => void;
  toggle: (taskId: string) => void;
  setScope: (taskId: string, scope: ReviewScope) => void;
  markRead: (taskId: string, scope: ReviewScope, path: string) => void;
}

export const useTaskReviewModeStore = create<TaskReviewModeState>()((set) => ({
  byTask: {},
  readByTask: {},
  openReview: (taskId, scope) =>
    set((state) => {
      const current = state.byTask[taskId];
      if (current?.mode === "review" && (!scope || (current.scope && sameReviewScope(current.scope, scope)))) return state;
      return { byTask: { ...state.byTask, [taskId]: { mode: "review", scope: scope ?? current?.scope } } };
    }),
  showConversation: (taskId) =>
    set((state) => {
      const current = state.byTask[taskId];
      if (!current || current.mode === "conversation") return state;
      return { byTask: { ...state.byTask, [taskId]: { ...current, mode: "conversation" } } };
    }),
  toggle: (taskId) =>
    set((state) => {
      const current = state.byTask[taskId];
      return { byTask: { ...state.byTask, [taskId]: { ...current, mode: current?.mode === "review" ? "conversation" : "review" } } };
    }),
  setScope: (taskId, scope) =>
    set((state) => {
      const current = state.byTask[taskId];
      if (current?.scope && sameReviewScope(current.scope, scope)) return state;
      return { byTask: { ...state.byTask, [taskId]: { mode: current?.mode ?? "review", scope } } };
    }),
  markRead: (taskId, scope, path) =>
    set((state) => {
      const key = reviewScopeKey(scope);
      const read = state.readByTask[taskId]?.[key] ?? [];
      if (read.includes(path)) return state;
      return { readByTask: { ...state.readByTask, [taskId]: { ...state.readByTask[taskId], [key]: [...read, path] } } };
    }),
}));
