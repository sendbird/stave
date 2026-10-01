/**
 * A one-shot request to open the Schedules sheet on "Check back on a task" for
 * a given task. The task menu sets it and opens Schedules; the view consumes it.
 */
import { create } from "zustand";

export interface CheckBackRequest {
  workspaceId: string;
  taskId: string;
}

interface ScheduleRequestState {
  checkBack: CheckBackRequest | null;
  requestCheckBack: (request: CheckBackRequest) => void;
  consume: () => CheckBackRequest | null;
}

export const useScheduleRequestStore = create<ScheduleRequestState>()((set, get) => ({
  checkBack: null,
  requestCheckBack: (request) => set({ checkBack: request }),
  consume: () => {
    const request = get().checkBack;
    if (request) set({ checkBack: null });
    return request;
  },
}));
