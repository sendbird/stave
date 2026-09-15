/**
 * Duration and deadline vocabulary shared by every delegation surface.
 *
 * Kept free of renderer imports so the main-process advisor trace can use the
 * same formatter as the UI; `format.ts` re-exports these next to the identity
 * and status helpers that need the model catalog.
 */

/**
 * One duration format for every exchange: `0.4s` under ten seconds (a cached
 * advisor really does answer in 150ms, and flooring it to a second made a
 * fast advisor look slow), `12s` under a minute, `1m 4s` under an hour and
 * `1h 2m` beyond. Trailing `.0` is dropped so four seconds reads `4s`.
 */
export function formatExchangeDuration(durationMs: number): string {
  const safeMs = Math.max(0, Math.round(durationMs));
  if (safeMs < 10_000) {
    const tenths = Math.round(safeMs / 100) / 10;
    return `${tenths}s`;
  }
  const totalSeconds = Math.round(safeMs / 1_000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) {
    const seconds = totalSeconds % 60;
    return seconds > 0 ? `${totalMinutes}m ${seconds}s` : `${totalMinutes}m`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

export interface DeadlineDescription {
  /** `Deadline in 12s`, `Deadline passed` or `No deadline`. */
  label: string;
  /** True once the deadline is behind `nowMs`; false when there is none. */
  passed: boolean;
  /** Milliseconds left, clamped at zero; `null` without a deadline. */
  remainingMs: number | null;
}

/**
 * Deadline countdown. Accepts either an absolute deadline or a remaining span;
 * a deadline that has already passed says so instead of counting `0ms`, which
 * is what the runtime's own timeout handling is now responsible for resolving.
 */
export function describeDeadline(args: {
  deadlineAtMs?: number | null;
  remainingMs?: number | null;
  nowMs: number;
}): DeadlineDescription {
  const remaining =
    args.remainingMs != null
      ? args.remainingMs
      : args.deadlineAtMs != null
        ? args.deadlineAtMs - args.nowMs
        : null;
  if (remaining === null || !Number.isFinite(remaining)) {
    return { label: "No deadline", passed: false, remainingMs: null };
  }
  if (remaining <= 0) {
    return { label: "Deadline passed", passed: true, remainingMs: 0 };
  }
  return {
    label: `Deadline in ${formatExchangeDuration(remaining)}`,
    passed: false,
    remainingMs: remaining,
  };
}
