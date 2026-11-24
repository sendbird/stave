import type * as React from "react";

import type { XstyleProp } from "../utils/stylex";
import type {
  ChartBarOptions, ChartDonutOptions, ChartExpansionOptions, ChartFunnelOptions, ChartRadialOptions, ChartImageOptions, ChartPointExtras, ChartSeriesExtras, ChartSingleSeriesOptions, ChartTrendOptions, SeriesExpansionOptions,
} from "./Charts.options";
import type { ChartEntranceOptions } from "./Charts.entrance";
import type { ChartHeaderProps } from "./Charts.header";
import type { ChartFrameProps } from "./Charts.states";
import type { ChartStreamOptions } from "./Charts.stream";
import type {
  ChartTooltipOptions,
  ChartTooltipRenderer,
} from "./Charts.tooltip";

/**
 * The shared prop surface behind the chart family.
 *
 * A sibling module of `Charts.tsx` rather than part of it: the chart file is at
 * this package's source-size ceiling, and the props are the half of it that
 * nothing else in the file reads back. `Charts.tsx` re-exports the public names
 * from here, so the package's API is unchanged by the move.
 */
export type ChartPoint = ChartPointExtras & {
  /**
   * Stable semantic color override. Use for domain states (progress, review,
   * risk) through tokens such as `colorWorkflow*` or `colorPriority*`, never
   * to hand-pick nominal category colors.
   */
  color?: string;
  label: string;
  value: number;
};

export type ScatterPoint = {
  /** Category; each group takes a palette slot and a legend row. */
  group?: string;
  label?: string;
  /** Bubble size (area-scaled). */
  size?: number;
  x: number;
  y: number;
};

export type BaseChartProps = ChartFrameProps & ChartImageOptions & ChartEntranceOptions & ChartHeaderProps & {
  /** Override the series color (defaults to the accent token). */
  color?: string;
  data: ChartPoint[];
  /**
   * Value-axis tick text. The default compacts numbers (1,284 · 12.9K), which
   * is right for counts and wrong for anything carrying a unit — a percentage
   * axis reading `0 20 40` states the wrong quantity. Ticks only: the tooltip
   * is `renderTooltip`'s. Ignored by the forms that have no value axis.
   */
  formatAxisValue?: (value: number) => string;
  /**
   * How a value reads wherever it is read rather than placed: the default
   * tooltip body, the legend's value column, and the table twin. Defaults to
   * grouped numbers (18,960 · 0.873). Pass the unit here (`(v) => \`${v}%\``)
   * and to `formatAxisValue` for the ticks.
   */
  formatValue?: (value: number) => string;
  /**
   * Replaces the default tooltip body. See `ChartTooltipRenderer`. It owns
   * the whole body, so it wins over `tooltip` (the default body's options),
   * which then does nothing: render `ChartTooltipSurface` / `ChartTooltipRow`
   * to keep the default look while changing what it says.
   */
  renderTooltip?: ChartTooltipRenderer;
};

/** Status tone for a reference mark. Neutral is a plain rule (a target). */
export type ChartReferenceTone = "danger" | "neutral" | "success" | "warning";

/**
 * A horizontal rule across the plot at one value — a target, an SLO, an
 * average. Drawn dashed: a dashed line reads as a threshold, never as data.
 */
export type ChartReferenceLine = {
  /** Short name printed at the rule's end ("SLO 2s", "Target"). */
  label?: string;
  /** @default "neutral" */
  tone?: ChartReferenceTone;
  value: number;
};

/** A value range washed across the plot — an acceptable band, an alert zone. */
export type ChartReferenceBand = {
  from: number;
  label?: string;
  /** @default "neutral" */
  tone?: ChartReferenceTone;
  to: number;
};

/**
 * The previous period, aligned to `data` by position. It draws as a muted
 * dashed line that takes no palette slot, and the default tooltip states the
 * previous value and the signed change beside the current one.
 */
export type ChartComparison = {
  data: Array<{ label?: string; value: number | null }>;
  /** Legend/tooltip name. @default "Previous period" */
  label?: string;
};

/**
 * An event pinned to a category — a deploy, an incident, a pricing change.
 * Drawn as a thin vertical rule with a short label, so a spike can be read
 * against what caused it. Takes no palette slot.
 */
export type ChartAnnotation = {
  /** Category `label`, or its index in `data`. */
  at: number | string;
  label: string;
  /** @default "neutral" */
  tone?: ChartReferenceTone;
};

/** What `onSelectPoint` hands back: the datum and its position. */
export type ChartPointSelection<T = Record<string, unknown>> = {
  datum: T;
  index: number;
  label: string;
};

/** Declared beside the tooltip body that reads it (no import cycle). */
export type { ChartTooltipOptions };

