import { create } from "zustand";
import type { SentReviewComment } from "@/lib/sent-review-comments";

/** Older sent comments drop off first; a task rarely has more open at once. */
const MAX_SENT_REVIEW_COMMENTS_PER_TASK = 50;

export const EMPTY_SENT_REVIEW_COMMENTS: readonly SentReviewComment[] = [];

interface SentReviewCommentsState {
  byTask: Readonly<Record<string, readonly SentReviewComment[]>>;
  recordSent: (args: { taskId: string; entries: readonly SentReviewComment[] }) => void;
  resolve: (args: { taskId: string; commentId: string }) => void;
}

/**
 * Diff review comments already sent to the agent, kept for this app session so
 * the reviewer can see which commented lines changed afterwards and resolve
 * them by hand. Not persisted: a restart clears them.
 */
export const useSentReviewCommentsStore = create<SentReviewCommentsState>()((set) => ({
  byTask: {},
  recordSent: ({ taskId, entries }) => {
    if (!taskId || entries.length === 0) {
      return;
    }
    set((state) => {
      const ids = new Set(entries.map((entry) => entry.comment.id));
      const kept = (state.byTask[taskId] ?? EMPTY_SENT_REVIEW_COMMENTS).filter((entry) => !ids.has(entry.comment.id));
      return {
        byTask: {
          ...state.byTask,
          [taskId]: [...kept, ...entries].slice(-MAX_SENT_REVIEW_COMMENTS_PER_TASK),
        },
      };
    });
  },
  resolve: ({ taskId, commentId }) =>
    set((state) => {
      const current = state.byTask[taskId];
      if (!current?.some((entry) => entry.comment.id === commentId)) {
        return state;
      }
      const remaining = current.filter((entry) => entry.comment.id !== commentId);
      const byTask = { ...state.byTask };
      if (remaining.length > 0) {
        byTask[taskId] = remaining;
      } else {
        delete byTask[taskId];
      }
      return { byTask };
    }),
}));
