import type { Tone } from "@/components/aui/utils/tone";

/**
 * How long a wait may run before its age stops reading as routine: one table
 * for every surface that colors a waiting time, so Fleet's rows and the bell
 * never disagree about when a request is late.
 *
 * Under `warningMs` the age stays quiet text; from `warningMs` it takes the
 * needs-answer state color, and from `dangerMs` the failed color. The age
 * text itself always says how long; the color only repeats it.
 */
export const FLEET_WAIT_AGE_THRESHOLDS_MS = {
  warningMs: 60 * 60 * 1000,
  dangerMs: 24 * 60 * 60 * 1000,
} as const;

export type WaitAgeTone = Extract<Tone, "neutral" | "warning" | "danger">;

/**
 * The tone of a wait that began at `since`. A wait with no recorded start,
 * or one that starts in the future (a clock skew), stays neutral: a guessed
 * age never turns red.
 */
export function classifyWaitAge(
  since: string | number | null | undefined,
  now: number,
  thresholds: { warningMs: number; dangerMs: number } = FLEET_WAIT_AGE_THRESHOLDS_MS,
): WaitAgeTone {
  if (since === null || since === undefined || since === "") return "neutral";
  const start = typeof since === "number" ? since : Date.parse(since);
  if (!Number.isFinite(start) || !Number.isFinite(now)) return "neutral";
  const waited = now - start;
  if (waited >= thresholds.dangerMs) return "danger";
  if (waited >= thresholds.warningMs) return "warning";
  return "neutral";
}
