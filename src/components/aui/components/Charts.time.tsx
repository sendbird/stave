import { ReferenceArea } from "recharts";

import { vars } from "../tokens/tokens.stylex";
import {
  timeLabelFormatter,
  timeTickFormatter,
  toEpoch,
} from "../utils/chart-transform";
import { axisTick } from "./Charts.config";
import { plotLabelHalo } from "./Charts.reference";
import type { ChartSpan, ChartSpanTone, ChartTimeAxis } from "./Charts.options";

/*
 * The time axis, axis spans and log value scale shared by the axis charts
 * (2026-11-02). Kept out of `Charts.axes.tsx` so that file only wires them in.
 */

/** A `timeAxis` prop resolved against the drawn times. */
export type ResolvedTimeAxis = {
  /** Tooltip / readout heading for one instant. */
  label: (time: number) => string;
  /** Tick text. */
  tick: (time: number) => string;
};

export function resolveTimeAxis(
  timeAxis: ChartTimeAxis | undefined,
  times: ReadonlyArray<number | null>,
): ResolvedTimeAxis | null {
  if (!timeAxis) return null;
  const options = typeof timeAxis === "object" ? timeAxis : {};
  const known = times.filter((time): time is number => time != null);
  const span = known.length > 1 ? Math.max(...known) - Math.min(...known) : 0;
  return {
    label: timeLabelFormatter(options),
    tick: options.format ?? timeTickFormatter(span, options),
  };
}

/** XAxis props for a time axis: numeric, time-scaled, fitted to the data. */
export function timeXAxisProps(time: ResolvedTimeAxis) {
  return {
    dataKey: "time",
    domain: ["dataMin", "dataMax"] as [string, string],
    scale: "time" as const,
    tickFormatter: time.tick,
    type: "number" as const,
  };
}

/**
 * Rows with a numeric `time` for a time axis. Rows whose `time` does not parse
 * are dropped, since a point with no instant has no place on the axis; the
 * input order is kept (sort upstream if the feed is out of order).
 */
export function withEpochTimes<T extends { time?: unknown }>(
  rows: readonly T[],
): Array<T & { time: number }> {
  return rows.flatMap((row) => {
    const time = toEpoch(row.time);
    return time == null ? [] : [{ ...row, time }];
  });
}

const spanWash: Record<ChartSpanTone, string> = {
  danger: vars["--aui-color-danger-soft"],
  // `border-subtle` at half opacity all but vanished; a neutral span needs the
  // regular border step to read as a stretch of the axis.
  neutral: vars["--aui-color-border"],
  success: vars["--aui-color-success-soft"],
  warning: vars["--aui-color-warning-soft"],
};

/** An axis position for a span end or an annotation: a label, or a time. */
export function axisPosition(
  at: Date | number | string,
  labels: readonly string[] | undefined,
  times: ReadonlyArray<number | null> | undefined,
): number | string | null {
  if (times) {
    if (
      typeof at === "number" &&
      Number.isInteger(at) &&
      at >= 0 &&
      at < times.length
    ) {
      return times[at] ?? null;
    }
    if (typeof at === "string" && labels?.includes(at))
      return times[labels.indexOf(at)] ?? null;
    return toEpoch(at);
  }
  if (typeof at === "number") return labels?.[at] ?? null;
  if (typeof at === "string") return labels && !labels.includes(at) ? null : at;
  return null;
}

/** Washes behind the data between two axis positions; unknown ends are skipped. */
export function spanMarks(
  spans: ChartSpan[] | undefined,
  labels: readonly string[] | undefined,
  times: ReadonlyArray<number | null> | undefined,
) {
  if (!spans?.length) return null;
  return spans.map((span, index) => {
    const x1 = axisPosition(span.from, labels, times);
    const x2 = axisPosition(span.to, labels, times);
    if (x1 == null || x2 == null) return null;
    return (
      <ReferenceArea
        className="atelier-chart-span"
        fill={spanWash[span.tone ?? "neutral"]}
        fillOpacity={span.tone && span.tone !== "neutral" ? 0.6 : 0.5}
        ifOverflow="hidden"
        key={`span-${index}`}
        label={
          span.label
            ? // Halo: the series inside the span (an incident spike) runs
              // straight through its name otherwise.
              {
                ...axisTick,
                ...plotLabelHalo,
                position: "insideTop",
                value: span.label,
              }
            : undefined
        }
        x1={x1}
        x2={x2}
      />
    );
  });
}

export { logAxis } from "../utils/chart-transform";

/**
 * Each row's labelled span ("Incident"), for the table twin and the keyboard
 * readout — a span is otherwise only a wash a screen reader never meets.
 * Null when no labelled span covers any row.
 */
export function spanLabelsAt(
  spans: ChartSpan[] | undefined,
  labels: readonly string[],
  times: ReadonlyArray<number | null> | undefined,
): Array<string | null> | null {
  const labelled = spans?.filter((span) => span.label);
  if (!labelled?.length) return null;
  const out: Array<string | null> = labels.map(() => null);
  const add = (index: number, label: string) => {
    out[index] = out[index] ? `${out[index]}, ${label}` : label;
  };
  for (const span of labelled) {
    if (times) {
      const a = axisPosition(span.from, labels, times);
      const b = axisPosition(span.to, labels, times);
      if (typeof a !== "number" || typeof b !== "number") continue;
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      times.forEach((time, index) => {
        if (time != null && time >= lo && time <= hi) add(index, span.label!);
      });
    } else {
      const at = (end: ChartSpan["from"]) =>
        typeof end === "number"
          ? Math.floor(end)
          : typeof end === "string"
            ? labels.indexOf(end)
            : -1;
      const a = at(span.from);
      const b = at(span.to);
      if (a < 0 || b < 0) continue;
      for (
        let index = Math.min(a, b);
        index <= Math.max(a, b) && index < labels.length;
        index += 1
      )
        add(index, span.label!);
    }
  }
  return out.some(Boolean) ? out : null;
}

/** A value a log axis can draw (positive), or null. */
export const logSafe = (value: unknown) =>
  typeof value === "number" && value > 0 ? value : null;
