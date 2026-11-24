import {
  CartesianGrid,
  ComposedChart as RComposedChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useId, useRef } from "react";

import { i18n, useTranslation } from "@/i18n";

import {
  rowLabelWidth,
  selectHandler,
  sharedAxes,
} from "./Charts.axes";
import {
  axisColor,
  axisTick,
  bandCursorFor,
  CHART_PALETTE_SIZE,
  chartMargin,
  chartPalette,
  gridColor,
  tooltipMotion,
} from "./Charts.config";
import { keyboardByDefault, useChartExplorer } from "./Charts.explore";
import {
  formatChartReadout,
  formatChartShare,
  formatChartValue,
  shareOf,
} from "./Charts.format";
import { comparisonInk } from "./Charts.reference";
import { ChartFrame } from "./Charts.frame";
import { useBarFocus } from "./Charts.focus";
import {
  ChartLegend,
  resolvePlacement,
  useHiddenLabels,
} from "./Charts.legend";
import type { SeriesChartProps, SeriesDatum } from "./Charts.props";
import { useActivePointReport } from "./Charts.cartesian";
import {
  divergingPlan, patternDefs, patternSwatch, stackGroups,
} from "./Charts.series.extras";
import { logAxis, logSafe, resolveTimeAxis, withEpochTimes } from "./Charts.time";
import { seriesAreaGradients, seriesMarks } from "./Charts.series.marks";
import { tooltipContent } from "./Charts.tooltip";

/**
 * Multi-series cartesian chart over shared categories, mixing bars, lines, and
 * areas on one axis — the general form behind composition-style dashboards
 * (stacked load per person, created vs. completed with a net line). A bar +
 * line pair is a `bar` series plus a `line` series, with a legend (the
 * legend-less `ComposedChart` shorthand for it was removed on 2026-11-08).
 *
 * All series share one value axis, so only combine series measured in the same
 * unit; a percentage next to a count needs its own card.
 */
