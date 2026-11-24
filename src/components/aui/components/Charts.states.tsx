import * as stylex from "@stylexjs/stylex";
import { TriangleAlert, type LucideIcon } from "lucide-react";
import type * as React from "react";

import { i18n, useTranslation } from "@/i18n";

import { vars } from "../tokens/tokens.stylex";
import { sx, type XstyleProp } from "../utils/stylex";
import { csvFileName, formatChartReadout, tableToCsv } from "./Charts.format";
import { Button } from "./Button";
import { ChartEmptyPlot, type ChartEmptyState } from "./Charts.emptyState";
import {
  ChartLoadingSilhouette,
  type ChartLoadingShape,
} from "./Charts.loading";
import { VisuallyHidden } from "./VisuallyHidden";
import type { ChartFrameExtras } from "./Charts.options";

/**
 * A chart card's non-plot states, and the table that carries its values.
 *
 * Split out of `Charts.tsx` because that file is past the 500-line cap and
 * frozen at merge-base, so the frame could not gain the two states it was
 * missing without paying for them — and because these are the parts a reader
 * looks for separately from the plot definitions.
 */

/**
 * The values, reachable without a pointer. The plot itself is decorative to
 * assistive tech (`aria-hidden` on the recharts subtree would fight its own
 * layer), so the table carries the data instead. It is visually hidden, not
 * absent.
 */
export type ChartTable = {
  /** Column headers, category column first. */
  columns: string[];
  /** One array of cells per row, aligned to `columns`. */
  rows: Array<Array<number | string>>;
};

/** Single-series `{ label, value }[]` → table spec. */
export function pointsTable(
  data: Array<{ label: string; value: number }>,
  valueColumn = i18n.t("ui:chart.column.value"),
): ChartTable {
  return {
    columns: [i18n.t("ui:chart.column.category"), valueColumn],
    rows: data.map((entry) => [entry.label, entry.value]),
  };
}