/**
 * Capabilities shared by the axis charts (`AreaChart`, `LineChart`,
 * `BarChart`, `SeriesChart` columns). All are optional; omitting them renders
 * exactly as before.
 */
export type CartesianChartOptions = ChartStreamOptions & ChartExpansionOptions & {
  /** Events marked on the category axis (deploys, incidents, launches). */
  annotations?: ChartAnnotation[];
  /** Value bands washed behind the data. */
  bands?: ChartReferenceBand[];
  /**
   * A range selector under the plot for long series: drag the handles (or
   * focus one and use the arrow keys) to zoom the plot to a window. `true`
   * starts on the whole range; an object seeds the window by index.
   * `onBrushChange` reports the window as indexes into `data`.
   * @default false
   */
  brush?: boolean | { endIndex?: number; startIndex?: number };
  onBrushChange?: (range: { endIndex: number; startIndex: number }) => void;
  /**
   * Drill-down: called with the clicked category, and with the keyboard-active
   * one on Enter or Space. The plot shows a pointer cursor while it is set.
   */
  onSelectPoint?: (selection: ChartPointSelection) => void;
  /**
   * Keyboard exploration: the plot becomes one Tab stop; ArrowLeft/ArrowRight
   * step through categories, Home/End jump to the ends, Escape leaves. The
   * active point shows its tooltip and is announced politely.
   *
   * On by default for a chart with a `title` — a named chart is one a keyboard
   * user can be told about and reach — and off for an untitled one, which has
   * no name to announce and is usually a small figure inside another control.
   * `false` opts a titled chart out.
   * @default true when `title` is set, otherwise false
   */
  keyboard?: boolean;
  /** Rules drawn over the plot at fixed values. */
  referenceLines?: ChartReferenceLine[];
  /**
   * Charts sharing a `syncId` share one hover: pointing at a category in one
   * shows the crosshair and tooltip at the same category in every other — a
   * price above its volume, requests above their error rate. The categories
   * must line up by position.
   */
  syncId?: string;
  /**
   * Fix the value axis instead of fitting it to the data — `[0, 100]` for a
   * percentage, or one shared domain across `SmallMultiples` panels so their
   * heights compare. `"auto"` keeps an end fitted. Reference marks still
   * widen it.
   */
  valueDomain?: [number | "auto", number | "auto"];
  /**
   * Adds a Chart / Table switch to the header. The table view shows the same
   * rows the screen-reader twin holds, formatted by `formatValue`.
   * @default false
   */
  tableToggle?: boolean;
  /**
   * Options for the default tooltip body (indicator, heading, Total row,
   * good direction). Ignored when `renderTooltip` is set — the renderer
   * replaces that body entirely.
   */
  tooltip?: ChartTooltipOptions;
};

/**
 * How a line or area runs between its points.
 *
 * - `monotone` — a smooth curve that never overshoots a point.
 * - `linear` — straight segments, for readings where a curve would imply
 *   values between samples that were never observed.
 * - `step` — the value holds across its category and changes at the boundary,
 *   for per-bucket states (a plan tier, a quota, a deploy version).
 */
export type ChartCurve = "linear" | "monotone" | "step";

/** Point markers on a line or area: none, every point, or the latest one. */
export type ChartDots = boolean | "last";

/** `AreaChart` / `LineChart` / `BarChart` props. */
export type CartesianChartProps = BaseChartProps &
  CartesianChartOptions & ChartSingleSeriesOptions & ChartTrendOptions & ChartBarOptions & {
    /** Previous-period overlay (line and area forms; ignored by bars). */
    comparison?: ChartComparison;
    /**
     * A band behind the line or area, aligned to `data` by position: a
     * forecast or confidence interval, a p5–p95 envelope. Takes the series ink
     * at low opacity; the tooltip and table state `low – high`.
     */
    range?: {
      data: Array<{ high: number | null; low: number | null }>;
      label?: string;
    };
    /** Line interpolation (line and area forms). @default "monotone" */
    curve?: ChartCurve;
    /**
     * Point markers (line and area forms). `"last"` marks only the latest
     * point with a value — the current reading. @default false
     */
    dots?: ChartDots;
    /**
     * Where the observed data ends and a projection begins — a category index
     * or `label`. Points after it draw dashed (line, area) or washed out (bar),
     * and the tooltip, keyboard readout and table name them "Projected". The
     * point itself is the last observed one: the dashed run starts from it.
     */
    projectedFrom?: number | string;
    /**
     * The level an area fills from (area form). Defaults to zero; set it to
     * a target or the first reading so the fill reads as above / below it.
     */
    baseline?: number;
    /** F6 identity legend under the title (comparison, labelled rules). @default true */
    legend?: boolean;
    /** The series' legend name beside a comparison. @default "Current" */
    seriesLabel?: string;
  };

