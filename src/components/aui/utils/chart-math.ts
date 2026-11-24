/**
 * Pure arithmetic behind the wave-8 chart forms: waterfall running totals, box
 * statistics, Pareto cumulative share, uptime ratios, and a shared linear
 * scale. No React, no recharts, so every number a chart prints can be unit
 * tested (`tests/chart-geometry.test.ts`).
 */
import { quantile } from "./histogram-bins";

/* ---------------------------------------------------------------- waterfall */

export type WaterfallStep = {
  label: string;
  /**
   * `delta` (default) moves the running total by `value`; `total` is a
   * checkpoint drawn from zero. With `value` omitted a total prints the running
   * total itself, which is how a bridge ends ("Ending MRR").
   */
  kind?: "delta" | "total";
  value?: number;
};

export type WaterfallBar = {
  /** Running total after this step. */
  end: number;
  kind: "decrease" | "increase" | "total";
  label: string;
  /** `[low, high]` of the floating bar. */
  range: [number, number];
  /** Running total before this step (0 for a total). */
  start: number;
  /** Signed change for a delta; the level for a total. */
  value: number;
};

export function waterfallBars(steps: readonly WaterfallStep[]): WaterfallBar[] {
  let running = 0;
  return steps.map((step) => {
    if (step.kind === "total") {
      const level = step.value ?? running;
      running = level;
      return {
        end: level,
        kind: "total",
        label: step.label,
        range: [Math.min(0, level), Math.max(0, level)],
        start: 0,
        value: level,
      };
    }
    const delta = step.value ?? 0;
    const start = running;
    running += delta;
    return {
      end: running,
      kind: delta < 0 ? "decrease" : "increase",
      label: step.label,
      range: [Math.min(start, running), Math.max(start, running)],
      start,
      value: delta,
    };
  });
}

/* ---------------------------------------------------------------- box plot */

export type BoxStats = {
  count: number;
  max: number;
  mean: number;
  median: number;
  min: number;
  /** Samples beyond 1.5 × IQR from the box. */
  outliers: number[];
  q1: number;
  q3: number;
};

/**
 * Tukey box statistics: quartiles by the type-7 estimator, whiskers at the
 * furthest samples within 1.5 × IQR, everything past them an outlier. Null for
 * a set with no finite samples.
 */
export function boxStats(samples: readonly number[]): BoxStats | null {
  const sorted = samples.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const q1 = quantile(sorted, 0.25)!;
  const median = quantile(sorted, 0.5)!;
  const q3 = quantile(sorted, 0.75)!;
  const fence = 1.5 * (q3 - q1);
  const inside = sorted.filter((v) => v >= q1 - fence && v <= q3 + fence);
  const outliers = sorted.filter((v) => v < q1 - fence || v > q3 + fence);
  return {
    count: sorted.length,
    max: inside[inside.length - 1] ?? q3,
    mean: sorted.reduce((sum, v) => sum + v, 0) / sorted.length,
    median,
    min: inside[0] ?? q1,
    outliers,
    q1,
    q3,
  };
}

/* ------------------------------------------------------------------ pareto */

export type ParetoRow = {
  /** Cumulative share through this row, 0–1. */
  cumulative: number;
  label: string;
  /** This row's share of the total, 0–1. */
  share: number;
  value: number;
};

