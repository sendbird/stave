/**
 * Axis ticks carry the values that are not directly labelled, so they have to
 * stay readable at four digits and beyond: thousands are grouped, and anything
 * past 9,999 compacts (12.4K, 3.1M) rather than widening the axis gutter.
 *
 * Split out of `Charts.tsx` when the theme-target host-composition contract
 * pushed the component past the repo's size ratchet — the same split
 * `Charts.states.tsx`, `Charts.styles.ts`, and `Charts.config.ts` already use.
 * Pure formatting with no chart imports, so it never imports back from
 * `Charts.tsx`.
 */
const compactFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  notation: "compact",
});
const groupedFormat = new Intl.NumberFormat("en-US");

export function formatChartValue(value: number | string): string {
  if (typeof value !== "number" || !Number.isFinite(value))
    return String(value);
  return Math.abs(value) >= 10_000
    ? compactFormat.format(value)
    : groupedFormat.format(value);
}

/**
 * The read-out form of a value: every place a reader reads one number exactly —
 * the tooltip, the legend's value column, the table twin — as opposed to an axis
 * tick that only has to place it. Grouped (18,960 · 0.873), never compacted,
 * because a tooltip that rounds 18,960 to "19K" states less than the chart knows.
 * The default for `BaseChartProps.formatValue`.
 */
export function formatChartReadout(value: number | string): string {
  if (typeof value !== "number" || !Number.isFinite(value))
    return String(value);
  return groupedFormat.format(value);
}

const shareFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  style: "percent",
});

/**
 * A 0–1 share as a percentage (0.624 → "62.4%"). The value axis and the
 * readouts of a `stacked: "percent"` chart, where every value is a share.
 */
export function formatChartShare(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  // A real but tiny share must not print as "0%" beside a nonzero value.
  if (value > 0 && value < 0.0005) return "<0.1%";
  return shareFormat.format(value);
}

/** A series' share of its stack in one row (0–1), or null outside percent mode. */
export function shareOf(
  row: Record<string, unknown>,
  key: string,
  groups: Record<string, string[]> | undefined,
): number | null {
  const members = groups?.[key];
  const cell = row[key];
  if (!members || typeof cell !== "number") return null;
  const total = members.reduce((sum, member) => {
    const value = row[member];
    return typeof value === "number" ? sum + Math.abs(value) : sum;
  }, 0);
  return total === 0 ? 0 : Math.abs(cell) / total;
}

/** Signed change between two readings, formatted like the values. */
export function formatDelta(
  current: number,
  previous: number,
  formatValue: (value: number) => string,
) {
  // Round away float noise before formatting: 6.1 − 6.8 is −0.7000000000000002,
  // and a caller's `(v) => \`${v}%\`` would print every digit of it.
  const delta = Number((current - previous).toPrecision(12));
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "±";
  return `${sign}${formatValue(Math.abs(delta))}`;
}

/* ------------------------------------------------------------ presets */

type PresetOptions = {
  /** Digits after the point. Defaults are per preset. */
  digits?: number;
  locale?: string;
};

const clean = (value: number) => Number(value.toPrecision(12));

/**
 * Ready-made value formatters for chart props (`formatValue`,
 * `formatAxisValue`, `formatX`, …). Each rounds away float noise first, so
 * `chartFormat.percent()` prints `0.7%` where `` (v) => `${v}%` `` printed
 * `0.7000000000000002%`.
 */
