import * as stylex from "@stylexjs/stylex";
import { useId } from "react";
import type * as React from "react";

import { i18n, useTranslation } from "@/i18n";
import {
  Area,
  AreaChart as RAreaChart,
  Bar,
  BarChart as RBarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  YAxis,
} from "recharts";

import { measured } from "../recipes/measured";
import { themeProps } from "../theming/theme-props";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { tooltipMotion } from "./Charts.config";
import { CHART_ENTRANCE_CLASS, useChartEntrance } from "./Charts.entrance";
import type {
  ChartTooltipRenderProps,
  ChartTooltipRenderer,
} from "./Charts.tooltip";

export type SparklineVariant = "area" | "line" | "bar";

/** recharts clones its `content` element with the hover state. */
function SparklineTooltip({
  render,
  ...state
}: ChartTooltipRenderProps & { render: ChartTooltipRenderer }) {
  return <>{render(state)}</>;
}

export type SparklineWidth = number | "fill";

export type SparklineProps = Omit<React.ComponentProps<"div">, "children"> & {
  /**
   * Play the trend's entrance once, when it first has points: the trend is
   * uncovered from its first point to its last over 220ms, each point at its
   * own value throughout. For one sparkline that leads a card.
   *
   * Off by default, unlike the charts (on since 2026-11-15): a sparkline is
   * the repeated form — table rows, stat tiles, KPI lists — where many would
   * play together and the page's three-at-once budget would animate some
   * and not others. Under Reduce Motion the trend is simply there.
   * @default false
   */
  entrance?: boolean;
  /** Data-ink color; use a `chart1\u20136` token, never a status token. */
  color?: string;
  /**
   * Numeric series (oldest \u2192 newest), or points. A point may carry extra
   * fields; they reach `renderTooltip` untouched on its `payload`, which is how
   * a hovered value gets a date or a unit it could not otherwise have.
   */
  data: Array<number | ({ value: number } & Record<string, unknown>)>;
  height?: number;
  /**
   * A dashed rule at one value — a target, the previous close, the period
   * average — so the trend reads as above or below something. It widens the
   * scale when it falls outside the data, so the rule is never clipped away.
   * Named in the generated label.
   */
  referenceValue?: number;
  /**
   * Mark the latest point: a dot at the end of a line or area, or the last
   * bar at full ink with the rest receded. The latest reading is what a
   * sparkline is looked at for. @default false
   */
  showLast?: boolean;
  /**
   * The period the series covers, printed at its two ends in micro type over
   * a hairline baseline ("Oct 30" · "Today"), so the line reads against a span
   * of time without an axis. String ends are added to the generated label.
   */
  range?: { end: React.ReactNode; start: React.ReactNode };
  /**
   * Adds a hover readout to a form that has none by default. A sparkline is
   * read at a glance and carries no axis, so reach for this only where the
   * exact value per point matters and nothing else on the card reports it.
   */
  renderTooltip?: ChartTooltipRenderer;
  /**
   * Called with the index of the point under the pointer, and `null` when it
   * leaves — how a `StatTile` reads the hovered moment (`trendFollow`).
   */
  onActiveIndexChange?: (index: number | null) => void;
  /**
   * `area` (default): filled gradient under the line.
   * `line`: stroke only. `bar`: mini bar columns.
   */
  variant?: SparklineVariant;
  /**
   * Fixed width in px, or `"fill"` to fill the container — use it inside a
   * stat tile so the trend spans the card instead of leaving it half empty.
   * Same word as every other fill axis (`DataTable` `size`, `Skeleton.Surface`).
   */
  width?: SparklineWidth;
} & XstyleProp;

/**
 * Compact inline trend \u2014 no axes or grid, and no tooltip unless one is
 * asked for.
 * recharts-based so the area gradient and the opt-in `entrance` match the
 * rest of the chart family; identity comes from the `chart1\u20136` slot color.
 */
