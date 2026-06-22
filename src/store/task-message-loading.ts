import type { ChatMessage } from "@/types/chat";

const INITIAL_LATEST_TASK_MESSAGES_MIN = 24;
const INITIAL_LATEST_TASK_MESSAGES_MAX = 48;
const ESTIMATED_CHAT_CHROME_HEIGHT_PX = 280;
const ESTIMATED_VISIBLE_MESSAGE_HEIGHT_PX = 72;
const INITIAL_LATEST_TASK_MESSAGES_SCREENFULS = 3;

export const TASK_MESSAGES_PAGE_SIZE = 120;

/**
 * Hard cap on how many of a task's messages stay resident in `messagesByTask`.
 * That state is only a tail window over the durable `messages` table, so
 * trimming the head bounds memory without losing history — evicted messages
 * stay on disk and reload on demand via `loadTaskMessagesPage(mode: "older")`.
 * Kept well above `INITIAL_LATEST_TASK_MESSAGES_MAX` and `TASK_MESSAGES_PAGE_SIZE`
 * so a single initial load or "load older" page never overflows the cap.
 */
export const MAX_LOADED_TASK_MESSAGES = 400;

/**
 * Hysteresis band: only evict once a window exceeds `cap + slack`, then trim
 * back to `cap`. Avoids re-allocating the array on every streamed message once
 * a long-lived task hovers around the cap.
 */
export const MAX_LOADED_TASK_MESSAGES_EVICTION_SLACK = 80;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function resolveInitialLatestTaskMessagesPageSize(args?: {
  viewportHeightPx?: number | null;
}) {
  const viewportHeightPx =
    args?.viewportHeightPx ??
    (typeof window === "undefined" ? null : window.innerHeight);
  const effectiveViewportHeight =
    typeof viewportHeightPx === "number" && Number.isFinite(viewportHeightPx)
      ? viewportHeightPx
      : 900;
  const usableHeightPx = Math.max(
    effectiveViewportHeight - ESTIMATED_CHAT_CHROME_HEIGHT_PX,
    ESTIMATED_VISIBLE_MESSAGE_HEIGHT_PX,
  );
  const estimatedVisibleMessageCount = Math.max(
    1,
    Math.ceil(usableHeightPx / ESTIMATED_VISIBLE_MESSAGE_HEIGHT_PX),
  );
  return clamp(
    estimatedVisibleMessageCount * INITIAL_LATEST_TASK_MESSAGES_SCREENFULS,
    INITIAL_LATEST_TASK_MESSAGES_MIN,
    INITIAL_LATEST_TASK_MESSAGES_MAX,
  );
}

/**
 * Bound a task's in-memory message window to the most-recent `cap` messages.
 *
 * - Returns the SAME array reference when no trimming is needed, so callers can
 *   cheaply preserve referential equality and skip redundant state updates.
 * - Always keeps the tail, so the in-flight / streaming last message is never
 *   dropped, and the kept window stays chronologically ordered.
 * - Only `messagesByTask` shrinks; callers must leave `messageCountByTask`
 *   (the on-disk total) untouched so "load older" backfill stays enabled.
 */
export function trimLoadedTaskMessages(args: {
  messages: ChatMessage[];
  cap?: number;
  slack?: number;
}): ChatMessage[] {
  const cap = args.cap ?? MAX_LOADED_TASK_MESSAGES;
  const slack = args.slack ?? MAX_LOADED_TASK_MESSAGES_EVICTION_SLACK;
  if (args.messages.length <= cap + slack) {
    return args.messages;
  }
  return args.messages.slice(args.messages.length - cap);
}
