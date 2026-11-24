import { useId } from "react";

import { i18n } from "@/i18n";
import {
  Area,
  AreaChart as RAreaChart,
  ComposedChart as RComposedChart,
  Bar,
  BarChart as RBarChart,
  Cell,
  Line,
  LineChart as RLineChart,
} from "recharts";

import { sharedAxes } from "./Charts.axes";
import {
  frameProps,
  useCartesianChart,
  usePreparedInput,
} from "./Charts.cartesian";
import {
  averageLine,
  baselineRule,
  ComparisonLine,
  endLabelList,
  markDots,
  plotMargin,
  projectedMark,
  RangeBand,
  signedGradients,
} from "./Charts.cartesian.marks";
import {
  accentColor,
  barRadius,
  chartMargin,
  maxBarSize,
} from "./Charts.config";
import { ChartFrame } from "./Charts.frame";
import { focusBarShape, useBarFocus } from "./Charts.focus";
import { identityLegend, withoutRuleLabels } from "./Charts.identity";
import type { LegendSlice } from "./Charts.legend";
import { activeDot, curveType } from "./Charts.marks";
import type { CartesianChartProps } from "./Charts.props";
import { comparisonLabel } from "./Charts.reference";

/*
 * The single-series cartesian forms: `AreaChart`, `LineChart`, `BarChart`.
 * Split out of `Charts.tsx` (ATL-76). Each takes the shared axis-chart options
 * (`CartesianChartOptions`); omitting them renders exactly as before. Their
 * shared engine — input preparation, rows, table, explorer — is
 * `Charts.cartesian.tsx`; their shared marks are `Charts.cartesian.marks.tsx`.
 */

/**
 * The shared engine plus the F6 identity legend under the title: the series,
 * its comparison and any labelled rule. With the legend showing, a labelled
 * rule is named there, so its label is dropped from the rule's end.
 */
function useIdentityCartesianChart(
  props: CartesianChartProps,
  { kind, mark }: { kind: "area" | "bar" | "line"; mark: LegendSlice["mark"] },
) {
  const overlay = kind !== "bar" ? props.comparison : undefined;
  const legend = identityLegend(props, {
    color: props.color ?? accentColor,
    mark,
    previousName: overlay ? comparisonLabel(overlay) : undefined,
  });
  const chart = useCartesianChart(
    legend
      ? { ...props, referenceLines: withoutRuleLabels(props.referenceLines) }
      : props,
    { kind },
  );
  return { ...chart, legend };
}

/** `frameProps` without the identity-legend options the frame does not take. */
function identityFrameProps(props: CartesianChartProps) {
  const {
    legend: _legend,
    seriesLabel: _seriesLabel,
    ...rest
  } = frameProps(props);
  return rest;
}

