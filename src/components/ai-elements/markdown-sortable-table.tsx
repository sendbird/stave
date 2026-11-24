import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Element } from "hast";
import * as stylex from "@stylexjs/stylex";
import { i18n, useTranslation } from "@/i18n";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  TABLE_FILTER_ROW_THRESHOLD,
  nextTableSort,
  visibleTableRowIndices,
  type PlainTable,
  type TableSortDirection,
  type TableSortState,
} from "@/lib/markdown/table-sort";
import { chatType } from "./chat-type.stylex";

interface MarkdownTableSortValue {
  headerCells: readonly Element[];
  sort: TableSortState | null;
  onSort: (column: number) => void;
  /** Body rows to show, as indices into the written order. */
  visibleRows: readonly number[];
  columnCount: number;
}

const MarkdownTableSortContext = createContext<MarkdownTableSortValue | null>(null);

function headerCellsOf(table: Element): Element[] {
  const cells: Element[] = [];
  for (const section of table.children) {
    if (section.type !== "element" || section.tagName !== "thead") continue;
    for (const row of section.children) {
      if (row.type !== "element" || row.tagName !== "tr") continue;
      for (const cell of row.children) {
        if (cell.type === "element" && cell.tagName === "th") cells.push(cell);
      }
    }
  }
  return cells;
}

/**
 * A reply's table whose cells are plain text: its headers sort the rows
 * (ascending, descending, then back to the written order) and, past
 * {@link TABLE_FILTER_ROW_THRESHOLD} rows, a field above it filters them.
 * The cells keep the Markdown rendering; only the row order and visibility
 * change.
 */
export function SortableMarkdownTable(props: {
  node: Element;
  table: PlainTable;
  renderTable: (children: ReactNode) => ReactNode;
  children?: ReactNode;
}) {
  useTranslation();
  const filterId = useId();
  const [sort, setSort] = useState<TableSortState | null>(null);
  const [query, setQuery] = useState("");
  const { node, table } = props;
  const headerCells = useMemo(() => headerCellsOf(node), [node]);
  const visibleRows = useMemo(
    () => visibleTableRowIndices(table.rows, sort, query),
    [query, sort, table.rows],
  );
  const value = useMemo<MarkdownTableSortValue>(
    () => ({
      headerCells,
      sort,
      onSort: (column) => setSort((current) => nextTableSort(current, column)),
      visibleRows,
      columnCount: table.columns.length,
    }),
    [headerCells, sort, table.columns.length, visibleRows],
  );
  const filterable = table.rows.length > TABLE_FILTER_ROW_THRESHOLD;

  return (
    <MarkdownTableSortContext.Provider value={value}>
      {filterable ? (
        <div className={sx(styles.filterBar)}>
          <Input
            id={filterId}
            type="search"
            aria-label={i18n.t("composer:richBlock.tableFilterLabel")}
            placeholder={i18n.t("composer:richBlock.tableFilterPlaceholder")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            xstyle={styles.filterInput}
          />
          {query.trim() ? (
            <span className={sx(styles.filterCount)} aria-live="polite">
              {i18n.t("composer:richBlock.tableFilterCount", {
                shown: visibleRows.length,
                total: table.rows.length,
              })}
            </span>
          ) : null}
        </div>
      ) : null}
      {props.renderTable(props.children)}
    </MarkdownTableSortContext.Provider>
  );
}

/** The sort state of the header cell `node`, or null outside a sortable table. */
export function useMarkdownTableHeaderSort(node: Element | undefined): {
  direction: TableSortDirection | null;
  onSort: () => void;
} | null {
  const context = useContext(MarkdownTableSortContext);
  if (!context || !node) return null;
  const column = context.headerCells.indexOf(node);
  if (column < 0) return null;
  return {
    direction: context.sort?.column === column ? context.sort.direction : null,
    onSort: () => context.onSort(column),
  };
}

/**
 * The body rows in display order. Outside a sortable table the rows render
 * as written.
 */
export function MarkdownTableBodyRows(props: { children?: ReactNode }) {
  useTranslation();
  const context = useContext(MarkdownTableSortContext);
  if (!context) return <>{props.children}</>;
  const rows = Children.toArray(props.children).filter(isValidElement);
  if (context.visibleRows.length === 0) {
    return (
      <TableRow>
        <TableCell colSpan={context.columnCount} xstyle={styles.emptyCell}>
          {i18n.t("composer:richBlock.tableNoMatches")}
        </TableCell>
      </TableRow>
    );
  }
  return <>{context.visibleRows.map((index) => rows[index])}</>;
}

const styles = stylex.create({
  filterBar: {
    display: "flex",
    alignItems: "center",
    gap: vars["--aui-space-8"],
    marginBottom: vars["--aui-space-8"],
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
  emptyCell: {
    color: vars["--aui-color-text-muted"],
    fontSize: chatType["--chat-type-secondary"],
    paddingInline: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-8"],
  },
});
