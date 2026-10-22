/**
 * Locale-aware formatting that follows the Stave display language.
 *
 * Use these instead of `toLocaleString()` without arguments (which follows the
 * OS locale) or hardcoded `"en-US"`, so dates, numbers, relative times,
 * durations, token counts and costs read the same on every surface.
 */
import { getIntlLocale, i18n } from "@/i18n/runtime";

type DateInput = Date | number | string;

function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

const formatterCache = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat | Intl.RelativeTimeFormat | Intl.ListFormat>();

function cached<T extends Intl.DateTimeFormat | Intl.NumberFormat | Intl.RelativeTimeFormat | Intl.ListFormat>(
  kind: string,
  options: object | undefined,
  create: (locale: string) => T,
): T {
  const locale = getIntlLocale();
  const key = `${kind}|${locale}|${options ? JSON.stringify(options) : ""}`;
  let formatter = formatterCache.get(key) as T | undefined;
  if (!formatter) {
    formatter = create(locale);
    formatterCache.set(key, formatter);
  }
  return formatter;
}

export function formatDateTime(value: DateInput, options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "";
  return cached("dt", options, (locale) => new Intl.DateTimeFormat(locale, options)).format(date);
}

export function formatDate(value: DateInput, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }): string {
  return formatDateTime(value, options);
}

export function formatTime(value: DateInput, options: Intl.DateTimeFormatOptions = { timeStyle: "short" }): string {
  return formatDateTime(value, options);
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return cached("num", options, (locale) => new Intl.NumberFormat(locale, options)).format(value);
}

export function formatPercent(ratio: number, options: Intl.NumberFormatOptions = { maximumFractionDigits: 0 }): string {
  return formatNumber(ratio, { style: "percent", ...options });
}

export function formatList(items: readonly string[], options: Intl.ListFormatOptions = { type: "conjunction" }): string {
  return cached("list", options, (locale) => new Intl.ListFormat(locale, options)).format(items);
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["week", 7 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
  ["second", 1000],
];

/** "3 minutes ago" / "3분 전", "in 2 days" / "2일 후". */
export function formatRelativeTime(value: DateInput, now: DateInput = Date.now(), options: Intl.RelativeTimeFormatOptions = { numeric: "auto" }): string {
  const diff = toDate(value).getTime() - toDate(now).getTime();
  if (Number.isNaN(diff)) return "";
  const formatter = cached("rel", options, (locale) => new Intl.RelativeTimeFormat(locale, options)) as Intl.RelativeTimeFormat;
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(diff) >= size || unit === "second") {
      return formatter.format(Math.round(diff / size), unit);
    }
  }
  return formatter.format(0, "second");
}

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * The short relative form for scannable rows: `just now`, `2m ago`, `in 3h`,
 * `5d ago` (`방금`, `2분 전`, `3시간 후`, `5일 전`), then the date past a week
 * (`Oct 14`, with the year when it is not this year's).
 */
export function formatRelativeTimeShort(value: DateInput, now: DateInput = Date.now()): string {
  const date = toDate(value);
  const reference = toDate(now);
  const diff = date.getTime() - reference.getTime();
  if (Number.isNaN(diff)) return "";
  const abs = Math.abs(diff);
  if (abs < 45 * SECOND_MS) {
    return i18n.t(diff <= 0 ? "common:relativeTime.justNow" : "common:relativeTime.inMoments");
  }
  if (abs >= 7 * DAY_MS) {
    const sameYear = date.getFullYear() === reference.getFullYear();
    return formatDate(date, sameYear ? { month: "short", day: "numeric" } : { year: "numeric", month: "short", day: "numeric" });
  }
  const [unit, size]: [Intl.RelativeTimeFormatUnit, number] =
    abs < HOUR_MS ? ["minute", MINUTE_MS] : abs < DAY_MS ? ["hour", HOUR_MS] : ["day", DAY_MS];
  const options: Intl.RelativeTimeFormatOptions = { numeric: "always", style: "narrow" };
  const formatter = cached("rel", options, (locale) => new Intl.RelativeTimeFormat(locale, options)) as Intl.RelativeTimeFormat;
  return formatter.format(Math.round(diff / size), unit);
}

export interface DurationFormatOptions {
  /** The largest units shown: `2` (default) reads `1m 4s` and `1h 2m`; `1` reads `1m` and `1h`. */
  units?: 1 | 2;
  /** Tenths of a second under ten seconds (`0.4s`, `4.2s`); whole seconds otherwise. */
  tenths?: boolean;
  /**
   * Milliseconds under a second (`350ms`), for timings where the sub-second
   * part is the point: a script hook, a routing decision.
   */
  milliseconds?: boolean;
}

/**
 * One duration vocabulary for every surface: `<1s`, `45s`, `1m 4s`, `1h 2m`,
 * `2d 3h` (`1초 미만`, `45초`, `1분 4초`, `1시간 2분`, `2일 3시간`). Time counts
 * down to the unit shown, so a live clock never reads ahead of the real span,
 * and a negative or unreadable span reads as zero.
 */
export function formatDuration(ms: number, options: DurationFormatOptions = {}): string {
  const span = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  if (options.milliseconds && span < SECOND_MS) {
    return i18n.t("common:duration.milliseconds", { value: formatNumber(Math.floor(span)) });
  }
  if (options.tenths && span < 10 * SECOND_MS) {
    const tenths = Math.floor(span / 100) / 10;
    return i18n.t("common:duration.seconds", { value: formatNumber(tenths, { maximumFractionDigits: 1 }) });
  }
  // Something that took a moment did take time: it reads `<1s`, not `0s`.
  if (span > 0 && span < SECOND_MS) {
    return i18n.t("common:duration.underSecond");
  }
  const twoUnits = (options.units ?? 2) === 2;
  const totalSeconds = Math.floor(span / SECOND_MS);
  if (totalSeconds < 60) {
    return i18n.t("common:duration.seconds", { value: formatNumber(totalSeconds) });
  }
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) {
    const seconds = totalSeconds % 60;
    return twoUnits && seconds > 0
      ? i18n.t("common:duration.minutesSeconds", { minutes: totalMinutes, seconds })
      : i18n.t("common:duration.minutes", { value: totalMinutes });
  }
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) {
    const minutes = totalMinutes % 60;
    return twoUnits && minutes > 0
      ? i18n.t("common:duration.hoursMinutes", { hours: totalHours, minutes })
      : i18n.t("common:duration.hours", { value: totalHours });
  }
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return twoUnits && hours > 0
    ? i18n.t("common:duration.daysHours", { days: formatNumber(days), hours })
    : i18n.t("common:duration.days", { value: formatNumber(days) });
}

