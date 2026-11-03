import type { UsageMetrics } from "@/lib/providers/usage-statistics";

/** A report's bounds: `from` inclusive, `to` exclusive, both ISO instants. */
export interface UsageRangeBounds {
  from: string;
  to: string;
}

/**
 * The period of equal length right before `range`, counted in calendar days
 * of the view's zone (local or UTC), so a daylight-saving change inside it
 * does not move its midnight boundaries. It ends where `range` starts.
 */
export function previousUsageRange(range: UsageRangeBounds, utc: boolean): UsageRangeBounds {
  const from = new Date(range.from);
  const days = Math.max(1, Math.round((Date.parse(range.to) - from.getTime()) / 86_400_000));
  const start = new Date(from);
  if (utc) start.setUTCDate(start.getUTCDate() - days);
  else start.setDate(start.getDate() - days);
  return { from: start.toISOString(), to: range.from };
}

/** Why a figure is not compared with the earlier period. */
export type UsageNotComparedReason =
  /** The earlier period has no completed turns under these filters. */
  | "no-earlier-turns"
  /** The earlier period has turns, but none reported this measurement. */
  | "earlier-not-reported"
  /** This period reported no such measurement, so there is nothing to compare. */
  | "not-reported";

export type UsageDelta =
  | { kind: "not-compared"; reason: UsageNotComparedReason }
  | { kind: "same"; previous: number }
  /** `ratio` is the change over the earlier value; null when the earlier value is zero. */
  | { kind: "up" | "down"; previous: number; ratio: number | null };

/** Which reported counters a figure is built from. */
export type UsageMeasurement = "tokens" | "cost";

const isMeasured = (metrics: UsageMetrics, measurement: UsageMeasurement) =>
  measurement === "cost" ? metrics.costReportedTurns > 0 && metrics.costUsd !== null : metrics.measuredTurns > 0;

/**
 * How one figure moved since the earlier period of equal length. A figure is
 * compared only when both periods measured it: an unreported amount is not a
 * zero, so it never produces a percentage.
 */
export function usageDelta(args: {
  current: UsageMetrics;
  previous: UsageMetrics;
  measurement: UsageMeasurement;
  read: (metrics: UsageMetrics) => number;
}): UsageDelta {
  if (!isMeasured(args.current, args.measurement)) return { kind: "not-compared", reason: "not-reported" };
  if (args.previous.turns === 0) return { kind: "not-compared", reason: "no-earlier-turns" };
  if (!isMeasured(args.previous, args.measurement)) return { kind: "not-compared", reason: "earlier-not-reported" };
  const current = args.read(args.current);
  const previous = args.read(args.previous);
  if (current === previous) return { kind: "same", previous };
  return {
    kind: current > previous ? "up" : "down",
    previous,
    ratio: previous === 0 ? null : Math.abs(current - previous) / previous,
  };
}

/**
 * The change as a whole percent; a change that rounds to nothing still reads
 * as one, so `<1%` never claims there was none.
 */
export function deltaPercentParts(ratio: number): { lessThanOne: boolean; percent: number } {
  const percent = Math.round(ratio * 100);
  return percent === 0 ? { lessThanOne: true, percent: 1 } : { lessThanOne: false, percent };
}

/** A row's share of the measured total, or null when the row reported nothing to share. */
export function usageShare(value: number, total: number, measured: boolean): number | null {
  if (!measured || total <= 0) return null;
  return Math.min(1, Math.max(0, value / total));
}
