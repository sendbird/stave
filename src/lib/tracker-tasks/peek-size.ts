/**
 * Peek panel width, in CSS pixels.
 *
 * ADS PeekPanel's split default is 420px. Tasks opens a property-dense ticket
 * body, so the first open is a step above that. The reader can drag the rail;
 * the clamped value is what we persist.
 */
export const ADS_PEEK_SPLIT_DEFAULT_PX = 420;
export const TRACKER_TASKS_PEEK_DEFAULT_PX = 480;
export const TRACKER_TASKS_PEEK_MIN_PX = 360;
export const TRACKER_TASKS_PEEK_MAX_PX = 720;
export const TRACKER_TASKS_PEEK_KEYBOARD_STEP_PX = 16;

export function clampTrackerTasksPeekWidth(value: number): number {
  if (!Number.isFinite(value)) {
    return TRACKER_TASKS_PEEK_DEFAULT_PX;
  }
  return Math.min(
    TRACKER_TASKS_PEEK_MAX_PX,
    Math.max(TRACKER_TASKS_PEEK_MIN_PX, Math.round(value)),
  );
}

/** Salvage a stored width. Unknown or out-of-range values fall back. */
export function parseTrackerTasksPeekWidth(value: unknown): number {
  if (typeof value !== "number" && typeof value !== "string") {
    return TRACKER_TASKS_PEEK_DEFAULT_PX;
  }
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return TRACKER_TASKS_PEEK_DEFAULT_PX;
  }
  return clampTrackerTasksPeekWidth(numeric);
}
