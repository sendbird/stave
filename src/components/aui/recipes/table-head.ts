import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/**
 * A column header (2026-11-16): 12 / 500 / 16 in muted ink, and the sorted
 * column one step heavier in body ink.
 *
 * Measured on 2026-11-15, the same header was two styles: `DataTable` set
 * 12/500 and kept 600 for the sorted column, while `Table` set 600 on every
 * header, so a static table's labels looked like a column someone had
 * sorted. `KeyValueEditor`, `PermissionMatrix` and `CohortChart` each wrote
 * their own 12/500. The value kept is `DataTable`'s reasoning: at 12px in
 * muted ink, 600 is heavier than the 14px / 400 data it labels, and the extra
 * weight is what tells a reader which column the rows are ordered by.
 *
 * Type and ink only: each table keeps its own padding, rule, alignment and
 * wrapping. Compose: `sx(tableHead.cell, styles.headCell)`, adding
 * `tableHead.sorted` on the column `aria-sort` names.
 */
export const tableHead = stylex.create({
  cell: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-caption"],
  },
  sorted: {
    color: vars["--aui-color-text"],
    fontWeight: vars["--aui-font-weight-semibold"],
  },
});
