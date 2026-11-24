import {
  Cell,
  Pie,
  PolarAngleAxis,
  PolarRadiusAxis,
  PieChart as RPieChart,
  RadialBar,
  RadialBarChart as RRadialBarChart,
  Tooltip,
} from "recharts";
import { useEffect } from "react";

import { i18n, useTranslation } from "@/i18n";

import { vars } from "../tokens/tokens.stylex";
import { foldSeries } from "./Charts.axes";
import {
  chartMargin,
  chartPalette,
  gridColor,
  PIE_CHART_MAX_SLICES,
  tooltipMotion,
} from "./Charts.config";
import { ChartFrame } from "./Charts.frame";
import { DonutCenter, useMomentStore } from "./Charts.headline";
import {
  ChartLegend,
  resolvePlacement,
  useHiddenLabels,
} from "./Charts.legend";
import type { PieChartProps, RadialBarChartProps } from "./Charts.props";
import { pointsTable } from "./Charts.states";
import { tooltipContent } from "./Charts.tooltip";
import { formatChartReadout } from "./Charts.format";
import { keyboardByDefault, useChartExplorer } from "./Charts.explore";

/*
 * The share forms: `PieChart` and `RadialBarChart`. Split out of `Charts.tsx`
 * (ATL-76); moved verbatim.
 */
/** The smallest wedge's share of the whole (0 when there is nothing to draw). */
function minShare(slices: ReadonlyArray<{ value: number }>) {
  const total = slices.reduce(
    (sum, slice) => sum + Math.max(0, slice.value),
    0,
  );
  if (total <= 0) return 0;
  return slices.reduce(
    (min, slice) => Math.min(min, Math.max(0, slice.value) / total),
    1,
  );
}

