import * as stylex from "@stylexjs/stylex";
import { useState } from "react";
import type * as React from "react";

import { i18n, useTranslation } from "@/i18n";

import { measured } from "../recipes/measured";
import { metric } from "../recipes/metric";
import { themeProps, themeSlotProps } from "../theming/theme-props";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";
import { Badge } from "./Badge";
import { formatChartValue } from "./Charts.format";
import { ChartTooltipRow, ChartTooltipSurface } from "./Charts.tooltip";
import { Progress } from "./Progress";
import { Skeleton } from "./Skeleton";
import { SKELETON_ARRIVE_CLASS, useSkeletonArrival } from "./Skeleton.motion";
import { Sparkline } from "./Sparkline";
import {
  resolveStatTileError,
  StatTileErrorLine,
  StatTileMissingValue,
} from "./StatTile.error";
import { StatTileProgressSkeleton } from "./StatTile.loading";
import { deriveDelta } from "./StatTile.delta";
import { StatTileRow } from "./StatTile.rowVariant";
import type { StatTileProps as StatTileBaseProps } from "./StatTile.types";

export type {
  StatTileDeltaTone,
  StatTileGoodDirection,
  StatTileTrendRange,
  StatTileVariant,
} from "./StatTile.types";

export type StatTileProps = StatTileBaseProps & {
  /**
   * A moment to read instead of the headline — the point a linked chart is
   * hovering (`onActivePointChange`). The readout shows its value with its
   * label beside it, and the delta steps aside; `null` returns to the
   * headline. Tile variant only.
   */
  activePoint?: { label: React.ReactNode; value: number | string } | null;
  /**
   * Let the readout follow the pointer along the trend: the hovered point's
   * value and its `trendLabels` name replace the headline until the pointer
   * leaves. Tile variant only. @default false
   */
  trendFollow?: boolean;
};

/**
 * The form a single headline number takes — a one-bar bar chart is not it.
 *
 * Anatomy is fixed so a row of metrics reads as one instrument: label · value ·
 * delta · trend. The root is deliberately flat; the parent establishes columns,
 * dividers, or a bounded region for the whole metric set instead of wrapping
 * every number in another card.
 */
export function StatTile(props: StatTileProps) {
  if (props.variant === "row") {
    const {
      activePoint: _activePoint,
      trendFollow: _trendFollow,
      ...row
    } = props;
    return <StatTileRow {...row} />;
  }
  return <StatTileCard {...props} />;
}

