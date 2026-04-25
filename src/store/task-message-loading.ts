const INITIAL_LATEST_TASK_MESSAGES_MIN = 24;
const INITIAL_LATEST_TASK_MESSAGES_MAX = 48;
const ESTIMATED_CHAT_CHROME_HEIGHT_PX = 280;
const ESTIMATED_VISIBLE_MESSAGE_HEIGHT_PX = 72;
const INITIAL_LATEST_TASK_MESSAGES_SCREENFULS = 3;

export const TASK_MESSAGES_PAGE_SIZE = 120;

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
