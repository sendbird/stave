import type * as React from "react";

import type {
  ChartTimeFormatOptions,
  DivergingSpec,
} from "../utils/chart-transform";

/**
 * Opt-in capabilities added to the chart family on 2026-11-02 (time axis,
 * partial periods, large-data thinning, log scale, KPI linking, pause, summary,
 * image export, diverging stacks and the rest). A sibling of `Charts.props.ts`,
 * which is at the source-size ceiling; the public prop types intersect these.
 *
 * Every option is off by default. A chart that sets none of them renders
 * exactly as it did before.
 */

/** Same four tones as reference marks, restated here to keep the import one-way. */
export type ChartSpanTone = "danger" | "neutral" | "success" | "warning";

/** Extra fields a `ChartPoint` may carry. */
export type ChartPointExtras = {
  /**
   * When the reading was taken — epoch ms, a `Date`, or an ISO string. Read
   * only with `timeAxis`, which spaces points by real time instead of by
   * position; `label` stays the reading's name in tooltips and the table.
   */
  time?: Date | number | string;
};

/** Extra fields a `ChartSeries` may carry. */
export type ChartSeriesExtras = {
  /**
   * A texture over the series fill (bar and area kinds) so the series is told
   * apart without color — in print, forced colors, or for a color-blind
   * reader. The legend swatch carries the same texture.
   */
  pattern?: ChartPattern;
};

export type ChartPattern = "dots" | "hatch";

/** How the time axis reads its times. `true` uses the viewer's zone and en-US. */
export type ChartTimeAxis =
  | boolean
  | (ChartTimeFormatOptions & {
      /** Tick text; defaults to a span-aware clock/date/month format. */
      format?: (time: number) => string;
    });

/** A stretch of the category or time axis washed behind the data. */
export type ChartSpan = {
  /** Start: a category label or index, or a time with `timeAxis`. */
  from: Date | number | string;
  label?: string;
  /** @default "neutral" */
  tone?: ChartSpanTone;
  to: Date | number | string;
};

/** The point a pointer or the keyboard is on, as `onActivePointChange` reports it. */
export type ChartActivePoint = {
  index: number;
  label: string;
  value: number | null;
};

/** Options every axis chart takes (`AreaChart`, `LineChart`, `BarChart`, `SeriesChart`). */
export type ChartExpansionOptions = {
  /**
   * Fires with the point a pointer hovers or the keyboard makes active, and
   * with `null` when it leaves — wire it to a `StatTile`'s `activePoint` so the
   * headline number reads the same moment the chart does.
   */
  onActivePointChange?: (point: ChartActivePoint | null) => void;
  /**
   * Freeze what is drawn while the data keeps arriving: the plot holds the
   * rows it had when `paused` turned on and catches up when it turns off.
   * For live charts a reader needs to stop to read. @default false
   */
  paused?: boolean;
  /** Stretches of the axis washed behind the data — an incident window, a weekend. */
  spans?: ChartSpan[];
  /**
   * Space points by their `time` instead of evenly by position, so a gap of
   * a minute and a gap of an hour look different. Line, area and series
   * line/area forms; points without a parseable `time` are dropped.
   */
  timeAxis?: ChartTimeAxis;
  /**
   * `log` makes each step of the value axis ten times the last, for readings
   * that span orders of magnitude (latency, cost, account size). The axis says
   * so; zero and negative readings cannot be drawn and are left as gaps.
   * Bars are not drawn on a log scale. @default "linear"
   */
  valueScale?: "linear" | "log";
};

/** `AreaChart`, `LineChart` and `BarChart` (one series); `SeriesChart` does not take these. */
export type ChartSingleSeriesOptions = {
  /**
   * Thin a long series to at most this many points with LTTB, which keeps
   * peaks and dips; tooltips, the readout and the table read the drawn
   * points. For thousands of readings; pair with `bucketEnvelope` to keep the
   * hidden spread visible as a `range`.
   */
  maxPoints?: number;
  /**
   * The first category that is still being counted (today, this week) — a
   * label or index. It and everything after it draw dashed (line, area) or
   * washed out (bar), and the tooltip, readout and table say "In progress",
   * so an unfinished period never reads as a drop. Not combined with
   * `projectedFrom`, which wins.
   */
  partialFrom?: number | string;
};

/** Line and area only. */
export type ChartTrendOptions = {
  /**
   * Print the latest value at the end of the line, so the current reading is
   * read without a hover. @default false
   */
  endLabel?: boolean;
  /**
   * Mark readings outside `range` (an envelope or `normalRange`) with a
   * warning-ringed dot, and name them in the readout. @default false
   */
  markOutsideRange?: boolean;
  /**
   * A trailing mean drawn as a thin line over the readings — a number is the
   * window size. Its name is "N-point average" unless `label` says otherwise.
   */
  movingAverage?: number | { label?: string; window: number };
  /**
   * Color the run above `baseline` (default zero) and the run below it
   * differently — profit and loss, over and under target. `true` uses the
   * first palette slot above and `chartNegative` (coral) below; the tooltip
   * and table keep the sign.
   */
  signedFill?: boolean | { negative?: string; positive?: string };
};

