import { DataTableRoot } from "./DataTable.root";
import type { DataTableProps } from "./DataTable.types";

export type {
  DataTableEmptyState,
  DataTableEmptyStateSlot,
} from "./DataTable.empty";
export {
  type DataTableCsvColumn,
  type DataTableToCsvOptions,
  dataTableToCsv,
} from "./DataTable.csv";
export type { DataTableColumnSize } from "./DataTable.sizing";
export type {
  DataTableColumn,
  DataTableColumnTone,
  DataTableColumnPinning,
  DataTableCursorLoadMorePagination,
  DataTableCursorNavigationPagination,
  DataTableCursorPagination,
  DataTableExpansion,
  DataTablePagePagination,
  DataTablePagination,
  DataTableProps,
  DataTableSelection,
  DataTableSort,
  DataTableSortDirection,
  DataTableStackRole,
  DataTableVirtualization,
} from "./DataTable.types";

/**
 * Public entrypoint; state and render seams live in focused sibling modules.
 *
 * 2026-11-14 — column tools, all opt-in (a table that passes none of them
 * renders as before):
 * - `onColumnOrderChange` / `defaultColumnOrder` and per-column `reorderable`:
 *   drag a header or press Alt+ArrowLeft / Alt+ArrowRight on it.
 * - `onColumnPinningChange` / `defaultColumnPinning`: "Pin to start", "Pin to
 *   end", "Unpin" per column in the Columns menu.
 * - `exportable`, per-column `exportable` / `exportValue`, and the exported
 *   `dataTableToCsv`: a CSV export of the visible columns and the loaded
 *   rows, with a formula-injection guard.
 * - `onDensityChange`: comfortable and compact rows.
 * Left out: a selection bar (Delete / Copy / Export) — AUI has
 * `SelectionActionBar` for that. See `DataTable.reorder.tsx`, `DataTable.toolbar.tsx`,
 * `DataTable.columns.ts` and `DataTable.csv.ts`.
 */
export function DataTable<TRow extends { id: string }>(
  props: DataTableProps<TRow>,
) {
  return <DataTableRoot {...props} />;
}
