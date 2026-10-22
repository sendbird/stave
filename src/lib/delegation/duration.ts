import { formatDuration } from "@/i18n/format";
import { i18n } from "@/i18n/runtime";
/**
 * Deadline vocabulary shared by every delegation surface. Durations read with
 * the shared `formatDuration` (tenths under ten seconds, since a cached advisor
 * really does answer in 150ms).
 *
 * Kept free of renderer imports so the main-process advisor trace can use the
 * same words as the UI; `format.ts` re-exports these next to the identity
 * and status helpers that need the model catalog.
 */

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
    return { label: i18n.t("agentRuns:duration.label"), passed: false, remainingMs: null };
  }
  if (remaining <= 0) {
    return { label: i18n.t("agentRuns:duration.label2"), passed: true, remainingMs: 0 };
  }
  return {
    label: i18n.t("agentRuns:duration.label3", { value1: formatDuration(remaining, { tenths: true }) }),
    passed: false,
    remainingMs: remaining,
  };
}
