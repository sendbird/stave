import { create } from "zustand";

/**
 * Tasks whose last message read failed. Kept beside the app store's loading
 * flags so the conversation can tell "this task's messages could not be read"
 * from "this task has no messages"; a retry clears the mark before it reads.
 */
export const useTaskMessageLoadFailures = create<{ failedByTask: Readonly<Record<string, true>> }>(() => ({
  failedByTask: {},
}));

export function markTaskMessagesLoadFailed(taskId: string) {
  useTaskMessageLoadFailures.setState((state) =>
    state.failedByTask[taskId] ? state : { failedByTask: { ...state.failedByTask, [taskId]: true } },
  );
}

export function clearTaskMessagesLoadFailure(taskId: string) {
  useTaskMessageLoadFailures.setState((state) => {
    if (!state.failedByTask[taskId]) return state;
    const { [taskId]: _cleared, ...rest } = state.failedByTask;
    return { failedByTask: rest };
  });
}
