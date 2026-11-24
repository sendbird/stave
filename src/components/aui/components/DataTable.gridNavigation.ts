/**
 * The pure half of the `DataTable` grid keyboard: which cells exist, in what
 * visual order, and where a navigation key lands. No DOM and no React here —
 * `DataTable.gridKeyboard.ts` owns focus and events and asks this module for
 * the target.
 *
 * The grid is a list of LINES in visual order, not a list of data rows. The
 * first shipped model (#535) walked `rows` only, so ArrowUp stopped at the
 * first data row with the sortable headers above it out of reach, and an
 * expanded row's detail row — a real `<tr>` between two data rows — was
 * skipped as if it were not on screen. A line is a header row, a data row, or
 * a detail row, and each carries the column keys it can be navigated by:
 *
 * - the header line has one cell per header cell the reader can see (all of
 *   them in a table; the strip's cells in the stacked presentation);
 * - a data line has the full column set;
 * - a detail line has exactly one cell, `GRID_DETAIL_COLUMN`, spanning the row.
 */

/** Column keys for the table-owned columns, outside any caller column id. */
export const GRID_EXPAND_COLUMN = "__aui-grid-expand";
export const GRID_SELECT_COLUMN = "__aui-grid-select";
export const GRID_ACTIONS_COLUMN = "__aui-grid-actions";
/** The one cell of an expanded row's full-width detail row. */
export const GRID_DETAIL_COLUMN = "__aui-grid-detail";
/** Row key of the header row. Reserved beside the `__aui-grid-` columns. */
export const GRID_HEADER_ROW = "__aui-grid-header";

export type GridCell = { columnKey: string; rowId: string };
export type GridLine = { columns: string[]; rowId: string };
export type GridPosition = { column: number; line: number };

/** Navigable column keys in visual order; the spacer column is never one. */
export function gridColumnKeys(options: {
  columnIds: string[];
  expansion: boolean;
  rowActions: boolean;
  selection: boolean;
}): string[] {
  return [
    ...(options.expansion ? [GRID_EXPAND_COLUMN] : []),
    ...(options.selection ? [GRID_SELECT_COLUMN] : []),
    ...options.columnIds,
    ...(options.rowActions ? [GRID_ACTIONS_COLUMN] : []),
  ];
}

/** The grid's lines in visual order: header, then each row and its detail. */
export function gridLines(options: {
  columnKeys: string[];
  expandedRowIds: ReadonlySet<string>;
  headerColumnKeys: string[];
  rowIds: string[];
}): GridLine[] {
  const lines: GridLine[] = [];
  if (options.headerColumnKeys.length > 0) {
    lines.push({ columns: options.headerColumnKeys, rowId: GRID_HEADER_ROW });
  }
  for (const rowId of options.rowIds) {
    lines.push({ columns: options.columnKeys, rowId });
    if (options.expandedRowIds.has(rowId)) {
      lines.push({ columns: [GRID_DETAIL_COLUMN], rowId });
    }
  }
  return lines;
}

/** Index of the line a cell sits on, or -1 when it is no longer rendered. */
export function lineIndexOf(lines: GridLine[], cell: GridCell): number {
  const detail = cell.columnKey === GRID_DETAIL_COLUMN;
  return lines.findIndex(
    (line) =>
      line.rowId === cell.rowId &&
      (line.columns[0] === GRID_DETAIL_COLUMN) === detail &&
      line.columns.includes(cell.columnKey),
  );
}

/**
 * The column a vertical move lands on. The same key when the target line has
 * it; the detail line's one cell; otherwise the target-line cell nearest the
 * key in full column order — a stacked header strip carries only some keys,
 * and "the header cell above this one" is the closest one it has.
 */
export function columnOnLine(
  target: GridLine,
  columnKey: string,
  columnOrder: string[],
): number {
  const same = target.columns.indexOf(columnKey);
  if (same >= 0) return same;
  if (target.columns.length === 1) return 0;
  const from = columnOrder.indexOf(columnKey);
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  target.columns.forEach((key, index) => {
    const distance = Math.abs(columnOrder.indexOf(key) - from);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

type NavigationKey = {
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
};

type NavigationContext = {
  /** Index of the first body line (1 with a header line, else 0). */
  bodyStart: number;
  /** Full column order, for mapping keys between lines of different shape. */
  columnOrder: string[];
  from: GridPosition;
  /**
   * The column a vertical move keeps. It is the current cell's key, except on
   * a detail line, where it is the key of the last multi-column cell — so
   * walking down through a detail row keeps the reader's column.
   */
  heldColumnKey: string;
  inlineStep: 1 | -1;
  lines: GridLine[];
  page: () => number;
};

/**
 * The cell a navigation key lands on; `null` when the key is not ours.
 *
 * Vertical jumps — PageUp/PageDown and Ctrl/Cmd+Home/End — stay in the body:
 * the header is entered with ArrowUp from the first row and left with
 * ArrowDown, the same as a spreadsheet's column band. From the header,
 * PageDown still lands a page into the body and PageUp stays put.
 */
export function nextGridPosition(
  event: NavigationKey,
  context: NavigationContext,
): GridPosition | null {
  const { bodyStart, from, lines } = context;
  const lastLine = lines.length - 1;
  const current = lines[from.line];
  if (!current) return null;
  const lastColumnOf = (line: number) =>
    Math.max(0, (lines[line]?.columns.length ?? 1) - 1);
  const firstBody = Math.min(bodyStart, lastLine);
  const vertical = (line: number): GridPosition => {
    const target = lines[line]!;
    return {
      column: columnOnLine(target, context.heldColumnKey, context.columnOrder),
      line,
    };
  };
  const clampBody = (line: number) =>
    Math.min(Math.max(line, Math.min(firstBody, from.line)), lastLine);
  const primary = event.ctrlKey || event.metaKey;

  switch (event.key) {
    case "Home":
      return primary ? { column: 0, line: firstBody } : { ...from, column: 0 };
    case "End":
      return primary
        ? { column: lastColumnOf(lastLine), line: lastLine }
        : { ...from, column: lastColumnOf(from.line) };
  }
  if (primary) return null;
  switch (event.key) {
    case "ArrowDown":
      return vertical(Math.min(from.line + 1, lastLine));
    case "ArrowUp":
      return vertical(Math.max(from.line - 1, 0));
    case "ArrowRight":
    case "ArrowLeft": {
      const step =
        event.key === "ArrowRight" ? context.inlineStep : -context.inlineStep;
      return {
        ...from,
        column: Math.min(
          Math.max(from.column + step, 0),
          lastColumnOf(from.line),
        ),
      };
    }
    case "PageDown":
      return vertical(
        clampBody(Math.max(from.line, firstBody - 1) + context.page()),
      );
    case "PageUp":
      return vertical(clampBody(from.line - context.page()));
    default:
      return null;
  }
}
