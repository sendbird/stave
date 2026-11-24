import * as stylex from "@stylexjs/stylex";

import { i18n, useTranslation } from "@/i18n";

import { themeProps, themeSlotProps } from "../theming/theme-props";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";
import { Badge } from "./Badge";
import { formatChartValue } from "./Charts.format";
import { Skeleton } from "./Skeleton";
import { Sparkline } from "./Sparkline";
import type { StatTileProps } from "./StatTile.types";
import { deriveDelta } from "./StatTile.delta";
import {
  resolveStatTileError,
  StatTileErrorLine,
  StatTileMissingValue,
} from "./StatTile.error";

/**
 * One line of a change summary (G6): metric name · value · delta tag · a 64px
 * trend. For a side panel or a report summary, where a tile grid would stack
 * one tall tile per metric. Rows are meant to be stacked: each one after the
 * first draws a hairline above itself, so a list of them reads as one panel.
 */
export function StatTileRow({
  className,
  comparisonLabel,
  delta: deltaProp,
  deltaFormat = "percent",
  deltaTone: deltaToneProp,
  density: _density,
  error: errorProp,
  errorLabel = i18n.t("ui:statTile.loadFailed"),
  format = formatChartValue,
  goodDirection = "up",
  icon: Icon,
  info,
  label,
  live: _live,
  loading = false,
  note: _note,
  onRetry,
  previous,
  progress: _progress,
  retryLabel,
  trend,
  trendLabels: _trendLabels,
  trendRange: _trendRange,
  trendTooltip: _trendTooltip,
  value,
  variant: _variant,
  xstyle,
  ...props
}: StatTileProps) {
  useTranslation();
  const theme = themeProps("stat-tile", { density: "regular", variant: "row" });
  const error = resolveStatTileError(errorProp, errorLabel, loading);
  const failed = error !== null;
  const derived =
    !loading &&
    !failed &&
    deltaProp == null &&
    typeof value === "number" &&
    previous != null
      ? deriveDelta(value, previous, { deltaFormat, format, goodDirection })
      : null;
  const delta = derived ? derived.text : deltaProp;
  const deltaTone = deltaToneProp ?? derived?.tone ?? "neutral";
  const hasTrend = trend != null && trend.length > 0;

  return (
    <div
      {...theme}
      {...props}
      aria-busy={loading || props["aria-busy"] || undefined}
      className={cx(
        sx(styles.row, hasTrend && styles.rowWithTrend, xstyle),
        theme.className,
        className,
      )}
      data-stat-variant="row"
    >
      <span
        {...themeSlotProps("stat-tile", "label")}
        className={sx(styles.label)}
      >
        {Icon ? (
          <Icon aria-hidden className={sx(styles.icon)} size={14} />
        ) : null}
        <span className={sx(styles.labelText)}>{label}</span>
        {info}
      </span>
      {loading ? (
        <Skeleton height={16} variant="block" width={48} />
      ) : failed ? (
        <StatTileMissingValue xstyle={styles.value} />
      ) : (
        <span
          {...themeSlotProps("stat-tile", "value")}
          className={sx(styles.value)}
        >
          {typeof value === "number" ? format(value) : value}
        </span>
      )}
      {failed ? (
        // The failure takes the delta and trend columns on the same line.
        <StatTileErrorLine
          message={error}
          onRetry={onRetry}
          retryLabel={retryLabel}
          row
        />
      ) : null}
      {failed ? null : (
        <span className={sx(styles.delta)}>
          {delta && !loading ? (
            <Badge
              // The period is not printed on a row; it stays in the tag's name.
              aria-label={
                typeof delta === "string" && typeof comparisonLabel === "string"
                  ? `${delta} ${comparisonLabel}`
                  : undefined
              }
              tone={deltaTone}
            >
              {delta}
            </Badge>
          ) : null}
        </span>
      )}
      {hasTrend && !failed ? (
        loading ? (
          <Skeleton height={20} variant="block" width={64} />
        ) : (
          <Sparkline
            aria-label={
              typeof label === "string"
                ? i18n.t("ui:statTile.trendNamed", { label })
                : i18n.t("ui:statTile.trend")
            }
            data={trend}
            height={20}
            variant="line"
            width={64}
          />
        )
      ) : null}
    </div>
  );
}

const styles = stylex.create({
  // label · value · delta (· trend). The delta column has a floor wide enough
  // for a typical tag ("+12.4%"), so in a stack of rows the tags start on one
  // edge and the right-aligned values end on one edge — each row sizes its
  // own grid, and an `auto` delta column let both edges wander row to row.
  row: {
    alignItems: "center",
    borderBlockStartColor: {
      default: vars["--aui-color-border-subtle"],
      ":first-child": "transparent",
    },
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: vars["--aui-border-width-hairline"],
    columnGap: vars["--aui-space-8"],
    display: "grid",
    fontSize: vars["--aui-font-size-body"],
    gridTemplateColumns: "minmax(0, 1fr) auto minmax(4.5rem, auto)",
    lineHeight: vars["--aui-line-height-control"],
    minInlineSize: 0,
    paddingBlock: vars["--aui-space-8"],
  },
  rowWithTrend: {
    gridTemplateColumns: "minmax(0, 1fr) auto minmax(4.5rem, auto) 64px",
  },
  label: {
    alignItems: "center",
    color: vars["--aui-color-text"],
    display: "flex",
    gap: vars["--aui-space-8"],
    minInlineSize: 0,
  },
  labelText: {
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  icon: { color: vars["--aui-color-text-muted"], flexShrink: 0 },
  value: {
    color: vars["--aui-color-text"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--aui-font-weight-medium"],
    textAlign: "end",
  },
  delta: {
    display: "inline-flex",
    justifyContent: "flex-start",
  },
});
