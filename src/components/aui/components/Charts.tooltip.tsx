import type * as React from "react";

import { i18n } from "@/i18n";

import { themeProps, themeSlotProps } from "../theming/theme-props";
import { cx, sx } from "../utils/stylex";
import { formatDelta } from "./Charts.explore";
import { formatChartReadout, formatChartShare, shareOf } from "./Charts.format";
import { styles } from "./Charts.styles";

/**
 * The chart family's tooltip: its surface, its default body, and the wrapper
 * that lets a caller replace that body without losing the box.
 *
 * A sibling module of `Charts.tsx` rather than part of it — the chart file is
 * at this package's source-size ceiling, and the tooltip is the one part of it
 * a caller now composes with, so it is also the part worth reading on its own.
 */
type TooltipEntry = {
  color?: string;
  dataKey?: string | number;
  name?: string;
  payload?: Record<string, unknown> & { fill?: string };
  value?: number | string;
};

/** One hovered series, as recharts hands it to a tooltip. */
export type ChartTooltipEntry = {
  color?: string;
  dataKey?: string | number;
  name?: string;
  /** The whole datum the point came from, so a renderer can read its siblings. */
  payload?: Record<string, unknown>;
  value?: number | string;
};

export type ChartTooltipRenderProps = {
  active?: boolean;
  /** The hovered category — the x value, or the slice name on a share chart. */
  label?: React.ReactNode;
  payload?: ChartTooltipEntry[];
};

/**
 * Replaces the tooltip body with the caller's own.
 *
 * The default tooltip states label, swatch, series name and value, which is
 * every fact the chart itself holds. A renderer is for facts it does not: a
 * share of a total the chart was never given, a unit the value alone cannot
 * carry, a glyph that encodes a rating. Anything the chart already knows should
 * stay on the default so tooltips read the same across the system.
 */
export type ChartTooltipRenderer = (
  props: ChartTooltipRenderProps,
) => React.ReactNode;

/**
 * Element wrapper for a caller's renderer. recharts clones its `content`
 * element with the hover state, which is the same path `ChartTooltip` takes —
 * so the renderer receives exactly what the default body receives.
 */
function CustomTooltip({
  active,
  label,
  payload,
  render,
}: ChartTooltipRenderProps & { render: ChartTooltipRenderer }) {
  return <>{render({ active, label, payload })}</>;
}

/** How the default tooltip body reads. Ignored when `renderTooltip` is set. */
export type ChartTooltipOptions = {
  /** Series key beside each row. @default "dot" */
  indicator?: "dashed" | "dot" | "line" | "none";
  /** Drop the category heading (the x value). @default false */
  hideLabel?: boolean;
  /** Rewrites the category heading ("Sep 3" → "Tue, Sep 3"). */
  formatLabel?: (label: string) => React.ReactNode;
  /** Add a Total row summing the numeric rows (stacked series). @default false */
  total?: boolean;
  /**
   * Which way the Change row is good news — `up` for revenue, `down` for
   * latency or cost. The row then says "better" or "worse" after the signed
   * change, so its meaning never rests on color. @default none
   */
  goodDirection?: "down" | "up";
};

/** Reads the default body; set by the axis charts from their public props. */
export type ChartTooltipBodyOptions = ChartTooltipOptions & {
  /** Data key of the previous-period overlay, to state the signed change. */
  comparisonKey?: string;
  /**
   * The tooltip is pinned by the keyboard explorer, which re-mounts it on
   * every arrow press: skip the entrance fade so stepping never flickers.
   */
  still?: boolean;
  /** Per-series readout formatters by data key (`ChartSeries.format`). */
  formatByKey?: Record<string, (value: number) => string>;
  /** Swatch colors by data key, where the mark's fill is a pattern (`url(#…)`). */
  colorByKey?: Record<string, string>;
  /**
   * Data key of the projected run. At the point where observation hands over
   * to projection both keys hold the same value; the tooltip states it once.
   */
  projectedKey?: string;
  /**
   * Percent stacking: each series key → the visible keys of its stack. A row
   * then reads its share first and keeps the raw value beside it.
   */
  shareGroups?: Record<string, string[]>;
  /** Heading for a numeric (time-axis) category. */
  timeLabel?: (time: number) => string;
};

/** The element every chart hands to recharts as its `<Tooltip content>`. */
export function tooltipContent(
  renderTooltip?: ChartTooltipRenderer,
  formatValue: (value: number) => string = formatChartReadout,
  options?: ChartTooltipBodyOptions,
) {
  return renderTooltip ? (
    <CustomTooltip render={renderTooltip} />
  ) : (
    <ChartTooltip formatValue={formatValue} options={options} />
  );
}

/**
 * The tooltip's own surface — box, elevation and heading row.
 *
 * Exported so a `renderTooltip` can change what the tooltip says without
 * rebuilding what it looks like. A tooltip assembled from these parts stays
 * identical to every other one on the page when the theme or the elevation
 * scale moves.
 */
export function ChartTooltipSurface({
  children,
  label,
  still = false,
}: {
  children: React.ReactNode;
  label?: React.ReactNode;
  /** No entrance fade (a keyboard-pinned tooltip that re-mounts per step). */
  still?: boolean;
}) {
  const hasLabel = label != null && label !== "";
  const tooltipTheme = themeProps("chart-tooltip");
  return (
    <div
      className={cx(
        sx(styles.tooltip, still && styles.tooltipStill),
        tooltipTheme.className,
      )}
    >
      {hasLabel ? (
        <span
          className={sx(styles.tooltipLabel)}
          {...themeSlotProps("chart-tooltip", "label")}
        >
          {label}
        </span>
      ) : null}
      {children}
    </div>
  );
}

