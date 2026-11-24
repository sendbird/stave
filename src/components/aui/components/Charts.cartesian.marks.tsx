import { Area, LabelList, Line, ReferenceLine } from "recharts";

import { vars } from "../tokens/tokens.stylex";
import { axisTick, chartMargin, chartNegative, chartPalette } from "./Charts.config";
import { formatChartReadout } from "./Charts.format";
import { activeDot, curveType, LiveDot, lineDots } from "./Charts.marks";
import type { CartesianChartProps } from "./Charts.props";
import {
  COMPARISON_KEY,
  comparisonInk,
  PROJECTED_KEY,
} from "./Charts.reference";

/*
 * Marks shared by `AreaChart` / `LineChart` / `BarChart`: the previous-period
 * line, the range band, the projected run, and the 2026-11-02 opt-in marks
 * (trailing mean, outside-range dots, end label, signed gradients). Split out
 * of `Charts.cartesian.tsx` to keep both under the size ceiling.
 */

/** Key of the trailing-mean overlay on each row. */
export const AVERAGE_KEY = "average";

/** Plot margin: the end label needs room past the last point. */
export function plotMargin(props: CartesianChartProps) {
  return props.endLabel ? { ...chartMargin, right: 56 } : chartMargin;
}

export function ComparisonLine({
  curve,
  name,
}: {
  curve: CartesianChartProps["curve"];
  name: string;
}) {
  return (
    <Line
      activeDot={activeDot(comparisonInk)}
      connectNulls={false}
      dataKey={COMPARISON_KEY}
      dot={false}
      isAnimationActive={false}
      name={name}
      stroke={comparisonInk}
      strokeDasharray="4 4"
      strokeWidth={1.5}
      type={curveType(curve)}
    />
  );
}

/** A `range` band: the series ink at low opacity, no stroke, no dot. */
export function RangeBand({
  color,
  curve,
  name,
}: {
  color: string;
  curve: CartesianChartProps["curve"];
  name: string;
}) {
  return (
    <Area
      activeDot={false}
      dataKey="range"
      data-range=""
      fill={color}
      fillOpacity={0.16}
      isAnimationActive={false}
      name={name}
      stroke="none"
      type={curveType(curve)}
    />
  );
}

/** The trailing mean: the series ink, thinner and half-strength, never animated. */
export function averageLine(
  chart: { averageName: string; averages: Array<number | null> | null },
  { color, curve }: { color: string; curve: CartesianChartProps["curve"] },
) {
  if (!chart.averages) return null;
  return (
    <Line
      activeDot={false}
      data-average=""
      dataKey={AVERAGE_KEY}
      dot={false}
      isAnimationActive={false}
      name={chart.averageName}
      stroke={color}
      strokeOpacity={0.55}
      strokeWidth={1.5}
      type={curveType(curve)}
    />
  );
}

/** The projected (or unfinished) run: the series' own ink, dashed, never animated in. */
export function projectedMark(
  kind: "area" | "line",
  {
    color,
    curve,
    fill,
    name = "Projected",
  }: {
    color: string;
    curve: CartesianChartProps["curve"];
    fill?: string;
    name?: string;
  },
) {
  const shared = {
    activeDot: activeDot(color),
    dataKey: PROJECTED_KEY,
    dot: false,
    isAnimationActive: false,
    name,
    stroke: color,
    strokeDasharray: "6 4",
    strokeWidth: 2,
    type: curveType(curve),
  } as const;
  return kind === "area" ? (
    <Area {...shared} fill={fill} fillOpacity={0.5} />
  ) : (
    <Line {...shared} />
  );
}

/** `dot` for the main mark: the `dots` markers, plus a warning ring on readings outside `range`. */
export function markDots(
  props: CartesianChartProps,
  color: string,
  values: ReadonlyArray<number | null | undefined>,
  outside: boolean[] | null,
) {
  const lineBase = lineDots(props.dots, color, values);
  // A live feed marks its newest reading (`LiveDot`).
  let lastIndex = -1;
  if (props.live)
    for (let index = values.length - 1; index >= 0 && lastIndex < 0; index -= 1)
      if (typeof values[index] === "number") lastIndex = index;
  const base =
    lastIndex < 0
      ? lineBase
      : (dot: { cx?: number | null; cy?: number | null; index: number }) =>
          dot.index === lastIndex && dot.cx != null && dot.cy != null ? (
            <LiveDot
              color={color}
              cx={dot.cx}
              cy={dot.cy}
              // Keyed by the reading, not the pixels: a new reading re-mounts
              // the dot and the halo flashes once; a resize or rescale does not.
              key={`live-${values.length}-${dot.index}-${values[dot.index]}`}
            />
          ) : lineBase ? (
            lineBase(dot)
          ) : null;
  if (!outside?.some(Boolean)) return base;
  const ringed = ringedOutliers(values, outside, props.range?.data);
  return (dot: { cx?: number | null; cy?: number | null; index: number }) => {
    if (ringed[dot.index] && dot.cx != null && dot.cy != null) {
      return (
        <circle
          className="atelier-chart-dot"
          cx={dot.cx}
          cy={dot.cy}
          data-outside=""
          fill={vars["--aui-color-surface-raised"]}
          key={`outside-${dot.index}`}
          r={4.5}
          stroke={vars["--aui-color-warning"]}
          strokeWidth={2.5}
        />
      );
    }
    return base ? base(dot) : null;
  };
}