export function Sparkline({
  "aria-label": ariaLabel,
  className,
  color = vars["--aui-chart-1"],
  data,
  entrance = false,
  height = 32,
  onActiveIndexChange,
  range,
  referenceValue,
  renderTooltip,
  showLast = false,
  variant = "area",
  width = 120,
  xstyle,
  ...props
}: SparklineProps) {
  useTranslation();
  const gradientId = `atelier-spark-${useId()}`;
  const points = data.map((d) => (typeof d === "number" ? { value: d } : d));
  const latest = points[points.length - 1]?.value;
  const generatedLabel =
    latest === undefined
      ? i18n.t("ui:sparkline.noData")
      : referenceValue != null
        ? i18n.t("ui:sparkline.summaryWithReference", {
            count: points.length,
            latest,
            reference: referenceValue,
          })
        : i18n.t("ui:sparkline.summary", { count: points.length, latest });
  const rangeLabel =
    range && typeof range.start === "string" && typeof range.end === "string"
      ? i18n.t("ui:sparkline.rangeSuffix", {
          end: range.end,
          start: range.start,
        })
      : "";
  const lastIndex = points.length - 1;
  const reference =
    referenceValue != null && Number.isFinite(referenceValue) ? (
      <ReferenceLine
        ifOverflow="extendDomain"
        stroke={vars["--aui-color-border-strong"]}
        strokeDasharray="3 3"
        strokeWidth={1}
        y={referenceValue}
      />
    ) : null;
  const theme = themeProps("sparkline", { variant });
  const follow = onActiveIndexChange
    ? {
        onMouseLeave: () => onActiveIndexChange(null),
        onMouseMove: (state: { activeTooltipIndex?: unknown }) => {
          const index =
            state?.activeTooltipIndex == null
              ? NaN
              : Number(state.activeTooltipIndex);
          if (Number.isInteger(index)) onActiveIndexChange(index);
        },
      }
    : null;
  // A follower needs the tooltip's hover state, so it gets a silent tooltip.
  const silentTooltip =
    follow && !renderTooltip ? (
      <Tooltip {...tooltipMotion} content={() => null} cursor={false} />
    ) : null;
  const fills = width === "fill";
  const entering = useChartEntrance({
    enabled: entrance,
    ready: points.length > 0,
  });

  const chart = (
    <div
      {...theme}
      {...props}
      aria-label={(ariaLabel ?? generatedLabel) + rangeLabel}
      className={cx(
        entering.playing && CHART_ENTRANCE_CLASS,
        sx(
          styles.sparkline,
          fills && styles.sparklineFull,
          range != null && styles.sparklineBaseline,
          range == null && xstyle,
        ),
        theme.className,
        className,
      )}
      data-chart-entrance={entering.playing ? "inline" : undefined}
      data-chart-entrance-size={entering.playing ? "compact" : undefined}
      onAnimationEnd={(event) => {
        props.onAnimationEnd?.(event);
        entering.onAnimationEnd(event);
      }}
      role="img"
      style={{
        blockSize: height,
        ...(fills ? null : { inlineSize: width }),
        ...props.style,
      }}
    >
      <ResponsiveContainer height="100%" width="100%">
        {variant === "bar" ? (
          <RBarChart
            // The wrapper already carries `role="img"` and the label; recharts'
            // accessibility layer would add a second, unnamed "application" tab
            // stop per sparkline — one dead stop per table row.
            accessibilityLayer={false}
            data={points}
            margin={{ bottom: 1, left: 0, right: 0, top: 1 }}
            {...follow}
          >
            <Bar
              dataKey="value"
              fill={color}
              isAnimationActive={false}
              radius={[1, 1, 0, 0]}
            >
              {showLast
                ? points.map((_, index) => (
                    <Cell
                      fill={color}
                      fillOpacity={index === lastIndex ? 1 : 0.45}
                      key={index}
                    />
                  ))
                : null}
            </Bar>
            {reference}
            {renderTooltip ? (
              <Tooltip
                {...tooltipMotion}
                content={<SparklineTooltip render={renderTooltip} />}
              />
            ) : null}
            {silentTooltip}
          </RBarChart>
        ) : (
          <RAreaChart
            accessibilityLayer={false}
            data={points}
            // The last-point dot is 4px across; the end margin keeps it whole.
            margin={{
              bottom: showLast ? 4 : 2,
              left: 0,
              right: showLast ? 4 : 0,
              top: showLast ? 4 : 2,
            }}
            {...follow}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.24} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            {/* A line has to be scaled to its own range, not to zero. Without an
                axis the chart library defaults to `[0, "auto"]`, so a real
                product metric — a large base with a small swing — compressed to
                nothing: a series running 18.1k → 20.3k drew 2.4px of movement in
                a 26px band, which a 1.75px stroke renders as a ruled line. On
                its own extent the same series draws 23.8px. `"auto"` rather than
                `["dataMin", "dataMax"]` keeps the nice-tick padding, so the
                stroke never rides the clip edge and a flat series still sits
                mid-band instead of being normalised into a full-height wiggle.
                The bar branch above stays zero-based on purpose: a bar's length
                *is* its magnitude, and rebasing it would lie. */}
            <YAxis domain={["auto", "auto"]} hide />
            {reference}
            <Area
              dataKey="value"
              dot={
                showLast
                  ? ({
                      cx,
                      cy,
                      index,
                    }: {
                      cx?: number;
                      cy?: number;
                      index: number;
                    }) =>
                      index === lastIndex && cx != null && cy != null ? (
                        <circle
                          cx={cx}
                          cy={cy}
                          data-sparkline-last=""
                          fill={color}
                          key="last"
                          r={2.5}
                          stroke={vars["--aui-color-surface-raised"]}
                          strokeWidth={1.5}
                        />
                      ) : (
                        <g key={index} />
                      )
                  : false
              }
              fill={variant === "area" ? `url(#${gradientId})` : "transparent"}
              isAnimationActive={false}
              stroke={color}
              strokeWidth={1.75}
              type="monotone"
            />
            {renderTooltip ? (
              <Tooltip
                {...tooltipMotion}
                content={<SparklineTooltip render={renderTooltip} />}
              />
            ) : null}
            {silentTooltip}
          </RAreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
  if (range == null) return chart;
  // The ends name the span for sighted readers; the chart's own label already
  // carries it for assistive tech, so the row is hidden from it.
  return (
    <div
      className={sx(styles.ranged, fills && styles.rangedFull, xstyle)}
      data-sparkline-range=""
    >
      {chart}
      <div aria-hidden className={sx(measured.tabular, styles.range)}>
        <span>{range.start}</span>
        <span>{range.end}</span>
      </div>
    </div>
  );
}

const styles = stylex.create({
  sparkline: {
    display: "inline-block",
    minInlineSize: 0,
  },
  sparklineFull: {
    display: "block",
    inlineSize: "100%",
  },
  sparklineBaseline: {
    boxShadow: `inset 0 -1px 0 ${vars["--aui-color-border-subtle"]}`,
  },
  ranged: {
    display: "inline-grid",
    gap: vars["--aui-space-4"],
    minInlineSize: 0,
  },
  rangedFull: {
    display: "grid",
    inlineSize: "100%",
  },
  range: {
    color: vars["--aui-color-text-muted"],
    display: "flex",
    fontSize: vars["--aui-font-size-micro"],
    gap: vars["--aui-space-8"],
    justifyContent: "space-between",
    lineHeight: vars["--aui-line-height-caption"],
  },
});
