import type * as React from "react";
import { LabelList } from "recharts";

import { i18n } from "@/i18n";

import { vars } from "../tokens/tokens.stylex";
import {
  divergingRows,
  NEUTRAL_HIGH,
  NEUTRAL_LOW,
} from "../utils/chart-transform";
import { axisTick, chartNegative, chartPalette } from "./Charts.config";
import { formatChartReadout, formatChartValue } from "./Charts.format";
import type { ChartPattern } from "./Charts.options";
import type {
  ChartSeries,
  SeriesChartProps,
  SeriesDatum,
} from "./Charts.props";
import type { ChartTable } from "./Charts.states";
import { ChartTooltipRow, ChartTooltipSurface } from "./Charts.tooltip";

/*
 * `SeriesChart` capabilities added on 2026-11-02 — the diverging stack, series
 * textures, focus and end labels — kept beside the form so `Charts.series.tsx`
 * only wires them in.
 */

/** Visible series keys per stack group, keyed by each member's own key. */
export function stackGroups(
  entries: ReadonlyArray<{ key: string; stack?: string }>,
): Record<string, string[]> {
  const members = new Map<string, string[]>();
  for (const entry of entries) {
    const group = entry.stack ?? entry.key;
    members.set(group, [...(members.get(group) ?? []), entry.key]);
  }
  const byKey: Record<string, string[]> = {};
  for (const entry of entries) {
    byKey[entry.key] = members.get(entry.stack ?? entry.key)!;
  }
  return byKey;
}

const surface = vars["--aui-color-surface-raised"];
const mix = (ink: string, amount: number) =>
  amount >= 100 ? ink : `color-mix(in oklab, ${ink} ${amount}%, ${surface})`;

/** Diverging ramp: `count` steps of one ink, lightest nearest the centre. */
function ramp(ink: string, count: number) {
  return Array.from({ length: count }, (_, step) =>
    // From 60%: lighter steps fell under 2:1 against the card and read as gaps.
    mix(ink, count === 1 ? 100 : Math.round(60 + (40 * step) / (count - 1))),
  );
}

export type DivergingPlan = {
  /**
   * One row's readout, from the drawn (paused, windowed) row's original values.
   * Hidden series are left out, as they are from the plot.
   */
  describeRow: (row: SeriesDatum, hidden: readonly string[]) => string;
  /** Legend rows in the caller's series order (the neutral once). */
  legend: Array<{
    color: string;
    label: string;
    swatchStyle?: React.CSSProperties;
  }>;
  props: SeriesChartProps;
  /** The table twin of the drawn rows, answers as given. */
  tableFor: (
    rows: readonly SeriesDatum[],
    hidden: readonly string[],
  ) => ChartTable;
};

/**
 * `diverging` resolved into an ordinary stacked `SeriesChart`: negated rows,
 * the neutral split into two halves, a centre-out drawing order, a two-hue
 * ramp with a grey centre, absolute axis ticks, and a tooltip, table and
 * readout that state each answer as given.
 */