function StatTileCard({
  activePoint,
  className,
  comparisonLabel,
  delta: deltaProp,
  deltaFormat = "percent",
  deltaTone: deltaToneProp,
  density = "regular",
  error: errorProp,
  errorLabel = i18n.t("ui:statTile.loadFailed"),
  format = formatChartValue,
  goodDirection = "up",
  icon: Icon,
  info,
  label,
  live = false,
  loading = false,
  note,
  onRetry,
  previous,
  progress,
  retryLabel,
  trend,
  trendLabels,
  trendFollow = false,
  trendRange,
  trendTooltip = trendLabels != null,
  value,
  variant: _variant,
  xstyle,
  ...props
}: StatTileProps) {
  useTranslation();
  const theme = themeProps("stat-tile", { density, variant: "tile" });
  const arriving = useSkeletonArrival(loading);
  const [hovered, setHovered] = useState<number | null>(null);
  // A failed value draws no delta, trend or progress: each would describe a
  // number the tile does not have.
  const error = resolveStatTileError(errorProp, errorLabel, loading);
  const failed = error !== null;
  const followed =
    !failed &&
    trendFollow &&
    hovered != null &&
    typeof trend?.[hovered] === "number"
      ? {
          label: trendLabels?.[hovered] ??
            i18n.t("ui:statTile.point", { index: hovered + 1 }),
          value: trend[hovered]!,
        }
      : null;
  const moment = failed ? null : (activePoint ?? followed);
  const shown = moment ? moment.value : value;
  const derived =
    !loading &&
    !failed &&
    deltaProp == null &&
    typeof value === "number" &&
    previous != null
      ? deriveDelta(value, previous, { deltaFormat, format, goodDirection })
      : null;
  const delta = failed ? null : derived ? derived.text : deltaProp;
  const comparison =
    comparisonLabel != null && comparisonLabel !== "" ? comparisonLabel : null;
  const deltaTone = deltaToneProp ?? derived?.tone ?? "neutral";
  const points = failed
    ? undefined
    : trend?.map((point, index) => ({
        label: trendLabels?.[index],
        value: point,
      }));
  return (
    <div
      {...theme}
      {...props}
      aria-busy={loading || props["aria-busy"] || undefined}
      className={cx(
        sx(styles.tile, density === "compact" && styles.tileCompact, xstyle),
        theme.className,
        className,
      )}
    >
      <div
        {...themeSlotProps("stat-tile", "label")}
        className={sx(
          styles.label,
          density === "compact" && styles.labelCompact,
        )}
      >
        {Icon ? (
          <Icon aria-hidden className={sx(styles.icon)} size={14} />
        ) : null}
        {label}
        {info}
        {live && !failed ? (
          <span className={sx(styles.live)} data-stat-live="">
            <span aria-hidden className={sx(styles.liveDot)} />
            {i18n.t("ui:statTile.live")}
          </span>
        ) : null}
      </div>
      <div
        // The body crosses from its skeletons to the numbers in one 120ms fade.
        className={cx(sx(styles.body), arriving && SKELETON_ARRIVE_CLASS)}
      >
        <div className={sx(styles.readout)}>
          {loading ? (
            // The readout's own type around a text skeleton, so the row keeps
            // the value's line box (a fixed 26px bar left it 6px short).
            <span
              className={sx(
                styles.value,
                density === "compact" ? metric.compact : metric.display,
              )}
            >
              <Skeleton as="span" variant="text" width="3.2em" />
            </span>
          ) : failed ? (
            <StatTileMissingValue
              xstyle={[
                styles.value,
                density === "compact" ? metric.compact : metric.display,
              ]}
            />
          ) : (
            <span
              {...themeSlotProps("stat-tile", "value")}
              // A hovered moment is not news: the chart that set it already
              // announces it, so the live region pauses while one is shown.
              aria-atomic={(live && !moment) || undefined}
              aria-live={live && !moment ? "polite" : undefined}
              className={sx(
                styles.value,
                density === "compact" ? metric.compact : metric.display,
              )}
            >
              {typeof shown === "number" ? format(shown) : shown}
            </span>
          )}
          {loading && (deltaProp != null || previous != null) ? (
            <Skeleton
              as="span"
              variant="chip"
              width="4em"
              xstyle={styles.deltaSkeleton}
            />
          ) : null}
          {moment && !loading ? (
            <span className={sx(measured.tabular, styles.moment)} data-stat-moment="">
              {moment.label}
            </span>
          ) : null}
          {failed ? (
            <StatTileErrorLine
              message={error}
              onRetry={onRetry}
              retryLabel={retryLabel}
            />
          ) : null}
          {delta && !loading && !moment ? (
            // The change is a tint tag under the value, its period in quiet
            // ink after it (B1): the tag carries the sign and the meaning,
            // the words say against what. The space keeps "+12.4% vs last
            // week" one phrase for text readers.
            <div
              {...themeSlotProps("stat-tile", "comparison")}
              className={sx(styles.comparison)}
            >
              <Badge tone={deltaTone}>{delta}</Badge>
              {comparison ? (
                <>
                  {" "}
                  <span className={sx(styles.comparisonLabel)}>
                    {comparison}
                  </span>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
        {note ? (
          <p
            {...themeSlotProps("stat-tile", "note")}
            className={sx(styles.note)}
          >
            {note}
          </p>
        ) : null}
        {progress && loading ? (
          <StatTileProgressSkeleton />
        ) : progress && !failed ? (
          <Progress
            // Progress prints its own ratio beside the label, so the label
            // names the goal ("of 5M") rather than repeating the percentage.
            label={
              typeof progress.label === "string"
                ? progress.label
                : i18n.t("ui:statTile.progressOf", {
                    max: format(progress.max),
                  })
            }
            max={progress.max}
            tone={progress.tone}
            value={Math.min(
              progress.max,
              progress.value ?? (typeof value === "number" ? value : 0),
            )}
            xstyle={styles.progress}
          />
        ) : null}
        {loading && trend ? (
          <Skeleton
            height={trendRange ? TREND_HEIGHT + 20 : TREND_HEIGHT}
            variant="block"
            width="100%"
          />
        ) : points?.length ? (
          <Sparkline
            aria-label={
              typeof label === "string"
                ? i18n.t("ui:statTile.trendNamed", { label })
                : i18n.t("ui:statTile.trend")
            }
            data={points}
            height={TREND_HEIGHT}
            onActiveIndexChange={trendFollow ? setHovered : undefined}
            range={trendRange}
            renderTooltip={
              trendTooltip
                ? ({ active, payload }) => {
                    const point = payload?.[0];
                    if (!active || typeof point?.value !== "number")
                      return null;
                    const name = point.payload?.label;
                    return (
                      <ChartTooltipSurface
                        label={typeof name === "string" ? name : undefined}
                      >
                        <ChartTooltipRow value={format(point.value)} />
                      </ChartTooltipSurface>
                    );
                  }
                : undefined
            }
            width="fill"
          />
        ) : null}
      </div>
    </div>
  );
}

/** B1: a 40px trend band, so the line has room to read as a shape. */
const TREND_HEIGHT = 40;

const livePulse = stylex.keyframes({
  "0%": { opacity: 1 },
  "50%": { opacity: 0.35 },
  "100%": { opacity: 1 },
});

const styles = stylex.create({
  live: {
    alignItems: "center",
    color: vars["--aui-color-success-text"],
    display: "inline-flex",
    fontSize: vars["--aui-font-size-caption"],
    gap: vars["--aui-space-4"],
    lineHeight: vars["--aui-line-height-control"],
    marginInlineStart: "auto",
  },
  liveDot: {
    animationDuration: {
      default: vars["--aui-motion-duration-loop"],
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    animationIterationCount: "infinite",
    animationName: livePulse,
    backgroundColor: vars["--aui-color-success"],
    blockSize: 6,
    borderRadius: vars["--aui-radius-full"],
    inlineSize: 6,
  },
  progress: { fontWeight: vars["--aui-font-weight-regular"] },
  // A Badge sits on the readout's baseline; an empty placeholder has none, so
  // it centres in the line instead of riding up to it.
  deltaSkeleton: { alignSelf: "center" },
  // Tiles share a row, so they share a height and keep their content at the
  // top — the sparkline lands on the same baseline across the row.
  tile: {
    alignContent: "start",
    display: "grid",
    gap: vars["--aui-space-8"],
    minInlineSize: 0,
    paddingBlock: vars["--aui-space-8"],
  },
  tileCompact: {
    gap: vars["--aui-space-4"],
    paddingBlock: vars["--aui-space-4"],
  },
  // B1: the metric's name in body-size muted ink, regular weight — the value
  // under it is the only emphasis in the tile.
  label: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    display: "flex",
    fontSize: vars["--aui-font-size-body"],
    gap: vars["--aui-space-8"],
    lineHeight: vars["--aui-line-height-control"],
    minInlineSize: 0,
  },
  labelCompact: {
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-caption"],
  },
  icon: { color: vars["--aui-color-text-subtle"], flexShrink: 0 },
  body: { display: "grid", gap: vars["--aui-space-8"] },
  readout: {
    display: "grid",
    gap: vars["--aui-space-4"],
    justifyItems: "start",
  },
  comparison: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
    minInlineSize: 0,
  },
  comparisonLabel: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-caption"],
  },
  // The headline is the tile's reason to exist: the display number
  // (`metric.display`, 24/32/600, composed at the call sites) shared with the
  // chart headline, a donut centre and the gauge; `metric.compact` (16/24) for
  // `density="compact"`, where a 24px number beside body copy would read as a
  // section heading. Tabular numerals since 2026-11-16 (proportional before):
  // the value updates in place, and `measured.ts` names this exact case.
  value: {
    color: vars["--aui-color-text"],
  },
  note: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-caption"],
    margin: 0,
  },
  // The moment the readout is showing ("Nov 1"), so a hovered value is never
  // mistaken for the headline total.
  moment: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-caption"],
  },
});
