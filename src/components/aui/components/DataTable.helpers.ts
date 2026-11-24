import { i18n } from "@/i18n";

import type {
  DataTableColumn,
  DataTableSort,
  DataTableSortDirection,
} from "./DataTable.types";

/**
 * Pure helpers for {@link DataTable}. Kept in a sibling module so the component
 * file stays focused on rendering while the sort/resize math stays unit-testable.
 */

/**
 * Uncontrolled client-side sort: order `rows` by each sort entry's column
 * `sortValue` in turn. Nullish values sort last in both directions; columns
 * without `sortValue` are skipped. Returns `rows` itself when nothing sorts.
 */
export function sortRows<TRow>(
  rows: TRow[],
  sortState: DataTableSort[],
  columns: Array<DataTableColumn<TRow>>,
): TRow[] {
  const keys = sortState.flatMap((entry) => {
    const sortValue = columns.find(
      (column) => column.id === entry.columnId,
    )?.sortValue;
    return sortValue ? [{ direction: entry.direction, sortValue }] : [];
  });

  if (keys.length === 0) {
    return rows;
  }

  return [...rows].sort((a, b) => {
    for (const key of keys) {
      const left = key.sortValue(a);
      const right = key.sortValue(b);

      if (left == null && right == null) continue;
      if (left == null) return 1;
      if (right == null) return -1;

      const order =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right));

      if (order !== 0) {
        return key.direction === "ascending" ? order : -order;
      }
    }
    return 0;
  });
}

/** Cycle a single column through ascending -> descending for single-sort mode. */
export function nextDirection(
  current: DataTableSortDirection | undefined,
): DataTableSortDirection {
  return current === "ascending" ? "descending" : "ascending";
}

/**
 * Compute the next multi-sort list after activating a column.
 *
 * - Plain click on a column: that column becomes the sole sort, toggling
 *   direction if it was already the (only) primary sort.
 * - Shift+click: the column is appended as a secondary sort, or its direction
 *   toggled in place if already present, preserving the order of the rest.
 *
 * Returns a brand-new array; never mutates the input.
 */
export function nextMultiSort(
  current: DataTableSort[],
  columnId: string,
  additive: boolean,
): DataTableSort[] {
  const existing = current.find((entry) => entry.columnId === columnId);

  if (!additive) {
    // Replace the whole sort with this single column. Toggle direction only
    // when it was already the lone active sort, otherwise start ascending.
    const wasSole = current.length === 1 && current[0]?.columnId === columnId;

    return [
      {
        columnId,
        direction: wasSole ? nextDirection(current[0]?.direction) : "ascending",
      },
    ];
  }

  if (existing) {
    return current.map((entry) =>
      entry.columnId === columnId
        ? { columnId, direction: nextDirection(entry.direction) }
        : entry,
    );
  }

  return [...current, { columnId, direction: "ascending" }];
}

/** Find a column's position (1-based) within the active multi-sort, or 0. */
export function sortIndex(sort: DataTableSort[], columnId: string): number {
  const index = sort.findIndex((entry) => entry.columnId === columnId);

  return index === -1 ? 0 : index + 1;
}

/** Resolve the active direction for a column within a multi-sort, if any. */
export function sortDirectionFor(
  sort: DataTableSort[],
  columnId: string,
): DataTableSortDirection | undefined {
  return sort.find((entry) => entry.columnId === columnId)?.direction;
}

/**
 * Identifies the single cell currently in inline-edit mode within a
 * {@link DataTable}. `null` means no cell is being edited.
 */
export type DataTableEditingCell = {
  columnId: string;
  /**
   * The editor's opening text when editing began by typing: the character
   * that was typed, which replaces the value the way a spreadsheet does.
   * Absent when editing began with Enter, F2, Space or a click.
   */
  draft?: string;
  rowId: string;
};

/**
 * Is this keystroke one character of text — the kind that starts editing a
 * focused cell with that character (type-to-edit)? Modifier chords, named
 * keys, and IME composition (`key` is "Process" / `isComposing`) are not.
 * Space is not either: on the edit trigger it is button activation, which
 * opens the editor on the current value, as Enter does.
 */
export function isTypeToEditKey(event: {
  altKey: boolean;
  ctrlKey: boolean;
  isComposing?: boolean;
  key: string;
  metaKey: boolean;
}): boolean {
  return (
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.isComposing &&
    event.key !== " " &&
    Array.from(event.key).length === 1
  );
}

/** Are `a` and `b` the same cell coordinate? Treats `null` on either side as no match. */
export function isSameEditingCell(
  a: DataTableEditingCell | null,
  b: DataTableEditingCell | null,
): boolean {
  return Boolean(a && b && a.rowId === b.rowId && a.columnId === b.columnId);
}

/**
 * Build the accessible label for an inline-edit input. Combines the human
 * column name with whatever per-row context the consumer provides (falling back
 * to the row id) so screen-reader users know which field they're editing.
 */
export function editInputLabel(
  columnLabel: string,
  rowContext: string | undefined,
  rowId: string,
): string {
  return rowContext === undefined
    ? i18n.t("ui:dataTable.editCellRowId", { column: columnLabel, rowId })
    : i18n.t("ui:dataTable.editCell", {
        column: columnLabel,
        row: rowContext,
      });
}

/** Default minimum width (px) a resizable column may be dragged down to. */
export const DEFAULT_MIN_COLUMN_WIDTH = 64;

/** Pixel step applied per arrow-key press on a column resize separator. */
export const RESIZE_KEYBOARD_STEP = 16;

/** Clamp a proposed column width to its minimum (and optional maximum). */
export function clampColumnWidth(
  width: number,
  minWidth: number = DEFAULT_MIN_COLUMN_WIDTH,
  maxWidth?: number,
): number {
  const lowerBounded = Math.max(width, minWidth);

  return typeof maxWidth === "number"
    ? Math.min(lowerBounded, maxWidth)
    : lowerBounded;
}

/** Fallback per-row height (px) used before a row has been measured. */
export const DEFAULT_ESTIMATE_ROW_HEIGHT = 44;

/** Default number of off-screen rows rendered on each edge while virtualizing. */
export const DEFAULT_OVERSCAN = 8;

/** Default bounded height (px) of the virtualized scroll container. */
export const DEFAULT_MAX_BLOCK_SIZE = 480;

/** Normalize a `maxBlockSize` (number -> px, string passthrough) for CSS. */
export function resolveMaxBlockSize(
  maxBlockSize: number | string | undefined,
): number | string {
  if (maxBlockSize === undefined) {
    return DEFAULT_MAX_BLOCK_SIZE;
  }

  return maxBlockSize;
}
