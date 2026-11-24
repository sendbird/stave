import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/**
 * The footer's own styles — the pagination row, its label/meta region and the
 * rows-per-page control. Split out of `DataTable.styles.ts` for the 500-line
 * source cap, on the seam that was already there: nothing above the footer
 * reads these, and the footer reads nothing else from the table's sheet.
 */
export const footerStyles = stylex.create({
  pagination: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-12"],
    justifyContent: "space-between",
    minInlineSize: 0,
  },
  paginationAtEnd: {
    justifyContent: "flex-end",
  },
  // Type and ink come from `Text size="xs" tone="muted" tabularNums` (F2: the
  // compact footer's 12px summary); this only lets a long summary wrap.
  paginationLabel: {
    minInlineSize: 0,
    overflowWrap: "anywhere",
  },
  // "1 / 3" between the chevrons: mono digits so the counter never reflows.
  counter: {
    color: vars["--aui-color-text-muted"],
    fontFamily: vars["--aui-font-mono"],
    paddingInline: vars["--aui-space-4"],
    whiteSpace: "nowrap",
  },
  paginationMeta: {
    alignItems: "center",
    display: "inline-flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-12"],
    minInlineSize: 0,
  },
  pageSizeControl: {
    alignItems: "center",
    display: "inline-flex",
    gap: vars["--aui-space-8"],
    whiteSpace: "nowrap",
  },
  pageSizeSelect: {
    display: "inline-block",
    inlineSize: 72,
  },
  paginationActions: {
    alignItems: "center",
    display: "inline-flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-4"],
    justifyContent: "flex-end",
    minInlineSize: 0,
  },
  paginationError: {
    alignItems: "center",
    color: vars["--aui-color-danger-text"],
    display: "inline-flex",
    flexWrap: "wrap",
    fontSize: vars["--aui-font-size-body"],
    gap: vars["--aui-space-8"],
    lineHeight: vars["--aui-line-height-body"],
    minInlineSize: 0,
    overflowWrap: "anywhere",
  },
});
