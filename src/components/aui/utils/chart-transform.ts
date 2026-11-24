/**
 * Pure data transforms behind the chart family's opt-in capabilities
 * (2026-11-02 expansion): downsampling, rolling statistics, time values,
 * readable summaries and the diverging (Likert) layout. No React and no chart
 * imports, so every function is unit-testable and safe to call in a product's
 * own data layer before the rows reach a chart.
 */

/** A reading that may be missing. */
type Reading = number | null | undefined;

const isNumber = (value: Reading): value is number =>
  typeof value === "number" && Number.isFinite(value);

/* ------------------------------------------------------------ downsample */

/**
 * Largest-Triangle-Three-Buckets: the indexes of at most `threshold` points
 * that keep the visual shape of a series — peaks and dips survive, flat runs
 * thin out. First and last observed points are kept (only the first when
 * `threshold` is 1); missing readings are never chosen. Returns every observed
 * index when the series already fits. Never returns more than `threshold`.
 */
export function lttbIndices(
  values: readonly Reading[],
  threshold: number,
): number[] {
  const observed: number[] = [];
  values.forEach((value, index) => {
    if (isNumber(value)) observed.push(index);
  });
  const limit = Math.max(1, Math.floor(threshold));
  if (observed.length <= limit) return observed;
  // Below three there is no middle to choose: keep the ends.
  if (limit === 1) return [observed[0]!];
  if (limit === 2) return [observed[0]!, observed[observed.length - 1]!];
  const picked = [observed[0]!];
  const bucketSize = (observed.length - 2) / (limit - 2);
  let a = 0;
  for (let bucket = 0; bucket < limit - 2; bucket += 1) {
    const start = Math.floor(bucket * bucketSize) + 1;
    const end = Math.min(
      Math.floor((bucket + 1) * bucketSize) + 1,
      observed.length - 1,
    );
    const nextStart = end;
    const nextEnd = Math.min(
      Math.floor((bucket + 2) * bucketSize) + 1,
      observed.length,
    );
    let avgX = 0;
    let avgY = 0;
    const span = Math.max(1, nextEnd - nextStart);
    for (let k = nextStart; k < nextEnd; k += 1) {
      avgX += observed[k]!;
      avgY += values[observed[k]!] as number;
    }
    avgX /= span;
    avgY /= span;
    const ax = observed[a]!;
    const ay = values[ax] as number;
    let best = start;
    let bestArea = -1;
    for (let k = start; k < end; k += 1) {
      const x = observed[k]!;
      const y = values[x] as number;
      const area = Math.abs((ax - avgX) * (y - ay) - (ax - x) * (avgY - ay));
      if (area > bestArea) {
        bestArea = area;
        best = k;
      }
    }
    picked.push(observed[best]!);
    a = best;
  }
  picked.push(observed[observed.length - 1]!);
  return picked;
}

/**
 * Buckets a long series into `buckets` points: each bucket's mean as the value
 * and its min–max as a `range` row, so a summary line keeps the spikes it
 * averaged away visible as an envelope. Labels come from each bucket's first
 * point. Use it in the data layer (or a server) for the "many points" recipe.
 */
export function bucketEnvelope<
  T extends { label: string; value: Reading; time?: unknown },
>(
  data: readonly T[],
  buckets: number,
): {
  data: Array<{ label: string; time?: unknown; value: number | null }>;
  range: Array<{ high: number | null; low: number | null }>;
} {
  const count = Math.max(1, Math.floor(buckets));
  if (data.length <= count) {
    return {
      data: data.map((point) => ({
        label: point.label,
        time: point.time,
        value: isNumber(point.value) ? point.value : null,
      })),
      range: data.map((point) =>
        isNumber(point.value)
          ? { high: point.value, low: point.value }
          : { high: null, low: null },
      ),
    };
  }
  const size = data.length / count;
  const out: ReturnType<typeof bucketEnvelope>["data"] = [];
  const range: ReturnType<typeof bucketEnvelope>["range"] = [];
  for (let bucket = 0; bucket < count; bucket += 1) {
    const slice = data.slice(
      Math.floor(bucket * size),
      Math.floor((bucket + 1) * size),
    );
    const values = slice.map((point) => point.value).filter(isNumber);
    const first = slice[0]!;
    out.push({
      label: first.label,
      time: first.time,
      value: values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : null,
    });
    range.push(
      values.length
        ? {
            high: values.reduce((a, b) => (b > a ? b : a)),
            low: values.reduce((a, b) => (b < a ? b : a)),
          }
        : { high: null, low: null },
    );
  }
  return { data: out, range };
}

/* --------------------------------------------------------- rolling stats */

/**
 * Trailing mean over `window` readings, aligned to the input. A point gets a
 * value once the window holds `window` observed readings; missing readings
 * neither count nor break the window. Rounds away float noise.
 */