/** Bar chart only. */
export type ChartBarOptions = {
  /**
   * Dim every bar except these labels — a cross-filter selection made in
   * another chart or a filter bar. Empty or omitted dims nothing.
   */
  highlightLabels?: string[];
  /** Keep the first N - 1 bars and sum the rest into "Other". */
  maxItems?: number;
};

/** `SeriesChart` only. */
export type SeriesExpansionOptions = {
  /**
   * Stack to the left and right of a centre line — Likert and CSAT answers,
   * new and returning against churned users. `negative` names the series that
   * stack left (innermost first) in a `chartNegative` (coral) ramp against a
   * `chart1` ramp; `neutral` is split across the centre. Values
   * stay positive in `data`; the tooltip and table read them as given.
   */
  diverging?: DivergingSpec;
  /** Name the series at the end of each line series. @default false */
  endLabels?: boolean;
  /** Keep this series (by label or key) at full ink and fade the rest. */
  focusSeries?: string;
};

/** Frame-level options every chart card forwards (`ChartStateProps`). */
/**
 * The headline number a chart card leads with (2026-11 refresh): the figure,
 * how it moved, and what it covers, above the plot.
 */
export type ChartHeadline = {
  /** What the figure covers ("Last 14 days"). Replaced by the hovered label. */
  caption?: React.ReactNode;
  /** How the figure moved ("+8.2%"). Hidden while a point is hovered. */
  delta?: React.ReactNode;
  /** What the movement means: a tinted chip for `success`/`danger`. @default "neutral" */
  deltaTone?: "danger" | "neutral" | "success";
  /**
   * On `AreaChart`, `LineChart` and `BarChart`, the figure follows the hovered
   * or keyboard-active point — its value through `formatValue`, its label as
   * the caption — and returns when the pointer leaves. @default true
   */
  follow?: boolean;
  /** The figure itself, already formatted ("13,340", "$48.2K"). */
  value: React.ReactNode;
};

/**
 * When a chart's data was last updated (2026-11 consensus review): live and
 * operational dashboards need to say how fresh a reading is, and when it has
 * gone stale, without hiding the last-known data.
 */
export type ChartFreshness = {
  /** Past this many milliseconds the header shows a Stale badge. */
  staleAfter?: number;
  /** When the data was last updated (Date, epoch ms or ISO string). */
  updatedAt: Date | number | string;
};

export type ChartFrameExtras = {
  /**
   * "Updated 2 min ago" in the header, with a Stale badge past `staleAfter`;
   * the plot stays readable either way. See `ChartFreshness`.
   */
  freshness?: ChartFreshness;
  /**
   * A headline figure between the header and the plot — the number the card
   * is about, with its delta and caption. See `ChartHeadline`.
   */
  headline?: ChartHeadline;
  /**
   * A one-sentence reading under the header. `true` writes it from the table
   * of an ordered axis chart (Area, Line, Bar, a columns SeriesChart): the
   * latest final value and its change, the high and the low, then what is
   * still being counted or projected. Every other form prints only the
   * sentence you pass. Screen readers reach it before the plot. @default false
   */
  summaryLine?: boolean | React.ReactNode;
};

export type { ChartEntranceOptions } from "./Charts.entrance";

/** Plotted (SVG) chart forms only — `BaseChartProps`. */
export type ChartImageOptions = {
  /**
   * A "Download image" action in the header: the plot as a PNG (or `.svg`
   * when the name ends in it) with the title and description drawn above it,
   * for a report or a message. `true` names the file from the title.
   * @default false
   */
  downloadImage?: boolean | string;
};

/** `PieChart` donut options (2026-11 refresh). */
export type ChartDonutOptions = {
  /**
   * Print the total in the donut's hole with a caption (`true` → "Total", or
   * the string you pass), and swap it for a slice's value and label while that
   * slice is hovered. `center` wins when both are set; ignored without
   * `donut`. @default false
   */
  centerTotal?: boolean | string;
};

/** `FunnelChart` options (2026-11 refresh). */
export type ChartFunnelOptions = {
  /**
   * `"bars"` draws each stage as a centred bar as wide as its share of the
   * first stage, in one hue, with the stage-to-stage conversion between bars —
   * lengths a reader can compare, where a trapezoid only gestures at them.
   * @default "funnel"
   */
  variant?: "bars" | "funnel";
};

/** `RadialBarChart` options (2026-11 refresh). */
export type ChartRadialOptions = {
  /**
   * The value a full ring stands for — `100` for completion or a percentage.
   * Without it the largest ring is drawn as a full circle, so "86% complete"
   * reads as done; set it whenever the rings are against a known whole.
   * @default the largest value
   */
  max?: number;
};
