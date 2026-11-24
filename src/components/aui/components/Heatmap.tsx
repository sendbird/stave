import * as stylex from "@stylexjs/stylex";
import type { LucideIcon } from "lucide-react";
import { Fragment } from "react";
import type * as React from "react";

import { i18n, useTranslation } from "@/i18n";

import { vars } from "../tokens/tokens.stylex";
import { themeProps, themeSlotProps } from "../theming/theme-props";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { chartNegative } from "./Charts.config";
import { formatChartValue } from "./Charts.format";
import type { ChartEmptyState } from "./Charts.emptyState";
import { ChartPlotState } from "./Charts.states";
import {
  formatShare,
  isHighlighted,
  matrixReader,
  type HeatmapNormalize,
} from "./Heatmap.matrix";

export type { HeatmapNormalize } from "./Heatmap.matrix";
import {
  DIVERGING_STEPS,
  divergingFill,
  divergingStep,
  RAMP_STEPS,
  rampFill,
  rampStep,
} from "./Heatmap.ramp";
import { VisuallyHidden } from "./VisuallyHidden";

export type HeatmapCell = {
  column: string;
  row: string;
  /** `null` means "no observation", which is not the same as zero. */
  value: number | null;
};

export type HeatmapProps = Omit<React.ComponentProps<"section">, "children"> & {
  cells: HeatmapCell[];
  /** Column order; derived from `cells` when omitted. */
  columns?: string[];
  description?: React.ReactNode;
  /**
   * What the grid says when there is nothing to draw — derived from `cells`,
   * never forced. The chart family's slot (`ChartEmptyState`).
   */
  emptyState?: ChartEmptyState;
  /** Formats the value in the cell title and the table twin. */
  formatValue?: (value: number) => string;
  /** Sequential hue the ramp is built from (the positive side when diverging). @default chart1 */
  hue?: string;
  /**
   * `"diverging"` colors values on both sides of zero: `negativeHue` below,
   * `hue` above, three steps a side by magnitude, and zero the neutral fill —
   * for changes, deltas and correlations. Ignored with `normalize`, whose
   * shares are never negative. @default "sequential"
   */
  scale?: "diverging" | "sequential";
  /** The hue below zero on a diverging scale. @default chartNegative — coral (chart4), the warm slot opposite chart1 */
  negativeHue?: string;
  icon?: LucideIcon;
  /** Labels under the scale legend. @default ["Less", "More"] (diverging: ["Lower", "Higher"]) */
  scaleLabels?: [string, string];
  /** Highest value the ramp maps to; derived from `cells` when omitted. */
  max?: number;
  /** Row order (top to bottom); derived from `cells` when omitted. */
  rows?: string[];
  title?: React.ReactNode;
  /**
   * Outline the cells where the row and column name match — the correct
   * answers of a confusion matrix (actual × predicted). @default false
   */
  highlightDiagonal?: boolean;
  /** Ring these cells in warning ink — the biggest confusion, a flagged pair. */
  highlightCells?: Array<{ column: string; row: string }>;
  /**
   * Color and print each cell as a share of its row (or column) total, so a
   * small class reads on the same scale as a large one. The table twin keeps
   * the raw value beside the share.
   */
  normalize?: HeatmapNormalize;
  /** Print each cell's value (or share) inside it. @default false */
  showValues?: boolean;
} & XstyleProp;