export function movingAverage(
  values: readonly Reading[],
  window: number,
): Array<number | null> {
  const size = Math.max(1, Math.floor(window));
  const recent: number[] = [];
  return values.map((value) => {
    if (isNumber(value)) {
      recent.push(value);
      if (recent.length > size) recent.shift();
    }
    if (recent.length < size || !isNumber(value)) return null;
    return Number(
      (recent.reduce((sum, item) => sum + item, 0) / size).toPrecision(12),
    );
  });
}

/**
 * The usual range of each reading, from the `window` readings before it: mean
 * ± `spread` standard deviations. The current reading is excluded, so a spike
 * cannot widen its own band. Shaped for a chart's `range` prop.
 */
export function normalRange(
  values: readonly Reading[],
  { spread = 2, window = 7 }: { spread?: number; window?: number } = {},
): Array<{ high: number | null; low: number | null }> {
  const size = Math.max(2, Math.floor(window));
  const history: number[] = [];
  return values.map((value) => {
    let band: { high: number | null; low: number | null } = {
      high: null,
      low: null,
    };
    if (history.length >= size) {
      const recent = history.slice(-size);
      const mean = recent.reduce((sum, item) => sum + item, 0) / size;
      const variance =
        recent.reduce((sum, item) => sum + (item - mean) ** 2, 0) / size;
      const deviation = Math.sqrt(variance) * spread;
      band = {
        high: Number((mean + deviation).toPrecision(12)),
        low: Number((mean - deviation).toPrecision(12)),
      };
    }
    if (isNumber(value)) history.push(value);
    return band;
  });
}

/** Whether each reading falls outside its band (false where either is missing). */
export function outsideRange(
  values: readonly Reading[],
  range: ReadonlyArray<{ high: number | null; low: number | null } | undefined>,
): boolean[] {
  return values.map((value, index) => {
    const band = range[index];
    if (
      !isNumber(value) ||
      !band ||
      !isNumber(band.low) ||
      !isNumber(band.high)
    )
      return false;
    return value < band.low || value > band.high;
  });
}

/* ------------------------------------------------------------------ time */

/** A point's `time` as epoch milliseconds, or null when it does not parse. */
export function toEpoch(time: unknown): number | null {
  if (time instanceof Date)
    return Number.isFinite(time.getTime()) ? time.getTime() : null;
  if (typeof time === "number") return Number.isFinite(time) ? time : null;
  if (typeof time === "string" && time.trim()) {
    const parsed = Date.parse(time);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export type ChartTimeFormatOptions = {
  /** BCP 47 locale for tick and tooltip text. @default "en-US" */
  locale?: string;
  /** IANA zone the times are read in ("Asia/Seoul", "UTC"). @default the viewer's */
  timeZone?: string;
};

/**
 * A tick formatter for a time axis whose visible span is `span` ms: clock time
 * under two days, month and day under ~six months, month and year beyond.
 */
export function timeTickFormatter(
  span: number,
  { locale = "en-US", timeZone }: ChartTimeFormatOptions = {},
) {
  const day = 86_400_000;
  const options: Intl.DateTimeFormatOptions =
    span < 2 * day
      ? { hour: "2-digit", hourCycle: "h23", minute: "2-digit", timeZone }
      : span < 180 * day
        ? { day: "numeric", month: "short", timeZone }
        : { month: "short", timeZone, year: "numeric" };
  const format = new Intl.DateTimeFormat(locale, options);
  return (time: number) => format.format(time);
}

/** The full reading of one instant, for tooltips and readouts. */
export function timeLabelFormatter({
  locale = "en-US",
  timeZone,
}: ChartTimeFormatOptions = {}) {
  const format = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "short",
    timeZone,
  });
  return (time: number) => format.format(time);
}

/* --------------------------------------------------------------- summary */

export type ChartSummaryTable = {
  columns: readonly string[];
  rows: ReadonlyArray<ReadonlyArray<number | string>>;
};

/**
 * One sentence that states what a chart shows, from its table twin: the
 * latest reading and its change from the one before, then the high and the
 * low. Reads the first numeric column after the category. Empty when the table
 * has no numeric reading. Deterministic — no model, no guessing.
 */
