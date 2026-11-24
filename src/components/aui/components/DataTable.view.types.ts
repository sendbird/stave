/**
 * The render-only prop contract for {@link DataTableView}.
 *
 * Split out of `DataTable.view.tsx` so the render frame stays under the source
 * size policy while the (large, generic) props shape keeps room to be read.
 * State ownership stays in `DataTable.root.tsx`; nothing here has behavior.
 *
 * This lives beside `DataTable.types.ts` rather than inside it on purpose:
 * `DataTableViewProps` needs `DataTablePinnedCell`, and `DataTable.pinning.ts`
 * already imports `DataTable.types.ts` — folding the view props into the shared
 * contract would close a relative-import cycle the structure check rejects.
 */
import type * as React from "react";

import type {
  DataTableGridHandlers,
  DataTableGridRow,
} from "./DataTable.gridKeyboard";
import type { InlineScrollEdges } from "../utils/scroll-edges";
import type {
  DataTablePinnedCell,
  DataTablePinnedExtents,
} from "./DataTable.pinning";
import type { DataTableColumnReorder } from "./DataTable.reorder";
import type { DataTableStack } from "./DataTable.responsive";
import type { DataTableTools } from "./DataTable.toolbar";
import type {
  DataTableColumn,
  DataTableExpansion,
  DataTablePagination,
  DataTableSelection,
  DataTableSort,
  DataTableVirtualization,
} from "./DataTable.types";
import type { WindowedEntry, WindowedList } from "../utils/windowed-list";
import type { EmptyStateProps } from "./EmptyState";
import type { DataTableBodyError } from "./DataTable.error";

export type DataTableViewProps<TRow extends { id: string }> = {
  allVisibleRowsSelected: boolean;
  /**
   * Every row of the windowed table, header and detail rows included —
   * `aria-rowcount`. Present only while virtualized.
   */
  ariaRowCount?: number;
  /** The `<tbody>`: the windowing seam's container. */
  bodyRef: React.RefObject<HTMLTableSectionElement | null>;
  columnCount: number;
  columnVisibility?: Record<string, boolean>;
  columnVisibilityLabel: React.ReactNode;
  columnWidths: Record<string, number>;
  configurableColumns: Array<DataTableColumn<TRow>>;
  density: "compact" | "regular";
  direction: "ltr" | "rtl";
  /** A first-load failure, drawn in the empty body's well instead of it. */
  bodyError?: DataTableBodyError;
  /** A node `emptyState`, drawn in place of the default `EmptyState`. */
  emptyContent?: React.ReactNode;
  emptyStateProps: EmptyStateProps;
  expansion?: DataTableExpansion<TRow>;
  fillHeight: boolean;
  filter?: React.ReactNode;
  fixedLayout: boolean;
  /** Floor for the fixed-layout table's inline size, in px (see root). */
  fixedMinInlineSize?: number;
  /** A column declares `hideBelow` (kept for the class; no floor differs). */
  responsiveLayout: boolean;
  frame: boolean;
  /** Present only for an editable table, which renders as `role="grid"`. */
  grid?: DataTableGridHandlers;
  /** The header row's grid attributes; present exactly when `grid` is. */
  gridHead?: DataTableGridRow;
  /** Header strip cells the grid walks while stacked (see the root). */
  headerColumnKeys: string[];
  handleSortActivate: (columnId: string, additive: boolean) => void;
  hasFixedColumnLayout: boolean;
  hasSelection: boolean;
  headerCellRefs: React.RefObject<Record<string, HTMLTableCellElement | null>>;
  loading: boolean;
  /**
   * Rows the skeleton cells are measured from, cycled over the skeleton rows:
   * a refetch's own rows, else `[loadingSample]`, else none.
   */
  loadingSamples: TRow[];
  multiSort: boolean;
  onColumnVisibilityChange?: (
    columnVisibility: Record<string, boolean>,
  ) => void;
  pagination?: DataTablePagination;
  pinnedCellFor: (columnId: string) => DataTablePinnedCell | undefined;
  /** How far the pinned columns reach in from each edge; the scroll cue stands there. */
  pinnedExtents: DataTablePinnedExtents;
  renderRow: (
    row: TRow,
    rowIndex: number,
    virtualIndex?: number,
  ) => React.ReactNode;
  /** Column reordering; `undefined` unless the table asked for it. */
  reorder?: DataTableColumnReorder<TRow>;
  /** An auto-layout column's floor (`minWidth`), else undefined. */
  resolveColumnMinWidth: (column: DataTableColumn<TRow>) => number | undefined;
  resolveColumnWidth: (column: DataTableColumn<TRow>) => string | undefined;
  rowActions?: (row: TRow) => React.ReactNode;
  rows: TRow[];
  /** Which inline edges have columns scrolled past them (the scroll cue). */
  scrollEdges: InlineScrollEdges;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  selectedRowIds: string[];
  selection?: DataTableSelection<TRow>;
  setColumnWidth: (columnId: string, width: number) => void;
  showColumnVisibility: boolean;
  showEmpty: boolean;
  skeletonRowCount: number;
  someVisibleRowsSelected: boolean;
  sortState: DataTableSort[];
  /** The stacked presentation, or `undefined` while rendering as a table. */
  stack?: DataTableStack;
  stickyHeader: boolean;
  toggleColumnWidths: () => void;
  /** The opt-in toolbar controls: density switch, CSV export, column pins. */
  tools?: DataTableTools;
  virtualization?: DataTableVirtualization;
  virtualizationEnabled: boolean;
  /** Rows and spacer rows in DOM order while virtualized (the seam's window). */
  windowEntries: WindowedEntry[];
  windowSpacerProps: WindowedList["spacerProps"];
  visibleColumns: Array<DataTableColumn<TRow>>;
  /** Visible rows the reader may select; select-all adds and removes exactly these. */
  selectableRowIds: string[];
};
