import { create } from "zustand";
import { readTaskHandoff } from "@/lib/db/task-handoff.db";
import type { TaskHandoffRecord } from "@/lib/task-context/handoff-record";

export function taskHandoffKey(workspaceId: string, taskId: string) {
  return `${workspaceId}:${taskId}`;
}

/**
 * Handoff records the window has read, by task. The Task panel's Handoff tab
 * writes what it loads and saves here, so the composer's switch notice says
 * the same thing the tab shows without a read of its own each time.
 */
export const useTaskHandoffStore = create<{
  records: Record<string, TaskHandoffRecord | undefined>;
  put: (key: string, record: TaskHandoffRecord) => void;
  load: (workspaceId: string, taskId: string) => Promise<TaskHandoffRecord>;
}>((set) => ({
  records: {},
  put: (key, record) =>
    set((state) => (state.records[key] === record ? state : { records: { ...state.records, [key]: record } })),
  load: async (workspaceId, taskId) => {
    const record = await readTaskHandoff({ workspaceId, taskId });
    set((state) => ({ records: { ...state.records, [taskHandoffKey(workspaceId, taskId)]: record } }));
    return record;
  },
}));
