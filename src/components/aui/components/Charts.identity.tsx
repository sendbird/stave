import { i18n } from "@/i18n";

import type { CartesianChartProps } from "./Charts.props";
import { ChartLegend, type LegendSlice } from "./Charts.legend";
import { comparisonInk, lineInk } from "./Charts.reference";

/**
 * F6 identity legend under the title for the single-series forms
 * (`AreaChart`, `LineChart`, `BarChart`): the series, its comparison and any
 * labelled reference rule, each marked the way the plot draws it. Nothing to
 * name — no comparison, no labelled rule — means no legend, so a plain
 * single-series chart renders as before.
 */
export function identityLegend(
  props: CartesianChartProps,
  {
    color,
    mark,
    previousName,
  }: { color: string; mark: LegendSlice["mark"]; previousName?: string },
) {
  if (props.legend === false) return undefined;
  const rules = (props.referenceLines ?? []).filter((line) => line.label);
  // A labelled range ("Usual") is part of the chart's identity too. Leaving
  // it out also meant a range chart beside a rule chart (Service health's
  // Errors next to Latency) drew no legend, so its plot started ~20px higher
  // and the two hover-linked time axes no longer lined up.
  const rangeLabel = props.range?.label;
  if (!previousName && rules.length === 0 && !rangeLabel) return undefined;
  const slices: LegendSlice[] = [
    {
      color,
      label: props.seriesLabel ?? i18n.t("ui:chart.currentSeries"),
      mark,
    },
    ...(rangeLabel
      ? [
          {
            // The band's own wash (`rangeArea`: series ink at 16%).
            color: `color-mix(in oklab, ${color} 16%, transparent)`,
            label: rangeLabel,
          },
        ]
      : []),
    ...(previousName
      ? [{ color: comparisonInk, label: previousName, mark: "dashed" as const }]
      : []),
    ...rules.map((line) => ({
      color: lineInk[line.tone ?? "neutral"],
      label: line.label!,
      mark: "dashed" as const,
    })),
  ];
  return <ChartLegend
      label={i18n.t("ui:chart.seriesLegend")}
      placement="top"
      slices={slices}
    />;
}

/**
 * With the identity legend showing, a labelled rule is named there; printing
 * its label again at the rule's end collided with the series on a narrow card.
 */
export function withoutRuleLabels(
  lines: CartesianChartProps["referenceLines"],
): CartesianChartProps["referenceLines"] {
  return lines?.map(({ label: _label, ...line }) => line);
}
