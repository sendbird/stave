/**
 * Host: the time-axis tick math for `TraceWaterfall`'s `axisTicks`, on its own
 * so the component stays under the 500-line source ceiling and the ladder is
 * tested where it is defined.
 */

/** The shared axis a waterfall draws on: origin and total span, in ms. */
export type TraceAxis = { originMs: number; totalMs: number };

/**
 * Tick steps a reader can add up at a glance, smallest first. Past the last
 * rung the step grows in whole hours.
 */
const TICK_STEPS_MS = [
  100, 200, 500, 1_000, 2_000, 5_000, 10_000, 15_000, 30_000, 60_000, 120_000,
  300_000, 600_000, 900_000, 1_800_000, 3_600_000,
];

const HOUR_MS = 3_600_000;

/** At most this many labelled ticks, `0` included, fit a pane's track. */
const MAX_AXIS_TICKS = 4;

/**
 * The time-axis ticks for `axis`, as offsets from its origin. The step is the
 * smallest readable one that keeps the count at `maxTicks` or fewer, so a
 * 1m 35s trace reads 0s / 30s / 1m / 1m 30s rather than a tick every few
 * seconds.
 */
export function resolveTraceTicks(
  axis: TraceAxis,
  maxTicks = MAX_AXIS_TICKS,
): number[] {
  const fits = (step: number) => Math.floor(axis.totalMs / step) + 1 <= maxTicks;
  const step =
    TICK_STEPS_MS.find(fits) ??
    Math.ceil(axis.totalMs / (maxTicks - 1) / HOUR_MS) * HOUR_MS;
  const ticks: number[] = [];
  for (let offset = 0; offset <= axis.totalMs; offset += step) {
    ticks.push(offset);
  }
  return ticks;
}

/**
 * Where a tick's label hangs off its line so none leaves the track: the origin
 * starts at its line, one near the end ends at it, the rest centre on it.
 */
export function tickLabelAnchor(percent: number): "start" | "centre" | "end" {
  if (percent <= 0) return "start";
  return percent >= 88 ? "end" : "centre";
}
