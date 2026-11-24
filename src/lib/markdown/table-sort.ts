import type { Element, ElementContent } from "hast";

/**
 * Sorting and filtering for a Markdown table in a reply.
 *
 * Only a table whose cells hold plain text takes part: text with emphasis is
 * fine, while a link, inline code, an image or math keeps the table as it was
 * written, because those cells carry more than their text.
 */

export type TableSortDirection = "ascending" | "descending";

export interface TableSortState {
  column: number;
  direction: TableSortDirection;
}

export interface PlainTable {
  columns: string[];
  rows: string[][];
}

/** Inline elements whose content is still the cell's text. */
const PLAIN_INLINE_TAGS = new Set(["strong", "em", "del", "b", "i", "s", "br"]);

/** A table needs at least this many body rows before sorting means anything. */
export const MIN_SORTABLE_ROWS = 2;

/** Above this many body rows the table shows a filter field. */
export const TABLE_FILTER_ROW_THRESHOLD = 10;

function isElement(node: ElementContent): node is Element {
  return node.type === "element";
}

function childElements(node: Element, tagName: string): Element[] {
  return node.children.filter(
    (child): child is Element => isElement(child) && child.tagName === tagName,
  );
}

/** The cell's text, or null when it holds anything other than plain text. */
function plainCellText(node: Element): string | null {
  let text = "";
  for (const child of node.children) {
    if (child.type === "text") {
      text += child.value;
      continue;
    }
    if (child.type === "comment") continue;
    if (!isElement(child) || !PLAIN_INLINE_TAGS.has(child.tagName)) return null;
    if (child.tagName === "br") {
      text += " ";
      continue;
    }
    const inner = plainCellText(child);
    if (inner === null) return null;
    text += inner;
  }
  return text;
}

function rowCells(row: Element): Element[] {
  return row.children.filter(
    (child): child is Element =>
      isElement(child) && (child.tagName === "td" || child.tagName === "th"),
  );
}

/**
 * The header labels and body rows of a rendered GFM table, or null when any
 * cell holds more than text or the table has too few rows to sort.
 */
export function plainTableFromHast(table: Element | undefined): PlainTable | null {
  if (!table || table.tagName !== "table") return null;
  const [head] = childElements(table, "thead");
  const [headRow] = head ? childElements(head, "tr") : [];
  if (!headRow) return null;
  const columns: string[] = [];
  for (const cell of rowCells(headRow)) {
    const text = plainCellText(cell);
    if (text === null) return null;
    columns.push(text.trim());
  }
  if (columns.length === 0) return null;

  const rows: string[][] = [];
  for (const body of childElements(table, "tbody")) {
    for (const row of childElements(body, "tr")) {
      const cells: string[] = [];
      for (const cell of rowCells(row)) {
        const text = plainCellText(cell);
        if (text === null) return null;
        cells.push(text.trim());
      }
      rows.push(cells);
    }
  }
  if (rows.length < MIN_SORTABLE_ROWS) return null;
  return { columns, rows };
}

const EMPTY_CELL = /^(?:|-|–|—|n\/?a)$/i;

/** Blank and placeholder cells ("", "-", "—", "n/a") sort after every value. */
export function isEmptyTableCell(cell: string): boolean {
  return EMPTY_CELL.test(cell.trim());
}

/**
 * A number with optional sign, currency symbol, thousands separators, exponent
 * and a short unit or percent sign: "1,204", "$12.50", "-3.5%", "12 ms".
 */
const NUMERIC_CELL =
  /^([+\-−]?)\s?[$€£¥₩]?\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d*\.?\d+)([eE][+-]?\d+)?\s?(?:%|[A-Za-zµ]{1,4})?$/;

/** The cell's value as a number when it reads as one, otherwise null. */
export function parseSortableNumber(cell: string): number | null {
  const match = NUMERIC_CELL.exec(cell.trim());
  if (!match) return null;
  const [, sign = "", digits = "", exponent = ""] = match;
  const negative = sign === "-" || sign === "−";
  const value = Number(`${negative ? "-" : ""}${digits.replaceAll(",", "")}${exponent}`);
  return Number.isFinite(value) ? value : null;
}

const textCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

/**
 * Ascending order of two non-empty cells: numbers by value and before text,
 * text with a natural collation (so "item 2" comes before "item 10").
 */
export function compareTableCells(a: string, b: string): number {
  const left = parseSortableNumber(a);
  const right = parseSortableNumber(b);
  if (left !== null && right !== null) return left - right;
  if (left !== null) return -1;
  if (right !== null) return 1;
  return textCollator.compare(a.trim(), b.trim());
}

/**
 * Row indices in display order for one column. Empty cells stay last in both
 * directions, and equal cells keep the order the table was written in.
 */
export function sortTableRowIndices(
  rows: readonly (readonly string[])[],
  sort: TableSortState,
): number[] {
  const sign = sort.direction === "ascending" ? 1 : -1;
  return rows
    .map((_, index) => index)
    .sort((x, y) => {
      const a = rows[x]?.[sort.column] ?? "";
      const b = rows[y]?.[sort.column] ?? "";
      const aEmpty = isEmptyTableCell(a);
      const bEmpty = isEmptyTableCell(b);
      if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
      if (aEmpty) return x - y;
      return sign * compareTableCells(a, b) || x - y;
    });
}

/** Whether every whitespace-separated term of `query` appears in the row. */
export function tableRowMatches(row: readonly string[], query: string): boolean {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const text = row.join("\u0000").toLocaleLowerCase();
  return terms.every((term) => text.includes(term));
}

/** The rows to show, in order: sorted when a column is sorted, then filtered. */
export function visibleTableRowIndices(
  rows: readonly (readonly string[])[],
  sort: TableSortState | null,
  query: string,
): number[] {
  const order = sort ? sortTableRowIndices(rows, sort) : rows.map((_, index) => index);
  if (!query.trim()) return order;
  return order.filter((index) => tableRowMatches(rows[index] ?? [], query));
}

/**
 * The next state after a header press: a new column sorts ascending, the
 * sorted column turns descending, and a third press returns the written order.
 */
export function nextTableSort(
  current: TableSortState | null,
  column: number,
): TableSortState | null {
  if (!current || current.column !== column) {
    return { column, direction: "ascending" };
  }
  return current.direction === "ascending"
    ? { column, direction: "descending" }
    : null;
}