export function divergingPlan(input: SeriesChartProps): DivergingPlan | null {
  const spec = input.diverging;
  if (!spec) return null;
  const read = input.formatValue ?? formatChartReadout;
  const negative = spec.negative.filter((key) =>
    input.series.some((entry) => entry.key === key),
  );
  const positive = input.series.filter(
    (entry) =>
      entry.key !== spec.neutral &&
      !negative.includes(entry.key) &&
      (entry.kind ?? "bar") === "bar",
  );
  const neutral = input.series.find((entry) => entry.key === spec.neutral);
  const byKey = new Map(input.series.map((entry) => [entry.key, entry]));
  const negInk = ramp(chartNegative, negative.length);
  const posInk = ramp(chartPalette[0]!, positive.length);
  const color = new Map<string, string>();
  negative.forEach((key, index) =>
    color.set(key, byKey.get(key)!.color ?? negInk[index]!),
  );
  positive.forEach((entry, index) =>
    color.set(entry.key, entry.color ?? posInk[index]!),
  );
  if (neutral)
    color.set(
      neutral.key,
      neutral.color ?? mix(vars["--aui-color-text-subtle"], 60),
    );
  const name = (key: string) => byKey.get(key)?.label ?? key;
  const bar = (key: string, entry?: Partial<ChartSeries>): ChartSeries => ({
    ...entry,
    color: color.get(entry?.key ?? key) ?? color.get(key),
    key,
    kind: "bar",
    label: name(entry?.key ?? key),
    stack: "atelier-diverging",
  });
  const series: ChartSeries[] = [
    ...(neutral
      ? [
          bar(`${neutral.key}${NEUTRAL_LOW}`, neutral),
          bar(`${neutral.key}${NEUTRAL_HIGH}`, neutral),
        ]
      : []),
    ...negative.map((key) => bar(key, byKey.get(key))),
    ...positive.map((entry) => bar(entry.key, entry)),
  ];
  const rows = divergingRows(input.data, spec);
  // A centre line belongs in the centre: one extent for both sides.
  const extent = Math.max(
    1,
    ...input.data.map((row) => {
      const read = (key: string) =>
        typeof row[key] === "number" ? Math.abs(row[key] as number) : 0;
      const half = neutral ? read(neutral.key) / 2 : 0;
      return Math.max(
        negative.reduce((sum, key) => sum + read(key), half),
        positive.reduce((sum, entry) => sum + read(entry.key), half),
      );
    }),
  );
  const magnitude = 10 ** Math.floor(Math.log10(extent));
  // Every edge on this ladder halves to a step recharts keeps as-is, so the
  // fixed domain ticks at −edge · −edge/2 · 0 · edge/2 · edge. A 2.5 edge
  // halved to 1.25, which recharts rounds up to 1.5: an extent of 2,100 drew
  // −2,500 · −1,000 · 500 · 2,500 — no zero, and not symmetric about it.
  const edge =
    [1, 1.5, 2, 3, 4, 5, 6, 8, 10]
      .map((f) => f * magnitude)
      .find((s) => s >= extent) ?? extent;
  const ordered = input.series.filter((entry) => color.has(entry.key));
  const axisFormat = input.formatAxisValue ?? formatChartValue;
  const renderTooltip: SeriesChartProps["renderTooltip"] = ({
    active,
    label,
    payload,
  }) => {
    const raw = payload?.[0]?.payload?.__raw as
      | Record<string, number>
      | undefined;
    if (!active || !raw) return null;
    const shown = new Set(
      (payload ?? []).map((entry) =>
        String(entry.dataKey)
          .replace(NEUTRAL_LOW, "")
          .replace(NEUTRAL_HIGH, ""),
      ),
    );
    return (
      <ChartTooltipSurface label={label}>
        {ordered
          .filter(
            (entry) =>
              shown.has(entry.key) && typeof raw[entry.key] === "number",
          )
          .map((entry) => (
            <ChartTooltipRow
              color={color.get(entry.key)}
              key={entry.key}
              name={name(entry.key)}
              value={read(raw[entry.key]!)}
            />
          ))}
      </ChartTooltipSurface>
    );
  };
  const rawOf = (row: SeriesDatum, key: string) => {
    const raw = (row as { __raw?: Record<string, number> }).__raw;
    const cell = raw ? raw[key] : row[key];
    return typeof cell === "number" ? Math.abs(cell) : null;
  };
  const visible = (hidden: readonly string[]) =>
    ordered.filter((entry) => !hidden.includes(name(entry.key)));
  return {
    describeRow: (row, hidden) =>
      [
        String(row.label),
        ...visible(hidden).map((entry) => {
          const cell = rawOf(row, entry.key);
          return cell == null
            ? `${name(entry.key)} no value`
            : `${name(entry.key)} ${read(cell)}`;
        }),
      ].join(", "),
    legend: ordered.map((entry) => ({
      color: color.get(entry.key)!,
      label: name(entry.key),
      swatchStyle: patternSwatch(entry.pattern),
    })),
    props: {
      ...input,
      data: rows as unknown as SeriesDatum[],
      formatAxisValue: (value) => axisFormat(Math.abs(value)),
      renderTooltip: input.renderTooltip ?? renderTooltip,
      series,
      stacked: false,
      valueDomain: input.valueDomain ?? [-edge, edge],
    },
    tableFor: (drawn, hidden) => ({
      columns: [
        i18n.t("ui:chart.column.category"),
        ...visible(hidden).map((entry) => name(entry.key)),
      ],
      rows: drawn.map((row) => [
        row.label,
        ...visible(hidden).map((entry) => rawOf(row, entry.key) ?? "—"),
      ]),
    }),
  };
}

