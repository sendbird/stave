import * as stylex from "@stylexjs/stylex";
import { ArrowUp, ChevronsUpDown } from "lucide-react";
import type * as React from "react";

import { focusRing } from "../recipes/focus-ring";
import { transition } from "../recipes/transition";
import { sx, type StyleXValue } from "../utils/stylex";
import { headerStyles } from "./DataTable.header.styles";
import { ColumnResizeSeparator } from "./DataTable.parts";
import type {
  DataTableColumn,
  DataTableSortDirection,
} from "./DataTable.types";

/**
 * DataTable header chrome: the band, the column cells, and the sort control.
 *
 * Split out of `DataTable.styles.ts` when the sort control grew real hover,
 * focus and transition behaviour — the header is the part of this table that
 * carries interaction, so it reads better as its own unit than as a third of a
 * 575-line style sheet.
 */

/** Grid focus-target attributes (`DataTable.gridKeyboard.ts`), when a grid. */
type HeaderFocusProps = {
  /** Marks the sort button of a reorderable column as a drag grip. */
  "data-aui-column-grip"?: "";
  "data-aui-grid-focus"?: "";
  tabIndex?: 0 | -1;
};

export type DataTableSortButtonProps = {
  /** The column's cell alignment; decides which side the indicator sits on. */
  align?: "center" | "end" | "start";
  direction: "ascending" | "descending" | null | undefined;
  focusProps?: HeaderFocusProps;
  header: React.ReactNode;
  onActivate: (append: boolean) => void;
  /** Multi-sort rank, or `null` when a single sort is active. */
  order: number | null;
  wrap?: boolean;
  /** Placement override from the header row (the stacked strip). */
  xstyle?: StyleXValue;
};

/**
 * Sortable column header. Plain click replaces the sort, shift-click appends —
 * the same activation as before; what is new is that the control now answers
 * the pointer at all.
 *
 * The indicator follows the column's alignment. A sortable column always
 * renders a glyph — the arrow when sorted, `ChevronsUpDown` when not — and the
 * glyph used to sit after the label unconditionally. In a start-aligned column
 * that is correct: the label keeps the cells' leading edge and the glyph
 * trails. In an `end`-aligned column it pushed the label 18px (14px glyph +
 * `space4`) off the edge its own numbers line up on, so "Responses" and its
 * counts never shared a right edge. Reversing the row for end alignment puts
 * the glyph on the leading side and gives the label the same end edge as the
 * data underneath it.
 */
export function DataTableSortButton({
  align,
  direction,
  focusProps,
  header,
  onActivate,
  order,
  wrap,
  xstyle,
}: DataTableSortButtonProps) {
  return (
    <button
      {...focusProps}
      className={sx(
        headerStyles.sortButton,
        transition.colors,
        focusRing.ring,
        align === "end" && headerStyles.sortButtonEndAligned,
        wrap && headerStyles.sortButtonWrap,
        xstyle,
      )}
      onClick={(event) => onActivate(event.shiftKey)}
      type="button"
    >
      <span
        className={sx(
          headerStyles.sortButtonLabel,
          wrap && headerStyles.sortButtonLabelWrap,
        )}
      >
        {header}
      </span>
      {direction ? (
        // One glyph for both directions, rotated. Two separate Lucide paths
        // swapped instantly; the rotation is the gesture the user just made.
        <ArrowUp
          aria-hidden
          className={sx(
            headerStyles.sortIndicator,
            transition.transform,
            direction === "descending" && sortTurnStyles.descending,
          )}
          size={14}
        />
      ) : (
        <ChevronsUpDown
          aria-hidden
          className={sx(headerStyles.sortIndicator)}
          data-aui-sort-indicator="idle"
          size={14}
        />
      )}
      {order != null ? (
        <span aria-hidden className={sx(headerStyles.sortOrderBadge)}>
          {order}
        </span>
      ) : null}
    </button>
  );
}

export type DataTableHeaderContentProps<TRow> = {
  column: DataTableColumn<TRow>;
  direction: DataTableSortDirection | null | undefined;
  /** Grid focus-target attributes for the sort button. */
  focusProps?: HeaderFocusProps;
  onResize: (columnId: string, width: number) => void;
  onResizeStart: () => void;
  onSortActivate: (columnId: string, append: boolean) => void;
  /** Multi-sort rank to display, or `null` to hide it. */
  order: number | null;
  /** Render the resize separator (the column's `resizable`, unless stacked). */
  resizable: boolean;
  sortButtonStyle?: StyleXValue;
  /** Committed pixel width, when the column has one. */
  width: number | undefined;
};

/**
 * Everything inside one `<th>`: the label (as a sort control when the column is
 * sortable), and the resize separator when it is resizable.
 *
 * It lives here rather than inline in `DataTable.tsx` because the header cell's
 * two variable parts — how the label is aligned, and which side the sort glyph
 * sits on — are both decided from `column.align`, and that decision belongs
 * beside the styles it selects. `DataTable.tsx` keeps the `<th>` itself, which
 * is where width, sticky state, and the ref for measurement live.
 */
export function DataTableHeaderContent<TRow>({
  column,
  direction,
  focusProps,
  onResize,
  onResizeStart,
  onSortActivate,
  order,
  resizable,
  sortButtonStyle,
  width,
}: DataTableHeaderContentProps<TRow>) {
  const label = column.sortable ? (
    <DataTableSortButton
      align={column.align}
      direction={direction}
      focusProps={focusProps}
      header={column.header}
      onActivate={(append) => onSortActivate(column.id, append)}
      order={order}
      wrap={column.wrap}
      xstyle={sortButtonStyle}
    />
  ) : (
    column.header
  );

  return (
    <div
      className={sx(
        headerStyles.headerInner,
        column.align === "end" && headerStyles.headerInnerEnd,
        column.align === "center" && headerStyles.headerInnerCenter,
      )}
    >
      {column.headerHint ? (
        // The hint sits OUTSIDE the sort button — see `headerHint` on
        // `DataTableColumn`. `headerInner` is a `space-between` row, so the
        // two have to travel as one item or the hint would be thrown to the
        // far edge of the cell.
        <span className={sx(headerStyles.headerLabelGroup)}>
          {label}
          {column.headerHint}
        </span>
      ) : (
        label
      )}
      {resizable ? (
        <ColumnResizeSeparator
          columnHeader={column.header}
          columnId={column.id}
          minWidth={column.minWidth}
          onResize={onResize}
          onResizeStart={onResizeStart}
          width={width}
        />
      ) : null}
    </div>
  );
}

/*
 * Kept in this file, apart from the rest of the header's rules in
 * `DataTable.header.styles.ts`: the interaction-states guard allows a
 * hand-written rotation here by path.
 */
const sortTurnStyles = stylex.create({
  /**
   * Descending is the ascending arrow rotated, not a different glyph, so
   * flipping the direction animates through `transition.transform` instead of
   * hard-swapping two Lucide paths.
   */
  descending: {
    transform: "rotate(180deg)",
  },
});

export { headerDensityStyles, headerStyles } from "./DataTable.header.styles";
