import type * as React from "react";

import { i18n, useTranslation } from "@/i18n";

import { specOptions, validateChartSpec } from "./ChartSpec.validate";
import { BarList } from "./BarList";
import { AreaChart, BarChart, LineChart } from "./Charts.basic";
import { ChartCard } from "./Charts.card";
import { chartFormat } from "./Charts.format";
import { IntervalChart, type IntervalDatum } from "./Charts.interval";
import type {
  CartesianChartProps,
  ChartPoint,
  ChartSeries,
  SeriesChartProps,
  SeriesDatum,
} from "./Charts.props";
import { PieChart } from "./Charts.radial";
import { SeriesChart } from "./Charts.series";
import { Heatmap, type HeatmapCell } from "./Heatmap";

/**
 * A chart as data: what an AI agent, a saved dashboard or a server can write
 * as JSON and hand to AUI, which checks it (`validateChartSpec`) before it
 * draws it (`ChartFromSpec`). Functions cannot travel in JSON, so formatting is
 * named (`format: "percent"`) instead of passed.
 */
export type ChartSpecFormat =
  | "compact"
  | "duration"
  | "number"
  | "percent"
  | "ratio"
  | `currency:${string}`;

type SpecBase = {
  description?: string;
  /** Value formatting by name; see `ChartSpecFormat`. */
  format?: ChartSpecFormat;
  height?: number;
  /** BCP 47 locale for `format` ("ko-KR"). @default "en-US" */
  locale?: string;
  title?: string;
};

type CartesianSpecOptions = Pick<
  CartesianChartProps,
  | "annotations"
  | "bands"
  | "comparison"
  | "curve"
  | "dots"
  | "downloadCsv"
  | "downloadImage"
  | "maxItems"
  | "maxPoints"
  | "movingAverage"
  | "partialFrom"
  | "projectedFrom"
  | "range"
  | "referenceLines"
  | "spans"
  | "summaryLine"
  | "tableToggle"
  | "timeAxis"
  | "valueDomain"
  | "valueScale"
>;

export type ChartSpec =
  | (SpecBase & {
      data: ChartPoint[];
      options?: CartesianSpecOptions;
      type: "area" | "bar" | "line";
    })
  | (SpecBase & {
      data: SeriesDatum[];
      options?: Pick<
        SeriesChartProps,
        | "diverging"
        | "focusSeries"
        | "layout"
        | "stacked"
        | "summaryLine"
        | "tableToggle"
        | "timeAxis"
        | "valueScale"
      >;
      series: ChartSeries[];
      type: "series";
    })
  | (SpecBase & {
      data: ChartPoint[];
      options?: { donut?: boolean; maxSlices?: number };
      type: "pie";
    })
  | (SpecBase & {
      data: ChartPoint[];
      options?: { highlightLabels?: string[]; maxItems?: number };
      type: "barlist";
    })
  | (SpecBase & {
      data: IntervalDatum[];
      options?: {
        goodDirection?: "down" | "none" | "up";
        reference?: number;
        referenceLabel?: string;
      };
      type: "interval";
    })
  | (SpecBase & {
      cells: HeatmapCell[];
      options?: {
        highlightDiagonal?: boolean;
        normalize?: "column" | "row";
        showValues?: boolean;
      };
      type: "heatmap";
    });

export {
  CHART_SPEC_OPTIONS,
  CHART_SPEC_TYPES,
  specOptions,
  validateChartSpec,
  type ChartSpecIssue,
  type ChartSpecType,
} from "./ChartSpec.validate";

/** A named `format` as the formatter the charts take. */
export function specFormatter(
  format: ChartSpecFormat | undefined,
  locale = "en-US",
) {
  if (!format) return undefined;
  if (format.startsWith("currency:"))
    return chartFormat.currency({ currency: format.slice(9), locale });
  switch (format) {
    case "compact":
      return chartFormat.compact({ locale });
    case "duration":
      return chartFormat.duration();
    case "number":
      return chartFormat.number({ locale });
    case "percent":
      return chartFormat.percent({ locale });
    case "ratio":
      return chartFormat.percent({ from: "ratio", locale });
    default:
      return undefined;
  }
}

export type ChartFromSpecProps = {
  className?: string;
  /** Shown instead of the chart when the spec has errors. @default the first error */
  invalidMessage?: React.ReactNode;
  spec: ChartSpec;
};

/**
 * Draws a `ChartSpec` with the matching AUI chart, after `validateChartSpec`.
 * A spec with errors draws the chart card's error state with the first error,
 * never a half-drawn chart.
 */
export function ChartFromSpec({
  className,
  invalidMessage,
  spec,
}: ChartFromSpecProps) {
  useTranslation();
  const { issues, valid } = validateChartSpec(spec);
  const common = {
    className,
    description: spec.description,
    height: spec.height,
    title: spec.title,
  };
  if (!valid) {
    const first = issues.find((issue) => issue.level === "error");
    return (
      <ChartCard
        {...common}
        error={
          invalidMessage ??
          i18n.t("ui:chart.invalidSpec", {
            detail: first
              ? `${first.path ? `${first.path} — ` : ""}${first.message}`
              : i18n.t("ui:chart.invalidSpecFallback"),
          })
        }
      >
        {null}
      </ChartCard>
    );
  }
  const format = specFormatter(spec.format, spec.locale);
  // Only the keys this type accepts reach the chart (see CHART_SPEC_OPTIONS).
  const options = specOptions(spec.type, spec.options);
  switch (spec.type) {
    case "area":
      return (
        <AreaChart
          {...common}
          {...(options as object)}
          data={spec.data}
          formatValue={format}
        />
      );
    case "bar":
      return (
        <BarChart
          {...common}
          {...(options as object)}
          data={spec.data}
          formatValue={format}
        />
      );
    case "line":
      return (
        <LineChart
          {...common}
          {...(options as object)}
          data={spec.data}
          formatValue={format}
        />
      );
    case "series":
      return (
        <SeriesChart
          {...common}
          {...(options as object)}
          data={spec.data}
          formatValue={format}
          series={spec.series}
        />
      );
    case "pie":
      return (
        <PieChart
          {...common}
          {...(options as object)}
          data={spec.data}
          formatValue={format}
        />
      );
    case "barlist":
      return (
        <ChartCard
          {...common}
          formatValue={format}
          table={{
            columns: [
              i18n.t("ui:chart.column.item"),
              i18n.t("ui:chart.column.value"),
            ],
            rows: spec.data.map((d) => [d.label, d.value]),
          }}
        >
          <BarList
            {...(options as object)}
            aria-label={spec.title}
            data={spec.data}
            formatValue={format}
          />
        </ChartCard>
      );
    case "interval":
      return (
        <IntervalChart
          {...common}
          {...(options as object)}
          data={spec.data}
          formatValue={format}
        />
      );
    case "heatmap":
      return (
        <Heatmap
          {...common}
          {...(options as object)}
          cells={spec.cells}
          formatValue={format}
        />
      );
  }
}