/* --------------------------------------------------------------- textures */

/** SVG `<pattern>`s for the series that ask for one (bar and area kinds). */
export function patternDefs(
  entries: ReadonlyArray<{
    color: string;
    key: string;
    pattern?: ChartPattern;
  }>,
  prefix: string,
) {
  const textured = entries.filter((entry) => entry.pattern);
  if (!textured.length) return null;
  return (
    <defs>
      {textured.map((entry) => (
        <pattern
          height={6}
          id={`${prefix}-${safeId(entry.key)}`}
          key={entry.key}
          patternTransform={
            entry.pattern === "hatch" ? "rotate(45)" : undefined
          }
          patternUnits="userSpaceOnUse"
          width={6}
        >
          <rect fill={entry.color} height={6} width={6} />
          {entry.pattern === "hatch" ? (
            <rect fill={surface} height={6} width={1.6} />
          ) : (
            <circle cx={3} cy={3} fill={surface} r={1.2} />
          )}
        </pattern>
      ))}
    </defs>
  );
}

/** Fill for a series: its texture when it has one, else its color. */
export const seriesFill = (
  entry: { color: string; key: string; pattern?: ChartPattern },
  prefix: string,
) => (entry.pattern ? `url(#${prefix}-${safeId(entry.key)})` : entry.color);

/** A series key as an id fragment (`url(#…)` breaks on a space or a quote). */
export const safeId = (key: string) =>
  key.replace(/[^A-Za-z0-9_-]/g, (c) => `_${c.charCodeAt(0)}`);

/** The same texture as a legend swatch (CSS over the swatch's own color). */
export function patternSwatch(
  pattern: ChartPattern | undefined,
): React.CSSProperties | undefined {
  if (pattern === "hatch") {
    return {
      backgroundImage: `repeating-linear-gradient(45deg, ${surface} 0 1.5px, transparent 1.5px 4px)`,
    };
  }
  if (pattern === "dots") {
    return {
      backgroundImage: `radial-gradient(${surface} 1px, transparent 1.3px)`,
      backgroundSize: "4px 4px",
    };
  }
  return undefined;
}

/* ---------------------------------------------------------- focus, labels */

/** `focusSeries`: whether a series is one of the faded ones. */
export const isFaded = (
  focus: string | undefined,
  entry: { key: string; name: string },
) => focus != null && focus !== entry.key && focus !== entry.name;

/** `endLabels`: the series name at its last value, in text ink. */
export function seriesEndLabel(
  entry: { key: string; name: string },
  data: ReadonlyArray<Record<string, unknown>>,
) {
  let last = -1;
  data.forEach((row, index) => {
    if (typeof row[entry.key] === "number") last = index;
  });
  return (
    <LabelList
      content={(label: {
        index?: number;
        x?: number | string;
        y?: number | string;
      }) =>
        label.index === last ? (
          <text
            data-end-label=""
            dominantBaseline="middle"
            fill={vars["--aui-color-text"]}
            fontSize={axisTick.fontSize}
            fontWeight={600}
            x={Number(label.x) + 8}
            y={Number(label.y)}
          >
            {entry.name}
          </text>
        ) : null
      }
      dataKey={entry.key}
    />
  );
}