/**
 * Where the aside (legend / value list) sits relative to the plot.
 *
 * - `top` — one wrapping line of identity chips under the title (F6).
 * - `side` — always beside the plot (wide cards, one or two per row).
 * - `bottom` — always under the plot, as compact wrapped chips. Use when many
 *   charts share a row (4-up donut walls) and each card is narrow.
 * - `auto` — beside the plot, flipping to the compact bottom form when the
 *   **card** (not the viewport) is narrower than 420px, so the same chart works
 *   in a 2-up and a 4-up grid without the call site knowing its own width.
 */
export type ChartLegendPlacement = "auto" | "bottom" | "side" | "top";

/**
 * The shared legend-toggle capability (ATL-56): legend click is a visibility
 * filter, and the entity keeps its color. Toggle buttons appear when any of
 * `onToggleLabel`, `onHiddenLabelsChange`, or `defaultHiddenLabels` is given.
 * The last visible entry cannot be hidden.
 */
export type ChartLegendToggleProps = {
  /** Controlled: labels currently excluded (rendered dimmed in the legend). */
  hiddenLabels?: string[];
  /** Uncontrolled seed; passing it (even `[]`) enables the toggles. */
  defaultHiddenLabels?: string[];
  /** Called with the label a toggle flipped. Presence enables the toggles. */
  onToggleLabel?: (label: string) => void;
  /** Called with the whole next hidden set. Presence enables the toggles. */
  onHiddenLabelsChange?: (labels: string[]) => void;
};

export type PieChartProps = Omit<BaseChartProps, "color"> &
  ChartLegendToggleProps & ChartDonutOptions & {
    /** Render as a donut (hollow center). @default false */
    donut?: boolean;
    /**
     * Legend placement. Share charts always need one — identity must never be
     * color-alone. `false` opts out; `true` is an alias for `"auto"`.
     * @default "auto"
     */
    legend?: ChartLegendPlacement | boolean;
    /**
     * Content centered in a donut's hollow — a total, an average, a rating glyph.
     * Ignored when `donut` is off, where there is no hole to put it in. It is
     * decoration over the arc: give the same fact to `title`/`description` or the
     * legend if a screen reader has to reach it.
     */
    center?: React.ReactNode;
    /**
     * Draw the slices clockwise from twelve o'clock instead of recharts' own
     * counter-clockwise sweep from three.
     *
     * A share chart is read as a clock face, so the first slice belongs at the
     * top; recharts starts at the positive x-axis and runs the other way, which
     * puts it on the right and reverses the order the caller passed. Opt-in
     * rather than the default, because flipping the sweep would re-cut every pie
     * already drawn in this package.
     * @default false
     */
    clockwiseFromTop?: boolean;
    /**
     * Print each legend row's count and share beside its name.
     *
     * On by default: a share chart's legend is also its value list, which is
     * where the exact numbers behind the wedges live. Turn it off where the
     * legend sits next to a second chart whose own legend names the same series —
     * two legends of the same series reading differently is worse than one of
     * them being identity-only.
     * @default true
     */
    legendValues?: boolean;
    /**
     * Cap on drawn slices; the tail is summed into "Other". Defaults to three,
     * and values above three are clamped, because pie wedges compare every pair
     * and only the first three palette slots pass that color-vision gate. A
     * `data` set where **every** datum carries its own `color` is not drawing
     * from that palette: it draws every slice by default, and `maxSlices` then
     * caps it wherever the caller says.
     */
    maxSlices?: number;
  } & XstyleProp;

export type RadialBarChartProps = Omit<BaseChartProps, "color"> &
  ChartLegendToggleProps & ChartRadialOptions & {
    /** Legend placement; `false` opts out. @default "auto" */
    legend?: ChartLegendPlacement | boolean;
  } & XstyleProp;

export type RadarChartProps = BaseChartProps &
  ChartLegendToggleProps & {
    /**
     * A second profile by spoke position — a previous period, a team average.
     * Drawn as a muted dashed outline with no fill and no palette slot; the
     * tooltip states both values and the change.
     */
    comparison?: ChartComparison;
    /** Web shape: concentric polygons or circles. @default "polygon" */
    grid?: "circle" | "polygon";
    /**
     * Value list placement; `false` opts out. One series means the aside reads
     * the spoke values rather than identifying colors. @default "auto"
     */
    legend?: ChartLegendPlacement | boolean;
  } & XstyleProp;

export type ScatterChartProps = Omit<BaseChartProps, "data"> & {
  data: ScatterPoint[];
} & XstyleProp;

export type FunnelChartProps = Omit<BaseChartProps, "color"> & ChartFunnelOptions & {
  /**
   * Legend placement; `false` opts out. Shares read against the first stage
   * (stage-to-entry conversion). @default "auto"
   */
  legend?: ChartLegendPlacement | boolean;
} & XstyleProp;