/** Categorical share chart — slices colored from the token palette. */
export function PieChart({
  center,
  centerTotal = false,
  className,
  clockwiseFromTop = false,
  data,
  description,
  formatValue,
  donut = false,
  defaultHiddenLabels,
  height,
  hiddenLabels: hiddenLabelsProp,
  icon,
  id,
  renderTooltip,
  style,
  legend = "auto",
  legendValues = true,
  maxSlices,
  onHiddenLabelsChange,
  onToggleLabel,
  title,
  xstyle,
  ...state
}: PieChartProps) {
  useTranslation();
  // Color follows the entity, never its rank: the palette slot comes from the
  // datum's position in `data`, so hiding a slice never repaints the rest.
  // Wedges compare every pair, so the draw limit is the all-pairs-safe subset
  // rather than the full adjacent-safe palette.
  const { hidden: hiddenLabels, toggle } = useHiddenLabels({
    defaultHiddenLabels,
    hiddenLabels: hiddenLabelsProp,
    onHiddenLabelsChange,
    onToggleLabel,
  });
  // The three-wedge ceiling exists because the palette only guarantees
  // all-pairs separation for its first three slots. A caller that colors every
  // datum itself is not drawing from that palette, so the ceiling is not its
  // constraint — and it owns the separation it asked for. Without that, the cap
  // holds.
  const callerColored =
    data.length > 0 && data.every((entry) => entry.color != null);
  // A caller-colored pie draws every slice it was given unless it asks for a
  // cap; the palette-colored one keeps the three-wedge default.
  const ceiling = callerColored
    ? Math.max(2, data.length)
    : PIE_CHART_MAX_SLICES;
  const sliceLimit =
    maxSlices != null && Number.isFinite(maxSlices)
      ? Math.max(2, Math.min(ceiling, Math.floor(maxSlices)))
      : ceiling;
  const folded = foldSeries(data, sliceLimit);
  const slices = folded.map((entry, index) => ({
    ...entry,
    color: entry.color ?? chartPalette[index],
  }));
  const drawn = (slice: (typeof slices)[number]) =>
    !hiddenLabels.includes(slice.label) && slice.value > 0;
  const visible = slices.filter(drawn);
  const visibleTotal = visible.reduce((total, slice) => total + slice.value, 0);
  const placement = resolvePlacement(legend);
  // `centerTotal`: the hovered slice replaces the total in the hole.
  const centerStore = useMomentStore();
  const readsCenter = donut && center == null && centerTotal !== false;
  // Arrow keys walk the slices with the sentence the tooltip gives; with
  // `centerTotal` the hole reads the active slice, as it does on hover.
  const pieExplorer = useChartExplorer({
    count: visible.length,
    describe: (index) => {
      const slice = visible[index]!;
      const read = formatValue ?? formatChartReadout;
      const share =
        visibleTotal > 0
          ? ` (${Math.round((slice.value / visibleTotal) * 100)}%)`
          : "";
      return `${slice.label}: ${read(slice.value)}${share}`;
    },
    enabled: keyboardByDefault(title),
  });
  const keySlice =
    pieExplorer.activeIndex != null
      ? visible[pieExplorer.activeIndex]
      : undefined;
  useEffect(() => {
    if (!readsCenter) return;
    centerStore.set(
      keySlice ? { label: keySlice.label, value: keySlice.value } : null,
    );
  }, [centerStore, keySlice, readsCenter]);
  return (
    <ChartFrame
      entranceMove="radial"
      {...state}
      explorer={pieExplorer}
      loadingShape="arc"
      formatValue={formatValue}
      aside={
        placement ? (
          <ChartLegend
            formatValue={formatValue}
            hiddenLabels={hiddenLabels}
            onToggleLabel={toggle}
            placement={placement}
            slices={slices.map((slice) => ({
              ...slice,
              // A share is only meaningful for a slice the pie actually drew:
              // a zero or negative row has no wedge, so it gets no percentage.
              share: !legendValues
                ? undefined
                : visibleTotal === 0 || !drawn(slice)
                  ? null
                  : `${Math.round((slice.value / visibleTotal) * 100)}%`,
              value: legendValues ? slice.value : undefined,
            }))}
          />
        ) : null
      }
      asidePlacement={placement ?? undefined}
      className={className}
      xstyle={xstyle}
      description={description}
      empty={visible.length === 0}
      height={height}
      icon={icon}
      id={id}
      overlay={
        !donut ? null : readsCenter ? (
          <DonutCenter
            caption={
              typeof centerTotal === "string"
                ? centerTotal
                : i18n.t("ui:chart.total")
            }
            formatValue={formatValue ?? formatChartReadout}
            store={centerStore}
            total={visibleTotal}
          />
        ) : (
          center
        )
      }
      style={style}
      square
      table={pointsTable(visible)}
      title={title}
    >
      <RPieChart accessibilityLayer={false} margin={chartMargin}>
        <Pie
          data={visible}
          dataKey="value"
          // Twelve o'clock, sweeping clockwise: 90deg is the top in recharts'
          // frame, and an end below the start is what reverses its direction.
          endAngle={clockwiseFromTop ? -270 : undefined}
          startAngle={clockwiseFromTop ? 90 : undefined}
          // A donut is a ring, not a pie with a hole: 64% leaves a band
          // thin enough to read as arcs, with room for a centred readout.
          // Rounded only while every wedge is wide enough to hold the
          // rounding; a sliver under 3% keeps square ends rather than a blob.
          cornerRadius={donut && minShare(visible) >= 0.03 ? 4 : 0}
          innerRadius={donut ? "64%" : 0}
          nameKey="label"
          onMouseEnter={
            readsCenter
              ? (_: unknown, index: number) => {
                  const slice = visible[index];
                  if (slice)
                    centerStore.set({ label: slice.label, value: slice.value });
                }
              : undefined
          }
          onMouseLeave={readsCenter ? () => centerStore.set(null) : undefined}
          outerRadius="90%"
          isAnimationActive={false}
          paddingAngle={donut ? 2 : 0}
          // 2px of surface between wedges — the gap does the separating, so no
          // wedge needs an outline of its own.
          stroke={vars["--aui-color-surface-raised"]}
          strokeWidth={2}
        >
          {visible.map((slice, index) => (
            // Labels are caller data and may repeat (two "Other" rollups, two
            // people with one name) — the index keeps the keys unique.
            <Cell fill={slice.color} key={`${slice.label}-${index}`} />
          ))}
        </Pie>
        <Tooltip
          {...tooltipMotion}
          // A keyboard-active slice or ring pins the tooltip at it, so a
          // sighted keyboard user sees the reading the live region speaks.
          active={pieExplorer.activeIndex != null ? true : undefined}
          content={tooltipContent(renderTooltip, formatValue, {
            still: pieExplorer.activeIndex != null,
          })}
          defaultIndex={pieExplorer.activeIndex ?? undefined}
          key={
            pieExplorer.activeIndex != null
              ? `kbd-${pieExplorer.activeIndex}`
              : "pointer"
          }
        />
      </RPieChart>
    </ChartFrame>
  );
}