export function summarizeChartTable(
  table: ChartSummaryTable,
  formatValue: (value: number) => string = (value) => String(value),
): string {
  const column = table.columns.findIndex(
    (_, index) =>
      index > 0 && table.rows.some((row) => typeof row[index] === "number"),
  );
  if (column < 1) return "";
  // A "Kind" column (partialFrom / projectedFrom) separates readings that are
  // final from ones still being counted or projected: only final readings
  // carry the change, the high and the low.
  const kind = table.columns.indexOf("Kind");
  const kindOf = (row: ReadonlyArray<number | string>) =>
    kind < 0 ? "Observed" : String(row[kind]);
  const numeric = table.rows.filter((row) => typeof row[column] === "number");
  const toPoint = (row: ReadonlyArray<number | string>) => ({
    label: String(row[0]),
    value: row[column] as number,
  });
  const points = numeric
    .filter((row) => kindOf(row) === "Observed")
    .map(toPoint);
  const unfinished = numeric
    .filter((row) => kindOf(row) === "In progress")
    .map(toPoint);
  const projected = numeric
    .filter((row) => kindOf(row) === "Projected")
    .map(toPoint);
  const name =
    table.columns[column] && table.columns[column] !== "Value"
      ? `${table.columns[column]} `
      : "";
  const parts: string[] = [];
  const last = points[points.length - 1];
  if (last) {
    parts.push(`${name}${last.label}: ${formatValue(last.value)}`);
    const prev = points[points.length - 2];
    if (prev) {
      const delta = last.value - prev.value;
      const relative = prev.value !== 0 ? Math.abs(delta / prev.value) : null;
      const size =
        relative == null
          ? formatValue(Math.abs(Number(delta.toPrecision(12))))
          : `${Number((relative * 100).toFixed(1))}%`;
      parts[0] +=
        delta === 0
          ? `, unchanged from ${prev.label}`
          : `, ${delta > 0 ? "up" : "down"} ${size} from ${prev.label}`;
    }
    if (points.length > 2) {
      const high = points.reduce((best, point) =>
        point.value > best.value ? point : best,
      );
      const low = points.reduce((best, point) =>
        point.value < best.value ? point : best,
      );
      parts.push(
        `High ${formatValue(high.value)} (${high.label}); low ${formatValue(low.value)} (${low.label})`,
      );
    }
  }
  const open = unfinished[unfinished.length - 1];
  if (open)
    parts.push(
      `${open.label} is still being counted (${formatValue(open.value)} so far)`,
    );
  const ahead = projected[projected.length - 1];
  if (ahead)
    parts.push(`Projected ${ahead.label}: ${formatValue(ahead.value)}`);
  return parts.length ? `${parts.join(". ")}.` : "";
}

/* ------------------------------------------------------------- diverging */

export type DivergingSpec = {
  /** Series keys read as the unfavourable side, innermost first. */
  negative: readonly string[];
  /** A middle answer, split evenly across the centre line. */
  neutral?: string;
};

/** Suffixes of the two halves a neutral series is drawn as. */
export const NEUTRAL_LOW = "__neutral_low";
export const NEUTRAL_HIGH = "__neutral_high";

/**
 * Rows for a diverging stack: negative keys negated so they stack left of
 * zero, the neutral split into two halves either side of it, and the original
 * values kept under `__raw` for tooltips and the table. Missing values read 0.
 */
export function divergingRows<
  T extends { label: string } & Record<string, unknown>,
>(
  data: readonly T[],
  spec: DivergingSpec,
): Array<T & { __raw: Record<string, number> }> {
  const negative = new Set(spec.negative);
  return data.map((row) => {
    const next: Record<string, unknown> = { ...row, __raw: {} };
    const raw = next.__raw as Record<string, number>;
    for (const [key, cell] of Object.entries(row)) {
      if (key === "label" || typeof cell !== "number") continue;
      raw[key] = cell;
      if (key === spec.neutral) {
        next[`${key}${NEUTRAL_LOW}`] = -cell / 2;
        next[`${key}${NEUTRAL_HIGH}`] = cell / 2;
      } else if (negative.has(key)) {
        next[key] = -Math.abs(cell);
      }
    }
    return next as T & { __raw: Record<string, number> };
  });
}

/* ------------------------------------------------------- axes, verdicts */

/**
 * Log-scale axis bounds and ticks: whole powers of ten around the positive
 * readings. Null when nothing positive is drawn.
 */
export function logAxis(values: ReadonlyArray<number | null | undefined>) {
  const positive = values.filter(
    (value): value is number => typeof value === "number" && value > 0,
  );
  if (!positive.length) return null;
  const lo = Math.floor(Math.log10(positive.reduce((a, b) => (b < a ? b : a))));
  const hi = Math.max(
    lo + 1,
    Math.ceil(Math.log10(positive.reduce((a, b) => (b > a ? b : a)))),
  );
  const ticks = Array.from(
    { length: hi - lo + 1 },
    (_, step) => 10 ** (lo + step),
  );
  return {
    domain: [ticks[0]!, ticks[ticks.length - 1]!] as [number, number],
    ticks,
  };
}

export type IntervalVerdict = "better" | "unclear" | "worse";

/** Whether an interval clears the reference, and which way that reads. */
export function intervalVerdict(
  d: { high: number; low: number },
  reference: number,
  goodDirection: "down" | "none" | "up",
): { side: "above" | "below" | null; verdict: IntervalVerdict } {
  const side =
    d.low > reference ? "above" : d.high < reference ? "below" : null;
  if (side == null) return { side, verdict: "unclear" };
  if (goodDirection === "none") return { side, verdict: "unclear" };
  return {
    side,
    verdict:
      (side === "above") === (goodDirection === "up") ? "better" : "worse",
  };
}
