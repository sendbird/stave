import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { ReviewCommentAnchor, SentReviewComment } from "@/lib/sent-review-comments";
import type { ReviewComment } from "@/types/review";

/** Older sent comments drop off first; a task rarely has more open at once. */
const MAX_SENT_REVIEW_COMMENTS_PER_TASK = 50;
/** Tasks whose sent comments are kept, the most recently sent first. */
const MAX_SENT_REVIEW_COMMENT_TASKS = 200;
/** A sent comment nobody resolved in this long is let go. */
export const SENT_REVIEW_COMMENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Bounds on what is read back, so a damaged entry cannot grow the store. */
const MAX_TEXT = 20_000;
const MAX_ID = 512;

export const EMPTY_SENT_REVIEW_COMMENTS: readonly SentReviewComment[] = [];

type SentByTask = Readonly<Record<string, readonly SentReviewComment[]>>;

interface SentReviewCommentsState {
  byTask: SentByTask;
  recordSent: (args: { taskId: string; entries: readonly SentReviewComment[] }) => void;
  resolve: (args: { taskId: string; commentId: string }) => void;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

const text = (value: unknown, max = MAX_TEXT): value is string => typeof value === "string" && value.length <= max;

function readAnchor(value: unknown): ReviewCommentAnchor | null | undefined {
  if (value === null) return null;
  if (!Array.isArray(value) || value.length !== 3) return undefined;
  const [before, line, after] = value as unknown[];
  const side = (part: unknown) => part === null || text(part);
  return side(before) && text(line) && side(after) ? [before as string | null, line, after as string | null] : undefined;
}

function readComment(value: unknown): ReviewComment | null {
  const comment = record(value);
  if (!comment || !text(comment.id, MAX_ID) || !comment.id || !text(comment.filePath, 4096) || !comment.filePath ||
    !text(comment.body) || !text(comment.createdAt, 64)) return null;
  const line = comment.line;
  if (line !== undefined && !(Number.isInteger(line) && (line as number) > 0)) return null;
  const side = comment.side;
  if (side !== undefined && side !== "original" && side !== "modified") return null;
  return {
    id: comment.id,
    filePath: comment.filePath,
    ...(line !== undefined ? { line: line as number } : {}),
    ...(side !== undefined ? { side } : {}),
    body: comment.body,
    createdAt: comment.createdAt,
  };
}

/**
 * What survives a restart: well-formed entries sent within the TTL, at most
 * 50 per task and 200 tasks (those sent to most recently). Anything else is
 * dropped rather than shown half-read.
 */
export function normalizeSentReviewComments(value: unknown, now: number): SentByTask {
  const tasks: Array<[string, SentReviewComment[], number]> = [];
  for (const [taskId, entries] of Object.entries(record(value) ?? {})) {
    if (!taskId || taskId.length > MAX_ID || !Array.isArray(entries)) continue;
    const kept: SentReviewComment[] = [];
    for (const entry of entries) {
      const fields = record(entry);
      const comment = readComment(fields?.comment);
      const anchor = readAnchor(fields?.anchor);
      const sentAt = fields?.sentAt;
      const sentTime = text(sentAt, 64) ? Date.parse(sentAt) : Number.NaN;
      if (!comment || anchor === undefined || !Number.isFinite(sentTime) || sentTime > now || now - sentTime > SENT_REVIEW_COMMENT_TTL_MS) continue;
      kept.push({ comment, sentAt: sentAt as string, anchor });
    }
    if (kept.length === 0) continue;
    const latest = Math.max(...kept.map((entry) => Date.parse(entry.sentAt)));
    tasks.push([taskId, kept.slice(-MAX_SENT_REVIEW_COMMENTS_PER_TASK), latest]);
  }
  tasks.sort((left, right) => right[2] - left[2]);
  return Object.fromEntries(tasks.slice(0, MAX_SENT_REVIEW_COMMENT_TASKS).map(([taskId, entries]) => [taskId, entries]));
}

/** Small UI state, kept in the same synchronous storage as other UI stores. */
const browserStorage: StateStorage = {
  getItem: (name) => (typeof window === "undefined" ? null : window.localStorage?.getItem?.(name) ?? null),
  setItem: (name, value) => {
    if (typeof window === "undefined" || typeof window.localStorage?.setItem !== "function") return;
    window.localStorage.setItem(name, value);
  },
  removeItem: (name) => {
    if (typeof window !== "undefined") window.localStorage?.removeItem?.(name);
  },
};

/**
 * Diff review comments already sent to the agent, so the reviewer can see
 * which commented lines changed afterwards and resolve them by hand. They are
 * kept across restarts (bounded by `normalizeSentReviewComments`) until
 * resolved.
 */
export function createSentReviewCommentsStore(options: { storage?: StateStorage; now?: () => number } = {}) {
  const now = options.now ?? Date.now;
  return create<SentReviewCommentsState>()(
    persist(
      (set) => ({
        byTask: {},
        recordSent: ({ taskId, entries }) => {
          if (!taskId || entries.length === 0) {
            return;
          }
          set((state) => {
            const ids = new Set(entries.map((entry) => entry.comment.id));
            const kept = (state.byTask[taskId] ?? EMPTY_SENT_REVIEW_COMMENTS).filter((entry) => !ids.has(entry.comment.id));
            return {
              byTask: normalizeSentReviewComments({ ...state.byTask, [taskId]: [...kept, ...entries] }, now()),
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
      }),
      {
        name: "stave:sent-review-comments",
        version: 1,
        storage: createJSONStorage(() => options.storage ?? browserStorage),
        partialize: (state) => ({ byTask: state.byTask }),
        merge: (saved, current) => ({ ...current, byTask: normalizeSentReviewComments(record(saved)?.byTask, now()) }),
      },
    ),
  );
}

// Synchronous hydration finishes before Review or the editor reads the store.
export const useSentReviewCommentsStore = createSentReviewCommentsStore();