export function ChartDataTable({
  formatValue = formatChartReadout,
  table,
  visible = false,
}: {
  /** Value cells read exactly as the tooltip states them. */
  formatValue?: (value: number) => string;
  table: ChartTable;
  /** Render as the card's visible table view instead of the hidden twin. */
  visible?: boolean;
}) {
  const body = (
    <table className={sx(visible ? styles.visibleTable : styles.dataTable)}>
        <thead>
          <tr>
            {/*
             * Keyed by position, not by the header's text. A column list is
             * positional, and two series can legitimately carry the same name —
             * a `SeriesChart` fed two categories both called "No category"
             * built two identical keys and React dropped one of the columns.
             */}
            {table.columns.map((column, index) => (
              <th
                className={
                  visible
                    ? sx(
                        styles.visibleCell,
                        styles.visibleHead,
                        index > 0 && styles.visibleValue,
                      )
                    : undefined
                }
                key={index}
                scope="col"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) =>
                cellIndex === 0 ? (
                  <th
                    className={
                      visible
                        ? sx(styles.visibleCell, styles.visibleRowHead)
                        : undefined
                    }
                    key={cellIndex}
                    scope="row"
                  >
                    {cell}
                  </th>
                ) : (
                  <td
                    className={
                      visible
                        ? sx(styles.visibleCell, styles.visibleValue)
                        : undefined
                    }
                    key={cellIndex}
                  >
                    {typeof cell === "number" ? formatValue(cell) : cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
  );
  return visible ? (
    <div className={sx(styles.visibleTableScroll)}>{body}</div>
  ) : (
    <VisuallyHidden>{body}</VisuallyHidden>
  );
}

/**
 * Which of the three non-plot states a chart card is in.
 *
 * The frame used to have one: `empty`. So a card that was still fetching, and a
 * card whose fetch had failed, both drew bare axes — and bare axes read as
 * "zero", not as "still loading" or "this failed". Those are three different
 * truths and a dashboard has to be able to say which one it is.
 *
 * Priority is error > loading > empty, because a failure is the most recent fact
 * about the data and the one the reader can act on.
 */
export type ChartPlotStateKind = "empty" | "loading" | "error";

/**
 * The state axis every chart card forwards to the shared frame. It lives here,
 * beside the component that renders it, so one contract serves fifteen charts.
 */
export type ChartStateProps = ChartFrameExtras & {
  /** Nothing to draw. */
  empty?: boolean;
  /**
   * What the plot says while `empty`: `{ title, description, action }`
   * (each optional) for the standard empty state, or a node that replaces
   * it. See `ChartEmptyState`. Say what the reader can change in the
   * description ("Try a different date range.").
   */
  emptyState?: ChartEmptyState;
  /** Failed load; `true` uses the default message. Wins over `loading`. */
  error?: React.ReactNode;
  /** Data in flight; a skeleton holds the plot's box. */
  loading?: boolean;
  onRetry?: () => void;
  /**
   * A refetch over data already drawn. The plot stays in place, dims, and is
   * marked `aria-busy`, so a periodic refresh neither blanks the card nor
   * shifts the layout. Distinct from `loading`, which has nothing to show yet
   * and replaces the plot with a skeleton; `loading`, `error` and `empty` win.
   * @default false
   */
  refreshing?: boolean;
  retryLabel?: string;
  /**
   * A "Download CSV" action in the header that saves the chart's table twin
   * (the same rows the table view shows). `true` names the file from the
   * title; a string names it. Hidden while a state replaces the plot.
   * @default false
   */
  downloadCsv?: boolean | string;
};

export function resolveChartPlotState({
  empty,
  error,
  loading,
}: {
  empty?: boolean;
  error?: React.ReactNode;
  loading?: boolean;
}): ChartPlotStateKind | null {
  if (error != null && error !== false) return "error";
  if (loading) return "loading";
  if (empty) return "empty";
  return null;
}

export function ChartPlotState({
  emptyState,
  emptyTitle = i18n.t("ui:chart.emptyTitle"),
  error,
  kind,
  loadingShape = "block",
  onRetry,
  retryLabel = i18n.t("ui:chart.retry"),
}: {
  emptyState?: ChartEmptyState;
  /** The empty title when `emptyState` sets none: each form's own default. */
  emptyTitle?: React.ReactNode;
  error?: React.ReactNode;
  kind: ChartPlotStateKind;
  /** The silhouette a loading plot shows (`ChartLoadingSilhouette`). */
  loadingShape?: ChartLoadingShape;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  useTranslation();
  if (kind === "loading") {
    /*
     * A shape, not a spinner: the card keeps its height either way, and a
     * skeleton in the plot's box says "a chart is coming here" where a centred
     * spinner says only "wait". `aria-hidden` on the skeleton is deliberate —
     * the status below is the one announcement.
     */
    return (
      <div className={sx(styles.statePlot)} role="status">
        <ChartLoadingSilhouette shape={loadingShape} />
        <VisuallyHidden>{i18n.t("ui:chart.loading")}</VisuallyHidden>
      </div>
    );
  }

  if (kind === "error") {
    /*
     * `role="alert"`: a failed load replaces pending content, so it has to be
     * announced rather than merely become visible — the same contract
     * `AsyncBoundary` holds. One recovery action, never two.
     */
    return (
      <div className={sx(styles.statePlot, styles.errorPlot)} role="alert">
        <TriangleAlert aria-hidden size={16} />
        <span className={sx(styles.errorMessage)}>
          {error === true ? i18n.t("ui:chart.loadFailed") : error}
        </span>
        {onRetry ? (
          <Button onClick={onRetry} size="xs" variant="outlined">
            {retryLabel}
          </Button>
        ) : null}
      </div>
    );
  }

  /*
   * A plot with no data draws bare axes, which reads as "zero" rather than
   * "nothing was returned". Say which one it is — and say it the way every
   * other empty region in the package does, through `EmptyState`
   * (`ChartEmptyPlot`), rather than as the loose centred sentence this used
   * to be.
   */
  return (
    <ChartEmptyPlot emptyState={emptyState} emptyTitle={emptyTitle} />
  );
}

/**
 * The card frame every chart form shares — the header, the plot's box, the
 * card's anchors and the non-plot states. Each form used to redeclare these
 * seven props beside `ChartStateProps`, with drifting docs (fifteen copies of
 * `title?: React.ReactNode`); a form now takes this type and declares only
 * what is its own. A form with no plot height of its own omits `height`.
 */
export type ChartFrameProps = ChartStateProps & {
  className?: string;
  /** Second line of the card header. */
  description?: React.ReactNode;
  /**
   * Plot height in px — the box the loading, error and empty states hold
   * too, so a state never resizes the card. @default 220 (a form that sizes
   * from its data says so)
   */
  height?: number;
  /** Optional leading icon in the header (for consistent card anatomy). */
  icon?: LucideIcon;
  /** Test/anchor hook on the card element. */
  id?: string;
  /** Inline styles on the card (grid placement, explicit sizing). */
  style?: React.CSSProperties;
  /** The card's heading; a titled chart is named for keyboard and table. */
  title?: React.ReactNode;
} & XstyleProp;

const styles = stylex.create({
  visibleTableScroll: {
    inlineSize: "100%",
    minInlineSize: 0,
    overflowX: "auto",
  },
  visibleTable: {
    borderCollapse: "collapse",
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontVariantNumeric: "tabular-nums",
    inlineSize: "100%",
    lineHeight: vars["--aui-line-height-body"],
    textAlign: "start",
  },
  // Cells: a hairline row rule and a quiet header, the table grammar the rest
  // of the system uses; values align to the end so digits line up.
  visibleCell: {
    borderBlockEndColor: vars["--aui-color-border-subtle"],
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: vars["--aui-border-width-hairline"],
    paddingBlock: vars["--aui-space-8"],
    paddingInlineEnd: vars["--aui-space-12"],
    textAlign: "start",
  },
  visibleHead: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  visibleRowHead: {
    fontWeight: vars["--aui-font-weight-medium"],
  },
  visibleValue: {
    fontVariantNumeric: "tabular-nums",
    paddingInlineEnd: 0,
    textAlign: "end",
  },
  dataTable: {
    inlineSize: 1,
    maxInlineSize: 1,
    tableLayout: "fixed",
  },
  statePlot: {
    alignItems: "center",
    blockSize: "100%",
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
    inlineSize: "100%",
    justifyContent: "center",
    minInlineSize: 0,
  },
  errorPlot: {
    // Semantic colour on the glyph and nothing else: §1.2 keeps the tone on a
    // small meaningful element rather than washing the whole plot box.
    color: vars["--aui-color-danger"],
    textAlign: "center",
  },
  errorMessage: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-body"],
    maxInlineSize: "40ch",
  },
});

/** Saves `table` as CSV through a temporary object URL. */
export function downloadTableCsv(table: ChartTable, fileName: string) {
  if (typeof document === "undefined") return;
  const blob = new Blob([tableToCsv(table.columns, table.rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** The header action; null when there is nothing to download. */
export function CsvAction({
  downloadCsv,
  table,
  title,
}: {
  downloadCsv?: boolean | string;
  table?: ChartTable;
  title?: React.ReactNode;
}) {
  useTranslation();
  if (!downloadCsv || !table) return null;
  const name = typeof downloadCsv === "string" ? downloadCsv : csvFileName(title);
  return (
    <Button
      data-chart-csv=""
      onClick={() => downloadTableCsv(table, name.endsWith(".csv") ? name : `${name}.csv`)}
      size="xs"
      variant="quiet"
    >
      {i18n.t("ui:chart.downloadCsv")}
    </Button>
  );
}