/** Ring thickness by count, and the inner radius the stack leaves. */
function ringGeometry(count: number, plotHeight: number) {
  const thickness = count <= 3 ? 16 : count <= 6 ? 12 : 10;
  const gap = 4;
  const outer = Math.max(
    1,
    (plotHeight - chartMargin.top - chartMargin.bottom) / 2,
  );
  const inner = Math.max(outer * 0.3, outer - count * (thickness + gap) + gap);
  return { inner: `${Math.round((inner / outer) * 100)}%`, thickness };
}

/** Concentric radial bars — good for progress / share-of-total dashboards. */
export function RadialBarChart({
  className,
  data,
  defaultHiddenLabels,
  description,
  formatValue,
  height,
  hiddenLabels,
  icon,
  id,
  renderTooltip,
  style,
  legend = "auto",
  max,
  onHiddenLabelsChange,
  onToggleLabel,
  title,
  xstyle,
  ...state
}: RadialBarChartProps) {
  const { hidden, toggle } = useHiddenLabels({
    defaultHiddenLabels,
    hiddenLabels,
    onHiddenLabelsChange,
    onToggleLabel,
  });
  // Color comes from the ring's position before any is hidden, so a hidden
  // ring never repaints the others.
  const rings = foldSeries(data).map((entry, index) => ({
    ...entry,
    color: entry.color ?? chartPalette[index],
  }));
  const folded = rings.filter((entry) => !hidden.includes(entry.label));
  const placement = resolvePlacement(legend);
  // Arrow keys walk the rings, outermost first in data order, each read
  // against the full ring's value when `max` is set.
  const ringExplorer = useChartExplorer({
    count: folded.length,
    describe: (index) => {
      const entry = folded[index]!;
      const read = formatValue ?? formatChartReadout;
      return `${entry.label}: ${read(entry.value)}${max != null ? ` of ${read(max)}` : ""}`;
    },
    enabled: keyboardByDefault(title),
  });
  // Ring geometry from the plot's height (the radial plot is square-capped).
  const ring = ringGeometry(folded.length, height ?? 220);
  return (
    <ChartFrame
      entranceMove="radial"
      {...state}
      explorer={ringExplorer}
      loadingShape="arc"
      formatValue={formatValue}
      aside={
        placement ? (
          <ChartLegend
            formatValue={formatValue}
            hiddenLabels={hidden}
            onToggleLabel={toggle}
            placement={placement}
            slices={rings}
          />
        ) : null
      }
      asidePlacement={placement ?? undefined}
      className={className}
      xstyle={xstyle}
      description={description}
      empty={folded.length === 0}
      height={height}
      icon={icon}
      id={id}
      style={style}
      square
      table={pointsTable(folded)}
      title={title}
    >
      <RRadialBarChart
        accessibilityLayer={false}
        // Rings of a set thickness (16px for up to three, 12px up to six,
        // 10px beyond) with 4px of air between them, fully rounded: touching
        // rings read as one target, and a percentage gap thinned three rings
        // to ~9px (2026-11 review). The hole is what the stack leaves.
        barSize={ring.thickness}
        data={folded}
        endAngle={-270}
        innerRadius={ring.inner}
        margin={chartMargin}
        outerRadius="100%"
        startAngle={90}
      >
        {/* Rings are categories: name them by label, so the tooltip reads
            "Billing", not the ring's index. */}
        <PolarRadiusAxis
          axisLine={false}
          dataKey="label"
          tick={false}
          type="category"
        />
        {max != null ? (
          <PolarAngleAxis
            axisLine={false}
            domain={[0, max]}
            tick={false}
            type="number"
          />
        ) : null}
        <RadialBar
          background={{ fill: gridColor }}
          cornerRadius={999}
          dataKey="value"
          isAnimationActive={false}
        >
          {folded.map((entry, index) => (
            <Cell fill={entry.color} key={`${entry.label}-${index}`} />
          ))}
        </RadialBar>
        <Tooltip
          {...tooltipMotion}
          // A keyboard-active slice or ring pins the tooltip at it, so a
          // sighted keyboard user sees the reading the live region speaks.
          active={ringExplorer.activeIndex != null ? true : undefined}
          content={tooltipContent(renderTooltip, formatValue, {
            still: ringExplorer.activeIndex != null,
          })}
          defaultIndex={ringExplorer.activeIndex ?? undefined}
          key={
            ringExplorer.activeIndex != null
              ? `kbd-${ringExplorer.activeIndex}`
              : "pointer"
          }
        />
      </RRadialBarChart>
    </ChartFrame>
  );
}
