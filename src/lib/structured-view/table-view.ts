import { compareTableCells, tableRowMatches } from "@/lib/markdown/table-sort";
import type {
  StructuredTableColumn,
  StructuredTableView,
  StructuredViewCellValue,
} from "./view-spec";

/**
 * The reader's controls over a table view's inline rows: search, sort and
 * pages. Everything runs over the rows the view carries; nothing is fetched.
 */

/** Ten rows fit the table frame's bounded height, so a page never scrolls inside the reply. */
export const STRUCTURED_TABLE_PAGE_SIZE = 10;

export type StructuredTableRow = {
  id: string;
  /** Written order, the tiebreak that keeps the sort stable. */
  index: number;
  values: Record<string, StructuredViewCellValue>;
};

export type StructuredTableSort = { columnId: string; direction: "asc" | "desc" };

export function structuredTableRows(view: StructuredTableView): StructuredTableRow[] {
  return view.rows.map((values, index) => ({ id: String(index), index, values }));
}

function isEmpty(value: StructuredViewCellValue | undefined): boolean {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

/** The plain text of a cell, as search and the CSV export read it. */
export function structuredCellText(value: StructuredViewCellValue | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

/**
 * Ascending order of two non-empty cells. Numbers compare by value, date
 * columns by time, booleans false before true, and text with the natural
 * collation the reply tables use ("item 2" before "item 10").
 */
export function compareStructuredCells(
  a: StructuredViewCellValue,
  b: StructuredViewCellValue,
  column: Pick<StructuredTableColumn, "type">,
): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  if (column.type === "date") {
    const left = Date.parse(String(a));
    const right = Date.parse(String(b));
    if (Number.isFinite(left) && Number.isFinite(right)) return left - right;
  }
  return compareTableCells(String(a), String(b));
}

/**
 * The rows to show, in order: filtered by every whitespace-separated term of
 * the query, then sorted. Empty cells stay last in both directions, and equal
 * cells keep the written order.
 */
export function visibleStructuredRows(
  view: Pick<StructuredTableView, "columns">,
  rows: readonly StructuredTableRow[],
  sort: StructuredTableSort | null,
  query: string,
): StructuredTableRow[] {
  const matching = query.trim()
    ? rows.filter((row) =>
        tableRowMatches(view.columns.map((column) => structuredCellText(row.values[column.key])), query),
      )
    : [...rows];
  const column = sort ? view.columns.find((candidate) => candidate.key === sort.columnId) : undefined;
  if (!sort || !column) return matching;
  const sign = sort.direction === "asc" ? 1 : -1;
  return matching.sort((x, y) => {
    const a = x.values[column.key];
    const b = y.values[column.key];
    const aEmpty = isEmpty(a);
    const bEmpty = isEmpty(b);
    if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
    if (aEmpty || a === undefined || b === undefined) return x.index - y.index;
    return sign * compareStructuredCells(a, b, column) || x.index - y.index;
  });
}

export function structuredTablePageCount(rowCount: number, pageSize = STRUCTURED_TABLE_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(rowCount / pageSize));
}

/** One page of rows; `page` is 1-based and clamped to the pages there are. */
export function structuredTablePage<T>(rows: readonly T[], page: number, pageSize = STRUCTURED_TABLE_PAGE_SIZE): T[] {
  const last = structuredTablePageCount(rows.length, pageSize);
  const current = Math.min(Math.max(1, Math.floor(page)), last);
  return rows.slice((current - 1) * pageSize, current * pageSize);
}

/** A column's alignment: numbers line up at the end unless the view says otherwise. */
export function structuredColumnAlign(column: StructuredTableColumn): "start" | "center" | "end" {
  return column.align ?? (column.type === "number" ? "end" : "start");
}
