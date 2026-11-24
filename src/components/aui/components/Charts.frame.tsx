import { useId, useRef, useState } from "react";
import type * as React from "react";
import { ResponsiveContainer } from "recharts";

import { i18n, useTranslation } from "@/i18n";

import { Badge } from "./Badge";
import { Button } from "./Button";
import { ChartExploreSurface, type ChartExplorer } from "./Charts.explore";

import type { LucideIcon } from "lucide-react";

import { themeProps } from "../theming/theme-props";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import type { ChartLegendPlacement } from "./Charts.props";
import {
  ChartDataTable,
  ChartPlotState,
  CsvAction,
  resolveChartPlotState,
  type ChartTable,
} from "./Charts.states";
import { ChartCardHeader, type ChartHeaderProps } from "./Charts.header";
import {
  ChartFreshnessNote,
  ChartHeadlineReadout,
  type ChartMomentStore,
} from "./Charts.headline";
import type { ChartEmptyState } from "./Charts.emptyState";
import {
  CHART_ENTRANCE_CLASS,
  useChartEntrance,
  wantsChartEntrance,
  type ChartEntranceMove,
} from "./Charts.entrance";
import type { ChartLoadingShape } from "./Charts.loading";
import type { ChartFreshness, ChartHeadline } from "./Charts.options";
import { ChartSummary, ImageAction } from "./Charts.share";
import { styles } from "./Charts.styles";
import { formatChartReadout } from "./Charts.format";

export { ChartCardHeader } from "./Charts.header";
export type { ChartHeaderProps } from "./Charts.header";

/**
 * The card every chart form draws into: header, plot box, aside (legend or
 * value list) with its container-query placement, overlay, the visually hidden
 * table twin, and the empty/loading/error states.
 *
 * A part of the chart family split out of `Charts.tsx` (ATL-76), which is now
 * the public re-export surface. Moved verbatim.
 */
