import * as React from "react";

import { i18n, useTranslation } from "@/i18n";

import { useDataTableEditing } from "./DataTable.editing";
import {
  GRID_SELECT_COLUMN,
  gridColumnKeys,
  useDataTableGrid,
} from "./DataTable.gridKeyboard";
import { useDataTableColumnState } from "./DataTable.columns";
import { DEFAULT_MIN_COLUMN_WIDTH } from "./DataTable.helpers";
import { orderPinnedColumns, useDataTablePinning } from "./DataTable.pinning";
import { resolveStack, useDataTableResponsive } from "./DataTable.responsive";
import { DataTableRow } from "./DataTable.row";
import { useDataTableScrollEdges } from "./DataTable.scrollEdges";
import { useLoadMoreReveal } from "./DataTable.loadMoreReveal";
import { resolveDataTableEmpty } from "./DataTable.empty";
import { resolveDataTableError } from "./DataTable.error";
import { columnSizeWidth, fixedLayoutFloor } from "./DataTable.sizing";
import { useColumnSizingWarnings } from "./DataTable.sizingWarnings";
import {
  useDataTableColumnWidths,
  useDataTableSort,
} from "./DataTable.rootState";
import type { DataTableColumn, DataTableProps } from "./DataTable.types";
import { useDataTableVirtualization } from "./DataTable.virtualization";
import { useDataTableColumnTools } from "./DataTable.tools";
import { DataTableView } from "./DataTable.view";
import { useDirection } from "./DirectionProvider";

const DEFAULT_SKELETON_ROWS = 4;
const MAX_SKELETON_ROWS = 24;

