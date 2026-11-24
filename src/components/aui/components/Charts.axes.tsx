import {
  Brush,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { i18n } from "@/i18n";

import { vars } from "../tokens/tokens.stylex";

import { formatChartValue } from "./Charts.format";
import type {
  CartesianChartOptions,
  ChartAnnotation,
  ChartPoint,
  ChartReferenceBand,
  ChartReferenceLine,
  ChartReferenceTone,
} from "./Charts.props";
import type { ChartSpan } from "./Charts.options";
import { referenceMarks } from "./Charts.reference";
import {
  axisPosition,
  spanMarks,
  timeXAxisProps,
  type ResolvedTimeAxis,
} from "./Charts.time";
import {
  tooltipContent,
  type ChartTooltipBodyOptions,
  type ChartTooltipRenderer,
} from "./Charts.tooltip";
import {
  axisColor,
  axisTick,
  bandCursorFor,
  pillCursor,
  CHART_PALETTE_SIZE,
  gridColor,
  chartOtherLabel,
  tooltipMotion,
} from "./Charts.config";

/*
 * Shared cartesian scaffolding for the chart family: the category fold, the
 * grid/axes/tooltip set every columns-layout form draws, and the row-layout
 * geometry. Split out of `Charts.tsx` (ATL-76); moved verbatim.
 */
/**
 * Caps a categorical series list at the palette size by summing the tail into a
 * single "Other" row. Cycling the palette instead would paint two entities the
 * same color; dropping the tail would silently change the total.
 */
export function foldSeries<T extends ChartPoint>(
  data: T[],
  limit = CHART_PALETTE_SIZE,
  otherLabel = chartOtherLabel(),
): ChartPoint[] {
  const resolvedLimit = Number.isFinite(limit)
    ? Math.max(2, Math.floor(limit))
    : CHART_PALETTE_SIZE;
  if (data.length <= resolvedLimit) return data;
  const head = data.slice(0, resolvedLimit - 1);
  const tail = data.slice(resolvedLimit - 1);
  return [
    ...head,
    {
      label: otherLabel,
      value: tail.reduce((total, entry) => total + entry.value, 0),
    },
  ];
}

export function sharedAxes({
  activeIndex,
  annotations,
  bands,
  brush,
  categorical,
  formatAxisValue = formatChartValue,
  formatRightAxisValue,
  formatValue,
  labels,
  onBrushChange,
  onBrushRange,
  proseCategories,
  referenceLines,
  renderTooltip,
  rightAxis,
  spans,
  time,
  times,
  tooltip,
  valueAxisWidth,
  valueDomain,
  valueLog,
}: {
  /**
   * Internal: the value axis gutter. Defaults to a fixed 40px (64px on a log
   * scale) so linked charts keep one plot edge; a chart whose ticks are
   * running totals ("$220.0K") passes `"auto"` so recharts measures them
   * instead of clipping the first glyph at the card edge.
   */
  valueAxisWidth?: number | "auto";
  /** Washes across stretches of the category or time axis. */
  spans?: ChartSpan[];
  /** A resolved `timeAxis`: the x-axis reads each row's numeric `time`. */
  time?: ResolvedTimeAxis | null;
  /** Row times by index, to place spans and annotations on a time axis. */
  times?: ReadonlyArray<number | null>;
  /** Log value scale bounds and ticks (see `logAxis`). */
  valueLog?: { domain: [number, number]; ticks: number[] } | null;
  valueDomain?: CartesianChartOptions["valueDomain"];
  annotations?: ChartAnnotation[];
  brush?: CartesianChartOptions["brush"];
  formatRightAxisValue?: (value: number) => string;
  /** Category labels in order — resolves index annotations and brush text. */
  labels?: readonly string[];
  onBrushChange?: CartesianChartOptions["onBrushChange"];
  /** Internal: the brushed window's first index, for index translation. */
  onBrushRange?: (startIndex: number) => void;
  /** Every category labelled, truncated to its band (see `CategoryTick`). */
  proseCategories?: boolean;
  /** Draw a second value axis on the right edge (`yAxisId="right"`). */
  rightAxis?: boolean;
  /** Keyboard-active category; shows its tooltip without a pointer. */
  activeIndex?: number | null;
  bands?: ChartReferenceBand[];
  categorical?: boolean;
  formatAxisValue?: (value: number) => string;
  formatValue?: (value: number) => string;
  referenceLines?: ChartReferenceLine[];
  renderTooltip?: ChartTooltipRenderer;
  tooltip?: ChartTooltipBodyOptions;
} = {}) {
  const keyboardActive = activeIndex != null;
  return (
    <>
      {/* Solid hairline: a dashed grid reads as a threshold or a projection,
          and it is only a grid. */}
      <CartesianGrid stroke={gridColor} vertical={false} />
      <XAxis
        axisLine={false}
        dataKey="label"
        // Every Nth label at an even stride counted back from the end, so the
        // latest category always shows (`StrideTick`) — never a ragged run
        // where recharts dropped whichever label collided.
        // A time axis keeps recharts' own numeric ticks and formatter.
        interval={time ? undefined : 0}
        stroke={axisColor}
        tick={
          time
            ? axisTick
            : proseCategories
              ? CategoryTick
              : (tick: TickProps) => (
                  <StrideTick
                    {...tick}
                    edges={!categorical}
                    widest={widestLabel(labels)}
                  />
                )
        }
        tickLine={false}
        tickMargin={8}
        {...(time ? timeXAxisProps(time) : null)}
      />
      <YAxis
        axisLine={false}
        stroke={axisColor}
        tick={axisTick}
        domain={valueLog ? (valueDomain ?? valueLog.domain) : valueDomain}
        tickFormatter={formatAxisValue}
        tickLine={false}
        // A log axis carries a rotated "log scale" title in the gutter's first
        // 16px; at 48px a "1,000" tick ran into it, so the gutter holds both.
        width={valueAxisWidth ?? (valueLog ? 64 : 40)}
        {...(valueLog
          ? {
              allowDataOverflow: true,
              label: {
                ...axisTick,
                angle: -90,
                position: "insideLeft",
                value: "log scale",
              },
              scale: "log" as const,
              ticks: valueLog.ticks,
            }
          : null)}
      />
      {rightAxis ? (
        <YAxis
          axisLine={false}
          orientation="right"
          stroke={axisColor}
          tick={axisTick}
          tickFormatter={formatRightAxisValue ?? formatChartValue}
          tickLine={false}
          width={44}
          yAxisId="right"
        />
      ) : null}
      {referenceMarks({ bands, referenceLines })}
      {spanMarks(spans, labels, time ? times : undefined)}
      {annotationMarks(annotations, labels, time ? times : undefined)}
      {brush ? (
        <Brush
          ariaLabel={i18n.t("ui:chart.visibleRange")}
          dataKey="label"
          endIndex={typeof brush === "object" ? brush.endIndex : undefined}
          fill={vars["--aui-color-surface-raised"]}
          height={24}
          onChange={
            onBrushChange || onBrushRange
              ? (range) => {
                  if (range.startIndex != null)
                    onBrushRange?.(range.startIndex);
                  if (
                    onBrushChange &&
                    range.startIndex != null &&
                    range.endIndex != null
                  ) {
                    onBrushChange({
                      endIndex: range.endIndex,
                      startIndex: range.startIndex,
                    });
                  }
                }
              : undefined
          }
          startIndex={typeof brush === "object" ? brush.startIndex : undefined}
          stroke={vars["--aui-color-border-strong"]}
          travellerWidth={8}
        />
      ) : null}
      <Tooltip
        {...tooltipMotion}
        // A keyboard-active category pins the tooltip at that index; the key
        // re-seeds recharts' index, which it reads only on mount.
        active={keyboardActive ? true : undefined}
        content={tooltipContent(renderTooltip, formatValue, {
          ...tooltip,
          ...(time ? { timeLabel: time.label } : null),
          still: keyboardActive,
        })}
        defaultIndex={keyboardActive ? activeIndex : undefined}
        key={keyboardActive ? `kbd-${activeIndex}` : "pointer"}
        // Bars are their own hit target — a hairline crosshair belongs to the
        // continuous forms, and a band wash belongs to the categorical ones.
        cursor={
          categorical
            ? bandCursorFor(brush ? undefined : labels?.length)
            : pillCursor((row) =>
                time && typeof row.time === "number"
                  ? time.label(row.time)
                  : String(row.label ?? ""),
              )
        }
      />
    </>
  );
}

/** Width reserved for row-layout category labels (people/project names). */
export const rowLabelWidth = 116;
/** Thickness cap for row-layout bars — a row list, not a set of slabs. */
export const rowBarSize = 26;

const annotationInk: Record<ChartReferenceTone, string> = {
  danger: vars["--aui-color-danger"],
  neutral: vars["--aui-color-text-subtle"],
  success: vars["--aui-color-success"],
  warning: vars["--aui-color-warning"],
};

/**
 * Event rules on the category axis. Solid and thin — a dash already means a
 * threshold — and labelled at the top so the label never sits on the data.
 * Unknown categories are skipped rather than drawn at the edge.
 */
export function annotationMarks(
  annotations: ChartAnnotation[] | undefined,
  labels: readonly string[] | undefined,
  times?: ReadonlyArray<number | null>,
) {
  if (!annotations?.length) return null;
  return annotations.map((annotation, index) => {
    const x = axisPosition(annotation.at, labels, times);
    if (x == null) return null;
    const ink = annotationInk[annotation.tone ?? "neutral"];
    return (
      <ReferenceLine
        className="atelier-chart-annotation"
        key={`annotation-${index}`}
        label={{
          ...axisTick,
          fill: ink,
          position: "insideTopLeft",
          value: annotation.label,
        }}
        stroke={ink}
        strokeWidth={1}
        x={x}
      />
    );
  });
}

/** recharts `onClick` → `onSelectPoint`, resolved against `data`. */
export function selectHandler<T extends { label: string | number }>(
  data: readonly T[],
  onSelectPoint: CartesianChartOptions["onSelectPoint"],
) {
  if (!onSelectPoint) return {};
  const select = (index: number) => {
    const datum = data[index];
    if (datum)
      onSelectPoint({
        datum: datum as never,
        index,
        label: String(datum.label),
      });
  };
  return {
    onClick: (state: {
      activeIndex?: unknown;
      activeTooltipIndex?: unknown;
    }) => {
      const raw = state?.activeTooltipIndex ?? state?.activeIndex;
      const index = typeof raw === "number" ? raw : Number(raw);
      if (Number.isInteger(index)) select(index);
    },
    select,
    style: { cursor: "pointer" },
  };
}

let measureContext: CanvasRenderingContext2D | null | undefined;

/**
 * Pixel width of a string in the chart tick font. Canvas when available,
 * otherwise an average-glyph estimate (6.2px per character at 11px).
 */
export function measureLabel(text: string, fontSize = 11): number {
  if (measureContext === undefined) {
    measureContext =
      typeof document === "undefined"
        ? null
        : document.createElement("canvas").getContext("2d");
  }
  if (measureContext) {
    measureContext.font = `${fontSize}px ${
      typeof document !== "undefined"
        ? getComputedStyle(document.body).fontFamily || "sans-serif"
        : "sans-serif"
    }`;
    return measureContext.measureText(text).width;
  }
  return text.length * fontSize * 0.56;
}

/** `text` cut to fit `maxWidth` px, ending in an ellipsis when cut. */
export function fitLabel(
  text: string,
  maxWidth: number,
  fontSize = 11,
): string {
  if (maxWidth <= 0) return "";
  if (measureLabel(text, fontSize) <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measureLabel(`${text.slice(0, mid)}…`, fontSize) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo === 0 ? "…" : `${text.slice(0, lo).trimEnd()}…`;
}

type TickProps = {
  index?: number;
  payload?: { value?: unknown };
  visibleTicksCount?: number;
  width?: number | string;
  x?: number | string;
  y?: number | string;
};

/** Estimated width of a tick label at the 12px tick size. */
const labelWidth = (label: string) => label.length * 6.6 + 4;
const widestLabel = (labels: readonly string[] = []) =>
  labels.reduce((widest, label) => Math.max(widest, labelWidth(label)), 0);
const TICK_GAP = 12;

/**
 * A category tick on an even stride counted back from the last category: the
 * axis fits as many labels as its width holds at the widest label, and shows
 * every Nth so the latest is always among them. On a line or area axis
 * (`edges`) the first and last labels sit inside the plot instead of being cut
 * at its edge.
 */
function StrideTick({
  edges,
  index = 0,
  payload,
  visibleTicksCount = 1,
  widest,
  width = 0,
  x = 0,
  y = 0,
}: TickProps & { edges: boolean; widest: number }) {
  const count = Math.max(1, visibleTicksCount);
  const fit = Math.max(1, Math.floor(Number(width) / (widest + TICK_GAP)));
  const stride = Math.max(1, Math.ceil(count / fit));
  if ((count - 1 - index) % stride !== 0) return <g />;
  const anchor =
    edges && count > 1 && index === count - 1
      ? "end"
      : edges && count > 1 && index === 0
        ? "start"
        : "middle";
  return (
    <text
      {...axisTick}
      className="recharts-text recharts-cartesian-axis-tick-value"
      textAnchor={anchor}
      x={x}
      y={y}
    >
      <tspan dy="0.71em" x={x}>
        {String(payload?.value ?? "")}
      </tspan>
    </text>
  );
}

/**
 * A category tick that always renders (every category is labelled, so the
 * first one is never dropped) and truncates to its own band with an ellipsis;
 * the full name stays in a `<title>` and in the table twin. For the
 * categorical forms whose categories are prose (reasons, regions, steps).
 */
export function CategoryTick({
  payload,
  visibleTicksCount = 1,
  width = 0,
  x = 0,
  y = 0,
}: TickProps) {
  const label = String(payload?.value ?? "");
  const band = Number(width) / Math.max(1, visibleTicksCount);
  const shown = fitLabel(label, Math.max(12, band - 6));
  return (
    <g transform={`translate(${x},${y})`}>
      <text {...axisTick} dy={12} textAnchor="middle">
        {shown}
        {shown !== label ? <title>{label}</title> : null}
      </text>
    </g>
  );
}

/** XAxis props for a prose category axis (see `CategoryTick`). */
export const categoryTickProps = {
  interval: 0,
  tick: CategoryTick,
} as const;
