import * as React from "react";

import {
  GRID_DETAIL_COLUMN,
  GRID_EXPAND_COLUMN,
  GRID_HEADER_ROW,
  type GridCell,
  gridLines,
  lineIndexOf,
  nextGridPosition,
} from "./DataTable.gridNavigation";

export {
  GRID_ACTIONS_COLUMN,
  GRID_DETAIL_COLUMN,
  GRID_EXPAND_COLUMN,
  GRID_HEADER_ROW,
  GRID_SELECT_COLUMN,
  gridColumnKeys,
} from "./DataTable.gridNavigation";

/**
 * Cell-level keyboard navigation for an editable `DataTable` — the WAI-ARIA
 * data grid pattern (https://www.w3.org/WAI/ARIA/apg/patterns/grid/).
 *
 * `column.editable` shipped with a keyboard model that was row-level only:
 * every edit trigger was its own Tab stop and no arrow key moved between
 * cells, so an editable grid of 20 rows by 3 editable columns was 60 Tab
 * presses deep (roadmap C10 / ATL-45). When a table has an `onCellEdit`
 * handler and at least one visible editable column it becomes a
 * `role="grid"` with ONE Tab stop — the active cell — and the arrow keys move
 * that stop. A table without an editable column keeps its native `<table>`
 * semantics and none of this runs.
 *
 * Base UI ships no grid composite, so the roving tab stop is owned here, on
 * the pattern `Calendar.tsx` and `EmojiPicker.tsx` already use: a remembered
 * cell identity (row id + column key, never a render position, so it survives
 * sorting and virtual windowing) plus a fallback to the first cell.
 *
 * The walk covers every row on screen, in visual order (see
 * `DataTable.gridNavigation.ts`): the header row — its sort buttons and
 * select-all checkbox are grid cells, not extra Tab stops in front of the
 * grid — then each data row and, when expanded, its full-width detail row.
 *
 * Expansion follows the treegrid convention where it fits a grid of cells.
 * On an expand cell the inline-end arrow expands a collapsed row (focus
 * stays; press it again to move on), the inline-start arrow collapses an
 * expanded one, and on any other row state the arrows move as usual. The
 * inline-start arrow on a detail cell moves to its row's expand cell, the
 * treegrid "child to parent" step.
 *
 * Every cell has exactly one focus target. A cell holding a single widget the
 * table renders itself (the edit trigger, the selection checkbox, the expand
 * toggle, a sort button) focuses that widget; any other cell focuses the
 * `<td>`/`<th>`. Content a caller renders inside `cell()`, `rowActions` or an
 * expanded row keeps its own Tab order; Enter on such a cell moves focus into
 * its first focusable descendant.
 */

const ROW_ATTR = "data-aui-grid-row";
const CELL_ATTR = "data-aui-grid-cell";
const FOCUS_ATTR = "data-aui-grid-focus";
const FALLBACK_PAGE_STEP = 10;
const FOCUSABLE_DESCENDANT =
  "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

/** Per-row attribute builders, handed to the rows and the header row. */
export type DataTableGridRow = {
  /** Attributes for a navigable `<td>` (a header cell overrides `role`). */
  cellProps: (columnKey: string) => {
    [CELL_ATTR]: string;
    role: "gridcell";
  };
  /**
   * Attributes for the one element in a cell that takes focus. `when: false`
   * returns nothing, so a cell can hand the target to its widget or keep it.
   */
  focusProps: (
    columnKey: string,
    when?: boolean,
  ) => { [FOCUS_ATTR]?: ""; tabIndex?: 0 | -1 };
  /** Attributes for the `<tr>`. */
  rowProps: { [ROW_ATTR]: string };
};

/** Table-level handlers, handed to `DataTableView` in grid mode. */
export type DataTableGridHandlers = {
  onFocus: React.FocusEventHandler<HTMLTableElement>;
  onKeyDownCapture: React.KeyboardEventHandler<HTMLTableElement>;
};

