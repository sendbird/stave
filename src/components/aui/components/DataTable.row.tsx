import { ChevronRight } from "lucide-react";
import * as React from "react";

import { i18n, useTranslation } from "@/i18n";

import { disclosureChevron } from "../recipes/disclosure-chevron";
import { focusRing } from "../recipes/focus-ring";
import { revealMotion } from "../recipes/reveal-motion";
import { transition } from "../recipes/transition";
import { themeProps } from "../theming/theme-props";
import { cx, sx } from "../utils/stylex";
import { DataTableDataCell } from "./DataTable.cell";
import {
  type DataTableGridRow,
  GRID_ACTIONS_COLUMN,
  GRID_DETAIL_COLUMN,
  GRID_EXPAND_COLUMN,
  GRID_SELECT_COLUMN,
  isGridCellFocusTarget,
} from "./DataTable.gridKeyboard";
import type { DataTableEditingCell } from "./DataTable.helpers";
import { revealStyles } from "./DataTable.loadMoreReveal";
import type { DataTablePinnedCell } from "./DataTable.pinning";
import { type DataTableStack, stackRoleOf } from "./DataTable.responsive";
import { stackedStyles } from "./DataTable.stacked.styles";
import { cellDensityStyles, styles } from "./DataTable.styles";
import type {
  DataTableColumn,
  DataTableExpansion,
  DataTableSelection,
} from "./DataTable.types";
import { Checkbox } from "./Checkbox";
import { useChangeCount } from "./agent-motion";

const ROW_CONTROL_SELECTOR =
  "button, a, input, select, textarea, label, [role='button'], [role='menu'], [role='menuitem'], [role='dialog'], [data-aui-row-actions='true']";

// A row click must not fire for anything the user aimed at a control instead of
// the row. `closest` covers controls rendered inline in a cell, but menu and
// dialog content opens in a portal: it leaves the `<tr>` in the DOM while React
// still bubbles its events up through the owning cell. Checking the React path
// as well as the DOM ancestry keeps both cases out of `onRowClick`.
const isRowControlEvent = (event: React.SyntheticEvent) => {
  const target = event.target as HTMLElement | null;

  if (target?.closest(ROW_CONTROL_SELECTOR)) {
    return true;
  }

  // Portaled content is not a DOM descendant of the row, so a target that sits
  // outside the row element can only have reached this handler through React's
  // portal bubbling — that is, from a control this row rendered.
  return Boolean(target) && !event.currentTarget.contains(target);
};

// The actions cell owns its own interactions. Stopping propagation here keeps
// the row's click and keyboard handlers out of the way even when the action
// content is portaled out of the row element.
const stopRowControlEvent = (event: React.SyntheticEvent) => {
  event.stopPropagation();
};

export type DataTableRowProps<TRow extends { id: string }> = {
  /** `aria-rowindex` of this row while the table is windowed. */
  ariaRowIndex?: number;
  beginEditing: (rowId: string, columnId: string, draft?: string) => void;
  cancelEditing: (rowId: string, columnId: string) => void;
  columnCount: number;
  commitEditing: (
    rowId: string,
    columnId: string,
    previousValue: string,
    nextValue: string,
    restoreFocus: boolean,
  ) => void;
  density: "compact" | "regular";
  direction: "ltr" | "rtl";
  editingCell: DataTableEditingCell | null;
  editingEnabled: boolean;
  editTriggerRefs: React.RefObject<Record<string, HTMLButtonElement | null>>;
  expandedRowIds: string[];
  expansion?: DataTableExpansion<TRow>;
  fixedLayout: boolean;
  /** Present only for an editable table, which renders as `role="grid"`. */
  grid?: DataTableGridRow;
  hasFixedColumnLayout: boolean;
  measureElement?: React.Ref<HTMLTableRowElement>;
  observeExpandedRow?: React.Ref<HTMLTableRowElement>;
  onRowClick?: (row: TRow) => void;
  pinnedCellFor: (columnId: string) => DataTablePinnedCell | undefined;
  resolvedCurrentRowId?: string;
  resolveColumnMinWidth: (column: DataTableColumn<TRow>) => number | undefined;
  resolveColumnWidth: (column: DataTableColumn<TRow>) => string | undefined;
  /** Load more just appended this row (`DataTable.loadMoreReveal`). */
  revealed?: boolean;
  row: TRow;
  rowActions?: (row: TRow) => React.ReactNode;
  rowIndex: number;
  /** `isRowUnavailable` said yes: the whole row steps back as one. */
  rowUnavailable?: boolean;
  rows: TRow[];
  selectedRowIds: string[];
  selection?: DataTableSelection<TRow>;
  /** The stacked presentation, or `undefined` in a table. */
  stack?: DataTableStack;
  toggleExpanded: (rowId: string) => void;
  virtualIndex?: number;
  visibleColumns: Array<DataTableColumn<TRow>>;
};

