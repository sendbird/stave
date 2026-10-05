/**
 * Locale-aware formatting that follows the Stave display language.
 *
 * Use these instead of `toLocaleString()` without arguments (which follows the
 * OS locale) or hardcoded `"en-US"`, so dates, numbers and relative times match
 * the rest of the UI.
 */
import { getIntlLocale } from "@/i18n/runtime";

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
