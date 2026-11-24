import { i18n, useTranslation } from "@/i18n";

import { focusRing } from "../recipes/focus-ring";
import { tableHead } from "../recipes/table-head";
import { themeProps } from "../theming/theme-props";
import { cx, sx } from "../utils/stylex";
import { cellInlineStyle, pinnedCellStyles } from "./DataTable.cellLayout";
import {
  type DataTableGridRow,
  GRID_ACTIONS_COLUMN,
  GRID_EXPAND_COLUMN,
  GRID_SELECT_COLUMN,
} from "./DataTable.gridKeyboard";
import {
  DataTableHeaderContent,
  headerDensityStyles,
  headerStyles,
} from "./DataTable.header";
import { sortDirectionFor, sortIndex } from "./DataTable.helpers";
import { COLUMN_GRIP_ATTR, reorderHeaderStyles } from "./DataTable.reorder";
import { stackedStyles } from "./DataTable.stacked.styles";
import { styles } from "./DataTable.styles";
import type { DataTableViewProps } from "./DataTable.view.types";
import { Checkbox } from "./Checkbox";

export type DataTableHeadRowProps<TRow extends { id: string }> = Pick<
  DataTableViewProps<TRow>,
  | "allVisibleRowsSelected"
  | "columnWidths"
  | "density"
  | "direction"
  | "expansion"
  | "handleSortActivate"
  | "hasFixedColumnLayout"
  | "headerCellRefs"
  | "headerColumnKeys"
  | "multiSort"
  | "pinnedCellFor"
  | "reorder"
  | "resolveColumnMinWidth"
  | "resolveColumnWidth"
  | "rowActions"
  | "selectableRowIds"
  | "selectedRowIds"
  | "selection"
  | "setColumnWidth"
  | "someVisibleRowsSelected"
  | "sortState"
  | "stack"
  | "stickyHeader"
  | "toggleColumnWidths"
  | "visibleColumns"
> & {
  /** Grid attributes for the header row; present when the table is a grid. */
  grid?: DataTableGridRow;
  /** `aria-rowindex` of the header row, set while the table is windowed. */
  rowIndex?: number;
};

/**
 * The table's `<thead>`: the table-owned expand / select-all / actions header
 * cells around one header cell per visible column. Split out of
 * `DataTable.view.tsx`, which owns the frame and the body.
 *
 * In a grid the header row is the grid's first row: each header cell listed
 * in `headerColumnKeys` is a navigable cell, its sort button or select-all
 * checkbox the focus target, any other header cell focusing itself. Stacked,
 * the row collapses to a strip of the cells a list still needs — select-all,
 * the title column's header and the other sortable columns' sort controls —
 * and the rest stay in the accessibility tree, off screen.
 */
