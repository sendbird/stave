import type {
  UsageStripBreakpoint,
  UsageStripSegmentModel,
} from "@/components/layout/status-bar-usage-strip.utils";

/**
 * The status bar's one shrink order. As the window narrows, segments give way
 * in this order, and the right-hand group never shrinks, so nothing collides:
 *
 * 1. `usage-detail` — each usage segment drops its rings, resets and spend
 *    for the compact meter (the strip's own estimate,
 *    `resolveUsageStripBreakpoint`, measured against the strip's width).
 * 2. `resource-label` — Resource Manager keeps its icon and drops its label,
 *    once the compact meter would otherwise run into it.
 * 3. `usage-clip` — the compact strip clips at its trailing end; the
 *    right-hand group keeps its place.
 */
export const STATUS_BAR_SHRINK_ORDER = ["usage-detail", "resource-label", "usage-clip"] as const;

/**
 * Bar widths (rem) at which the Resource Manager label switches on. Container
 * query conditions cannot read a variable, so the styles carry one rule per
 * step and the estimate below picks it.
 */
export const RESOURCE_LABEL_BREAKPOINTS_REM = [32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 88, 96, 112, 128] as const;

/** `always`: no step is safe to hide the label at, so it stays. */
export type ResourceLabelBreakpoint = (typeof RESOURCE_LABEL_BREAKPOINTS_REM)[number] | "always";

// Measured at caption size (12px), rounded up so the estimate errs wide.
const CHAR_REM = 0.36;
const MONO_CHAR_REM = 0.45;
const TRIGGER_INSET_REM = 1;
const PART_GAP_REM = 0.375;
const DOT_REM = 0.375;
const CLOCK_REM = 0.875;
const GLYPH_REM = 1;
const SEGMENT_GAP_REM = 0.125;
const BAR_INSET_REM = 0.5;
const SAFETY_REM = 0.5;

/** The Resource Manager trigger with its label, and as an icon alone. */
export const RESOURCE_TRIGGER_FULL_REM =
  TRIGGER_INSET_REM + GLYPH_REM + PART_GAP_REM + "Resource Manager".length * CHAR_REM;
export const RESOURCE_TRIGGER_ICON_REM = TRIGGER_INSET_REM + GLYPH_REM;

/** Width of one segment's compact meter: dot, name, `5h 100%` and its clock per window. */
export function estimateCompactUsageSegmentRem(segment: UsageStripSegmentModel): number {
  let rem = TRIGGER_INSET_REM + DOT_REM + PART_GAP_REM + segment.name.length * CHAR_REM;
  if (segment.stale) rem += " (unverified)".length * CHAR_REM;
  if (segment.gateway) return rem;
  if (segment.windows.length === 0) return rem + PART_GAP_REM + GLYPH_REM;
  for (const window of segment.windows) {
    const text = `${window.short ? `${window.short} ` : ""}100%`;
    rem += PART_GAP_REM + text.length * MONO_CHAR_REM + CLOCK_REM;
  }
  return rem;
}

export function estimateCompactUsageStripRem(segments: readonly UsageStripSegmentModel[]): number {
  if (segments.length === 0) return 0;
  return (
    segments.reduce((total, segment) => total + estimateCompactUsageSegmentRem(segment), 0) +
    SEGMENT_GAP_REM * (segments.length - 1)
  );
}

/**
 * The bar width below which Resource Manager shows its icon only.
 *
 * It is the narrowest step at which the compact meter and the labelled
 * trigger still fit side by side, so the label goes before the meter would
 * clip. It is capped so that dropping the label can never hand the strip
 * enough room to switch back to its full form: below the step, the strip
 * is `fullStripStep` wide at most, which keeps the order one-way.
 */
export function resolveResourceLabelBreakpoint(args: {
  segments: readonly UsageStripSegmentModel[];
  fullStripStep: UsageStripBreakpoint;
}): ResourceLabelBreakpoint {
  const needed =
    estimateCompactUsageStripRem(args.segments) + RESOURCE_TRIGGER_FULL_REM + BAR_INSET_REM + SAFETY_REM;
  const ceiling =
    args.fullStripStep === "never"
      ? Number.POSITIVE_INFINITY
      : args.fullStripStep + RESOURCE_TRIGGER_ICON_REM + BAR_INSET_REM;
  const fitting = RESOURCE_LABEL_BREAKPOINTS_REM.find((step) => step >= needed);
  if (fitting !== undefined && fitting <= ceiling) return fitting;
  const capped = [...RESOURCE_LABEL_BREAKPOINTS_REM].reverse().find((step) => step <= ceiling);
  return capped ?? "always";
}