/**
 * `range` draws a band between `key` (low) and `highKey` (high) — a forecast
 * or confidence interval, a p5–p95 envelope. It takes a palette slot.
 */
export type ChartSeriesKind = "area" | "bar" | "line" | "range";

export type ChartSeries = ChartSeriesExtras & {
  /**
   * `comparison` draws the series as a muted dashed line that takes no palette
   * slot — a previous period or a baseline next to the current series.
   * @default "default"
   */
  variant?: "comparison" | "default";
  /**
   * Series color; defaults to its palette slot (fixed by series order). The
   * six-series ceiling is the palette's — colored every series yourself and it
   * no longer applies, along with the guarantee that came with it.
   */
  color?: string;
  /**
   * Which value axis the series reads against. A `right` series gets its own
   * axis on the right edge, for two measures in different units (requests and
   * error rate). The legend marks it "(right)". @default "left"
   */
  axis?: "left" | "right";
  /** Interpolation of a `line` or `area` series. @default "monotone" */
  curve?: ChartCurve;
  /**
   * This series' own readout formatter (tooltip, keyboard readout), for a
   * series in a different unit. Falls back to the chart's `formatValue`.
   */
  format?: (value: number) => string;
  /** Upper bound's data key, for a `range` series (`key` is the lower). */
  highKey?: string;
  /** Data key on each `SeriesDatum`. */
  key: string;
  /** @default "bar" */
  kind?: ChartSeriesKind;
  /** Legend/tooltip name. @default `key` */
  label?: string;
  /**
   * Stack group. Series sharing an id stack on top of each other; omit to draw
   * them side by side. `stacked` is the shorthand for "one group for all".
   */
  stack?: string;
};

export type SeriesDatum = {
  label: string;
} & Record<string, number | string | null | undefined>;

export type SeriesChartProps = Omit<BaseChartProps, "color" | "data"> &
  ChartLegendToggleProps &
  CartesianChartOptions & SeriesExpansionOptions & {
    /**
     * Draw the value and category axes. @default true
     *
     * `false` is only for a single stacked row whose shares are named in a list
     * beside it; a plot whose values are not stated anywhere else keeps its
     * axes — this is not a way to save space.
     */
    axes?: boolean;
    /**
     * Bridge a missing value (`null`) on line and area series instead of
     * breaking the line. Off by default: a gap says "no reading", and a bridge
     * invents the readings in between — turn it on only where the in-between is
     * genuinely continuous. @default false
     */
    connectNulls?: boolean;
    data: SeriesDatum[];
    /** Tick text of the right axis (see `ChartSeries.axis`). */
    formatRightAxisValue?: (value: number) => string;
    /**
     * Bar direction.
     *
     * - `columns` — categories along the x-axis. For ordered categories (time
     *   buckets, sizes) where reading left-to-right carries meaning.
     * - `rows` — horizontal bars, one per category. For entity categories with
     *   prose labels (people, projects): the name gets a full line instead of a
     *   rotated tick, and the bars fill the card's width instead of leaving a
     *   wide gap between narrow columns.
     *
     * @default "columns"
     */
    layout?: "columns" | "rows";
    /**
     * Legend placement. A multi-series chart always needs one — identity must
     * never be color-alone. `false` opts out. @default "top" (F6)
     */
    legend?: ChartLegendPlacement | boolean;
    series: ChartSeries[];
    /**
     * Shorthand: every series without its own `stack` shares one.
     *
     * `"percent"` stacks to 100%: each category's stack fills the plot and the
     * value axis reads share (0–100%). The tooltip and the keyboard readout
     * state each series' share and its raw value; the table twin keeps the raw
     * values. `formatAxisValue` is not used — the axis is a share, not the
     * series' unit. `line` and `comparison` series have no share and are not
     * drawn in this mode.
     * @default false
     */
    stacked?: boolean | "percent";
  } & XstyleProp;

/**
 * No `entrance`: a gauge is a meter, and a meter paints at the value it was
 * given (progress grammar, rule 2).
 */
export type GaugeChartProps = Omit<
  BaseChartProps,
  "data" | "entrance" | "formatAxisValue" | "formatValue" | "renderTooltip"
> & {
  /**
   * Content paired with the arc (breakdown, target, notes). A gauge scales with
   * height, so a lone one in a wide card leaves the sides empty — give it
   * something to sit next to.
   */
  aside?: React.ReactNode;
  /** Placement of `aside`. @default "auto" */
  asidePlacement?: ChartLegendPlacement;
  /** Max value the gauge fills to. @default 100 */
  max?: number;
  /** Suffix shown after the value (e.g. "%"). */
  unit?: string;
  value: number;
} & XstyleProp;
