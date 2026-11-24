import * as stylex from "@stylexjs/stylex";

import { i18n, useTranslation } from "@/i18n";
import type * as React from "react";

import { vars } from "../tokens/tokens.stylex";
import { themeProps, themeSlotProps } from "../theming/theme-props";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { foldSeries } from "./Charts.axes";

export type ChartDatum = {
  label: string;
  value: number;
};

export type BarListProps = React.ComponentProps<"div"> & {
  data: ChartDatum[];
  /**
   * Dim every row except these labels — a cross-filter selection made in a
   * linked chart or a filter bar. Empty or omitted dims nothing.
   */
  highlightLabels?: string[];
  /** Keep the first N - 1 rows and sum the rest into one "Other" row. */
  maxItems?: number;
  /** How each row's value prints (and is read by assistive tech). @default the raw number */
  formatValue?: (value: number) => string;
  maxValue?: number;
} & XstyleProp;

/**
 * Names and exact values as text, each with a proportional bar — read a
 * ranking without an axis. Put it in a `ChartCard` for the chart family's
 * card (title, description, icon, states, table twin):
 * `<ChartCard title description><BarList data /></ChartCard>`. `BarChart`
 * measures magnitudes on an axis instead. The `Chart` export that wrapped
 * this list in its own card was a second spelling of that composition and
 * was removed (2026-11-08).
 */
export function BarList({
  "aria-label": ariaLabel,
  className,
  data: inputData,
  formatValue,
  highlightLabels,
  maxItems,
  maxValue,
  xstyle,
  ...props
}: BarListProps) {
  useTranslation();
  const data = maxItems ? foldSeries(inputData, maxItems) : inputData;
  const highlight = highlightLabels?.length ? highlightLabels : null;
  // The scale is the largest value present, not a floor of 1: flooring turns a
  // list of rates (0.12, 0.34) into a near-empty track. Only a non-positive
  // max needs a guard, and that is a divide-by-zero guard, not a scale.
  const largest = Math.max(0, ...data.map((item) => item.value));
  const resolved = maxValue ?? largest;
  const scale = resolved > 0 ? resolved : 1;
  const theme = themeProps("bar-list");

  return (
    <div
      {...props}
      {...theme}
      aria-label={ariaLabel ?? i18n.t("ui:barList.label")}
      className={cx(sx(styles.barList, xstyle), theme.className, className)}
      role="list"
    >
      {data.map((item, index) => {
        const percent = Math.max(0, Math.min(100, (item.value / scale) * 100));

        return (
          <div
            className={sx(
              styles.barRow,
              highlight &&
                !highlight.includes(item.label) &&
                styles.barRowDimmed,
            )}
            data-dimmed={
              highlight && !highlight.includes(item.label) ? "" : undefined
            }
            key={`${item.label}-${index}`}
            role="listitem"
          >
            <span
              className={sx(styles.barLabel)}
              {...themeSlotProps("bar-list", "label")}
            >
              {item.label}
            </span>
            <span
              aria-label={`${item.label}: ${formatValue ? formatValue(item.value) : item.value}`}
              className={sx(styles.track)}
              role="meter"
              aria-valuemin={Math.min(0, item.value)}
              aria-valuemax={Math.max(scale, item.value)}
              aria-valuenow={item.value}
              {...themeSlotProps("bar-list", "track")}
            >
              <span
                className={sx(styles.bar)}
                style={{ inlineSize: `${percent}%` }}
              />
            </span>
            <strong
              className={sx(styles.barValue)}
              {...themeSlotProps("bar-list", "value")}
            >
              {formatValue ? formatValue(item.value) : item.value}
            </strong>
          </div>
        );
      })}
    </div>
  );
}

const styles = stylex.create({
  barRowDimmed: { opacity: 0.4 },
  barList: {
    display: "grid",
    gap: vars["--aui-space-12"],
    minInlineSize: 0,
  },
  barRow: {
    alignItems: "center",
    display: "grid",
    gap: vars["--aui-space-12"],
    gridTemplateColumns: {
      default: "minmax(120px, 0.72fr) minmax(0, 1fr) auto",
      "@media (max-width: 560px)": "minmax(0, 1fr)",
    },
    minInlineSize: 0,
  },
  barLabel: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-body"],
    minInlineSize: 0,
    overflowWrap: "anywhere",
  },
  track: {
    backgroundColor: vars["--aui-color-canvas-subtle"],
    borderRadius: vars["--aui-radius-full"],
    display: "block",
    minBlockSize: 10,
    minInlineSize: 0,
    overflow: "hidden",
  },
  bar: {
    // Data ink uses the chart palette, not the near-black UI accent.
    backgroundColor: vars["--aui-chart-1"],
    borderRadius: vars["--aui-radius-full"],
    display: "block",
    minBlockSize: 10,
  },
  barValue: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-semibold"],
    lineHeight: vars["--aui-line-height-body"],
  },
});
