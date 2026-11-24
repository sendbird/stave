import { i18n } from "@/i18n";

import { vars } from "../tokens/tokens.stylex";

/* TimelineChart helpers: tone ink and words, time parsing, tick placement. Split from Charts.timeline.tsx. */

/** Status tone of a timeline bar. */
export type TimelineTone =
  | "danger"
  | "info"
  | "neutral"
  | "success"
  | "warning";

export const TIMELINE_DAY_MS = 86_400_000;
export const toneInk: Record<TimelineTone, string> = {
  danger: vars["--aui-color-danger"],
  info: vars["--aui-color-info"],
  neutral: vars["--aui-color-text-subtle"],
  success: vars["--aui-color-success"],
  warning: vars["--aui-color-warning"],
};

/** Legend words for a status tone; override with a group when you need your own. */
export const TONE_WORD: Record<TimelineTone, string> = {
  get danger() {
    return i18n.t("ui:timeline.tone.danger");
  },
  get info() {
    return i18n.t("ui:timeline.tone.info");
  },
  get neutral() {
    return i18n.t("ui:timeline.tone.neutral");
  },
  get success() {
    return i18n.t("ui:timeline.tone.success");
  },
  get warning() {
    return i18n.t("ui:timeline.tone.warning");
  },
};

export const ms = (value: Date | number | string) =>
  value instanceof Date
    ? value.getTime()
    : typeof value === "number"
      ? value
      : Date.parse(value);

export const dayFormat = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
export const monthFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});
export const timeFormat = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

/**
 * Evenly stepped positions from the first multiple of `step` at or after `lo`
 * up to `hi` (F7, 2026-11-08). The one tick loop for every time axis: the
 * hour ticks below, `TimelineChart lanes` `tickEvery`, and `Plan` schedule's
 * `tickEvery`. `open` drops the two ends (a schedule's 0 and its span are the
 * track edges, not ticks). A non-positive step yields no ticks.
 */
export function stepTicks(
  lo: number,
  hi: number,
  step: number,
  { open = false }: { open?: boolean } = {},
): number[] {
  const out: number[] = [];
  if (!(step > 0)) return out;
  for (let t = Math.ceil(lo / step) * step; open ? t < hi : t <= hi; t += step)
    if (!open || t > lo) out.push(t);
  return out;
}

/**
 * Keeps every nth tick so labels `labelPx` apart never collide on a track
 * `trackPx` wide. `anchor="end"` keeps the last tick (a lanes axis ending at
 * "now"); `"start"` keeps the first.
 */
export function thinTicks<T>(
  ticks: readonly T[],
  labelPx: number,
  trackPx: number,
  anchor: "end" | "start" = "start",
): T[] {
  const every = Math.max(
    1,
    Math.ceil((ticks.length * labelPx) / Math.max(1, trackPx)),
  );
  return ticks.filter(
    (_, index) =>
      (anchor === "end" ? ticks.length - 1 - index : index) % every === 0,
  );
}

/** Whether a "now" instant falls on the axis, so its rule is drawn. */
export const inTimeDomain = (
  at: number | null | undefined,
  domain: readonly [number, number],
): at is number => at != null && at >= domain[0] && at <= domain[1];

/** Tick positions on whole days, weeks or months, whichever gives 3–8 ticks. */
export function timeTicks(
  lo: number,
  hi: number,
): Array<{ at: number; label: string }> {
  const span = hi - lo;
  if (span <= 2 * TIMELINE_DAY_MS) {
    const step = span <= 6 * 3_600_000 ? 3_600_000 : 6 * 3_600_000;
    return stepTicks(lo, hi, step).map((t) => ({
      at: t,
      label: timeFormat.format(t),
    }));
  }
  if (span <= 70 * TIMELINE_DAY_MS) {
    const step = span <= 10 * TIMELINE_DAY_MS ? TIMELINE_DAY_MS : 7 * TIMELINE_DAY_MS;
    const out = [];
    for (let t = Math.ceil(lo / TIMELINE_DAY_MS) * TIMELINE_DAY_MS; t <= hi; t += step)
      out.push({ at: t, label: dayFormat.format(t) });
    return out;
  }
  const out = [];
  const d = new Date(lo);
  let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  const every = span > 400 * TIMELINE_DAY_MS ? 3 : 1;
  let i = 0;
  while (t <= hi) {
    if (i % every === 0) out.push({ at: t, label: monthFormat.format(t) });
    const n = new Date(t);
    t = Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 1);
    i += 1;
  }
  return out;
}

export function duration(msSpan: number) {
  const days = msSpan / TIMELINE_DAY_MS;
  if (days >= 1)
    return `${Math.round(days * 10) / 10} ${days === 1 ? "day" : "days"}`;
  const hours = msSpan / 3_600_000;
  if (hours >= 1) return `${Math.round(hours * 10) / 10} h`;
  return `${Math.round(msSpan / 60_000)} min`;
}