/** State and behavior assembly for the public `DataTable` entrypoint. */
export function DataTableRoot<TRow extends { id: string }>({
  columnOrder,
  columnPinning: columnPinningProp,
  columnVisibility,
  columnVisibilityLabel = i18n.t("ui:dataTable.columns"),
  columnWidths: controlledColumnWidths,
  columns,
  currentRowId,
  defaultColumnOrder,
  defaultColumnPinning,
  defaultSort,
  density = "regular",
  exportable = false,
  layout = "auto",
  emptyState,
  fillHeight = false,
  frame = true,
  expansion,
  filter,
  isRowUnavailable,
  loading = false,
  loadingSample,
  multiSort = false,
  onCellEdit,
  onColumnOrderChange,
  onColumnPinningChange,
  onColumnVisibilityChange,
  onColumnWidthsChange,
  onDensityChange,
  onRowClick,
  onSortChange,
  onSortStateChange,
  pagination,
  rowActions,
  rows: rowsProp,
  selection,
  sort,
  stackBelow,
  stickyHeader = false,
  virtualization,
  // error, errorTitle, onRetry, retryLabel: the first-load failure.
  ...recovery
}: DataTableProps<TRow>) {
  useTranslation();
  const direction = useDirection();
  const resolvedCurrentRowId = currentRowId;
  // Order and pins: controlled, or the table's own from the `default*` props.
  const { columnPinning, commitOrder, orderedColumns, setColumnPin } =
    useDataTableColumnState({
      columnOrder,
      columnPinning: columnPinningProp,
      columns,
      defaultColumnOrder,
      defaultColumnPinning,
      onColumnOrderChange,
      onColumnPinningChange,
    });
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const bodyRef = React.useRef<HTMLTableSectionElement>(null);
  // The table is the region its skeleton rows stand in for: busy while shown.
  React.useLayoutEffect(() => {
    const table = bodyRef.current?.closest("table");
    if (loading) table?.setAttribute("aria-busy", "true");
    else table?.removeAttribute("aria-busy");
  }, [loading]);
  // `hideBelow` and `stackBelow` both answer to the scroll frame's width.
  const { hasResponsiveColumns, stacked, widthHidden } = useDataTableResponsive(
    { columns, scrollRef, stackBelow },
  );
  const visibleColumns = React.useMemo(
    () =>
      orderPinnedColumns(
        orderedColumns.filter(
          (column) =>
            !column.hidden &&
            !widthHidden(column) &&
            columnVisibility?.[column.id] !== false,
        ),
        stacked ? undefined : columnPinning,
      ),
    [columnPinning, columnVisibility, orderedColumns, stacked, widthHidden],
  );
  const stack = resolveStack(stacked, visibleColumns);
  // A column the width has put away leaves the Columns menu too: a checked
  // item for a column that is not on screen would read as a broken toggle.
  const configurableColumns = orderedColumns.filter(
    (column) =>
      !column.hidden && !widthHidden(column) && column.hideable !== false,
  );
  const showColumnVisibility =
    configurableColumns.length > 0 && Boolean(onColumnVisibilityChange);

  const { handleSortActivate, rows, sortState } = useDataTableSort({
    columns,
    defaultSort,
    multiSort,
    onSortChange,
    onSortStateChange,
    rows: rowsProp,
    sort,
  });

  const selectedRowIds = selection?.selectedRowIds ?? [];
  // Select-all is defined over the rows the gate allows, not every rendered
  // row: with a locked row on the page, "all" over every row could never be
  // reached and the control would sit permanently indeterminate.
  const selectableRowIds = rows
    .filter((row) => selection?.isRowSelectable?.(row) ?? true)
    .map((row) => row.id);
  const selectedVisibleRowIds = selectableRowIds.filter((rowId) =>
    selectedRowIds.includes(rowId),
  );
  const allVisibleRowsSelected =
    selectableRowIds.length > 0 &&
    selectedVisibleRowIds.length === selectableRowIds.length;
  const someVisibleRowsSelected =
    selectedVisibleRowIds.length > 0 && !allVisibleRowsSelected;
  const hasRows = rows.length > 0;
  const showEmpty = !loading && !hasRows;
  const emptyResolved = resolveDataTableEmpty(emptyState, !!filter);
  const bodyError = resolveDataTableError({
    ...recovery,
    hasRows,
    headingLevel: emptyResolved.props.headingLevel,
    loading,
  });
  const skeletonRowCount = Math.min(
    hasRows ? rows.length : DEFAULT_SKELETON_ROWS,
    MAX_SKELETON_ROWS,
  );
  // What the skeleton rows are measured from: the rows a refetch already
  // shows (exact), else the caller's sample; none leaves text-line cells.
  const loadingSamples = !loading
    ? []
    : hasRows
      ? rows.slice(0, skeletonRowCount)
      : loadingSample
        ? [loadingSample]
        : [];

  const expandedRowIds = expansion?.expandedRowIds ?? [];
  const toggleExpanded = React.useCallback(
    (rowId: string) => {
      if (!expansion) return;
      const next = expandedRowIds.includes(rowId)
        ? expandedRowIds.filter((id) => id !== rowId)
        : [...expandedRowIds, rowId];
      expansion.onExpandedRowIdsChange?.(next);
    },
    [expansion, expandedRowIds],
  );

  const {
    columnWidths,
    freezeVisibleColumnWidths,
    headerCellRefs,
    setColumnWidth,
  } = useDataTableColumnWidths({
    columnWidths: controlledColumnWidths,
    onColumnWidthsChange,
    visibleColumns,
  });
  // Widths are a table's concern; a stacked list lays its rows out itself.
  const hasFixedColumnLayout =
    !stacked &&
    visibleColumns.length > 0 &&
    visibleColumns.every((column) => columnWidths[column.id] !== undefined);
  const fixedLayout = !stacked && (layout === "fixed" || hasFixedColumnLayout);
  const resolveColumnWidth = React.useCallback(
    (column: DataTableColumn<TRow>) =>
      stacked
        ? undefined
        : columnWidths[column.id] !== undefined
          ? `${columnWidths[column.id]}px`
          : (columnSizeWidth(column.size) ?? column.width),
    [columnWidths, stacked],
  );
  useColumnSizingWarnings(columns, layout);
  // An auto-layout column's floor rides on its cells (fixed layout floors
  // through `fixedLayoutFloor` instead; a stacked list has no columns).
  const resolveColumnMinWidth = React.useCallback(
    (column: DataTableColumn<TRow>) =>
      stacked || fixedLayout ? undefined : column.minWidth,
    [fixedLayout, stacked],
  );
  const fixedMinInlineSize = React.useMemo(
    () =>
      fixedLayout
        ? fixedLayoutFloor(
            visibleColumns,
            (index) => resolveColumnWidth(visibleColumns[index]!),
            {
              actions: Boolean(rowActions),
              expansion: Boolean(expansion),
              selection: Boolean(selection),
            },
            DEFAULT_MIN_COLUMN_WIDTH,
          )
        : undefined,
    [
      expansion,
      fixedLayout,
      resolveColumnWidth,
      rowActions,
      selection,
      visibleColumns,
    ],
  );

  const editingEnabled = Boolean(onCellEdit) && !loading;
  const editing = useDataTableEditing({ enabled: editingEnabled, onCellEdit });
  const columnCount =
    visibleColumns.length +
    (selection ? 1 : 0) +
    (expansion ? 1 : 0) +
    (rowActions ? 1 : 0) +
    (hasFixedColumnLayout ? 1 : 0);
  const columnKeys = React.useMemo(
    () =>
      gridColumnKeys({
        columnIds: visibleColumns.map((column) => column.id),
        expansion: Boolean(expansion),
        rowActions: Boolean(rowActions),
        selection: Boolean(selection),
      }),
    [expansion, rowActions, selection, visibleColumns],
  );
  // Every header cell is a grid cell in a table; stacked, only the strip's
  // (select-all, the title header, sortable headers) are on screen to walk.
  const headerColumnKeys = React.useMemo(
    () =>
      stack
        ? [
            ...(selection ? [GRID_SELECT_COLUMN] : []),
            ...visibleColumns
              .filter(
                (column) => column.id === stack.titleId || column.sortable,
              )
              .map((column) => column.id),
          ]
        : columnKeys,
    [columnKeys, selection, stack, visibleColumns],
  );
  const expandedSet = React.useMemo(
    () => new Set(expandedRowIds),
    [expandedRowIds],
  );
  const expandableSet = React.useMemo(
    () =>
      new Set(
        expansion
          ? rows
              .filter((row) => expansion.isRowExpandable?.(row) ?? true)
              .map((row) => row.id)
          : [],
      ),
    [expansion, rows],
  );
  // An editable table is a grid: one Tab stop, arrow keys walk the cells.
  // Keyed on the columns actually on screen, so hiding the last editable
  // column hands the table back its native semantics.
  const grid = useDataTableGrid({
    columnKeys,
    direction,
    enabled:
      Boolean(onCellEdit) &&
      visibleColumns.some((column) => column.editable === true),
    expansion: expansion
      ? {
          expandableRowIds: expandableSet,
          expandedRowIds: expandedSet,
          toggle: toggleExpanded,
        }
      : undefined,
    headerColumnKeys,
    rows: loading ? [] : rows,
  });
  const virtual = useDataTableVirtualization({
    bodyRef,
    expandedRowIds,
    hasRows,
    keepMountedIndex: grid.tabStopRowIndex,
    loading,
    rowCount: rows.length,
    scrollRef,
    virtualization,
  });
  // A windowed table names its full size: the header row, every row and each
  // open detail row, with each rendered row at its absolute position.
  const ariaRows = React.useMemo(() => {
    if (!virtual.enabled) return undefined;
    const indexes = new Map<string, number>();
    let next = 2;
    for (const row of rows) {
      indexes.set(row.id, next);
      next += expandableSet.has(row.id) && expandedSet.has(row.id) ? 2 : 1;
    }
    return { count: next - 1, indexes };
  }, [expandableSet, expandedSet, rows, virtual.enabled]);
  const { pinnedCellFor, pinnedExtents } = useDataTablePinning({
    // Pins keep a row's actions in reach. With no rows (empty, or the first
    // load's skeleton) there is nothing to reach, so the empty table draws no
    // sticky strip beside its message; the column ORDER stays, so the headers
    // do not move when rows arrive.
    columnPinning: hasRows ? columnPinning : undefined,
    columns: visibleColumns,
    direction,
    headerCellRefs,
    scrollRef,
  });
  const scrollEdges = useDataTableScrollEdges({ direction, scrollRef });
  const { reorder, tools } = useDataTableColumnTools({
    columnPinning,
    commitOrder,
    direction,
    exportable,
    headerCellRefs,
    onDensityChange,
    orderedColumns,
    pinnable: Boolean(onColumnPinningChange) || !!defaultColumnPinning,
    reorderable: Boolean(onColumnOrderChange) || !!defaultColumnOrder,
    rows,
    setColumnPin,
    visibleColumns,
  });
  const loadMoreReveal = useLoadMoreReveal({ pagination, rows, scrollRef });

  const renderRow = (row: TRow, rowIndex: number, virtualIndex?: number) => (
    <DataTableRow
      {...editing}
      ariaRowIndex={ariaRows?.indexes.get(row.id)}
      revealed={loadMoreReveal.revealedRowIds.has(row.id)}
      rowUnavailable={isRowUnavailable?.(row) ?? false}
      columnCount={columnCount}
      density={density}
      direction={direction}
      editingEnabled={editingEnabled}
      expandedRowIds={expandedRowIds}
      expansion={expansion}
      fixedLayout={fixedLayout}
      grid={grid.rowFor?.(row.id)}
      hasFixedColumnLayout={hasFixedColumnLayout}
      key={row.id}
      measureElement={virtual.measureElement}
      observeExpandedRow={virtual.observeExpandedRow}
      onRowClick={onRowClick}
      pinnedCellFor={pinnedCellFor}
      resolvedCurrentRowId={resolvedCurrentRowId}
      resolveColumnMinWidth={resolveColumnMinWidth}
      resolveColumnWidth={resolveColumnWidth}
      row={row}
      rowActions={rowActions}
      rowIndex={rowIndex}
      rows={rows}
      selectedRowIds={selectedRowIds}
      selection={selection}
      stack={stack}
      toggleExpanded={toggleExpanded}
      virtualIndex={virtualIndex}
      visibleColumns={visibleColumns}
    />
  );

  return (
    <DataTableView
      allVisibleRowsSelected={allVisibleRowsSelected}
      ariaRowCount={ariaRows?.count}
      bodyRef={bodyRef}
      columnCount={columnCount}
      columnVisibility={columnVisibility}
      columnVisibilityLabel={columnVisibilityLabel}
      columnWidths={columnWidths}
      configurableColumns={configurableColumns}
      density={density}
      direction={direction}
      emptyContent={emptyResolved.content}
      emptyStateProps={emptyResolved.props}
      bodyError={bodyError}
      expansion={expansion}
      fillHeight={fillHeight}
      filter={filter}
      fixedLayout={fixedLayout}
      fixedMinInlineSize={fixedMinInlineSize}
      responsiveLayout={hasResponsiveColumns}
      frame={frame}
      grid={grid.handlers}
      gridHead={grid.head}
      handleSortActivate={handleSortActivate}
      hasFixedColumnLayout={hasFixedColumnLayout}
      hasSelection={selectedRowIds.length > 0}
      headerCellRefs={headerCellRefs}
      headerColumnKeys={headerColumnKeys}
      loading={loading}
      loadingSamples={loadingSamples}
      multiSort={multiSort}
      onColumnVisibilityChange={onColumnVisibilityChange}
      pagination={loadMoreReveal.pagination}
      pinnedCellFor={pinnedCellFor}
      pinnedExtents={pinnedExtents}
      renderRow={renderRow}
      reorder={reorder}
      resolveColumnMinWidth={resolveColumnMinWidth}
      resolveColumnWidth={resolveColumnWidth}
      rowActions={rowActions}
      rows={rows}
      scrollEdges={scrollEdges}
      scrollRef={scrollRef}
      selectedRowIds={selectedRowIds}
      selection={selection}
      setColumnWidth={setColumnWidth}
      showColumnVisibility={showColumnVisibility}
      showEmpty={showEmpty}
      skeletonRowCount={skeletonRowCount}
      someVisibleRowsSelected={someVisibleRowsSelected}
      sortState={sortState}
      stack={stack}
      stickyHeader={stickyHeader}
      toggleColumnWidths={freezeVisibleColumnWidths}
      tools={tools}
      virtualization={virtualization}
      virtualizationEnabled={virtual.enabled}
      windowEntries={virtual.entries}
      windowSpacerProps={virtual.spacerProps}
      visibleColumns={visibleColumns}
      selectableRowIds={selectableRowIds}
    />
  );
}
