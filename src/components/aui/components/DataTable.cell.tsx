import type * as React from "react";

import { focusRing } from "../recipes/focus-ring";
import { measured } from "../recipes/measured";
import { transition } from "../recipes/transition";
import { themeSlotProps } from "../theming/theme-props";
import { sx } from "../utils/stylex";
import { cellInlineStyle, pinnedCellStyles } from "./DataTable.cellLayout";
import { EditableCellInput, editTriggerKey } from "./DataTable.editing";
import type { DataTableGridRow } from "./DataTable.gridKeyboard";
import {
  type DataTableEditingCell,
  editInputLabel,
  isSameEditingCell,
  isTypeToEditKey,
} from "./DataTable.helpers";
import type { DataTablePinnedCell } from "./DataTable.pinning";
import { stackedStyles } from "./DataTable.stacked.styles";
import { cellDensityStyles, styles } from "./DataTable.styles";
import type { DataTableColumn } from "./DataTable.types";

export type DataTableDataCellProps<TRow extends { id: string }> = {
  beginEditing: (rowId: string, columnId: string, draft?: string) => void;
  cancelEditing: (rowId: string, columnId: string) => void;
  column: DataTableColumn<TRow>;
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
  fixedLayout: boolean;
  grid?: DataTableGridRow;
  pinnedCell: DataTablePinnedCell | undefined;
  /** The column's auto-layout floor (`minWidth`), else undefined. */
  resolvedMinWidth?: number;
  resolvedWidth: string | undefined;
  row: TRow;
  /** The row's accessible context, used to name the inline editor. */
  rowContext: string;
  /** The cell's line in the stacked presentation; absent in a table. */
  stackRole?: "meta" | "title";
  /** S7: a secondary column's cell, in muted ink (`DataTableColumn.tone`). */
  muted?: boolean;
};

/**
 * One caller-column `<td>`: the cell content, or — for an editable column —
 * the edit trigger that opens the inline editor in place. Split out of
 * `DataTable.row.tsx`, which keeps the table-owned cells around it.
 *
 * Type-to-edit: a character typed on a focused edit trigger opens the editor
 * with that character as its draft, replacing the value the way a
 * spreadsheet cell does; Escape still cancels back to the original. Enter,
 * Space, F2 and a click open it on the current value.
 *
 * Stacked, a meta cell leads with its column's header as a visible label.
 * The label is `aria-hidden`: the column header already names the cell for
 * assistive tech, and reading it twice would be noise.
 */
export function DataTableDataCell<TRow extends { id: string }>({
  beginEditing,
  cancelEditing,
  column,
  commitEditing,
  density,
  direction,
  editingCell,
  editingEnabled,
  editTriggerRefs,
  fixedLayout,
  grid,
  pinnedCell,
  resolvedMinWidth,
  resolvedWidth,
  row,
  muted = false,
  rowContext,
  stackRole,
}: DataTableDataCellProps<TRow>) {
  const cellEditable = editingEnabled && column.editable === true;
  const isEditing =
    cellEditable &&
    isSameEditingCell(editingCell, { columnId: column.id, rowId: row.id });
  const columnLabel =
    typeof column.header === "string" ? column.header : column.id;
  // The `<td>` is the focus target unless the cell holds the edit trigger
  // (which takes it) or the open editor (which already has it).
  const cellIsTarget = Boolean(grid) && !cellEditable;
  const focusProps = (when?: boolean) =>
    grid?.focusProps(column.id, when) ?? {};

  const content = isEditing ? (
    <EditableCellInput
      ariaLabel={editInputLabel(columnLabel, rowContext, row.id)}
      draft={editingCell?.draft}
      initialValue={column.getEditValue?.(row) ?? ""}
      onCancel={() => cancelEditing(row.id, column.id)}
      onCommit={(nextValue, restoreFocus) =>
        commitEditing(
          row.id,
          column.id,
          column.getEditValue?.(row) ?? "",
          nextValue,
          restoreFocus,
        )
      }
    />
  ) : cellEditable ? (
    <button
      {...focusProps()}
      className={sx(styles.editTrigger, transition.colors, focusRing.ring)}
      onClick={() => beginEditing(row.id, column.id)}
      onKeyDown={(event) => {
        if (event.key === "F2") {
          event.preventDefault();
          beginEditing(row.id, column.id);
        } else if (
          isTypeToEditKey({
            ...event,
            isComposing: event.nativeEvent.isComposing,
          })
        ) {
          // Prevented so the character is not also typed into the page;
          // the editor opens holding it instead.
          event.preventDefault();
          beginEditing(row.id, column.id, event.key);
        }
      }}
      ref={(element) => {
        editTriggerRefs.current[editTriggerKey(row.id, column.id)] = element;
      }}
      type="button"
    >
      {column.cell(row)}
    </button>
  ) : (
    column.cell(row)
  );

  return (
    <td
      {...themeSlotProps("data-table-row", "cell")}
      {...(grid?.cellProps(column.id) ?? (stackRole ? { role: "cell" } : {}))}
      {...focusProps(cellIsTarget)}
      aria-readonly={cellIsTarget ? true : undefined}
      className={sx(
        styles.cell,
        muted && styles.cellMuted,
        cellDensityStyles[density],
        column.wrap && styles.cellWrap,
        column.align === "end" && styles.alignEnd,
        column.align === "center" && styles.alignCenter,
        column.measured && measured.face,
        fixedLayout && styles.cellConstrained,
        cellEditable && styles.cellEditable,
        cellIsTarget && focusRing.ring,
        // Stacked cells have no padding for an inset band to sit in; the
        // row's own padding holds the outset ring.
        cellIsTarget && !stackRole && focusRing.ringInset,
        ...pinnedCellStyles(pinnedCell, direction),
        stackRole && stackedStyles.cell,
        stackRole === "title" && stackedStyles.titleCell,
        stackRole === "meta" && stackedStyles.metaCell,
      )}
      data-column-id={column.id}
      data-measured={column.measured ? "" : undefined}
      style={cellInlineStyle(resolvedWidth, pinnedCell, resolvedMinWidth)}
    >
      {stackRole === "meta" ? (
        <>
          <span aria-hidden className={sx(stackedStyles.metaLabel)}>
            {column.header}
          </span>
          <span
            className={sx(
              stackedStyles.metaValue,
              cellEditable && stackedStyles.metaValueEditable,
            )}
          >
            {content}
          </span>
        </>
      ) : (
        content
      )}
    </td>
  );
}