/** Is `target` a grid cell that is its own focus target (no widget inside)? */
export function isGridCellFocusTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.hasAttribute(CELL_ATTR) &&
    target.hasAttribute(FOCUS_ATTR)
  );
}

/** The cell for a grid event target, when it belongs to `table` itself. */
function gridCellOf(target: EventTarget | null, table: HTMLTableElement) {
  if (!(target instanceof HTMLElement)) return null;
  const cell = target.closest<HTMLElement>(`[${CELL_ATTR}]`);
  const row = cell?.closest<HTMLElement>(`[${ROW_ATTR}]`);
  // A DataTable nested in an expanded row is inside this table's DOM too.
  if (!cell || !row || row.closest("table") !== table) return null;
  const columnKey = cell.getAttribute(CELL_ATTR);
  const rowId = row.getAttribute(ROW_ATTR);
  return columnKey === null || rowId === null
    ? null
    : { cell, key: { columnKey, rowId } };
}

function findFocusTarget(table: HTMLTableElement | null, key: GridCell) {
  // `rows` spans the header and every body section, and only this table's.
  for (const row of Array.from(table?.rows ?? [])) {
    if (row.getAttribute(ROW_ATTR) !== key.rowId) continue;
    for (const cell of Array.from(row.cells)) {
      if (cell.getAttribute(CELL_ATTR) !== key.columnKey) continue;
      return cell.hasAttribute(FOCUS_ATTR)
        ? cell
        : cell.querySelector<HTMLElement>(`[${FOCUS_ATTR}]`);
    }
  }
  return null;
}

/** Rows one PageUp/PageDown moves: a viewport of rows, less one for context. */
function pageStep(table: HTMLTableElement, cell: HTMLElement) {
  const rowHeight = cell.getBoundingClientRect().height;
  const viewport = Math.min(
    table.parentElement?.clientHeight ?? Number.POSITIVE_INFINITY,
    window.innerHeight,
  );
  return rowHeight > 0 && Number.isFinite(viewport)
    ? Math.max(1, Math.floor(viewport / rowHeight) - 1)
    : FALLBACK_PAGE_STEP;
}

/**
 * Rows a jump mounts are measured on commit, and a measured row a few px
 * taller than the estimate pushes the target partly back out of the frame
 * after `focus()` scrolled it in. One nearest-edge correction once the
 * measurement re-render has landed, and only while focus is still there.
 */
function settleIntoView(target: HTMLElement) {
  let frames = 2;
  const tick = () => {
    if (document.activeElement !== target) return;
    if (--frames > 0) {
      requestAnimationFrame(tick);
      return;
    }
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
    revealBelowStickyHead(target);
  };
  requestAnimationFrame(tick);
}

/**
 * `focus()` scrolls a cell to the scrollport's top edge when moving up, and a
 * `stickyHeader` sits over exactly that edge. Step the frame back until the
 * cell clears the header. A header cell is the header, so it never needs it.
 */
function revealBelowStickyHead(target: HTMLElement) {
  const table = target.closest("table");
  const head = table?.tHead;
  const frame = table?.parentElement;
  if (!head || !frame || head.contains(target)) return;
  if (getComputedStyle(head).position !== "sticky") return;
  const overlap =
    head.getBoundingClientRect().bottom - target.getBoundingClientRect().top;
  if (overlap > 0) frame.scrollTop -= overlap;
}

/** Expansion as the grid needs it: what is open, and how to toggle a row. */
export type DataTableGridExpansion = {
  expandableRowIds: ReadonlySet<string>;
  expandedRowIds: ReadonlySet<string>;
  toggle: (rowId: string) => void;
};

type UseDataTableGridOptions<TRow extends { id: string }> = {
  columnKeys: string[];
  direction: "ltr" | "rtl";
  enabled: boolean;
  expansion?: DataTableGridExpansion;
  /** The header row's navigable cells, in visual order; empty for none. */
  headerColumnKeys: string[];
  /** The data rows on screen — empty while the table shows its skeleton. */
  rows: TRow[];
};

