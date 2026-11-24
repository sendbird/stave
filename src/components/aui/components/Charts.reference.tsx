import { ReferenceArea, ReferenceLine } from "recharts";

import { i18n } from "@/i18n";

import { vars } from "../tokens/tokens.stylex";
import { axisTick } from "./Charts.config";
import type {
  ChartComparison,
  ChartPoint,
  ChartReferenceBand,
  ChartReferenceLine,
  ChartReferenceTone,
} from "./Charts.props";

/*
 * Reference marks and the previous-period overlay for the axis charts.
 *
 * A reference is read against the data, so it never takes a palette slot: a
 * neutral rule is the strong border ink, a status rule is its status ink. Rules
 * are dashed because the system reserves dashes for thresholds and projections
 * (the grid is solid for exactly that reason).
 */

/** A reference rule's ink by tone — shared with the legend's rule mark. */
export const lineInk: Record<ChartReferenceTone, string> = {
  danger: vars["--aui-color-danger"],
  neutral: vars["--aui-color-border-strong"],
  success: vars["--aui-color-success"],
  warning: vars["--aui-color-warning"],
};

const bandWash: Record<ChartReferenceTone, string> = {
  danger: vars["--aui-color-danger-soft"],
  neutral: vars["--aui-color-border-subtle"],
  success: vars["--aui-color-success-soft"],
  warning: vars["--aui-color-warning-soft"],
};

/** Name of the key the comparison values are merged under on each datum. */
/**
 * Clearance for a label printed on the plot (a rule's "SLO 2,000 ms", a
 * band's name). Labels sit above the series layer, but a series line still
 * ran straight through the glyphs; a surface-coloured halo painted under the
 * text gives the label its own gap wherever a line crosses it.
 */
export const plotLabelHalo = {
  paintOrder: "stroke",
  stroke: vars["--aui-color-surface-raised"],
  strokeLinejoin: "round",
  // 3px each side closes the gaps between 12px glyphs, so a crossing line
  // breaks for the whole word instead of showing between letters.
  strokeWidth: 6,
} as const;

export const COMPARISON_KEY = "previous";

/** The comparison stroke: muted, dashed, no palette slot. */
export const comparisonInk = vars["--aui-color-text-muted"];

export function referenceMarks({
  bands,
  referenceLines,
}: {
  bands?: ChartReferenceBand[];
  referenceLines?: ChartReferenceLine[];
}) {
  if (!bands?.length && !referenceLines?.length) return null;
  return (
    <>
      {bands?.map((band, index) => (
        <ReferenceArea
          fill={bandWash[band.tone ?? "neutral"]}
          fillOpacity={band.tone && band.tone !== "neutral" ? 0.6 : 0.5}
          ifOverflow="extendDomain"
          key={`band-${index}`}
          label={
            band.label
              ? {
                  ...axisTick,
                  ...plotLabelHalo,
                  position: "insideTopLeft",
                  value: band.label,
                }
              : undefined
          }
          y1={band.from}
          y2={band.to}
        />
      ))}
      {referenceLines?.map((line, index) => (
        <ReferenceLine
          ifOverflow="extendDomain"
          key={`line-${index}`}
          label={
            line.label
              ? {
                  ...axisTick,
                  ...plotLabelHalo,
                  fill: lineInk[line.tone ?? "neutral"],
                  position: "insideBottomRight",
                  value: line.label,
                }
              : undefined
          }
          stroke={lineInk[line.tone ?? "neutral"]}
          strokeDasharray="4 4"
          strokeWidth={1.5}
          y={line.value}
        />
      ))}
    </>
  );
}

/**
 * Merges a previous period into the current points by position, under
 * `COMPARISON_KEY`. A missing previous value stays `null` so the line gaps
 * rather than inventing a zero.
 */
export function withComparison(
  data: ChartPoint[],
  comparison?: ChartComparison,
): Array<ChartPoint & { previous?: number | null }> {
  if (!comparison) return data;
  return data.map((point, index) => ({
    ...point,
    [COMPARISON_KEY]: comparison.data[index]?.value ?? null,
  }));
}

export function comparisonLabel(comparison?: ChartComparison) {
  return comparison?.label ?? i18n.t("ui:chart.previousPeriod");
}

/** Name of the key the projected run is drawn under (see `projectedFrom`). */
export const PROJECTED_KEY = "projected";

/**
 * The index the projection starts from, or null when nothing is projected —
 * an unknown label, an index out of range, or the last point (a projection
 * with no points after it draws nothing).
 */
export function projectionIndex(
  data: ReadonlyArray<{ label: string }>,
  projectedFrom: number | string | undefined,
): number | null {
  if (projectedFrom == null) return null;
  const index =
    typeof projectedFrom === "number"
      ? Math.floor(projectedFrom)
      : data.findIndex((point) => point.label === projectedFrom);
  return index >= 0 && index < data.length - 1 ? index : null;
}

/**
 * Splits `value` into an observed run (up to and including `split`) and a
 * projected run under `PROJECTED_KEY` (from `split` on), so the dashed line
 * starts at the last observed point instead of leaving a gap before it.
 */
export function withProjection<T extends { value?: number | null }>(
  rows: T[],
  split: number | null,
): Array<T & { projected?: number | null }> {
  if (split == null) return rows;
  return rows.map((row, index) => ({
    ...row,
    [PROJECTED_KEY]: index >= split ? (row.value ?? null) : null,
    value: index <= split ? row.value : null,
  }));
}
