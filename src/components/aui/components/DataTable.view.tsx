import { themeProps, themeSlotProps } from "../theming/theme-props";
import { cx, sx } from "../utils/stylex";
import { DataTableErrorState } from "./DataTable.error";
import { DataTableFooter } from "./DataTable.footer";
import { panelStyles } from "./DataTable.panel.styles";
import { DataTableHeadRow } from "./DataTable.headRow";
import { resolveMaxBlockSize } from "./DataTable.helpers";
import { DataTableLoadingRows } from "./DataTable.loadingRows";
import {
  DataTableScrollEdgeShadows,
  frameHostStyles,
} from "./DataTable.scrollEdges";
import { stackedStyles } from "./DataTable.stacked.styles";
import { styles } from "./DataTable.styles";
import { DataTableToolbar, type DataTableTools } from "./DataTable.toolbar";
import type { DataTableViewProps } from "./DataTable.view.types";
import { EmptyState } from "./EmptyState";
import { VisuallyHidden } from "./VisuallyHidden";

export type { DataTableViewProps } from "./DataTable.view.types";

/** Pinning pauses while stacked, so its menu section does too. */
const stackedTools = (tools: DataTableTools | undefined) =>
  tools && { ...tools, pin: undefined };

/** Render-only table frame. State ownership stays in `DataTable.root.tsx`. */
export function DataTableView<TRow extends { id: string }>({
  allVisibleRowsSelected,
  ariaRowCount,
  bodyError,
  bodyRef,
  columnCount,
  columnVisibility,
  columnVisibilityLabel,
  columnWidths,
  configurableColumns,
  density,
  direction,
  emptyContent,
  emptyStateProps,
  expansion,
  fillHeight,
  filter,
  fixedLayout,
  fixedMinInlineSize,
  responsiveLayout,
  frame,
  grid,
  gridHead,
  handleSortActivate,
  hasFixedColumnLayout,
  hasSelection,
  headerCellRefs,
  headerColumnKeys,
  loading,
  loadingSamples,
  multiSort,
  onColumnVisibilityChange,
  pagination,
  pinnedCellFor,
  pinnedExtents,
  renderRow,
  reorder,
  resolveColumnMinWidth,
  resolveColumnWidth,
  rowActions,
  rows,
  scrollEdges,
  scrollRef,
  selectedRowIds,
  selection,
  setColumnWidth,
  showColumnVisibility,
  showEmpty,
  skeletonRowCount,
  someVisibleRowsSelected,
  sortState,
  stack,
  stickyHeader,
  toggleColumnWidths,
  tools,
  virtualization,
  virtualizationEnabled,
  visibleColumns,
  windowEntries,
  windowSpacerProps,
  selectableRowIds,
}: DataTableViewProps<TRow>) {
  /*
   * An empty table keeps its frame and its header row, filter or no filter:
   * the reader still sees what the table lists and which columns a filter or a
   * sort ran against. It used to be replaced by a bare card (no filter, no
   * pagination) or by a message in an empty frame — headers gone either way.
   * The message takes the body, one cell across every column.
   */
  const frameTheme = themeProps("data-table", { density });
  // A `display` change can take a table out of the accessibility tree, so
  // the stacked presentation states the table roles outright.
  const sectionRole = stack ? "rowgroup" : undefined;

  return (
    <div
      className={sx(
        styles.root,
        frame && panelStyles.root,
        fillHeight && styles.rootFill,
      )}
    >
      <DataTableToolbar
        columnVisibility={columnVisibility}
        columnVisibilityLabel={columnVisibilityLabel}
        configurableColumns={configurableColumns}
        density={density}
        filter={filter}
        frame={frame}
        onColumnVisibilityChange={onColumnVisibilityChange}
        showColumnVisibility={showColumnVisibility}
        tools={stack ? stackedTools(tools) : tools}
        visibleColumns={visibleColumns}
      />
      {reorder?.enabled ? (
        // Where a keyboard or pointer move is reported to assistive tech.
        <VisuallyHidden aria-live="polite" role="status">
          {reorder.announcement}
        </VisuallyHidden>
      ) : null}
      <div
        className={sx(frameHostStyles.host, fillHeight && frameHostStyles.fill)}
      >
        <div
          {...frameTheme}
          className={cx(
            sx(
              styles.frame,
              frame ? panelStyles.frame : styles.frameless,
              fillHeight && styles.frameFill,
            ),
            selection ? "aui-data-table--selectable" : undefined,
            hasSelection ? "aui-data-table--selection-active" : undefined,
            stack ? "aui-data-table--stacked" : undefined,
            frameTheme.className,
          )}
          ref={scrollRef}
          style={
            virtualizationEnabled &&
            !(fillHeight && virtualization?.maxBlockSize === undefined)
              ? {
                  maxBlockSize: resolveMaxBlockSize(
                    virtualization?.maxBlockSize,
                  ),
                }
              : undefined
          }
        >
          {
            <table
              aria-rowcount={ariaRowCount}
              className={sx(
                styles.table,
                fixedLayout
                  ? styles.tableFixed
                  : responsiveLayout && styles.tableResponsive,
                stack && stackedStyles.table,
              )}
              onFocus={grid?.onFocus}
              onKeyDownCapture={grid?.onKeyDownCapture}
              role={grid ? "grid" : stack ? "table" : undefined}
              style={
                fixedMinInlineSize === undefined
                  ? undefined
                  : { minInlineSize: `${fixedMinInlineSize}px` }
              }
            >
              {hasFixedColumnLayout ? (
                <colgroup>
                  {expansion ? <col /> : null}
                  {selection ? <col /> : null}
                  {visibleColumns.map((column) => (
                    <col
                      key={column.id}
                      style={{ width: `${columnWidths[column.id]}px` }}
                    />
                  ))}
                  {rowActions ? <col /> : null}
                  <col />
                </colgroup>
              ) : null}
              <DataTableHeadRow
                allVisibleRowsSelected={allVisibleRowsSelected}
                columnWidths={columnWidths}
                density={density}
                direction={direction}
                expansion={expansion}
                grid={gridHead}
                handleSortActivate={handleSortActivate}
                hasFixedColumnLayout={hasFixedColumnLayout}
                headerCellRefs={headerCellRefs}
                headerColumnKeys={headerColumnKeys}
                multiSort={multiSort}
                rowIndex={ariaRowCount === undefined ? undefined : 1}
                pinnedCellFor={pinnedCellFor}
                reorder={stack ? undefined : reorder}
                resolveColumnMinWidth={resolveColumnMinWidth}
                resolveColumnWidth={resolveColumnWidth}
                rowActions={rowActions}
                selectableRowIds={selectableRowIds}
                selectedRowIds={selectedRowIds}
                selection={selection}
                setColumnWidth={setColumnWidth}
                someVisibleRowsSelected={someVisibleRowsSelected}
                sortState={sortState}
                stack={stack}
                stickyHeader={stickyHeader}
                toggleColumnWidths={toggleColumnWidths}
                visibleColumns={visibleColumns}
              />
              <tbody
                className={stack ? sx(stackedStyles.section) : undefined}
                ref={bodyRef}
                role={sectionRole}
              >
                {showEmpty ? (
                  <tr role={stack ? "row" : undefined}>
                    <td
                      className={sx(styles.emptyCell)}
                      colSpan={columnCount}
                      role={stack ? "cell" : undefined}
                    >
                      <div
                        {...themeSlotProps("data-table", "empty")}
                        className={sx(styles.emptySlot)}
                      >
                        {bodyError ? (
                          <DataTableErrorState {...bodyError} />
                        ) : (
                          (emptyContent ?? (
                            <EmptyState
                              {...emptyStateProps}
                              variant={emptyStateProps.variant ?? "plain"}
                            />
                          ))
                        )}
                      </div>
                    </td>
                  </tr>
                ) : loading ? (
                  <DataTableLoadingRows
                    bodyRef={bodyRef}
                    density={density}
                    direction={direction}
                    expansion={expansion}
                    fixedLayout={fixedLayout}
                    hasFixedColumnLayout={hasFixedColumnLayout}
                    loadingSamples={loadingSamples}
                    pinnedCellFor={pinnedCellFor}
                    resolveColumnMinWidth={resolveColumnMinWidth}
                    resolveColumnWidth={resolveColumnWidth}
                    rowActions={rowActions}
                    selection={selection}
                    skeletonRowCount={skeletonRowCount}
                    stack={stack}
                    visibleColumns={visibleColumns}
                  />
                ) : virtualizationEnabled ? (
                  // In-flow spacer rows stand in for the skipped rows — before
                  // the window, after it, and between the window and a row kept
                  // mounted outside it (the grid's Tab stop, a focused row).
                  windowEntries.map((entry) => {
                    if (entry.type === "spacer") {
                      return entry.size > 0 ? (
                        <tr key={entry.key} {...windowSpacerProps(entry.size)}>
                          <td colSpan={columnCount} style={{ padding: 0 }} />
                        </tr>
                      ) : null;
                    }
                    const row = rows[entry.index];
                    return row
                      ? renderRow(row, entry.index, entry.index)
                      : null;
                  })
                ) : (
                  rows.map((row, index) => renderRow(row, index))
                )}
              </tbody>
            </table>
          }
        </div>
        <DataTableScrollEdgeShadows
          edges={scrollEdges}
          // The perimeter is the panel's now; the cue sits on the edgeless frame.
          frame={false}
          pinnedInset={pinnedExtents}
        />
      </div>
      {pagination ? (
        <DataTableFooter
          pagination={pagination}
          panel={frame}
          rowCount={rows.length}
        />
      ) : null}
    </div>
  );
}