function order(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * Magnitude across a two-dimensional grid — usage by hour × weekday, errors by
 * service × day, cohort retention. The job is comparison over a grid, so the
 * color is **sequential**: one hue, light → dark, quantised into five steps so
 * neighbouring cells are actually distinguishable (a continuous ramp reads as
 * one smear). Never a rainbow, and never categorical hues — hue here means
 * magnitude, not identity.
 *
 * Every cell carries its value on hover and in the (visually hidden) table
 * twin, because a color scale alone is never a readable value.
 */
export function Heatmap({
  cells,
  className,
  columns,
  description,
  emptyState,
  formatValue = formatChartValue,
  highlightCells,
  highlightDiagonal = false,
  hue = vars["--aui-chart-1"],
  icon: Icon,
  max,
  normalize,
  rows,
  scale = "sequential",
  negativeHue = chartNegative,
  scaleLabels: scaleLabelsProp,
  showValues = false,
  title,
  xstyle,
  ...props
}: HeatmapProps) {
  useTranslation();
  const rowKeys = rows ?? order(cells.map((cell) => cell.row));
  const columnKeys = columns ?? order(cells.map((cell) => cell.column));
  const byKey = new Map(
    cells.map((cell) => [`${cell.row}\0${cell.column}`, cell.value]),
  );
  const reading = matrixReader({
    byKey,
    columns: columnKeys,
    normalize,
    rows: rowKeys,
  });
  const observed = cells
    .map((cell) => (normalize ? reading(cell.row, cell.column) : cell.value))
    .filter((value): value is number => value !== null);
  const diverging = scale === "diverging" && !normalize;
  const scaleLabels =
    scaleLabelsProp ??
    (diverging
      ? [i18n.t("ui:heatmap.scale.lower"), i18n.t("ui:heatmap.scale.higher")]
      : [i18n.t("ui:heatmap.scale.less"), i18n.t("ui:heatmap.scale.more")]);
  const ceiling = normalize
    ? 1
    : (max ??
      (observed.length
        ? observed.reduce(
            (top, value) => Math.max(top, diverging ? Math.abs(value) : value),
            diverging ? 0 : -Infinity,
          )
        : 0));
  const read = (row: string, column: string) => {
    const raw = byKey.get(`${row}\0${column}`) ?? null;
    if (raw === null) return i18n.t("ui:heatmap.noData");
    const shown = reading(row, column);
    const text =
      normalize && shown != null
        ? `${formatShare(shown)} (${formatValue(raw)})`
        : formatValue(raw);
    // The rings are visual; the twin names what they mark.
    const marks = [
      highlightDiagonal && row === column
        ? i18n.t("ui:heatmap.mark.diagonal")
        : null,
      isHighlighted(highlightCells, row, column)
        ? i18n.t("ui:heatmap.mark.highlighted")
        : null,
    ].filter(Boolean);
    return marks.length ? `${text} (${marks.join(", ")})` : text;
  };
  const empty =
    cells.length === 0 || rowKeys.length === 0 || columnKeys.length === 0;
  const theme = themeProps("heatmap");

  const stepOf = (value: number) =>
    diverging ? divergingStep(value, ceiling) : rampStep(value, ceiling);
  const fillOf = (step: number) =>
    diverging ? divergingFill(step, negativeHue, hue) : rampFill(step, hue);
  const legendSteps = diverging
    ? Array.from(
        { length: DIVERGING_STEPS * 2 + 1 },
        (_, i) => i - DIVERGING_STEPS,
      )
    : Array.from({ length: RAMP_STEPS + 1 }, (_, step) => step);

  return (
    <section
      {...props}
      {...theme}
      className={cx(sx(styles.root, xstyle), theme.className, className)}
    >
      {title || description ? (
        <div
          className={sx(styles.header)}
          {...themeSlotProps("heatmap", "header")}
        >
          {title ? (
            <div className={sx(styles.titleRow)}>
              {Icon ? (
                <Icon aria-hidden className={sx(styles.headerIcon)} size={14} />
              ) : null}
              <h3
                className={sx(styles.title)}
                {...themeSlotProps("heatmap", "title")}
              >
                {title}
              </h3>
            </div>
          ) : null}
          {description ? (
            <p
              className={sx(styles.description)}
              {...themeSlotProps("heatmap", "description")}
            >
              {description}
            </p>
          ) : null}
        </div>
      ) : null}

      {empty ? (
        // The chart family's own empty state, not a loose sentence: the one
        // grid surface in the category used to match nothing beside it.
        <div className={sx(styles.empty)}>
          <ChartPlotState emptyState={emptyState} kind="empty" />
        </div>
      ) : (
        <>
          <VisuallyHidden>
            <table className={sx(styles.dataTable)}>
              <thead>
                <tr>
                  <th scope="col">{i18n.t("ui:heatmap.rowHeader")}</th>
                  {columnKeys.map((column) => (
                    <th key={column} scope="col">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowKeys.map((row) => (
                  <tr key={row}>
                    <th scope="row">{row}</th>
                    {columnKeys.map((column) => {
                      return <td key={column}>{read(row, column)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </VisuallyHidden>

          <div aria-hidden className={sx(styles.scroller)}>
            <div
              className={sx(styles.grid)}
              style={{
                gridTemplateColumns: `auto repeat(${columnKeys.length}, minmax(14px, 1fr))`,
              }}
            >
              <span />
              {columnKeys.map((column) => (
                <span
                  className={sx(styles.columnLabel)}
                  key={column}
                  {...themeSlotProps("heatmap", "label")}
                >
                  {column}
                </span>
              ))}
              {rowKeys.map((row) => (
                <Fragment key={row}>
                  <span
                    className={sx(styles.rowLabel)}
                    {...themeSlotProps("heatmap", "label")}
                  >
                    {row}
                  </span>
                  {columnKeys.map((column) => {
                    const value = reading(row, column);
                    const step = value === null ? 0 : stepOf(value);
                    const diagonal = highlightDiagonal && row === column;
                    const flagged = isHighlighted(highlightCells, row, column);
                    return (
                      <span
                        className={sx(
                          styles.cell,
                          value === null && styles.noData,
                          showValues && styles.cellValue,
                          diagonal && styles.cellDiagonal,
                          flagged && styles.cellFlagged,
                          diagonal && flagged && styles.cellDiagonalFlagged,
                        )}
                        data-diagonal={diagonal ? "" : undefined}
                        data-flagged={flagged ? "" : undefined}
                        key={column}
                        style={{ backgroundColor: fillOf(step) }}
                        {...themeSlotProps("heatmap", "cell")}
                        // The value is reachable without hovering (table twin);
                        // this is the pointer shortcut, not the only route.
                        title={`${row} · ${column}: ${read(row, column)}`}
                      >
                        {showValues && value !== null ? (
                          <span className={sx(styles.cellChip)}>
                            {normalize
                              ? formatShare(value)
                              : formatValue(value)}
                          </span>
                        ) : null}
                      </span>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>

          <div aria-hidden className={sx(styles.scale)}>
            <span className={sx(styles.scaleLabel)}>{scaleLabels[0]}</span>
            {legendSteps.map((step) => (
              <span
                className={sx(styles.scaleSwatch)}
                data-step={step}
                key={step}
                style={{ backgroundColor: fillOf(step) }}
                {...themeSlotProps("heatmap", "swatch")}
              />
            ))}
            <span className={sx(styles.scaleLabel)}>{scaleLabels[1]}</span>
          </div>
        </>
      )}
    </section>
  );
}

const styles = stylex.create({
  root: {
    alignContent: "start",
    backgroundColor: vars["--aui-color-surface-raised"],
    borderColor: vars["--aui-color-ring"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    // Flat by contract (§1.5 "Elevation is a lift, not a grouping cue"): a
    // static container that groups content in flow does not leave its plane, so
    // it carries no shadow. `elevation1` now means pressable, movable, or
    // docked. Depth against the canvas comes from the surface step + hairline.
    boxShadow: vars["--aui-elevation-raised"],
    color: vars["--aui-color-text"],
    display: "grid",
    gap: vars["--aui-space-16"],
    inlineSize: "100%",
    minInlineSize: 0,
    padding: vars["--aui-space-16"],
  },
  header: { display: "grid", gap: vars["--aui-space-4"], minInlineSize: 0 },
  titleRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
    minInlineSize: 0,
  },
  headerIcon: { color: vars["--aui-color-text-subtle"], flexShrink: 0 },
  title: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-semibold"],
    lineHeight: vars["--aui-line-height-body"],
    margin: 0,
  },
  description: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-body"],
    margin: 0,
  },
  dataTable: {
    inlineSize: 1,
    maxInlineSize: 1,
    tableLayout: "fixed",
  },
  empty: {
    display: "grid",
    minBlockSize: 160,
  },
  // A grid of fixed-minimum cells scrolls rather than crushing its columns to
  // slivers; the labels stay legible at any card width.
  scroller: { minInlineSize: 0, overflowX: "auto" },
  grid: {
    columnGap: 3,
    display: "grid",
    minInlineSize: "fit-content",
    rowGap: 3,
  },
  columnLabel: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-caption"],
    paddingBlockEnd: vars["--aui-space-4"],
    textAlign: "center",
  },
  rowLabel: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    display: "flex",
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-caption"],
    paddingInlineEnd: vars["--aui-space-8"],
    whiteSpace: "nowrap",
  },
  // Cells stretch across the card but stay a fixed band tall: forcing them
  // square would blow a 6-column grid up into a wall of tiles on a wide card,
  // and the grid — not the tile — is what should fill the width.
  cell: {
    blockSize: 26,
    borderRadius: vars["--aui-radius-control"],
    display: "block",
    minInlineSize: 14,
  },
  // Absent data is drawn as an outline, never as the lowest step of the ramp —
  // "nothing happened" and "no reading" are different facts.
  cellValue: {
    alignItems: "center",
    color: vars["--aui-color-text"],
    display: "flex",
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-caption"],
    fontVariantNumeric: "tabular-nums",
    justifyContent: "center",
  },
  // The value sits on a near-surface chip, not on the ramp itself: text on a
  // ramp step fails contrast on some step in every theme, whichever ink it
  // takes. The chip keeps text-on-surface contrast in light, dark and HC.
  cellChip: {
    backgroundColor: `color-mix(in oklab, ${vars["--aui-color-surface-raised"]} 88%, transparent)`,
    borderRadius: vars["--aui-radius-control"],
    lineHeight: vars["--aui-line-height-caption"],
    paddingInline: vars["--aui-space-4"],
  },
  // The diagonal (a confusion matrix's correct answers) is outlined in text
  // ink; a caller-flagged cell in warning ink over a surface ring, so the
  // warning ring is separated from any ramp step; a cell that is both keeps
  // both rings.
  cellDiagonal: {
    boxShadow: `inset 0 0 0 ${vars["--aui-ring-width-sm"]} ${vars["--aui-color-text"]}`,
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  // Whole pixels (2026-11-16, `recipes/data-mark.ts`): a 2px ring, then a
  // hairline of surface (flagged) or a 2px text ring (flagged diagonal). It
  // was 2.5 / 4 / 4.5px.
  cellFlagged: {
    boxShadow: `inset 0 0 0 ${vars["--aui-ring-width-sm"]} ${vars["--aui-color-warning"]}, inset 0 0 0 calc(${vars["--aui-ring-width-sm"]} + ${vars["--aui-border-width-hairline"]}) ${vars["--aui-color-surface-raised"]}`,
  },
  cellDiagonalFlagged: {
    boxShadow: `inset 0 0 0 ${vars["--aui-ring-width-sm"]} ${vars["--aui-color-warning"]}, inset 0 0 0 calc(2 * ${vars["--aui-ring-width-sm"]}) ${vars["--aui-color-text"]}`,
  },
  noData: {
    borderColor: vars["--aui-color-border-subtle"],
    borderStyle: "dashed",
    borderWidth: vars["--aui-border-width-hairline"],
  },
  scale: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-4"],
    justifyContent: "flex-end",
  },
  scaleLabel: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-caption"],
    marginInline: vars["--aui-space-4"],
  },
  scaleSwatch: {
    blockSize: 12,
    borderRadius: vars["--aui-radius-control"],
    inlineSize: 12,
  },
});
