import { thresholdTone, type Tone, type ToneThreshold } from "@/components/aui/utils/tone";

/**
 * The one place usage readings get their warning and danger points. Every
 * surface that colours the same kind of reading reads the same entry, so a
 * value never looks fine in one place and alarming in another.
 */

export type UsageThresholdTone = Extract<Tone, "warning" | "danger">;

type UsageThresholdScale = readonly [
  ToneThreshold<"warning">,
  ToneThreshold<"danger">,
];

export const USAGE_THRESHOLDS = {
  /**
   * An account quota window (5-hour, weekly, credits). Worth watching from
   * 80% used and about to bind from 97%. The Usage view's pace sentence warns
   * earlier, so the colour can wait until the window is nearly spent.
   */
  quota: [
    { from: 80, tone: "warning" },
    { from: 97, tone: "danger" },
  ],
  /**
   * A conversation's context window. Worth watching from 60% and close to
   * compaction from 85%.
   */
  context: [
    { from: 60, tone: "warning" },
    { from: 85, tone: "danger" },
  ],
} as const satisfies Record<string, UsageThresholdScale>;

export type UsageThresholdKind = keyof typeof USAGE_THRESHOLDS;

/** The tone of a used-percent reading, or `fallback` below the warning point. */
export function usageThresholdTone<F extends Tone>(
  kind: UsageThresholdKind,
  usedPercent: number,
  fallback: F,
): UsageThresholdTone | F {
  return thresholdTone(usedPercent, USAGE_THRESHOLDS[kind], fallback);
}

/** The used percent where `kind` turns `tone`. */
export function usageThresholdFrom(
  kind: UsageThresholdKind,
  tone: UsageThresholdTone,
): number {
  const step = USAGE_THRESHOLDS[kind].find((threshold) => threshold.tone === tone);
  return step?.from ?? Number.POSITIVE_INFINITY;
}
