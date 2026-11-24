/**
 * Column order and pin membership for `DataTable`: the pure moves and the
 * state hook that makes each of them controlled or uncontrolled.
 *
 * 2026-11-14. AUI already took `columnOrder` and `columnPinning` as
 * controlled props with nothing that could change them from the table, so
 * this adds the change callbacks (`onColumnOrderChange`, pin changes) and
 * the uncontrolled defaults.
 */
import * as React from "react";

import type {
  DataTableColumn,
  DataTableColumnPinning,
} from "./DataTable.types";

/** Where a column sits: a pinned edge, or the scrolling middle. */
export type DataTableColumnGroup = "center" | "leading" | "trailing";

/** A pin target: a logical edge, or `null` to release the column. */
export type DataTablePinSide = "leading" | "trailing" | null;

/** `columns` in `order`; ids missing from `order` follow in `columns` order. */
export function resolveColumnOrder<TColumn extends { id: string }>(
  columns: TColumn[],
  order?: string[],
): TColumn[] {
  if (!order?.length) return columns;
  const byId = new Map(columns.map((column) => [column.id, column]));
  const ordered = order
    .map((id) => byId.get(id))
    .filter((column): column is TColumn => Boolean(column));
  const orderedIds = new Set(ordered.map((column) => column.id));
  return [
    ...ordered,
    ...columns.filter((column) => !orderedIds.has(column.id)),
  ];
}

/** The pinned edge `columnId` belongs to; leading wins when listed twice. */
export function columnGroupOf(
  pinning: DataTableColumnPinning | undefined,
  columnId: string,
): DataTableColumnGroup {
  if (pinning?.leading?.includes(columnId)) return "leading";
  if (pinning?.trailing?.includes(columnId)) return "trailing";
  return "center";
}

/**
 * `order` with `columnId` placed directly before or after `targetId`. Returns
 * the same array when nothing would move, so a caller can skip the commit.
 */
export function moveColumnId(
  order: string[],
  columnId: string,
  targetId: string,
  place: "after" | "before",
): string[] {
  if (columnId === targetId || !order.includes(columnId)) return order;
  const without = order.filter((id) => id !== columnId);
  const targetIndex = without.indexOf(targetId);
  if (targetIndex < 0) return order;
  const next = [...without];
  next.splice(place === "before" ? targetIndex : targetIndex + 1, 0, columnId);
  return next.every((id, index) => id === order[index]) ? order : next;
}

/** `pinning` with `columnId` moved to `side`, or released when `side` is null. */
export function pinColumn(
  pinning: DataTableColumnPinning | undefined,
  columnId: string,
  side: DataTablePinSide,
): DataTableColumnPinning {
  const leading = (pinning?.leading ?? []).filter((id) => id !== columnId);
  const trailing = (pinning?.trailing ?? []).filter((id) => id !== columnId);
  if (side === "leading") leading.push(columnId);
  // A column pinned to the end joins the inside of that group, next to the
  // scrolling columns, so the outermost pinned column keeps its edge.
  if (side === "trailing") trailing.unshift(columnId);
  return { leading, trailing };
}

/** A column's spoken name: its `header` when that is text, else its `id`. */
export function columnLabel(column: {
  header: React.ReactNode;
  id: string;
}): string {
  return typeof column.header === "string" || typeof column.header === "number"
    ? String(column.header)
    : column.id;
}

type ColumnStateOptions<TRow> = {
  columnOrder?: string[];
  columnPinning?: DataTableColumnPinning;
  columns: Array<DataTableColumn<TRow>>;
  defaultColumnOrder?: string[];
  defaultColumnPinning?: DataTableColumnPinning;
  onColumnOrderChange?: (columnOrder: string[]) => void;
  onColumnPinningChange?: (columnPinning: DataTableColumnPinning) => void;
};

/**
 * Order and pin state. A `columnOrder` / `columnPinning` prop always wins;
 * without one the table keeps its own copy, seeded from the `default*` prop,
 * and the callbacks still fire.
 */
export function useDataTableColumnState<TRow>({
  columnOrder,
  columnPinning,
  columns,
  defaultColumnOrder,
  defaultColumnPinning,
  onColumnOrderChange,
  onColumnPinningChange,
}: ColumnStateOptions<TRow>) {
  const [ownOrder, setOwnOrder] = React.useState(defaultColumnOrder);
  const [ownPinning, setOwnPinning] = React.useState(defaultColumnPinning);
  const order = columnOrder ?? ownOrder;
  const pinning = columnPinning ?? ownPinning;
  const orderedColumns = React.useMemo(
    () => resolveColumnOrder(columns, order),
    [columns, order],
  );
  const commitOrder = React.useCallback(
    (next: string[]) => {
      if (columnOrder === undefined) setOwnOrder(next);
      onColumnOrderChange?.(next);
    },
    [columnOrder, onColumnOrderChange],
  );
  const setColumnPin = React.useCallback(
    (columnId: string, side: DataTablePinSide) => {
      const next = pinColumn(pinning, columnId, side);
      if (columnPinning === undefined) setOwnPinning(next);
      onColumnPinningChange?.(next);
    },
    [columnPinning, onColumnPinningChange, pinning],
  );
  return { columnPinning: pinning, commitOrder, orderedColumns, setColumnPin };
}