/** Sorted descending, with each row's share and the cumulative share. */
export function paretoRows(
  data: ReadonlyArray<{ label: string; value: number }>,
): ParetoRow[] {
  const rows = data
    .filter((d) => Number.isFinite(d.value) && d.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = rows.reduce((sum, d) => sum + d.value, 0);
  let running = 0;
  return rows.map((d) => {
    running += d.value;
    return {
      cumulative: total === 0 ? 0 : running / total,
      label: d.label,
      share: total === 0 ? 0 : d.value / total,
      value: d.value,
    };
  });
}

/** The number of leading rows it takes to reach `threshold` (the "vital few"). */
export function paretoCut(rows: readonly ParetoRow[], threshold = 0.8): number {
  const index = rows.findIndex((row) => row.cumulative >= threshold - 1e-9);
  return index === -1 ? rows.length : index + 1;
}

/* ------------------------------------------------------------------ uptime */

export type UptimeStatus = "degraded" | "down" | "maintenance" | "none" | "up";

/**
 * Share of observed buckets that were available. `degraded` counts as up (the
 * service answered), `maintenance` and `none` are excluded — a planned window
 * and a gap in monitoring are not downtime. Null when nothing was observed.
 */
export function uptimeRatio(
  statuses: readonly UptimeStatus[],
  { degradedCountsAsUp = true }: { degradedCountsAsUp?: boolean } = {},
): number | null {
  let observed = 0;
  let up = 0;
  for (const status of statuses) {
    if (status === "none" || status === "maintenance") continue;
    observed += 1;
    if (status === "up" || (status === "degraded" && degradedCountsAsUp)) up += 1;
  }
  return observed === 0 ? null : up / observed;
}

/* ------------------------------------------------------------------ scale */

/**
 * A nice linear domain covering `values` — used by the DOM-drawn forms
 * (dumbbell, bullet) that have no recharts axis to do it. Includes zero when
 * `zero` is set, and never collapses to a zero-width span.
 */
export function niceDomain(
  values: readonly number[],
  { zero = false }: { zero?: boolean } = {},
): [number, number] {
  const finite = values.filter(Number.isFinite);
  if (zero) finite.push(0);
  if (finite.length === 0) return [0, 1];
  let lo = Math.min(...finite);
  let hi = Math.max(...finite);
  if (lo === hi) {
    const pad = Math.abs(lo) || 1;
    lo -= pad;
    hi += pad;
  }
  const raw = (hi - lo) / 5;
  const exponent = Math.floor(Math.log10(raw));
  const base = 10 ** exponent;
  const fraction = raw / base;
  const step = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * base;
  const clean = (v: number) => Number(v.toPrecision(12));
  return [clean(Math.floor(lo / step) * step), clean(Math.ceil(hi / step) * step)];
}

/** Position of `value` in `domain` as a 0–100 percentage, clamped. */
export function percentOf(value: number, [lo, hi]: readonly [number, number]): number {
  if (hi === lo) return 0;
  return Math.max(0, Math.min(100, ((value - lo) / (hi - lo)) * 100));
}

/* ------------------------------------------------------------------ cohort */

export type CohortRow = {
  /** Cohort name ("Jan 2026", "Week of Sep 1"). */
  label: string;
  /** Cohort size at period 0; defaults to `values[0]`. */
  size?: number;
  /**
   * One reading per period since the cohort started. Counts, or shares when
   * the chart's `valueKind` is `"share"`. `null` is a period not reached yet.
   */
  values: Array<number | null>;
};

/** Each cell as a share (0–1) of its cohort's size. */
export function cohortShares(
  rows: readonly CohortRow[],
  valueKind: "count" | "share" = "count",
): Array<Array<number | null>> {
  return rows.map((row) => {
    const size = row.size ?? row.values[0] ?? 0;
    return row.values.map((value) => {
      if (value == null || !Number.isFinite(value)) return null;
      if (valueKind === "share") return value;
      return size > 0 ? value / size : null;
    });
  });
}

/**
 * The size-weighted average share per period across the cohorts that reached
 * it — the "average" row every retention table ends with.
 */
export function cohortAverages(
  rows: readonly CohortRow[],
  shares: ReadonlyArray<ReadonlyArray<number | null>>,
): Array<number | null> {
  const periods = Math.max(0, ...shares.map((row) => row.length));
  return Array.from({ length: periods }, (_, period) => {
    let weight = 0;
    let sum = 0;
    shares.forEach((row, index) => {
      const share = row[period];
      if (share == null) return;
      const size = rows[index]!.size ?? rows[index]!.values[0] ?? 1;
      weight += size;
      sum += share * size;
    });
    return weight === 0 ? null : sum / weight;
  });
}

/* ------------------------------------------------------------ regression */

/** Ordinary least squares fit of y on x, with R². Null below two points. */
export function linearFit(
  points: ReadonlyArray<{ x: number; y: number }>,
): { intercept: number; r2: number; slope: number } | null {
  const valid = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const n = valid.length;
  if (n < 2) return null;
  const mx = valid.reduce((sum, p) => sum + p.x, 0) / n;
  const my = valid.reduce((sum, p) => sum + p.y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const p of valid) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  return {
    intercept: my - slope * mx,
    r2: syy === 0 ? 1 : (sxy * sxy) / (sxx * syy),
    slope,
  };
}

/* ------------------------------------------------------------------ ecdf */

/** Empirical CDF steps: for each distinct sorted value, the share ≤ it. */
export function ecdf(samples: readonly number[]): Array<{ share: number; value: number }> {
  const sorted = samples.filter(Number.isFinite).sort((a, b) => a - b);
  const out: Array<{ share: number; value: number }> = [];
  sorted.forEach((value, index) => {
    const share = (index + 1) / sorted.length;
    if (out.length && out[out.length - 1]!.value === value) out[out.length - 1]!.share = share;
    else out.push({ share, value });
  });
  return out;
}

/* ---------------------------------------------------------------- waffle */

/** Largest-remainder rounding of shares to whole cells that sum to `cells`. */
export function waffleCells(values: readonly number[], total: number, cells: number): number[] {
  if (total <= 0) return values.map(() => 0);
  const raw = values.map((value) => (Math.max(0, value) / total) * cells);
  const floor = raw.map(Math.floor);
  const target = Math.min(cells, Math.round(raw.reduce((sum, v) => sum + v, 0)));
  let left = target - floor.reduce((sum, v) => sum + v, 0);
  const order = raw
    .map((value, index) => ({ index, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest);
  for (const { index } of order) {
    if (left <= 0) break;
    floor[index] = floor[index]! + 1;
    left -= 1;
  }
  // A nonzero part always gets at least one cell, taken from the largest
  // part: a legend row with no cells reads as an error.
  values.forEach((value, index) => {
    if (value > 0 && floor[index] === 0) {
      const largest = floor.indexOf(Math.max(...floor));
      if (floor[largest]! > 1) {
        floor[largest] = floor[largest]! - 1;
        floor[index] = 1;
      }
    }
  });
  return floor;
}
