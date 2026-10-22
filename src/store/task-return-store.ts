import { create } from "zustand";

/**
 * When you leave and come back to tasks, for this app session only: nothing
 * is persisted. A return shows the task's summary until you dismiss it or
 * write to the task; after a restart, your last message stands in for the
 * last visit.
 */
export interface TaskArrival {
  /** When you came to the task. */
  at: string;
  /** When you had left it before, this session; null when not known. */
  leftAt: string | null;
}

interface TaskReturnState {
  leftAtByTask: Record<string, string>;
  arrivalByTask: Record<string, TaskArrival | undefined>;
  /** Arrivals whose summary was dismissed, by task. */
  dismissedByTask: Record<string, string | undefined>;
  noteLeft: (taskId: string, at?: string) => void;
  noteArrived: (taskId: string, at?: string) => void;
  dismiss: (taskId: string) => void;
}

export const useTaskReturnStore = create<TaskReturnState>((set) => ({
  leftAtByTask: {},
  arrivalByTask: {},
  dismissedByTask: {},
  noteLeft: (taskId, at = new Date().toISOString()) => {
    if (!taskId) return;
    set((state) => ({ leftAtByTask: { ...state.leftAtByTask, [taskId]: at } }));
  },
  noteArrived: (taskId, at = new Date().toISOString()) => {
    if (!taskId) return;
    set((state) => ({
      arrivalByTask: {
        ...state.arrivalByTask,
        [taskId]: { at, leftAt: state.leftAtByTask[taskId] ?? null },
      },
    }));
  },
  dismiss: (taskId) =>
    set((state) => ({
      dismissedByTask: { ...state.dismissedByTask, [taskId]: state.arrivalByTask[taskId]?.at },
    })),
}));
