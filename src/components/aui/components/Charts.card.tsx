import { useId } from "react";
import type * as React from "react";

import { themeProps } from "../theming/theme-props";
import { cx, sx } from "../utils/stylex";
import { ChartCardHeader, type ChartHeaderProps } from "./Charts.header";
import {
  ChartDataTable,
  ChartPlotState,
  CsvAction,
  resolveChartPlotState,
  type ChartFrameProps,
  type ChartTable,
} from "./Charts.states";
import { styles } from "./Charts.styles";
import { ChartFreshnessNote, ChartHeadlineReadout } from "./Charts.headline";
import { ChartSummary } from "./Charts.share";
import { formatChartReadout } from "./Charts.format";

export type ChartCardProps = ChartFrameProps &
  ChartHeaderProps & {
    /** The visualization: a `BarList`, or an app-specific plot. */
    children?: React.ReactNode;
    /** Values for the visually hidden table twin, read through `formatValue`. */
    table?: ChartTable;
    formatValue?: (value: number) => string;
    /** Height of the box the loading / error / empty state holds. @default 220 */
    height?: number;
  };

/**
 * The chart card on its own: the same surface, header anatomy, states and
 * table twin every chart form draws into, for a body that is not a Recharts
 * plot — a `BarList` (read names and exact values) or an app-specific
 * visualization. It replaces the deprecated `Chart` wrapper (ATL-56).
 *
 * States hold `height` px in place of `children`, with the frame's priority:
 * error > loading > empty. The table twin is withheld while a state shows.
 * `refreshing` keeps the body, dimmed and `aria-busy`, while data refetches.
 */
export function ChartCard({
  actions,
  children,
  className,
  description,
  descriptionPlacement,
  empty,
  emptyState,
  error,
  formatValue,
  freshness,
  headline,
  height = 220,
  icon,
  id,
  loading = false,
  onRetry,
  downloadCsv,
  refreshing = false,
  retryLabel,
  style,
  summaryLine,
  table,
  title,
  xstyle,
}: ChartCardProps) {
  const headingId = `atelier-chart-title-${useId()}`;
  const plotState = resolveChartPlotState({ empty, error, loading });
  const theme = themeProps("chart");
  return (
    <section
      {...theme}
      aria-labelledby={title ? headingId : undefined}
      className={cx(sx(styles.frame, xstyle), theme.className, className)}
      id={id}
      style={style}
    >
      <ChartCardHeader
        actions={
          actions != null ||
          freshness ||
          (downloadCsv && table && plotState == null) ? (
            <>
              {actions}
              {freshness ? <ChartFreshnessNote freshness={freshness} /> : null}
              {downloadCsv && table && plotState == null ? (
                <CsvAction
                  downloadCsv={downloadCsv}
                  table={table}
                  title={title}
                />
              ) : null}
            </>
          ) : undefined
        }
        description={description}
        descriptionPlacement={descriptionPlacement}
        headingId={headingId}
        icon={icon}
        title={title}
      />
      {/* The same headline figure the plotted forms lead with (static here:
          a card's body is the caller's, so there is no point to follow). */}
      {headline ? (
        <ChartHeadlineReadout
          formatValue={formatValue ?? formatChartReadout}
          headline={headline}
          loading={plotState === "loading"}
        />
      ) : null}
      {plotState == null ? (
        <ChartSummary
          formatValue={formatValue}
          summary={summaryLine}
          table={table}
        />
      ) : null}
      {table && plotState == null ? (
        <ChartDataTable formatValue={formatValue} table={table} />
      ) : null}
      {plotState != null ? (
        <div className={sx(styles.plot)} style={{ blockSize: height }}>
          <ChartPlotState
            emptyState={emptyState}
            error={error}
            kind={plotState}
            onRetry={onRetry}
            retryLabel={retryLabel}
          />
        </div>
      ) : refreshing ? (
        // Wrapped only while refreshing, so a settled card keeps the exact
        // box tree its body was laid out in.
        <div aria-busy className={sx(styles.plotRefreshing)}>
          {children}
        </div>
      ) : (
        children
      )}
    </section>
  );
}