/**
 * How long something has run, from `since` to `now`, in the `formatDuration`
 * vocabulary. Empty when either instant is unreadable.
 */
export function formatElapsed(since: DateInput, now: DateInput = Date.now(), options?: DurationFormatOptions): string {
  const start = toDate(since).getTime();
  const end = toDate(now).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return "";
  return formatDuration(end - start, options);
}

/**
 * Token counts as people say them: `950`, `1.2k`, `18k`, `1.2M`, `18M`. One
 * decimal below ten of a unit, whole units above, with the locale's digits.
 */
export function formatTokenCount(count: number): string {
  const tokens = Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
  if (tokens < 1_000) return formatNumber(tokens);
  const thousands = tokens / 1_000;
  const shownThousands = thousands < 10 ? Math.round(thousands * 10) / 10 : Math.round(thousands);
  if (shownThousands < 1_000) {
    return `${formatNumber(shownThousands, { maximumFractionDigits: 1 })}k`;
  }
  const millions = tokens / 1_000_000;
  const shownMillions = millions < 10 ? Math.round(millions * 10) / 10 : Math.round(millions);
  return `${formatNumber(shownMillions, { maximumFractionDigits: 1 })}M`;
}

export interface CostFormatOptions {
  /**
   * `summary` (default) shows cents and reads anything under a cent as
   * `<$0.01`; `detail` keeps a small amount readable: `$0.012`, `$0.0012`.
   */
  precision?: "summary" | "detail";
}

const ISO_CURRENCY = /^[A-Z]{3}$/;

/**
 * Money a turn or run cost: `$1.24`, `<$0.01`. A reported ISO currency uses its
 * own symbol (`€1.24`); a plan unit such as credits follows the amount, in the
 * provider's own word (`0.0541 credits`).
 */
export function formatCost(amount: number, currency = "USD", options: CostFormatOptions = {}): string {
  const value = Number.isFinite(amount) ? amount : 0;
  const unit = currency.trim();
  const code = unit.toUpperCase();
  if (!ISO_CURRENCY.test(code)) {
    const digits = Math.abs(value) >= 1 ? 2 : 4;
    return `${formatNumber(value, { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${unit}`;
  }
  const detail = options.precision === "detail";
  const digits = !detail || Math.abs(value) >= 1 ? 2 : Math.abs(value) >= 0.01 ? 3 : 4;
  const money = (figure: number) =>
    formatNumber(figure, {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  if (!detail && value > 0 && value < 0.01) return `<${money(0.01)}`;
  return money(value);
}
