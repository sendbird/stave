/**
 * Binning for `HistogramChart`: raw samples → half-open bins on "nice" edges,
 * with an optional overflow bin that folds a long tail into one labelled bar.
 *
 * Pure and dependency-free so it can be unit-tested and reused by a caller that
 * wants the same bins in a table or an export. Every edge is a multiple of a
 * 1 / 2 / 2.5 / 5 × 10ⁿ step, so ticks read `0 5 10 15`, never `0 4.37 8.74`.
 */

/** One bar of a histogram: `[from, to)` and how many samples fell in it. */
export type HistogramBin = {
  count: number;
  from: number;
  /**
   * The folded tail: every sample above `from`. Drawn apart from the regular
   * bins and labelled "`from` and above", because its width is not a step.
   */
  overflow?: boolean;
  to: number;
};

/** Quantile names a histogram can mark or fold at. */
export type HistogramPercentile = "p50" | "p75" | "p90" | "p95" | "p99";

export type HistogramBinOptions = {
  /**
   * Target number of regular bins; the step is rounded to a nice value, so the
   * result lands near this, not on it. @default √n, clamped to 5–30
   */
  binCount?: number;
  /** Exact bin width. Wins over `binCount`. */
  binWidth?: number;
  /**
   * Fold every sample above this value (or quantile) into one overflow bin, so
   * a long tail does not flatten the body of the distribution into a sliver.
   * `false` keeps every sample in a regular bin. @default false
   */
  overflowAt?: HistogramPercentile | number | false;
};

export type HistogramBinResult = {
  bins: HistogramBin[];
  /** Finite samples counted (non-finite values are dropped). */
  count: number;
  max: number | null;
  min: number | null;
  /** Samples folded into the overflow bin. */
  overflowCount: number;
  /** Sorted finite samples, for percentile reads. */
  sorted: number[];
};

/** Hard ceiling on regular bins: a caller's tiny `binWidth` cannot hang a tab. */
export const MAX_HISTOGRAM_BINS = 200;

const PERCENTILES: Record<HistogramPercentile, number> = {
  p50: 0.5,
  p75: 0.75,
  p90: 0.9,
  p95: 0.95,
  p99: 0.99,
};

export function percentileRank(name: HistogramPercentile): number {
  return PERCENTILES[name];
}

/** Strips float noise from an edge (0.30000000000000004 → 0.3). */
function clean(value: number): number {
  return Number(value.toPrecision(12));
}

/** The nice step (1, 2, 2.5 or 5 × 10ⁿ) at or above `raw`. */
export function niceStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const exponent = Math.floor(Math.log10(raw));
  const base = 10 ** exponent;
  const fraction = raw / base;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return clean(nice * base);
}

/**
 * Linear-interpolated quantile of an ascending array (the "type 7" estimator
 * most tools report). `p` is 0–1. Null for an empty array.
 */
export function quantile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const clamped = Math.max(0, Math.min(1, p));
  const position = (sorted.length - 1) * clamped;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const low = sorted[lower]!;
  if (lower === upper) return low;
  return low + (sorted[upper]! - low) * (position - lower);
}

export function binSamples(
  samples: readonly number[],
  { binCount, binWidth, overflowAt = false }: HistogramBinOptions = {},
): HistogramBinResult {
  const sorted = samples
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (sorted.length === 0) {
    return { bins: [], count: 0, max: null, min: null, overflowCount: 0, sorted };
  }
  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;
  const threshold =
    overflowAt === false
      ? null
      : typeof overflowAt === "number"
        ? overflowAt
        : quantile(sorted, PERCENTILES[overflowAt]);
  // A threshold at or past the maximum folds nothing, and one at or below the
  // minimum would fold everything: both mean "no overflow bin".
  const folds = threshold != null && threshold < max && threshold > min;
  const top = folds ? threshold : max;
  const target =
    binCount != null && binCount > 0
      ? Math.floor(binCount)
      : Math.max(5, Math.min(30, Math.round(Math.sqrt(sorted.length))));
  const span = top - min;
  const rawStep =
    binWidth != null && binWidth > 0
      ? binWidth
      : span > 0
        ? niceStep(span / target)
        : niceStep(Math.abs(min) || 1);
  // Never more than the ceiling, whatever width was asked for.
  const step =
    span / rawStep > MAX_HISTOGRAM_BINS
      ? niceStep(span / MAX_HISTOGRAM_BINS)
      : rawStep;
  const start = clean(Math.floor(min / step) * step);
  // Enough bins that `top` falls inside the last one ([from, to) — so a top
  // sitting exactly on an edge needs the bin that starts there).
  const binTotal = Math.max(1, Math.floor(clean((top - start) / step)) + 1);
  const bins: HistogramBin[] = Array.from({ length: binTotal }, (_, index) => ({
    count: 0,
    from: clean(start + index * step),
    to: clean(start + (index + 1) * step),
  }));
  let overflowCount = 0;
  for (const value of sorted) {
    if (folds && value > top) {
      overflowCount += 1;
      continue;
    }
    const index = Math.min(
      binTotal - 1,
      Math.max(0, Math.floor(clean((value - start) / step))),
    );
    bins[index]!.count += 1;
  }
  // Trailing empty bins past the last counted sample carry no information.
  while (bins.length > 1 && bins[bins.length - 1]!.count === 0) bins.pop();
  if (folds && overflowCount > 0) {
    bins.push({ count: overflowCount, from: top, overflow: true, to: max });
  }
  return { bins, count: sorted.length, max, min, overflowCount, sorted };
}