export function SeriesChart(input: SeriesChartProps) {
  useTranslation();
  const div = divergingPlan(input);
  const {
  annotations,
  axes = true,
  bands,
  brush,
  className,
  connectNulls = false,
  data: inputData,
  defaultHiddenLabels,
  description,
  formatValue,
  formatAxisValue,
  formatRightAxisValue,
  height,
  hiddenLabels,
  icon,
  id,
  keyboard: keyboardProp,
  referenceLines,
  renderTooltip,
  style,
  layout = "columns",
  legend = "top",
  onBrushChange,
  onHiddenLabelsChange,
  onSelectPoint,
  onToggleLabel,
  series,
  stacked = false,
  syncId,
  tableToggle,
  valueDomain,
  title,
  tooltip,
  xstyle,
  live = false,
  windowSize,
  diverging: _diverging,
  endLabels = false,
  focusSeries,
  onActivePointChange,
  paused = false,
  spans,
  timeAxis,
  valueScale,
  ...state
} = div?.props ?? input;
  const held = useRef(inputData);
  if (!paused) held.current = inputData;
  const source = paused ? held.current : inputData;
  const windowedData =
    windowSize && windowSize > 0 && source.length > windowSize
      ? source.slice(source.length - windowSize)
      : source;
  // A time axis exists only in the columns layout; rows keep every row.
  const data: SeriesDatum[] = timeAxis && layout !== "rows"
    ? (withEpochTimes(windowedData as Array<SeriesDatum & { time?: unknown }>) as unknown as SeriesDatum[])
    : windowedData;
  const log = valueScale === "log" && !div;
  const patternId = `atelier-series-pattern-${useId()}`;
  const rows = layout === "rows";
  const keyboard = keyboardProp ?? keyboardByDefault(title);
  const percent = stacked === "percent";
  const read = formatValue ?? formatChartReadout;
  // The ceiling is the palette's, so it binds the series that draw from it. A
  // set where every series names its own color is separated by whatever the
  // caller chose, and the palette has no say in how many of those there may be.
  const paletteOverflow =
    series.length > CHART_PALETTE_SIZE &&
    series.some((entry) => entry.color == null);
  const chartSeries = paletteOverflow ? [] : series;
  const { hidden, toggle } = useHiddenLabels({
    defaultHiddenLabels,
    hiddenLabels,
    onHiddenLabelsChange,
    onToggleLabel,
  });
  // Colors resolve from the full series order before any is hidden, so hiding
  // a series never repaints the rest; the legend lists every series.
  // A comparison series takes no palette slot: slots count data series only,
  // so adding a previous period never repaints the current ones.
  let slot = 0;
  // A 100% stack has no place for a raw reading, so its lines stay out.
  const drawn = percent
    ? chartSeries.filter(
        (entry) =>
          entry.variant !== "comparison" && (entry.kind ?? "bar") !== "line",
      )
    : log
      ? chartSeries.filter((entry) => (entry.kind ?? "bar") !== "bar")
      : chartSeries;
  const all = drawn.map((entry) => {
    const comparison = entry.variant === "comparison";
    const color = comparison
      ? (entry.color ?? comparisonInk)
      : (entry.color ?? chartPalette[slot] ?? comparisonInk);
    if (!comparison) slot += 1;
    return {
      axis: entry.axis === "right" ? ("right" as const) : undefined,
      color,
      comparison,
      curve: entry.curve,
      format: entry.format,
      highKey: entry.highKey,
      key: entry.key,
      kind: comparison ? ("line" as const) : (entry.kind ?? "bar"),
      name: entry.label ?? entry.key,
      pattern: entry.pattern,
      legendName:
        entry.axis === "right"
          ? `${entry.label ?? entry.key} (right)`
          : (entry.label ?? entry.key),
      stack: comparison
        ? undefined
        : (entry.stack ?? (stacked ? "atelier-stack" : undefined)),
    };
  });
  // Hidden series leave the plot, the tooltip, the domain and the table twin.
  const resolved = all.filter((entry) => !hidden.includes(entry.name));
  // A range series reads [low, high] from one synthetic key per row.
  const rangeKey = (key: string) => `__range_${key}`;
  const ranges = resolved.filter((entry) => entry.kind === "range" && entry.highKey);
  const logged = log
    ? data.map((row) => {
        const next: Record<string, unknown> = { ...row };
        for (const entry of resolved) next[entry.key] = logSafe(row[entry.key]);
        return next as typeof row;
      })
    : data;
  const plotData = ranges.length
    ? logged.map((row) => {
        const next: Record<string, unknown> = { ...row };
        for (const entry of ranges) {
          const low = row[entry.key];
          const high = row[entry.highKey!];
          next[rangeKey(entry.key)] =
            typeof low === "number" && typeof high === "number"
              ? [low, high]
              : null;
        }
        return next as typeof row;
      })
    : logged;
  const rangeCell = (row: (typeof data)[number], entry: (typeof resolved)[number]) => {
    const low = row[entry.key];
    const high = entry.highKey ? row[entry.highKey] : undefined;
    return typeof low === "number" && typeof high === "number"
      ? ([low, high] as const)
      : null;
  };
  // Only the top segment of a stack gets the rounded cap — rounding every
  // segment would read as separate bars sitting on each other.
  const topOfStack = new Map<string, string>();
  for (const entry of resolved) {
    if (entry.kind === "bar" && entry.stack) {
      topOfStack.set(entry.stack, entry.key);
    }
  }
  const placement = resolvePlacement(legend);
  const comparisonKey = resolved.find((entry) => entry.comparison)?.key;
  // Percent mode: each series' share is read against the visible members of
  // its own stack group, which is also what recharts' "expand" offset fills.
  const shareGroups = percent ? stackGroups(resolved) : undefined;
  const share = (row: (typeof data)[number], key: string) =>
    shareOf(row, key, shareGroups);
  const select = rows
    ? selectHandler([], undefined)
    : selectHandler(data, onSelectPoint);
  const { select: selectIndex, ...chartSelect } = select;
  const rightAxis =
    !rows && !percent && resolved.some((entry) => entry.axis === "right");
  const formatByKey = Object.fromEntries(
    resolved
      .filter((entry) => entry.format)
      .flatMap((entry) => [
        [entry.key, entry.format!],
        [`__range_${entry.key}`, entry.format!],
      ]),
  );
  const hasFormats = Object.keys(formatByKey).length > 0;
  const explorer = useChartExplorer({
    count: data.length,
    onSelect: selectIndex,
    describe: div ? (index) => div.describeRow(data[index]!, hidden) : (index) => {
      const row = data[index]!;
      const values = resolved.map((entry) => {
        if (entry.kind === "range") {
          const band = rangeCell(row, entry);
          const own = entry.format ?? read;
          return band
            ? `${entry.name} ${own(band[0])} to ${own(band[1])}`
            : `${entry.name} no value`;
        }
        const cell = row[entry.key];
        if (typeof cell !== "number") return `${entry.name} no value`;
        const part = share(row, entry.key);
        const own = entry.format ?? read;
        return part == null
          ? `${entry.name} ${own(cell)}`
          : `${entry.name} ${formatChartShare(part)} (${own(cell)})`;
      });
      return [String(row.label), ...values].join(", ");
    },
    enabled: keyboard && !rows,
  });
  const firstKey = resolved[0]?.key;
  // A diverging row has no single value (negated halves): only its category.
  const activeRows = data.map((row) => ({ label: String(row.label), value: firstKey && !div ? (row[firstKey] as number | null) : null }));
  const active = useActivePointReport(activeRows, onActivePointChange, explorer.activeIndex);
  const focus = useBarFocus(explorer.activeIndex, { ...chartSelect, ...active });
  const time = rows ? null : resolveTimeAxis(timeAxis, data.map((row) => (typeof row.time === "number" ? row.time : null)));
  const patterned = resolved.filter((entry) => entry.pattern);
  const tooltipOptions =
    comparisonKey || shareGroups || hasFormats || patterned.length
      ? {
          ...tooltip,
          colorByKey: patterned.length ? Object.fromEntries(patterned.map((entry) => [entry.key, entry.color])) : undefined,
          comparisonKey,
          formatByKey: hasFormats ? formatByKey : undefined,
          shareGroups,
        }
      : tooltip;
  const valueAxisFormat = percent
    ? formatChartShare
    : (formatAxisValue ?? formatChartValue);
  return (
    <ChartFrame
      {...state}
      // Streaming data never performs. The marks are uncovered along the
      // category axis, which runs down the card for rows.
      entrance={live ? false : state.entrance}
      entranceMove={rows ? "block" : "inline"}
      explorer={explorer}
      loadingShape={
        rows
          ? "rows"
          : series.some((entry) => (entry.kind ?? "bar") === "bar")
            ? "bars"
            : "line"
      }
      formatValue={formatValue}
      ordered={!rows && !div}
      paused={paused}
      tableToggle={tableToggle}
      aside={
        placement && !paletteOverflow ? (
          <ChartLegend
            formatValue={formatValue}
            hiddenLabels={hidden}
            label={i18n.t("ui:chart.seriesLegend")}
            onToggleLabel={toggle}
            placement={placement}
            slices={div?.legend ?? all.map((entry) => ({
              color: entry.color,
              label: entry.name,
              swatchStyle: patternSwatch(entry.pattern),
              mark: entry.comparison
                ? ("dashed" as const)
                : entry.kind === "line" || entry.kind === "area"
                  ? ("line" as const)
                  : ("dot" as const),
              ...(entry.axis === "right" ? { display: entry.legendName } : {}),
            }))}
          />
        ) : null
      }
      asidePlacement={placement ?? undefined}
      className={className}
      xstyle={xstyle}
      description={description}
      empty={data.length === 0 || resolved.length === 0 || paletteOverflow}
      // The overflow message outranks a caller's empty title: it is the
      // reason nothing is drawn.
      emptyState={
        paletteOverflow
          ? {
              title: i18n.t("ui:chart.tooManySeries", {
                max: CHART_PALETTE_SIZE,
              }),
            }
          : state.emptyState
      }
      height={height}
      icon={icon}
      id={id}
      style={style}
      table={div ? div.tableFor(data, hidden) : {
        columns: [
          i18n.t("ui:chart.column.category"),
          ...resolved.map((entry) => entry.name),
        ],
        rows: data.map((row) => [
          row.label,
          ...resolved.map((entry) => {
            if (entry.kind === "range") {
              const band = rangeCell(row, entry);
              const own = entry.format ?? formatValue ?? formatChartReadout;
              return band ? `${own(band[0])} – ${own(band[1])}` : "—";
            }
            const cell = row[entry.key];
            return typeof cell === "number" || typeof cell === "string"
              ? cell
              : "—";
          }),
        ]),
      }}
      title={title}
    >
      <RComposedChart
        accessibilityLayer={false}
        data={plotData}
        layout={rows ? "vertical" : "horizontal"}
        margin={endLabels ? { ...chartMargin, right: 72 } : chartMargin}
        stackOffset={percent ? "expand" : div ? "sign" : undefined}
        syncId={syncId}
        {...focus.handlers}
      >
        {patternDefs(resolved, patternId)}
        {seriesAreaGradients(resolved, patternId)}
        {rows ? (
          <>
            {axes ? (
              <CartesianGrid horizontal={false} stroke={gridColor} />
            ) : null}
            <XAxis
              axisLine={false}
              hide={!axes}
              stroke={axisColor}
              tick={axisTick}
              domain={div ? valueDomain : undefined}
              tickFormatter={valueAxisFormat}
              tickLine={false}
              type="number"
            />
            <YAxis
              axisLine={false}
              dataKey="label"
              hide={!axes}
              stroke={axisColor}
              tick={axisTick}
              tickLine={false}
              type="category"
              width={axes ? rowLabelWidth : 0}
            />
            <Tooltip
              {...tooltipMotion}
              content={tooltipContent(
                renderTooltip,
                formatValue,
                tooltipOptions,
              )}
              cursor={bandCursorFor(plotData.length)}
            />
          </>
        ) : (
          sharedAxes({
            activeIndex: explorer.activeIndex,
            annotations,
            bands,
            brush,
            formatRightAxisValue,
            labels: data.map((row) => String(row.label)),
            onBrushChange,
            rightAxis,
            spans,
            time,
            times: time ? data.map((row) => (typeof row.time === "number" ? row.time : null)) : undefined,
            valueDomain,
            valueLog: log ? logAxis(resolved.flatMap((entry) => data.map((row) => row[entry.key] as number))) : null,
            categorical: resolved.some((entry) => entry.kind === "bar"),
            formatAxisValue: valueAxisFormat,
            formatValue,
            referenceLines,
            renderTooltip,
            tooltip: tooltipOptions,
          })
        )}
        {seriesMarks(resolved, {
          connectNulls,
          data,
          endLabels,
          focusSeries,
          idPrefix: patternId,
          rangeKey,
          rightAxis: Boolean(rightAxis),
          rows,
          focus: focus.store,
          topOfStack,
        })}
      </RComposedChart>
    </ChartFrame>
  );
}
