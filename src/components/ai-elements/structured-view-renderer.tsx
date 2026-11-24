import { useId, useMemo, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { getIntlLocale, i18n, useTranslation } from "@/i18n";
import { formatDate } from "@/i18n/format";
import {
  ChartFromSpec,
  specFormatter,
  type ChartSpec,
  type ChartSpecFormat,
} from "@/components/aui/components/ChartSpec";
import { TimelineChart, type TimelineItem } from "@/components/aui/components/Charts.timeline";
import { DataTable } from "@/components/aui/components/DataTable";
import type { DataTableColumn, DataTableSort } from "@/components/aui/components/DataTable.types";
import { StatTile } from "@/components/aui/components/StatTile";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { Input } from "@/components/ui/input";
import {
  structuredCellText,
  structuredColumnAlign,
  structuredTablePage,
  structuredTablePageCount,
  structuredTableRows,
  visibleStructuredRows,
  type StructuredTableRow,
  type StructuredTableSort,
} from "@/lib/structured-view/table-view";
import {
  chartViewSpec,
  heatmapChartSpec,
  type StructuredStatsView,
  type StructuredTableColumn,
  type StructuredTableView,
  type StructuredTimelineView,
  type StructuredViewCellValue,
  type StructuredViewFormat,
  type StructuredViewSpec,
} from "@/lib/structured-view/view-spec";
import { chatType } from "./chat-type.stylex";

/**
 * Draws one structured view with the design system's data components. This
 * module carries the chart library, so it loads the first time a reply shows
 * a view (`structured-view-block.tsx`).
 */
export default function StructuredViewRenderer({ spec }: { spec: StructuredViewSpec }) {
  useTranslation();
  switch (spec.type) {
    case "chart":
      return <ChartFromSpec spec={chartViewSpec(spec) as ChartSpec} />;
    case "heatmap":
      return <ChartFromSpec spec={heatmapChartSpec(spec) as ChartSpec} />;
    case "timeline":
      return <TimelineView view={spec} />;
    case "stats":
      return <StatsView view={spec} />;
    case "table":
      return <TableView view={spec} />;
  }
}

function formatterFor(format: StructuredViewFormat | undefined) {
  // The view schema admits the same named formats `ChartSpecFormat` lists.
  return specFormatter(format as ChartSpecFormat | undefined, getIntlLocale());
}

function ViewHeading({ title, summary }: { title?: string; summary?: string }) {
  if (!title && !summary) return null;
  return (
    <div className={sx(styles.heading)}>
      {title ? <div className={sx(styles.title)}>{title}</div> : null}
      {summary ? <div className={sx(styles.summary)}>{summary}</div> : null}
    </div>
  );
}

function TimelineView({ view }: { view: StructuredTimelineView }) {
  const items = useMemo<TimelineItem[]>(
    () =>
      view.items.map((item, index) => ({
        ...item,
        id: item.id ?? String(index),
      })),
    [view.items],
  );
  return (
    <TimelineChart
      description={view.summary}
      items={items}
      now={view.now}
      title={view.title}
    />
  );
}

function StatsView({ view }: { view: StructuredStatsView }) {
  return (
    <section className={sx(styles.section)}>
      <ViewHeading summary={view.summary} title={view.title} />
      <div className={sx(styles.statGrid)}>
        {view.items.map((item, index) => {
          const format = formatterFor(item.format);
          return (
            <StatTile
              key={`${index}-${item.label}`}
              delta={item.delta}
              deltaTone={item.status}
              goodDirection={item.goodDirection}
              label={item.label}
              note={item.note}
              previous={item.previous}
              trend={item.trend}
              value={item.value}
              {...(format ? { format } : {})}
            />
          );
        })}
      </div>
    </section>
  );
}

function formatCell(value: StructuredViewCellValue | undefined, column: StructuredTableColumn): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "boolean") {
    return value ? i18n.t("composer:structuredView.yes") : i18n.t("composer:structuredView.no");
  }
  if (typeof value === "number") {
    const format = formatterFor(column.format);
    return format ? format(value) : value.toLocaleString(getIntlLocale());
  }
  if (column.type === "date" && Number.isFinite(Date.parse(value))) {
    return formatDate(value);
  }
  return value;
}

