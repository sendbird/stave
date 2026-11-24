/**
 * Sort and column-width state for `DataTable.root.tsx`. Moved out of the root
 * (2026-11-14) when it reached the source size cap; behaviour is unchanged.
 */
import * as React from "react";

import { nextMultiSort, sortRows } from "./DataTable.helpers";
import type {
  DataTableColumn,
  DataTableProps,
  DataTableSort,
} from "./DataTable.types";

type SortOptions<TRow extends { id: string }> = Pick<
  DataTableProps<TRow>,
  "columns" | "defaultSort" | "onSortChange" | "onSortStateChange" | "sort"
> & { multiSort: boolean; rows: TRow[] };

/** Controlled or uncontrolled sort, and the rows it leaves in order. */
export function useDataTableSort<TRow extends { id: string }>({
  columns,
  defaultSort,
  multiSort,
  onSortChange,
  onSortStateChange,
  rows: rowsProp,
  sort,
}: SortOptions<TRow>) {
  const isSortControlled = sort !== undefined;
  const [uncontrolledSort, setUncontrolledSort] = React.useState<
    DataTableSort[]
  >(() =>
    defaultSort
      ? Array.isArray(defaultSort)
        ? defaultSort
        : [defaultSort]
      : [],
  );
  const sortState = React.useMemo(() => {
    if (isSortControlled) {
      return Array.isArray(sort) ? sort : sort ? [sort] : [];
    }
    return uncontrolledSort;
  }, [isSortControlled, sort, uncontrolledSort]);
  const handleSortActivate = React.useCallback(
    (columnId: string, additive: boolean) => {
      const next = nextMultiSort(sortState, columnId, multiSort && additive);

      if (!isSortControlled) {
        setUncontrolledSort(next);
      }
      onSortStateChange?.(next);
      if (next[0]) {
        onSortChange?.(next[0]);
      }
    },
    [isSortControlled, multiSort, onSortChange, onSortStateChange, sortState],
  );

  const rows = React.useMemo(
    () =>
      isSortControlled || sortState.length === 0
        ? rowsProp
        : sortRows(rowsProp, sortState, columns),
    [columns, isSortControlled, rowsProp, sortState],
  );
  return { handleSortActivate, rows, sortState };
}

type WidthOptions<TRow> = {
  columnWidths?: Record<string, number>;
  onColumnWidthsChange?: (columnWidths: Record<string, number>) => void;
  visibleColumns: Array<DataTableColumn<TRow>>;
};

/** Controlled or uncontrolled pixel widths, and the header refs they are measured from. */
export function useDataTableColumnWidths<TRow>({
  columnWidths: controlledColumnWidths,
  onColumnWidthsChange,
  visibleColumns,
}: WidthOptions<TRow>) {
  const [uncontrolledColumnWidths, setUncontrolledColumnWidths] =
    React.useState<Record<string, number>>({});
  const columnWidths = controlledColumnWidths ?? uncontrolledColumnWidths;
  const columnWidthsRef = React.useRef(columnWidths);
  columnWidthsRef.current = columnWidths;
  const commitColumnWidths = React.useCallback(
    (next: Record<string, number>) => {
      columnWidthsRef.current = next;
      if (controlledColumnWidths === undefined) {
        setUncontrolledColumnWidths(next);
      }
      onColumnWidthsChange?.(next);
    },
    [controlledColumnWidths, onColumnWidthsChange],
  );
  const setColumnWidth = React.useCallback(
    (columnId: string, width: number) => {
      commitColumnWidths({ ...columnWidthsRef.current, [columnId]: width });
    },
    [commitColumnWidths],
  );
  const headerCellRefs = React.useRef<
    Record<string, HTMLTableCellElement | null>
  >({});
  const freezeVisibleColumnWidths = React.useCallback(() => {
    const snapshot = { ...columnWidthsRef.current };
    for (const column of visibleColumns) {
      const measured =
        headerCellRefs.current[column.id]?.getBoundingClientRect().width;
      if (measured) snapshot[column.id] = Math.round(measured);
    }
    commitColumnWidths(snapshot);
  }, [commitColumnWidths, visibleColumns]);
  return {
    columnWidths,
    freezeVisibleColumnWidths,
    headerCellRefs,
    setColumnWidth,
  };
}