export function DataTableHeadRow<TRow extends { id: string }>({
  allVisibleRowsSelected,
  columnWidths,
  density,
  direction,
  expansion,
  grid,
  handleSortActivate,
  hasFixedColumnLayout,
  headerCellRefs,
  headerColumnKeys,
  multiSort,
  pinnedCellFor,
  reorder,
  resolveColumnMinWidth,
  resolveColumnWidth,
  rowActions,
  rowIndex,
  selectableRowIds,
  selectedRowIds,
  selection,
  setColumnWidth,
  someVisibleRowsSelected,
  sortState,
  stack,
  stickyHeader,
  toggleColumnWidths,
  visibleColumns,
}: DataTableHeadRowProps<TRow>) {
  useTranslation();
  const headerRole = grid || stack ? "columnheader" : undefined;
  const navigable = (key: string) =>
    grid !== undefined && headerColumnKeys.includes(key);
  const cellProps = (key: string) =>
    navigable(key) ? grid?.cellProps(key) : undefined;
  const focusProps = (key: string, when = true) =>
    navigable(key) ? grid?.focusProps(key, when) : undefined;
  /** A header cell that is its own focus target wears the inset ring. */
  const ringFor = (key: string) => [
    navigable(key) && focusRing.ring,
    navigable(key) && focusRing.ringInset,
  ];
  const offscreen = stack && styles.visuallyHidden;

  return (
    <thead
      className={sx(
        headerStyles.head,
        stickyHeader && headerStyles.stickyHead,
        stack && stackedStyles.section,
      )}
      role={stack ? "rowgroup" : undefined}
    >
      <tr
        {...grid?.rowProps}
        aria-rowindex={rowIndex}
        className={stack ? sx(stackedStyles.headRow) : undefined}
        role={stack || grid ? "row" : undefined}
      >
        {expansion ? (
          <th
            {...cellProps(GRID_EXPAND_COLUMN)}
            {...focusProps(GRID_EXPAND_COLUMN)}
            className={sx(
              headerStyles.expandHeaderCell,
              headerDensityStyles[density],
              ...ringFor(GRID_EXPAND_COLUMN),
              stack && (selection ? stackedStyles.headExpandSpacer : offscreen),
            )}
            role={headerRole}
            scope="col"
          >
            <span className={sx(styles.visuallyHidden)}>
              {i18n.t("ui:dataTable.expandColumn")}
            </span>
          </th>
        ) : null}
        {selection ? (
          <th
            {...cellProps(GRID_SELECT_COLUMN)}
            className={sx(
              headerStyles.selectionHeaderCell,
              headerDensityStyles[density],
              stack && stackedStyles.headCell,
              stack && stackedStyles.headSelectCell,
            )}
            role={headerRole}
            scope="col"
          >
            <Checkbox
              {...focusProps(GRID_SELECT_COLUMN)}
              aria-label={i18n.t("ui:dataTable.selectAllRows")}
              checked={allVisibleRowsSelected}
              className="aui-data-table__selection-checkbox"
              disabled={selectableRowIds.length === 0}
              indeterminate={someVisibleRowsSelected}
              onCheckedChange={(nextChecked) => {
                const nextSelectedRowIds = nextChecked
                  ? Array.from(
                      new Set([...selectedRowIds, ...selectableRowIds]),
                    )
                  : selectedRowIds.filter(
                      (rowId) => !selectableRowIds.includes(rowId),
                    );

                selection.onSelectedRowIdsChange?.(nextSelectedRowIds);
              }}
            />
          </th>
        ) : null}
        {visibleColumns.map((column) => {
          const sortDirection = sortDirectionFor(sortState, column.id);
          const order = sortIndex(sortState, column.id);
          const showOrder = multiSort && sortState.length > 1 && order > 0;
          const pinnedCell = pinnedCellFor(column.id);
          const headerCellTheme = themeProps("data-table-header-cell", {
            density,
          });
          const inStrip =
            !stack || column.id === stack.titleId || column.sortable === true;
          // A sortable header's button takes focus; any other header cell
          // is its own target.
          const cellIsTarget = !column.sortable;
          const reorderProps = reorder?.headerProps(column);
          // Outside a grid a plain header is not focusable; one that can be
          // moved with the keyboard has to be.
          const reorderTabStop =
            reorderProps !== undefined && cellIsTarget && !navigable(column.id);

          return (
            <th
              {...headerCellTheme}
              {...cellProps(column.id)}
              {...focusProps(column.id, cellIsTarget)}
              {...reorderProps}
              {...(reorderTabStop ? { tabIndex: 0 } : undefined)}
              aria-sort={sortDirection ?? undefined}
              className={cx(
                sx(
                  tableHead.cell,
                  headerStyles.headerCell,
                  headerDensityStyles[density],
                  sortDirection != null && tableHead.sorted,
                  column.wrap && headerStyles.headerCellWrap,
                  column.align === "end" && styles.alignEnd,
                  column.align === "center" && styles.alignCenter,
                  column.resizable && headerStyles.headerCellResizable,
                  ...reorderHeaderStyles(reorderProps),
                  ...pinnedCellStyles(pinnedCell, direction, true),
                  ...(cellIsTarget ? ringFor(column.id) : []),
                  reorderTabStop && focusRing.ring,
                  reorderTabStop && focusRing.ringInset,
                  stack && stackedStyles.headCell,
                  !inStrip && offscreen,
                ),
                headerCellTheme.className,
              )}
              data-column-id={column.id}
              key={column.id}
              ref={(element) => {
                headerCellRefs.current[column.id] = element;
              }}
              role={headerRole}
              scope="col"
              style={cellInlineStyle(
                resolveColumnWidth(column),
                pinnedCell,
                resolveColumnMinWidth(column),
              )}
            >
              <DataTableHeaderContent
                column={column}
                direction={sortDirection}
                focusProps={
                  column.sortable
                    ? reorderProps
                      ? { ...focusProps(column.id), [COLUMN_GRIP_ATTR]: "" }
                      : focusProps(column.id)
                    : undefined
                }
                onResize={setColumnWidth}
                onResizeStart={toggleColumnWidths}
                onSortActivate={handleSortActivate}
                order={showOrder ? order : null}
                resizable={column.resizable === true && !stack}
                sortButtonStyle={stack ? stackedStyles.sortButton : undefined}
                width={columnWidths[column.id]}
              />
            </th>
          );
        })}
        {rowActions ? (
          <th
            {...cellProps(GRID_ACTIONS_COLUMN)}
            {...focusProps(GRID_ACTIONS_COLUMN)}
            className={sx(
              headerStyles.actionsHeaderCell,
              headerDensityStyles[density],
              ...ringFor(GRID_ACTIONS_COLUMN),
              offscreen,
            )}
            role={headerRole}
            scope="col"
          >
            {i18n.t("ui:dataTable.actionsColumn")}
          </th>
        ) : null}
        {hasFixedColumnLayout ? (
          <th aria-hidden className={sx(headerStyles.spacerHeaderCell)} />
        ) : null}
      </tr>
    </thead>
  );
}