export function AreaChart(input: CartesianChartProps) {
  const props = usePreparedInput(input, "area");
  const { color = accentColor } = props;
  const id = useId();
  const gradientId = `atelier-area-${id}`;
  const signed = { fill: `atelier-signed-fill-${id}`, stroke: `atelier-signed-stroke-${id}` };
  const chart = useIdentityCartesianChart(props, { kind: "area", mark: "line" });
  const signedDefs = signedGradients(props, chart.values, signed);
  // An Area root does not draw a Line: the trailing mean needs the composed root.
  const AreaRoot = chart.averages ? RComposedChart : RAreaChart;
  return (
    <ChartFrame
      entranceMove="inline"
      {...identityFrameProps(props)}
      headlineStore={chart.momentStore}
      loadingShape="line"
      aside={chart.legend}
      asidePlacement="top"
      explorer={chart.explorer}
      table={chart.table}
    >
      <AreaRoot
        accessibilityLayer={false}
        data={chart.rows}
        margin={plotMargin(props)}
        syncId={props.syncId}
        {...chart.chartSelect}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {signedDefs}
        {sharedAxes(chart.axes)}
        {baselineRule(props)}
        {chart.band ? (
          <RangeBand color={color} curve={props.curve} name={chart.bandName} />
        ) : null}
        {chart.overlay ? (
          <ComparisonLine curve={props.curve} name={chart.previousName} />
        ) : null}
        <Area
          activeDot={activeDot(color)}
          baseValue={props.baseline}
          dataKey="value"
          dot={markDots(props, color, chart.values, chart.outside)}
          fill={signedDefs ? `url(#${signed.fill})` : `url(#${gradientId})`}
          isAnimationActive={false}
          name={
            chart.overlay ? i18n.t("ui:chart.currentSeries") : undefined
          }
          stroke={signedDefs ? `url(#${signed.stroke})` : color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          type={curveType(props.curve)}
        >
          {endLabelList(props, chart.values)}
        </Area>
        {averageLine(chart, { color, curve: props.curve })}
        {chart.split != null
          ? projectedMark("area", {
              color,
              curve: props.curve,
              fill: `url(#${gradientId})`,
              name: chart.unfinished,
            })
          : null}
      </AreaRoot>
    </ChartFrame>
  );
}

export function LineChart(input: CartesianChartProps) {
  const props = usePreparedInput(input, "line");
  const { color = accentColor } = props;
  const id = useId();
  const signed = { fill: `atelier-signed-fill-${id}`, stroke: `atelier-signed-stroke-${id}` };
  const chart = useIdentityCartesianChart(props, { kind: "line", mark: "line" });
  const signedDefs = signedGradients(props, chart.values, signed);
  // A LineChart root does not draw an Area: a band needs the composed root.
  const LineRoot = chart.band ? RComposedChart : RLineChart;
  return (
    <ChartFrame
      entranceMove="inline"
      {...identityFrameProps(props)}
      headlineStore={chart.momentStore}
      loadingShape="line"
      aside={chart.legend}
      asidePlacement="top"
      explorer={chart.explorer}
      table={chart.table}
    >
      <LineRoot
        accessibilityLayer={false}
        data={chart.rows}
        margin={plotMargin(props)}
        syncId={props.syncId}
        {...chart.chartSelect}
      >
        {signedDefs}
        {sharedAxes(chart.axes)}
        {baselineRule(props)}
        {chart.band ? (
          <RangeBand color={color} curve={props.curve} name={chart.bandName} />
        ) : null}
        {chart.overlay ? (
          <ComparisonLine curve={props.curve} name={chart.previousName} />
        ) : null}
        <Line
          activeDot={activeDot(color)}
          dataKey="value"
          dot={markDots(props, color, chart.values, chart.outside)}
          isAnimationActive={false}
          name={
            chart.overlay ? i18n.t("ui:chart.currentSeries") : undefined
          }
          stroke={signedDefs ? `url(#${signed.stroke})` : color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          type={curveType(props.curve)}
        >
          {endLabelList(props, chart.values)}
        </Line>
        {averageLine(chart, { color, curve: props.curve })}
        {chart.split != null
          ? projectedMark("line", { color, curve: props.curve, name: chart.unfinished })
          : null}
      </LineRoot>
    </ChartFrame>
  );
}

export function BarChart(input: CartesianChartProps) {
  const props = usePreparedInput(input, "bar");
  const { color = accentColor, data } = props;
  const chart = useIdentityCartesianChart(props, { kind: "bar", mark: "dot" });
  const highlight = props.highlightLabels?.length ? props.highlightLabels : null;
  // A standing selection (highlightLabels) owns the dimming; hover focus
  // applies only without one.
  const focus = useBarFocus(chart.explorer.activeIndex, chart.chartSelect);
  return (
    <ChartFrame
      entranceMove="inline"
      {...identityFrameProps(props)}
      headlineStore={chart.momentStore}
      loadingShape="bars"
      aside={chart.legend}
      asidePlacement="top"
      explorer={chart.explorer}
      table={chart.table}
    >
      <RBarChart
        accessibilityLayer={false}
        data={data}
        margin={chartMargin}
        syncId={props.syncId}
        {...(highlight ? chart.chartSelect : focus.handlers)}
      >
        {sharedAxes({ ...chart.axes, categorical: true })}
        <Bar
          dataKey="value"
          fill={color}
          shape={highlight ? undefined : focusBarShape(focus.store)}
          isAnimationActive={false}
          maxBarSize={maxBarSize}
          radius={barRadius}
        >
          {data.map((point, index) => (
            <Cell
              // A projected bar is the same entity, not yet observed: its own
              // ink, washed out, so it never reads as a second series.
              data-dimmed={highlight && !highlight.includes(point.label) ? "" : undefined}
              data-projected={chart.projected(index) ? "" : undefined}
              fill={point.color ?? color}
              fillOpacity={
                chart.projected(index)
                  ? 0.4
                  : highlight && !highlight.includes(point.label)
                    ? 0.3
                    : 1
              }
              key={`${point.label}-${index}`}
            />
          ))}
        </Bar>
      </RBarChart>
    </ChartFrame>
  );
}