export function ChartFrame({
  actions,
  aside,
  asidePlacement = "auto",
  children,
  className,
  description,
  descriptionPlacement,
  /** Rendered instead of the plot when there is nothing to draw. */
  empty,
  emptyState,
  entrance,
  entranceMove,
  error,
  explorer,
  formatValue,
  tableToggle = false,
  loading = false,
  onRetry,
  downloadCsv,
  downloadImage,
  ordered = false,
  paused = false,
  refreshing = false,
  retryLabel,
  summaryLine,
  headline,
  freshness,
  headlineStore,
  loadingShape,
  height = 220,
  icon: Icon,
  id,
  /** Centered layer over the plot, drawn only when there is a plot to cover. */
  overlay,
  /** Cap the plot to a square (radial forms scale with height, not width). */
  square = false,
  style,
  table,
  title,
  xstyle,
}: ChartHeaderProps & {
  /** Content rendered beside/below the plot (legend, value list, notes). */
  aside?: React.ReactNode;
  asidePlacement?: ChartLegendPlacement;
  children: React.ReactNode;
  className?: string;
  description?: React.ReactNode;
  empty?: boolean;
  /** The empty state (`ChartStateProps.emptyState`). */
  emptyState?: ChartEmptyState;
  /** Play the first entrance (`ChartEntranceOptions.entrance`). @default true */
  entrance?: boolean;
  /**
   * The direction this form's marks are uncovered in. A form without a move
   * (a gauge, the forms drawn outside the shared plot) has no entrance.
   */
  entranceMove?: ChartEntranceMove;
  /** Message for a failed load; `true` uses the default. Wins over `loading`. */
  error?: React.ReactNode;
  /** Keyboard exploration of the plot (axis charts). */
  explorer?: ChartExplorer;
  /** Formats the table twin's value cells (see `BaseChartProps.formatValue`). */
  formatValue?: (value: number) => string;
  /** Header switch between the plot and a visible table of `table`. */
  tableToggle?: boolean;
  height?: number;
  /** The data is in flight. A skeleton holds the plot's box. */
  loading?: boolean;
  onRetry?: () => void;
  /** A refetch over drawn data: the plot stays, dims, and is `aria-busy`. */
  refreshing?: boolean;
  downloadCsv?: boolean | string;
  /** A "Download image" header action (see `ChartFrameExtras`). */
  downloadImage?: boolean | string;
  /** The plot is held (`paused`): a Paused badge says why it stopped moving. */
  paused?: boolean;
  /** The table twin is an ordered series, so `summaryLine` can be written from it. */
  ordered?: boolean;
  retryLabel?: string;
  /** A one-sentence reading under the header (see `ChartFrameExtras`). */
  summaryLine?: boolean | React.ReactNode;
  /** The figure the card leads with (see `ChartFrameExtras`). */
  headline?: ChartHeadline;
  /** When the data was last updated (see `ChartFrameExtras`). */
  freshness?: ChartFreshness;
  /** The silhouette shown while `loading` (bars, a line, or a plain block). */
  loadingShape?: ChartLoadingShape;
  /** The active point a following `headline` shows instead of its figure. */
  headlineStore?: ChartMomentStore | null;
  icon?: LucideIcon;
  id?: string;
  overlay?: React.ReactNode;
  square?: boolean;
  style?: React.CSSProperties;
  table?: ChartTable;
  title?: React.ReactNode;
} & XstyleProp) {
  const headingId = `atelier-chart-title-${useId()}`;
  const split = aside != null && asidePlacement !== "top";
  const plotState = resolveChartPlotState({ empty, error, loading });
  const theme = themeProps("chart");
  const rootRef = useRef<HTMLElement>(null);
  useTranslation();
  const [showTable, setShowTable] = useState(false);
  const canToggle = tableToggle && table != null && plotState == null;
  const tableView = canToggle && showTable;
  const plotTitle = typeof title === "string" ? title : undefined;
  // Refreshing only means something over a drawn plot; a state that replaced
  // the plot already says what the data is doing.
  const stale = refreshing && plotState == null;
  const entering = useChartEntrance({
    enabled: wantsChartEntrance(entrance, entranceMove),
    ready: plotState == null && !tableView,
  });
  const plot = tableView ? (
    <div
      aria-busy={stale || undefined}
      className={sx(stale && styles.plotRefreshing)}
    >
      <ChartDataTable formatValue={formatValue} table={table!} visible />
    </div>
  ) : (
    <div
      aria-busy={stale || undefined}
      className={cx(
        entering.playing && CHART_ENTRANCE_CLASS,
        sx(
          styles.plot,
          // Once the entrance has run the plot's own fade stays off, so the
          // entrance ending does not start a second one.
          entering.settled && styles.plotEntered,
          // Auto margins center the capped plot in the block-direction forms. In a
          // side-by-side split they would eat the row's free space before
          // `justify-content` sees it, pushing the legend to the far card edge and
          // stretching the gap between the arc and its own labels — there, the row
          // centers the pair instead.
          square &&
            (!split || asidePlacement === "bottom") &&
            styles.plotSquare,
          square && split && asidePlacement === "auto" && styles.plotSquareAuto,
          split && styles.plotSplit,
          split && asidePlacement === "bottom" && styles.plotFull,
          split && asidePlacement === "auto" && styles.plotAuto,
          stale && styles.plotRefreshing,
        ),
      )}
      data-chart-entrance={entering.playing ? entranceMove : undefined}
      onAnimationEnd={entering.onAnimationEnd}
      // The square cap is the arc's, not a state's: capped, an empty pie's
      // message wrapped inside a ~180px column of a wide card.
      style={{
        blockSize: height,
        maxInlineSize: square && plotState == null ? height : undefined,
      }}
    >
      {plotState != null ? (
        <ChartPlotState
          emptyState={emptyState}
          error={error}
          kind={plotState}
          loadingShape={loadingShape}
          onRetry={onRetry}
          retryLabel={retryLabel}
        />
      ) : (
        <>
          {/* Ahead of the plot, not after it. The readout and the chart's
              tooltip are both positioned with no z-index, so document order is
              paint order: after the plot, a donut's centre readout covered any
              tooltip that opened across the hole. The arc never covers the
              hole, so the readout still shows. */}
          {overlay != null ? (
            <div className={sx(styles.plotOverlay)}>{overlay}</div>
          ) : null}
          {explorer ? (
            <ChartExploreSurface
              explorer={explorer}
              label={plotTitle}
              labelledBy={title && plotTitle == null ? headingId : undefined}
            >
              <ResponsiveContainer height="100%" width="100%">
                {children as React.ReactElement}
              </ResponsiveContainer>
            </ChartExploreSurface>
          ) : (
            <ResponsiveContainer height="100%" width="100%">
              {children as React.ReactElement}
            </ResponsiveContainer>
          )}
        </>
      )}
    </div>
  );
  return (
    <section
      {...theme}
      aria-labelledby={title ? headingId : undefined}
      className={cx(sx(styles.frame, xstyle), theme.className, className)}
      id={id}
      ref={rootRef}
      style={style}
    >
      <ChartCardHeader
        actions={
          actions != null ||
          canToggle ||
          paused ||
          freshness ||
          (downloadCsv && table && plotState == null) ||
          (downloadImage && plotState == null) ? (
            <>
              {actions}
              {freshness ? <ChartFreshnessNote freshness={freshness} /> : null}
              {paused ? (
                <Badge data-chart-paused="" tone="neutral">
                  {i18n.t("ui:chart.paused")}
                </Badge>
              ) : null}
              {plotState == null && !tableView ? (
                <ImageAction
                  description={description}
                  downloadImage={downloadImage}
                  rootRef={rootRef}
                  title={title}
                />
              ) : null}
              {plotState == null ? (
                <CsvAction
                  downloadCsv={downloadCsv}
                  table={table}
                  title={title}
                />
              ) : null}
              {canToggle ? (
                <Button
                  aria-pressed={showTable}
                  onClick={() => setShowTable((current) => !current)}
                  size="xs"
                  variant="quiet"
                >
                  {showTable
                    ? i18n.t("ui:chart.showChart")
                    : i18n.t("ui:chart.showTable")}
                </Button>
              ) : null}
            </>
          ) : null
        }
        description={description}
        descriptionPlacement={descriptionPlacement}
        headingId={headingId}
        icon={Icon}
        title={title}
      />
      {/* Kept through loading (as a skeleton) and every other state, so the
          figure's row never appears or vanishes under the reader. */}
      {headline ? (
        <ChartHeadlineReadout
          formatValue={formatValue ?? formatChartReadout}
          headline={headline}
          loading={plotState === "loading"}
          store={plotState == null ? headlineStore : null}
        />
      ) : null}
      {plotState == null ? (
        <ChartSummary
          formatValue={formatValue}
          ordered={ordered}
          summary={summaryLine}
          table={table}
        />
      ) : null}
      {/* F6: an identity legend reads under the title, before the plot. */}
      {aside != null && asidePlacement === "top" ? aside : null}
      {table && plotState == null && !tableView ? (
        <ChartDataTable formatValue={formatValue} table={table} />
      ) : null}
      {aside == null || asidePlacement === "top" ? (
        plot
      ) : (
        <div
          className={sx(
            styles.split,
            asidePlacement === "bottom" && styles.splitColumn,
            asidePlacement === "auto" && styles.splitAuto,
          )}
        >
          {plot}
          {/* The aside owns the width the plot does not: it is the half of the
              card that stops a height-driven form from leaving dead space. */}
          <div
            className={sx(
              styles.aside,
              asidePlacement === "bottom" && styles.asideFull,
              asidePlacement === "auto" && styles.asideAuto,
            )}
          >
            {aside}
          </div>
        </div>
      )}
    </section>
  );
}
