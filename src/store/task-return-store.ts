import { create } from "zustand";
import { captureReturnBaseline, type ReturnBaseline } from "@/lib/task-context/return-summary";
import type { ChatMessage } from "@/types/chat";

/**
 * When you leave and come back to tasks, for this app session only: nothing
 * is persisted. A return shows the task's summary in its conversation; Got it
 * or writing to the task folds it into a one-line divider until the next
 * return. After a restart, your last message stands in for the last visit.
 */
export interface TaskArrival {
  /** When you came to the task. */
  at: string;
  /** When you had left it before, this session; null when not known. */
  leftAt: string | null;
  /** What you had seen of it then; null when its conversation was not loaded. */
  baseline: ReturnBaseline | null;
}

interface TaskReturnState {
  leftAtByTask: Record<string, string>;
  baselineByTask: Record<string, ReturnBaseline | null>;
  arrivalByTask: Record<string, TaskArrival | undefined>;
  /**
   * Whether you folded or reopened the summary of a task's current arrival
   * (`at`). Without a choice for it, the summary folds once you write.
   */
  collapsedByTask: Record<string, { at: string; collapsed: boolean } | undefined>;
  /** `messages`: the task's loaded conversation as you leave it. */
  noteLeft: (taskId: string, at?: string, messages?: readonly ChatMessage[]) => void;
  noteArrived: (taskId: string, at?: string) => void;
  setCollapsed: (taskId: string, collapsed: boolean) => void;
}

export const useTaskReturnStore = create<TaskReturnState>((set) => ({
  leftAtByTask: {},
  baselineByTask: {},
  arrivalByTask: {},
  collapsedByTask: {},
  noteLeft: (taskId, at = new Date().toISOString(), messages) => {
    if (!taskId) return;
    set((state) => ({
      leftAtByTask: { ...state.leftAtByTask, [taskId]: at },
      baselineByTask: { ...state.baselineByTask, [taskId]: messages ? captureReturnBaseline(messages) : null },
    }));
  },
  noteArrived: (taskId, at = new Date().toISOString()) => {
    if (!taskId) return;
    set((state) => ({
      arrivalByTask: {
        ...state.arrivalByTask,
        [taskId]: {
          at,
          leftAt: state.leftAtByTask[taskId] ?? null,
          baseline: state.baselineByTask[taskId] ?? null,
        },
      },
    }));
  },
  setCollapsed: (taskId, collapsed) =>
    set((state) => {
      const at = state.arrivalByTask[taskId]?.at;
      if (!at) return state;
      return { collapsedByTask: { ...state.collapsedByTask, [taskId]: { at, collapsed } } };
    }),
}));
