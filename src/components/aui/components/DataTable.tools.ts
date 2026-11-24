import * as React from "react";

import { i18n } from "@/i18n";

import { dataTableToCsv, downloadCsv } from "./DataTable.csv";
import { useDataTableColumnReorder } from "./DataTable.reorder";
import type { DataTablePinSide } from "./DataTable.columns";
import type { DataTableTools } from "./DataTable.toolbar";
import type {
  DataTableColumn,
  DataTableColumnPinning,
  DataTableProps,
} from "./DataTable.types";

type ToolOptions<TRow extends { id: string }> = Pick<
  DataTableProps<TRow>,
  "exportable" | "onDensityChange"
> & {
  pin?: {
    pinning: DataTableColumnPinning | undefined;
    set: (columnId: string, side: DataTablePinSide) => void;
  };
  rows: TRow[];
  visibleColumns: Array<DataTableColumn<TRow>>;
};

/**
 * The toolbar's opt-in controls from the table's props; `undefined` when the
 * table asked for none, which leaves the toolbar as it was.
 */
export function resolveDataTableTools<TRow extends { id: string }>({
  exportable,
  onDensityChange,
  pin,
  rows,
  visibleColumns,
}: ToolOptions<TRow>): DataTableTools | undefined {
  if (!exportable && !onDensityChange && !pin) return undefined;
  const exportOptions = typeof exportable === "object" ? exportable : {};
  return {
    exportCsv: exportable
      ? {
          label: exportOptions.label ?? i18n.t("ui:dataTable.exportCsv"),
          // The rows on screen, in their sorted order, and the columns on
          // screen in theirs: what the reader is looking at.
          run: () =>
            downloadCsv(
              dataTableToCsv({ columns: visibleColumns, rows }),
              exportOptions.fileName,
            ),
        }
      : undefined,
    onDensityChange,
    pin,
  };
}

type ColumnToolOptions<TRow extends { id: string }> = Pick<
  ToolOptions<TRow>,
  "exportable" | "onDensityChange" | "rows" | "visibleColumns"
> & {
  columnPinning: DataTableColumnPinning | undefined;
  commitOrder: (order: string[]) => void;
  direction: "ltr" | "rtl";
  headerCellRefs: React.RefObject<Record<string, HTMLTableCellElement | null>>;
  orderedColumns: Array<DataTableColumn<TRow>>;
  /** The table asked for pin controls (`onColumnPinningChange` or a default). */
  pinnable: boolean;
  /** The table asked for reordering (`onColumnOrderChange` or a default). */
  reorderable: boolean;
  setColumnPin: (columnId: string, side: DataTablePinSide) => void;
};

/**
 * Everything the 2026-11-14 column tools add to the root: header reordering
 * and the toolbar's opt-in controls. Both are `undefined` for a table that
 * asked for neither, which renders as it always did.
 */
export function useDataTableColumnTools<TRow extends { id: string }>({
  columnPinning,
  commitOrder,
  direction,
  exportable,
  headerCellRefs,
  onDensityChange,
  orderedColumns,
  pinnable,
  reorderable,
  rows,
  setColumnPin,
  visibleColumns,
}: ColumnToolOptions<TRow>) {
  const orderedIds = React.useMemo(
    () => orderedColumns.map((column) => column.id),
    [orderedColumns],
  );
  const reorder = useDataTableColumnReorder({
    commitOrder,
    direction,
    enabled: reorderable,
    headerCellRefs,
    orderedIds,
    pinning: columnPinning,
    visibleColumns,
  });
  const tools = resolveDataTableTools({
    exportable,
    onDensityChange,
    pin: pinnable ? { pinning: columnPinning, set: setColumnPin } : undefined,
    rows,
    visibleColumns,
  });
  return { reorder: reorder.enabled ? reorder : undefined, tools };
}
