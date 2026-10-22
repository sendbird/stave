import { create } from "zustand";
import { captureReturnBaseline, type ReturnBaseline } from "@/lib/task-context/return-summary";
import type { ChatMessage } from "@/types/chat";

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
  /** What you had seen of it then; null when its conversation was not loaded. */
  baseline: ReturnBaseline | null;
}

interface TaskReturnState {
  leftAtByTask: Record<string, string>;
  baselineByTask: Record<string, ReturnBaseline | null>;
  arrivalByTask: Record<string, TaskArrival | undefined>;
  /** Arrivals whose summary was dismissed, by task. */
  dismissedByTask: Record<string, string | undefined>;
  /** `messages`: the task's loaded conversation as you leave it. */
  noteLeft: (taskId: string, at?: string, messages?: readonly ChatMessage[]) => void;
  noteArrived: (taskId: string, at?: string) => void;
  dismiss: (taskId: string) => void;
}

export const useTaskReturnStore = create<TaskReturnState>((set) => ({
  leftAtByTask: {},
  baselineByTask: {},
  arrivalByTask: {},
  dismissedByTask: {},
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
  dismiss: (taskId) =>
    set((state) => ({
      dismissedByTask: { ...state.dismissedByTask, [taskId]: state.arrivalByTask[taskId]?.at },
    })),
}));