export const chartFormat = {
  /** 12,900 → "12.9K"; axis-friendly. */
  compact: ({ digits = 1, locale = "en-US" }: PresetOptions = {}) => {
    const f = new Intl.NumberFormat(locale, { maximumFractionDigits: digits, notation: "compact" });
    return (value: number) => f.format(clean(value));
  },
  /** $1,234.50, or compact ($1.2M) with `compact: true`. */
  currency: ({
    compact = false,
    currency = "USD",
    digits,
    locale = "en-US",
  }: PresetOptions & { compact?: boolean; currency?: string } = {}) => {
    const f = new Intl.NumberFormat(locale, {
      currency,
      maximumFractionDigits: digits ?? (compact ? 1 : 2),
      notation: compact ? "compact" : "standard",
      style: "currency",
    });
    return (value: number) => f.format(clean(value));
  },
  /**
   * A duration from a number in `unit` (default ms): 950 → "950ms",
   * 1500 → "1.5s", 90_000 → "1.5m", 5_400_000 → "1.5h", days past 48h.
   */
  duration: ({ digits = 1, unit = "ms" }: { digits?: number; unit?: "h" | "m" | "ms" | "s" } = {}) => {
    const scale = { h: 3_600_000, m: 60_000, ms: 1, s: 1000 }[unit];
    const round = (n: number) => Number(n.toFixed(digits)).toString();
    return (value: number) => {
      const ms = clean(value * scale);
      const sign = ms < 0 ? "−" : "";
      const a = Math.abs(ms);
      if (a < 1000) return `${sign}${round(a)}ms`;
      if (a < 60_000) return `${sign}${round(a / 1000)}s`;
      if (a < 3_600_000) return `${sign}${round(a / 60_000)}m`;
      if (a < 172_800_000) return `${sign}${round(a / 3_600_000)}h`;
      return `${sign}${round(a / 86_400_000)}d`;
    };
  },
  /** Grouped number with fixed digits: 1,234.5. */
  number: ({ digits = 2, locale = "en-US" }: PresetOptions = {}) => {
    const f = new Intl.NumberFormat(locale, { maximumFractionDigits: digits });
    return (value: number) => f.format(clean(value));
  },
  /**
   * A percentage. `from: "percent"` (default) reads 12.5 as "12.5%";
   * `from: "ratio"` reads 0.125 as "12.5%".
   */
  percent: ({
    digits = 1,
    from = "percent",
    locale = "en-US",
  }: PresetOptions & { from?: "percent" | "ratio" } = {}) => {
    const f = new Intl.NumberFormat(locale, { maximumFractionDigits: digits, style: "percent" });
    return (value: number) => f.format(clean(from === "ratio" ? value : value / 100));
  },
  /**
   * Every preset above bound to one locale, plus date readers — for a product
   * that shows Korean (or any) number and date conventions. Opt-in: charts keep
   * their en-US defaults until a formatter from here is passed.
   *
   * `chartFormat.locale("ko-KR").compact(12_900)` → "1.3만";
   * `.currency("KRW")(12_000_000)` → "₩12,000,000"; `.date(Date.now())` → "11월 2일 (월)".
   */
  locale: (locale: string, { timeZone }: { timeZone?: string } = {}) => {
    const compact = new Intl.NumberFormat(locale, { maximumFractionDigits: 1, notation: "compact" });
    const grouped = new Intl.NumberFormat(locale);
    const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone, weekday: "short" });
    const clock = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone });
    return {
      /** Axis ticks: compact past 9,999. */
      axis: (value: number) => (Math.abs(value) >= 10_000 ? compact.format(clean(value)) : grouped.format(clean(value))),
      compact: (value: number) => compact.format(clean(value)),
      currency: (currency: string, options: { compact?: boolean; digits?: number } = {}) =>
        chartFormat.currency({ ...options, currency, locale }),
      date: (time: Date | number) => day.format(time),
      percent: (options: { digits?: number; from?: "percent" | "ratio" } = {}) =>
        chartFormat.percent({ ...options, locale }),
      /** Readouts: grouped, never compacted. */
      readout: (value: number) => grouped.format(clean(value)),
      time: (time: Date | number) => clock.format(time),
    };
  },
  /** A value with a unit suffix: bytes-like or custom ("12.5 GB"). */
  unit: (suffix: string, { digits = 1, locale = "en-US" }: PresetOptions = {}) => {
    const f = new Intl.NumberFormat(locale, { maximumFractionDigits: digits });
    return (value: number) => `${f.format(clean(value))}${suffix.startsWith(" ") ? suffix : ` ${suffix}`}`;
  },
} as const;

/* ---------------------------------------------------------------- csv */

/** RFC 4180 CSV of a table (header row first); cells with , " or newline are quoted. */
export function tableToCsv(
  columns: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<number | string>>,
): string {
  const cell = (value: number | string) => {
    const text = typeof value === "number" ? String(clean(value)) : value;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [columns, ...rows].map((row) => row.map(cell).join(",")).join("\r\n");
}

/** A filesystem-safe name from a chart title. */
export function csvFileName(title: unknown): string {
  const base = typeof title === "string" && title.trim() ? title : "chart";
  return `${base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "chart"}.csv`;
}