/** One logical row, including its optional expansion sibling. */
export function DataTableRow<TRow extends { id: string }>({
  ariaRowIndex,
  beginEditing,
  cancelEditing,
  columnCount,
  commitEditing,
  density,
  direction,
  editingCell,
  editingEnabled,
  editTriggerRefs,
  expandedRowIds,
  expansion,
  fixedLayout,
  grid,
  hasFixedColumnLayout,
  measureElement,
  observeExpandedRow,
  onRowClick,
  pinnedCellFor,
  resolvedCurrentRowId,
  resolveColumnMinWidth,
  resolveColumnWidth,
  revealed = false,
  row,
  rowActions,
  rowIndex,
  rowUnavailable = false,
  rows,
  selectedRowIds,
  selection,
  stack,
  toggleExpanded,
  virtualIndex,
  visibleColumns,
}: DataTableRowProps<TRow>) {
  useTranslation();
  const selected = selectedRowIds.includes(row.id);
  // S7: the title column keeps primary ink; the same rule as the stacked
  // presentation's title (explicit `stackRole: "title"`, else the first).
  const titleColumnId = (
    visibleColumns.find((column) => column.stackRole === "title") ??
    visibleColumns[0]
  )?.id;
  const current =
    resolvedCurrentRowId !== undefined && resolvedCurrentRowId === row.id;
  const canExpand =
    Boolean(expansion) && (expansion?.isRowExpandable?.(row) ?? true);
  const expanded = canExpand && expandedRowIds.includes(row.id);
  // The detail cell drops in when THIS row is expanded by the reader — not
  // when a row mounts already expanded (first paint, or windowed back in).
  const revealDetail = useChangeCount(expanded) > 0;
  const virtualized = virtualIndex !== undefined;
  const lastRow = rows.length > 0 && rows[rows.length - 1]!.id === row.id;
  const rowNumber = rowIndex + 1;
  const rowContext =
    selection?.getRowLabel?.(row) ??
    expansion?.getRowLabel?.(row) ??
    `row ${rowNumber}`;
  const rowTheme = themeProps("data-table-row");
  const selectable = selection?.isRowSelectable?.(row) ?? true;
  // In a grid the row is not a Tab stop (its cells are); a clickable row is
  // activated from any cell that is its own focus target instead.
  const rowFocusable = Boolean(onRowClick) && !grid;
  // Stacked, the table roles are stated outright (see the view).
  const cellProps = (key: string) =>
    grid?.cellProps(key) ?? (stack ? { role: "cell" } : {});
  // A grid's cells are `gridcell`s, and ARIA requires them to sit in a
  // `row`: a native `<tr>` under `role="grid"` is not one.
  const rowRole = stack || grid ? "row" : undefined;
  const focusProps = (key: string, when?: boolean) =>
    grid?.focusProps(key, when) ?? {};

  return (
    <React.Fragment>
      <tr
        {...rowTheme}
        aria-current={current ? "true" : undefined}
        aria-rowindex={ariaRowIndex}
        className={cx(
          sx(
            styles.row,
            (!lastRow || expanded) && styles.rowDivider,
            transition.colors,
            onRowClick && styles.rowClickable,
            rowFocusable && focusRing.ring,
            rowFocusable && focusRing.ringInset,
            selected && styles.rowSelected,
            current && styles.rowCurrent,
            stack && stackedStyles.row,
            stack &&
              (density === "compact"
                ? stackedStyles.rowCompact
                : stackedStyles.rowRegular),
            rowUnavailable && styles.rowUnavailable,
            revealed && revealStyles.row,
          ),
          rowTheme.className,
        )}
        data-active={current ? "true" : undefined}
        data-current={current ? "true" : undefined}
        data-revealed={revealed ? "true" : undefined}
        data-row-id={row.id}
        data-unavailable={rowUnavailable ? "true" : undefined}
        data-windowed-index={virtualized ? virtualIndex : undefined}
        data-selected={selected ? "true" : undefined}
        onClick={
          onRowClick
            ? (event) => {
                if (!isRowControlEvent(event)) {
                  onRowClick(row);
                }
              }
            : undefined
        }
        onKeyDown={
          onRowClick
            ? (event) => {
                if (event.key !== "Enter" && event.key !== " ") {
                  return;
                }

                const fromRow = event.target === event.currentTarget;
                const fromCell =
                  Boolean(grid) && isGridCellFocusTarget(event.target);
                if ((!fromRow && !fromCell) || isRowControlEvent(event)) {
                  return;
                }

                event.preventDefault();
                onRowClick(row);
              }
            : undefined
        }
        ref={virtualized ? measureElement : undefined}
        role={rowRole}
        tabIndex={rowFocusable ? 0 : undefined}
        {...grid?.rowProps}
      >
        {expansion ? (
          <td
            {...cellProps(GRID_EXPAND_COLUMN)}
            {...focusProps(GRID_EXPAND_COLUMN, !canExpand)}
            className={sx(
              styles.expandCell,
              cellDensityStyles[density],
              grid && !canExpand && focusRing.ring,
              grid && !canExpand && focusRing.ringInset,
              stack && stackedStyles.cell,
              stack && stackedStyles.expandCell,
            )}
          >
            {canExpand ? (
              <button
                {...focusProps(GRID_EXPAND_COLUMN)}
                aria-expanded={expanded}
                aria-label={
                  expansion.getRowLabel?.(row) ??
                  (expanded
                    ? i18n.t("ui:dataTable.collapseRow", { row: rowNumber })
                    : i18n.t("ui:dataTable.expandRow", { row: rowNumber }))
                }
                className={sx(
                  styles.expandButton,
                  transition.colors,
                  focusRing.ring,
                )}
                onClick={() => toggleExpanded(row.id)}
                type="button"
              >
                <ChevronRight
                  aria-hidden
                  className={sx(
                    disclosureChevron.base,
                    expanded && disclosureChevron.openQuarter,
                  )}
                  size={16}
                />
              </button>
            ) : null}
          </td>
        ) : null}
        {selection ? (
          <td
            {...cellProps(GRID_SELECT_COLUMN)}
            {...focusProps(GRID_SELECT_COLUMN, !selectable)}
            className={sx(
              styles.selectionCell,
              cellDensityStyles[density],
              grid && !selectable && focusRing.ring,
              grid && !selectable && focusRing.ringInset,
              stack && stackedStyles.cell,
              stack && stackedStyles.selectCell,
            )}
          >
            <Checkbox
              {...focusProps(GRID_SELECT_COLUMN, selectable)}
              aria-label={
                selection.getRowLabel?.(row) ??
                i18n.t("ui:dataTable.selectRow", { row: rowNumber })
              }
              checked={selected}
              className="aui-data-table__selection-checkbox"
              disabled={!selectable}
              onCheckedChange={(nextChecked) => {
                const nextSelectedRowIds = nextChecked
                  ? Array.from(new Set([...selectedRowIds, row.id]))
                  : selectedRowIds.filter((id) => id !== row.id);

                selection.onSelectedRowIdsChange?.(nextSelectedRowIds);
              }}
            />
          </td>
        ) : null}
        {visibleColumns.map((column) => (
          <DataTableDataCell
            // The open row's secondary cells step up to body ink: muted ink
            // falls under 4.5:1 on the strong selection rung (§1.7).
            muted={
              !current &&
              (column.tone === undefined
                ? column.id !== titleColumnId
                : column.tone === "muted")
            }
            beginEditing={beginEditing}
            cancelEditing={cancelEditing}
            column={column}
            commitEditing={commitEditing}
            density={density}
            direction={direction}
            editingCell={editingCell}
            editingEnabled={editingEnabled}
            editTriggerRefs={editTriggerRefs}
            fixedLayout={fixedLayout}
            grid={grid}
            key={column.id}
            pinnedCell={pinnedCellFor(column.id)}
            resolvedMinWidth={resolveColumnMinWidth(column)}
            resolvedWidth={resolveColumnWidth(column)}
            row={row}
            rowContext={rowContext}
            stackRole={stackRoleOf(stack, column.id)}
          />
        ))}
        {rowActions ? (
          <td
            {...cellProps(GRID_ACTIONS_COLUMN)}
            {...focusProps(GRID_ACTIONS_COLUMN)}
            className={sx(
              styles.actionsCell,
              cellDensityStyles[density],
              grid && focusRing.ring,
              grid && focusRing.ringInset,
              stack && stackedStyles.cell,
              stack && stackedStyles.actionsCell,
            )}
            data-aui-row-actions="true"
            onClick={stopRowControlEvent}
            onKeyDown={stopRowControlEvent}
          >
            {rowActions(row)}
          </td>
        ) : null}
        {hasFixedColumnLayout ? (
          <td aria-hidden className={sx(styles.spacerCell)} />
        ) : null}
      </tr>
      {expanded ? (
        // The detail row is one full-width cell of the grid walk, between
        // its row and the next (`DataTable.gridNavigation.ts`).
        <tr
          {...grid?.rowProps}
          aria-rowindex={
            ariaRowIndex === undefined ? undefined : ariaRowIndex + 1
          }
          className={sx(
            styles.expandedRow,
            !lastRow && styles.rowDivider,
            stack && stackedStyles.block,
            // The detail belongs to its row and steps back with it.
            rowUnavailable && styles.rowUnavailable,
          )}
          data-vrow-expanded={virtualized ? "true" : undefined}
          // The detail row carries its row's index too, so focus inside it
          // keeps the pair mounted when the window scrolls away.
          data-windowed-index={virtualized ? virtualIndex : undefined}
          ref={virtualized ? observeExpandedRow : undefined}
          role={rowRole}
        >
          <td
            {...cellProps(GRID_DETAIL_COLUMN)}
            {...focusProps(GRID_DETAIL_COLUMN)}
            className={sx(
              styles.expandedCell,
              grid && focusRing.ring,
              grid && focusRing.ringInset,
              stack && stackedStyles.block,
              revealDetail && revealMotion.enter,
            )}
            colSpan={columnCount}
          >
            {expansion?.renderExpanded(row)}
          </td>
        </tr>
      ) : null}
    </React.Fragment>
  );
}
