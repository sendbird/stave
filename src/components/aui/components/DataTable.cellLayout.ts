import type * as React from "react";

import type { StyleXValue } from "../utils/stylex";
import type { DataTablePinnedCell } from "./DataTable.pinning";
import { styles } from "./DataTable.styles";

/**
 * Per-cell geometry shared by the header cell, the loading-skeleton cell and
 * the body cell. The three used to spell the same pinned-edge style list and
 * the same inline `width` / sticky-offset object out in full, once each, so a
 * change to pinning had three places to land and two to be forgotten in.
 */

type StyleEntry = StyleXValue;

/**
 * The pinned-edge styles for one cell, in the order every call site applied
 * them. `header` adds the header rung between the sticky base and the boundary
 * hairline, where the header cell always had it.
 */
export function pinnedCellStyles(
  pinnedCell: DataTablePinnedCell | undefined,
  direction: "ltr" | "rtl",
  header = false,
): StyleEntry[] {
  return [
    pinnedCell && styles.pinnedCell,
    header && pinnedCell && styles.pinnedHeaderCell,
    pinnedCell?.boundary &&
      pinnedCell.side === "leading" &&
      (direction === "rtl"
        ? styles.pinnedLeadingBoundaryRtl
        : styles.pinnedLeadingBoundaryLtr),
    pinnedCell?.boundary &&
      pinnedCell.side === "trailing" &&
      (direction === "rtl"
        ? styles.pinnedTrailingBoundaryRtl
        : styles.pinnedTrailingBoundaryLtr),
  ];
}

/**
 * The inline style a cell needs: its resolved column width, its floor
 * (`minWidth` in auto layout — header, body and skeleton cells all carry it,
 * so the column holds it in every state) and, when pinned, its measured
 * sticky offset on the logical edge it is pinned to. All are runtime
 * numbers, which is why they are inline rather than StyleX.
 */
export function cellInlineStyle(
  resolvedWidth: string | undefined,
  pinnedCell: DataTablePinnedCell | undefined,
  minWidth?: number,
): React.CSSProperties | undefined {
  if (!resolvedWidth && !pinnedCell && minWidth === undefined) return undefined;
  return {
    ...(resolvedWidth ? { width: resolvedWidth } : {}),
    ...(minWidth === undefined ? {} : { minInlineSize: `${minWidth}px` }),
    ...(pinnedCell?.side === "leading"
      ? { insetInlineStart: pinnedCell.offset }
      : pinnedCell
        ? { insetInlineEnd: pinnedCell.offset }
        : {}),
  };
}
