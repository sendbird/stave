import { Area, Bar, Line } from "recharts";

import { vars } from "../tokens/tokens.stylex";
import { rowBarSize } from "./Charts.axes";
import { barRadius, maxBarSize, rowBarRadius } from "./Charts.config";
import { focusBarShape } from "./Charts.focus";
import { activeDot, curveType } from "./Charts.marks";
import type { ChartPattern } from "./Charts.options";
import type { ChartCurve } from "./Charts.props";
import {
  isFaded,
  safeId,
  seriesEndLabel,
  seriesFill,
} from "./Charts.series.extras";

/*
 * The marks a `SeriesChart` draws for each resolved series — line, range band,
 * area or bar — split out of `Charts.series.tsx` (source-size guard) when the
 * 2026-11 visual refresh gave areas a fading fill and lines a ringed active dot.
 */

export type SeriesMark = {
  axis?: "right";
  color: string;
  comparison: boolean;
  curve?: ChartCurve;
  key: string;
  kind: "area" | "bar" | "line" | "range";
  name: string;
  pattern?: ChartPattern;
  stack?: string;
};

type SeriesMarksContext = {
  connectNulls: boolean;
  data: ReadonlyArray<Record<string, unknown>>;
  endLabels: boolean;
  /** Hover/keyboard focus: the other categories' bars fall back. */
  focus?: Parameters<typeof focusBarShape>[0];
  focusSeries?: string;
  /** Prefix for this chart's `<pattern>` and `<linearGradient>` ids. */
  idPrefix: string;
  rangeKey: (key: string) => string;
  rightAxis: boolean;
  rows: boolean;
  topOfStack: ReadonlyMap<string, string>;
};

/**
 * An area that stands alone fades from its color to nothing toward the
 * baseline, like `AreaChart`; a stacked area keeps a flat fill because each
 * layer's lower edge is the one beneath it, not the axis.
 */
const fades = (entry: SeriesMark) =>
  entry.kind === "area" && !entry.stack && !entry.pattern;
const gradientId = (prefix: string, entry: SeriesMark) =>
  `${prefix}-fade-${safeId(entry.key)}`;

export function seriesAreaGradients(
  entries: ReadonlyArray<SeriesMark>,
  prefix: string,
) {
  const fading = entries.filter(fades);
  if (!fading.length) return null;
  return (
    <defs>
      {fading.map((entry) => (
        <linearGradient
          id={gradientId(prefix, entry)}
          key={entry.key}
          x1="0"
          x2="0"
          y1="0"
          y2="1"
        >
          <stop offset="0%" stopColor={entry.color} stopOpacity={0.3} />
          <stop offset="95%" stopColor={entry.color} stopOpacity={0} />
        </linearGradient>
      ))}
    </defs>
  );
}

export function seriesMarks(
  entries: ReadonlyArray<SeriesMark>,
  ctx: SeriesMarksContext,
) {
  const axisId = (entry: SeriesMark) =>
    ctx.rightAxis && entry.axis === "right" ? "right" : undefined;
  return entries.map((entry) => {
    const faded = isFaded(ctx.focusSeries, entry);
    if (entry.kind === "line") {
      return (
        <Line
          activeDot={activeDot(entry.color)}
          connectNulls={ctx.connectNulls}
          dataKey={entry.key}
          dot={false}
          isAnimationActive={false}
          key={entry.key}
          name={entry.name}
          stroke={entry.color}
          strokeDasharray={entry.comparison ? "4 4" : undefined}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity={faded ? 0.25 : undefined}
          strokeWidth={entry.comparison ? 1.5 : 2}
          type={curveType(entry.curve)}
          yAxisId={axisId(entry)}
        >
          {ctx.endLabels && !entry.comparison
            ? seriesEndLabel(entry, ctx.data)
            : null}
        </Line>
      );
    }
    if (entry.kind === "range") {
      return (
        <Area
          activeDot={false}
          connectNulls={ctx.connectNulls}
          dataKey={ctx.rangeKey(entry.key)}
          data-range=""
          fill={entry.color}
          fillOpacity={0.16}
          isAnimationActive={false}
          key={entry.key}
          name={entry.name}
          stroke="none"
          type={curveType(entry.curve)}
          yAxisId={axisId(entry)}
        />
      );
    }
    if (entry.kind === "area") {
      const fill = fades(entry)
        ? `url(#${gradientId(ctx.idPrefix, entry)})`
        : seriesFill(entry, ctx.idPrefix);
      return (
        <Area
          activeDot={activeDot(entry.color)}
          connectNulls={ctx.connectNulls}
          dataKey={entry.key}
          fill={fill}
          fillOpacity={
            faded
              ? fades(entry)
                ? 0.3
                : 0.08
              : entry.pattern
                ? 0.6
                : fades(entry)
                  ? 1
                  : 0.24
          }
          isAnimationActive={false}
          key={entry.key}
          name={entry.name}
          stackId={entry.stack}
          stroke={entry.color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity={faded ? 0.25 : undefined}
          strokeWidth={2}
          type={curveType(entry.curve)}
          yAxisId={axisId(entry)}
        >
          {ctx.endLabels ? seriesEndLabel(entry, ctx.data) : null}
        </Area>
      );
    }
    const capped =
      !entry.stack || ctx.topOfStack.get(entry.stack) === entry.key;
    return (
      <Bar
        dataKey={entry.key}
        fill={seriesFill(entry, ctx.idPrefix)}
        fillOpacity={faded ? 0.25 : undefined}
        // Row bars never animate: recharts grows a horizontal bar by
        // animating its computed width, and that width is captured at the
        // container size of the first paint. When the responsive
        // container settles wider, the axis rescales but the bars keep
        // the stale length — the plot then lies about its own scale.
        isAnimationActive={false}
        key={entry.key}
        // Row bars are read as a list, so they stay slim; column bars may
        // grow to the shared cap before a lone category turns into a slab.
        maxBarSize={ctx.rows ? rowBarSize : maxBarSize}
        name={entry.name}
        radius={capped ? (ctx.rows ? rowBarRadius : barRadius) : undefined}
        shape={ctx.focus && !faded ? focusBarShape(ctx.focus) : undefined}
        stackId={entry.stack}
        // Stacked segments are separated by 2px of surface, never by a
        // border: the gap is negative space, an outline would be ink.
        stroke={entry.stack ? vars["--aui-color-surface-raised"] : undefined}
        strokeWidth={entry.stack ? 2 : undefined}
        yAxisId={axisId(entry)}
      />
    );
  });
}