/** One `swatch · name · value` line inside a `ChartTooltipSurface`. */
export function ChartTooltipRow({
  color,
  indicator = "dot",
  name,
  value,
}: {
  color?: string;
  /** Series key shape. @default "dot" */
  indicator?: ChartTooltipOptions["indicator"];
  name?: React.ReactNode;
  value: React.ReactNode;
}) {
  return (
    <span className={sx(styles.tooltipRow)}>
      {color && indicator !== "none" ? (
        <span
          aria-hidden
          className={sx(
            styles.tooltipSwatch,
            indicator === "line" && styles.tooltipSwatchLine,
            indicator === "dashed" && styles.tooltipSwatchDashed,
          )}
          style={
            indicator === "dashed"
              ? { borderColor: color }
              : { backgroundColor: color }
          }
          {...themeSlotProps("chart-tooltip", "swatch")}
        />
      ) : null}
      {name ? (
        <span
          className={sx(styles.tooltipName)}
          {...themeSlotProps("chart-tooltip", "name")}
        >
          {name}
        </span>
      ) : null}
      <span
        className={sx(styles.tooltipValue)}
        {...themeSlotProps("chart-tooltip", "value")}
      >
        {value}
      </span>
    </span>
  );
}

function ChartTooltip({
  active,
  formatValue,
  label,
  options = {},
  payload,
}: {
  active?: boolean;
  formatValue: (value: number) => string;
  label?: React.ReactNode;
  options?: ChartTooltipBodyOptions;
  payload?: TooltipEntry[];
}) {
  if (!active || !payload?.length) {
    return null;
  }
  const {
    colorByKey,
    comparisonKey,
    formatByKey,
    formatLabel,
    goodDirection,
    hideLabel,
    indicator,
    projectedKey,
    shareGroups,
    timeLabel,
    total,
  } = options;
  if (projectedKey) {
    const observed = payload.some(
      (entry) =>
        entry.dataKey !== projectedKey &&
        entry.dataKey !== comparisonKey &&
        typeof entry.value === "number",
    );
    if (observed) {
      payload = payload.filter((entry) => entry.dataKey !== projectedKey);
    }
  }
  const read = (entry: TooltipEntry) => {
    const raw = entry.value as unknown;
    if (Array.isArray(raw)) {
      // A range band: [low, high].
      const own =
        (typeof entry.dataKey === "string" && formatByKey?.[entry.dataKey]) ||
        formatValue;
      const [low, high] = raw as Array<number | null>;
      return typeof low === "number" && typeof high === "number"
        ? `${own(low)} – ${own(high)}`
        : "—";
    }
    if (typeof entry.value !== "number") return entry.value;
    const part =
      entry.payload && typeof entry.dataKey === "string"
        ? shareOf(entry.payload, entry.dataKey, shareGroups)
        : null;
    const own =
      (typeof entry.dataKey === "string" && formatByKey?.[entry.dataKey]) ||
      formatValue;
    return part == null
      ? own(entry.value)
      : `${formatChartShare(part)} · ${own(entry.value)}`;
  };
  const heading = hideLabel
    ? undefined
    : timeLabel && typeof label === "number"
      ? timeLabel(label)
      : formatLabel && typeof label === "string"
      ? formatLabel(label)
      : label;
  const current = payload.find(
    (entry) => entry.dataKey !== comparisonKey && typeof entry.value === "number",
  );
  const previous = comparisonKey
    ? payload.find((entry) => entry.dataKey === comparisonKey)
    : undefined;
  const change =
    typeof current?.value === "number" && typeof previous?.value === "number"
      ? formatDelta(current.value, previous.value, formatValue) +
        (goodDirection && current.value !== previous.value
          ? (current.value > previous.value) === (goodDirection === "up")
            ? " · better"
            : " · worse"
          : "")
      : null;
  const sum = total
    ? payload.reduce(
        (acc, entry) =>
          entry.dataKey !== comparisonKey && typeof entry.value === "number"
            ? acc + entry.value
            : acc,
        0,
      )
    : null;
  return (
    <ChartTooltipSurface label={heading} still={options?.still}>
      {payload.map((entry, index) => (
        <ChartTooltipRow
          color={
            (typeof entry.dataKey === "string" && colorByKey?.[entry.dataKey]) ||
            entry.color ||
            entry.payload?.fill
          }
          indicator={
            entry.dataKey === comparisonKey && comparisonKey
              ? "dashed"
              : indicator
          }
          key={index}
          // The default single-series dataKey ("value") carries no meaning as a
          // legend name — the x-axis category (top label) already identifies it.
          name={entry.name && entry.name !== "value" ? entry.name : null}
          value={read(entry)}
        />
      ))}
      {change != null ? (
        <ChartTooltipRow
          indicator="none"
          name={i18n.t("ui:chart.tooltip.change")}
          value={change}
        />
      ) : null}
      {sum != null ? (
        <ChartTooltipRow
          indicator="none"
          name={i18n.t("ui:chart.total")}
          value={formatValue(sum)}
        />
      ) : null}
    </ChartTooltipSurface>
  );
}