function TableView({ view }: { view: StructuredTableView }) {
  const searchId = useId();
  const rows = useMemo(() => structuredTableRows(view), [view]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<StructuredTableSort | null>(
    view.sort ? { columnId: view.sort.key, direction: view.sort.direction } : null,
  );
  const [page, setPage] = useState(1);
  const visible = useMemo(() => visibleStructuredRows(view, rows, sort, query), [view, rows, sort, query]);
  const pageCount = structuredTablePageCount(visible.length);
  const currentPage = Math.min(page, pageCount);
  const pageRows = structuredTablePage(visible, currentPage);

  const columns = useMemo<Array<DataTableColumn<StructuredTableRow>>>(
    () =>
      view.columns.map((column) => ({
        id: column.key,
        header: column.label ?? column.key,
        align: structuredColumnAlign(column),
        sortable: true,
        // The rows arrive sorted (sort is controlled); this value names the
        // column's order for the header and the CSV export.
        sortValue: (row) => {
          const value = row.values[column.key];
          return typeof value === "boolean" ? Number(value) : (value ?? null);
        },
        exportValue: (row) => {
          const value = row.values[column.key];
          return typeof value === "boolean" ? structuredCellText(value) : (value ?? null);
        },
        cell: (row) => formatCell(row.values[column.key], column),
      })),
    [view.columns],
  );
  const tableSort: DataTableSort | undefined = sort
    ? { columnId: sort.columnId, direction: sort.direction === "asc" ? "ascending" : "descending" }
    : undefined;

  return (
    <section className={sx(styles.section)}>
      <ViewHeading summary={view.summary} title={view.title} />
      <DataTable
        columns={columns}
        density="compact"
        exportable={{ fileName: view.title ?? "table" }}
        filter={
          <div className={sx(styles.filterBar)}>
            <Input
              id={searchId}
              type="search"
              aria-label={i18n.t("composer:richBlock.tableFilterLabel")}
              placeholder={i18n.t("composer:richBlock.tableFilterPlaceholder")}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              xstyle={styles.filterInput}
            />
            {query.trim() ? (
              <span className={sx(styles.filterCount)} aria-live="polite">
                {i18n.t("composer:richBlock.tableFilterCount", {
                  shown: visible.length,
                  total: rows.length,
                })}
              </span>
            ) : null}
          </div>
        }
        onSortChange={(next) => {
          setSort({ columnId: next.columnId, direction: next.direction === "descending" ? "desc" : "asc" });
          setPage(1);
        }}
        pagination={
          pageCount > 1 ? { page: currentPage, pageCount, onPageChange: setPage } : undefined
        }
        rows={pageRows}
        sort={tableSort}
      />
    </section>
  );
}

const styles = stylex.create({
  section: {
    display: "grid",
    gap: vars["--aui-space-8"],
    minInlineSize: 0,
  },
  heading: {
    display: "grid",
    gap: vars["--aui-space-2"],
    minInlineSize: 0,
  },
  title: {
    color: vars["--aui-color-text"],
    fontSize: chatType["--chat-type-body"],
    lineHeight: chatType["--chat-type-body-leading"],
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  summary: {
    color: vars["--aui-color-text-muted"],
    fontSize: chatType["--chat-type-secondary"],
    lineHeight: chatType["--chat-type-secondary-leading"],
  },
  statGrid: {
    display: "grid",
    gap: vars["--aui-space-12"],
    gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 12rem), 1fr))",
  },
  filterBar: {
    display: "flex",
    alignItems: "center",
    gap: vars["--aui-space-8"],
    minInlineSize: 0,
  },
  filterInput: {
    maxInlineSize: "16rem",
  },
  filterCount: {
    color: vars["--aui-color-text-muted"],
    fontSize: chatType["--chat-type-meta"],
    lineHeight: chatType["--chat-type-meta-leading"],
    whiteSpace: "nowrap",
  },
});