const NO_ROWS: ReadonlySet<string> = new Set();

/** Owns the grid's roving tab stop and its key/focus handlers. */
export function useDataTableGrid<TRow extends { id: string }>({
  columnKeys,
  direction,
  enabled,
  expansion,
  headerColumnKeys,
  rows,
}: UseDataTableGridOptions<TRow>) {
  const [activeCell, setActiveCell] = React.useState<GridCell | null>(null);
  const tableRef = React.useRef<HTMLTableElement | null>(null);
  const pendingFocusRef = React.useRef<GridCell | null>(null);
  // The column a vertical walk keeps while it passes through a detail row.
  const heldColumnRef = React.useRef<string | null>(null);

  const expandedRowIds = expansion?.expandedRowIds ?? NO_ROWS;
  const lines = React.useMemo(
    () =>
      enabled
        ? gridLines({
            columnKeys,
            expandedRowIds,
            headerColumnKeys,
            rowIds: rows.map((row) => row.id),
          })
        : [],
    [columnKeys, enabled, expandedRowIds, headerColumnKeys, rows],
  );
  const bodyStart = headerColumnKeys.length > 0 ? 1 : 0;

  const activeLine = activeCell ? lineIndexOf(lines, activeCell) : -1;
  // The one Tab stop: the remembered cell while it still exists, else the
  // first body cell (a sort, a filter or a page change can remove the
  // remembered one), else — while the skeleton shows — the first header cell.
  const fallbackLine = lines[Math.min(bodyStart, lines.length - 1)];
  const tabStop: GridCell | null =
    activeCell && activeLine >= 0
      ? activeCell
      : fallbackLine && fallbackLine.columns[0] !== undefined
        ? { columnKey: fallbackLine.columns[0], rowId: fallbackLine.rowId }
        : null;
  const tabStopRowIndex =
    tabStop && tabStop.rowId !== GRID_HEADER_ROW
      ? rows.findIndex((row) => row.id === tabStop.rowId)
      : -1;

  const focusCell = React.useCallback((key: GridCell) => {
    const target = findFocusTarget(tableRef.current, key);
    if (!target) return null;
    target.focus();
    revealBelowStickyHead(target);
    return target;
  }, []);

  // A move to a windowed-out row lands one render later: the new Tab stop is
  // the row the virtualizer keeps mounted (`tabStopRowIndex`), so it mounts in
  // that render, beside a spacer at its true offset, and `focus()` scrolls it
  // in from real layout. Deliberately not `scrollToIndex`: the virtualizer's
  // offsets exclude the header, and its follow-up scroll correction lands a
  // row one header-height short of the frame after focus has already moved.
  React.useLayoutEffect(() => {
    const pending = pendingFocusRef.current;
    const target = pending ? focusCell(pending) : null;
    if (!target) return;
    pendingFocusRef.current = null;
    settleIntoView(target);
  });

  const onFocus = React.useCallback<React.FocusEventHandler<HTMLTableElement>>(
    (event) => {
      const hit = gridCellOf(event.target, event.currentTarget);
      if (!hit) return;
      tableRef.current = event.currentTarget;
      pendingFocusRef.current = null;
      if (hit.key.columnKey !== GRID_DETAIL_COLUMN) {
        heldColumnRef.current = hit.key.columnKey;
      }
      setActiveCell((current) =>
        current?.rowId === hit.key.rowId &&
        current.columnKey === hit.key.columnKey
          ? current
          : hit.key,
      );
    },
    [],
  );

  const moveTo = (key: GridCell) => {
    if (key.columnKey !== GRID_DETAIL_COLUMN) {
      heldColumnRef.current = key.columnKey;
    }
    setActiveCell(key);
    if (!focusCell(key)) pendingFocusRef.current = key;
  };

  /**
   * The treegrid half: an inline arrow on an expand cell opens or closes its
   * row before it moves anywhere, and the inline-start arrow on a detail cell
   * steps back to its row. `true` when the key was spent here.
   */
  const handleExpansionKey = (event: React.KeyboardEvent, key: GridCell) => {
    if (!expansion) return false;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return false;
    const forward = (event.key === "ArrowRight") === (direction === "ltr");
    if (key.columnKey === GRID_DETAIL_COLUMN) {
      if (!forward) moveTo({ columnKey: GRID_EXPAND_COLUMN, rowId: key.rowId });
      return true;
    }
    if (key.columnKey !== GRID_EXPAND_COLUMN) return false;
    if (!expansion.expandableRowIds.has(key.rowId)) return false;
    const expanded = expansion.expandedRowIds.has(key.rowId);
    if (forward === expanded) return false;
    expansion.toggle(key.rowId);
    return true;
  };

  const onKeyDownCapture: React.KeyboardEventHandler<HTMLTableElement> = (
    event,
  ) => {
    if (!enabled || event.altKey || event.shiftKey) return;
    const table = event.currentTarget;
    const hit = gridCellOf(event.target, table);
    // Only the cell's own focus target navigates. Keys typed into the inline
    // editor, or into a control a caller rendered in a cell, stay theirs.
    if (!hit || !(event.target as HTMLElement).hasAttribute(FOCUS_ATTR)) {
      return;
    }
    tableRef.current = table;

    if (event.key === "Enter" && event.target === hit.cell) {
      const inner = hit.cell.querySelector<HTMLElement>(FOCUSABLE_DESCENDANT);
      if (inner) {
        event.preventDefault();
        event.stopPropagation();
        inner.focus();
      }
      return;
    }

    if (
      !event.ctrlKey &&
      !event.metaKey &&
      handleExpansionKey(event, hit.key)
    ) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const line = lineIndexOf(lines, hit.key);
    const column = lines[line]?.columns.indexOf(hit.key.columnKey) ?? -1;
    if (line < 0 || column < 0) return;
    const next = nextGridPosition(event, {
      bodyStart,
      columnOrder: columnKeys,
      from: { column, line },
      heldColumnKey:
        hit.key.columnKey === GRID_DETAIL_COLUMN
          ? (heldColumnRef.current ?? columnKeys[0] ?? hit.key.columnKey)
          : hit.key.columnKey,
      inlineStep: direction === "rtl" ? -1 : 1,
      lines,
      page: () => pageStep(table, hit.cell),
    });
    if (!next) return;

    // Handled even at an edge: an arrow that does not move the cell must not
    // fall through and scroll the frame instead.
    event.preventDefault();
    event.stopPropagation();
    const target = lines[next.line];
    const columnKey = target?.columns[next.column];
    if (!target || columnKey === undefined) return;
    moveTo({ columnKey, rowId: target.rowId });
  };

  const isTabStop = (rowId: string, columnKey: string) =>
    tabStop?.rowId === rowId && tabStop.columnKey === columnKey;

  const rowFor = (rowId: string): DataTableGridRow => ({
    cellProps: (columnKey) => ({ [CELL_ATTR]: columnKey, role: "gridcell" }),
    focusProps: (columnKey, when = true) =>
      when
        ? { [FOCUS_ATTR]: "", tabIndex: isTabStop(rowId, columnKey) ? 0 : -1 }
        : {},
    rowProps: { [ROW_ATTR]: rowId },
  });

  return {
    handlers: enabled
      ? ({ onFocus, onKeyDownCapture } satisfies DataTableGridHandlers)
      : undefined,
    /** Attribute builders for the header row, in grid mode. */
    head: enabled ? rowFor(GRID_HEADER_ROW) : undefined,
    rowFor: enabled ? rowFor : undefined,
    /** Row index the virtualizer must keep mounted so the Tab stop exists. */
    tabStopRowIndex: tabStopRowIndex >= 0 ? tabStopRowIndex : undefined,
  };
}