/**
 * Which outside readings get a ring: one per run — consecutive readings on
 * the same side of the band — at the run's extreme. A 90-point series puts
 * readings ~4px apart, so ringing every point of an incident plateau piled
 * seven 9px rings into one knot over the span label. The tooltip, readout
 * and table still name every outside reading.
 */
function ringedOutliers(
  values: ReadonlyArray<number | null | undefined>,
  outside: boolean[],
  band: ReadonlyArray<{ high: number | null; low: number | null }> | undefined,
) {
  const ringed = outside.map(() => false);
  const sideOf = (index: number) => {
    const value = values[index];
    const high = band?.[index]?.high;
    return typeof value === "number" && high != null && value > high
      ? 1
      : -1;
  };
  let index = 0;
  while (index < outside.length) {
    if (!outside[index]) {
      index += 1;
      continue;
    }
    const side = sideOf(index);
    let extreme = index;
    let next = index;
    while (next < outside.length && outside[next] && sideOf(next) === side) {
      const value = values[next];
      const best = values[extreme];
      if (
        typeof value === "number" &&
        (typeof best !== "number" || value * side > best * side)
      )
        extreme = next;
      next += 1;
    }
    ringed[extreme] = true;
    index = next;
  }
  return ringed;
}

/** The latest value printed past the end of the line (`endLabel`). */
export function endLabelList(
  props: CartesianChartProps,
  values: ReadonlyArray<number | null | undefined>,
) {
  if (!props.endLabel) return null;
  let last = -1;
  values.forEach((value, index) => {
    if (typeof value === "number") last = index;
  });
  const read = props.formatValue ?? formatChartReadout;
  return (
    <LabelList
      content={(label: {
        index?: number;
        value?: unknown;
        x?: number | string;
        y?: number | string;
      }) =>
        label.index === last && typeof label.value === "number" ? (
          <text
            data-end-label=""
            dominantBaseline="middle"
            fill={vars["--aui-color-text"]}
            fontSize={axisTick.fontSize}
            fontWeight={600}
            x={Number(label.x) + 8}
            y={Number(label.y)}
          >
            {read(label.value)}
          </text>
        ) : null
      }
      dataKey="value"
    />
  );
}

/**
 * `signedFill`: gradients that switch ink at the baseline — one for the
 * stroke (spans the data) and one for an area fill (spans data and baseline).
 */
export function signedGradients(
  props: CartesianChartProps,
  values: ReadonlyArray<number | null | undefined>,
  ids: { fill: string; stroke: string },
) {
  if (!props.signedFill) return null;
  const spec = typeof props.signedFill === "object" ? props.signedFill : {};
  const positive = spec.positive ?? props.color ?? chartPalette[0]!;
  const negative = spec.negative ?? chartNegative;
  let max = -Infinity;
  let min = Infinity;
  for (const value of values) {
    if (typeof value !== "number") continue;
    if (value > max) max = value;
    if (value < min) min = value;
  }
  // No reading, or a flat one: an objectBoundingBox gradient on a zero-height
  // path paints nothing, so the plain ink is used instead.
  if (max === -Infinity || max === min) return null;
  const base = props.baseline ?? 0;
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  const strokeAt =
    max === min ? (max >= base ? 1 : 0) : clamp((max - base) / (max - min));
  const top = Math.max(max, base);
  const bottom = Math.min(min, base);
  const fillAt = top === bottom ? 1 : clamp((top - base) / (top - bottom));
  return (
    <defs>
      <linearGradient id={ids.stroke} x1="0" x2="0" y1="0" y2="1">
        <stop offset={strokeAt} stopColor={positive} />
        <stop offset={strokeAt} stopColor={negative} />
      </linearGradient>
      <linearGradient id={ids.fill} x1="0" x2="0" y1="0" y2="1">
        <stop offset={0} stopColor={positive} stopOpacity={0.3} />
        <stop offset={fillAt} stopColor={positive} stopOpacity={0.08} />
        <stop offset={fillAt} stopColor={negative} stopOpacity={0.08} />
        <stop offset={1} stopColor={negative} stopOpacity={0.3} />
      </linearGradient>
    </defs>
  );
}

/** `signedFill`'s baseline, drawn so "above" and "below" have a line to be read against. */
export function baselineRule(props: CartesianChartProps) {
  if (!props.signedFill) return null;
  return (
    <ReferenceLine
      className="atelier-chart-baseline"
      ifOverflow="extendDomain"
      stroke={vars["--aui-color-border-strong"]}
      strokeWidth={1}
      y={props.baseline ?? 0}
    />
  );
}
