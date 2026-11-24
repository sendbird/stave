import * as stylex from "@stylexjs/stylex";

import { densityPad } from "../tokens/density.stylex";
import { vars } from "../tokens/tokens.stylex";

/**
 * The stacked presentation (`stackBelow`): the same `<table>`, rows and cells,
 * laid out as a list. Keeping the table's own elements — rather than
 * rendering a second, list-shaped tree — is what lets selection, row
 * actions, row activation, expansion and the grid keyboard work unchanged:
 * every handler and every `data-aui-grid-*` attribute is still on the element
 * it was on. The view restores table semantics with explicit ARIA roles,
 * because a `display` change can drop a table from the accessibility tree.
 *
 * Each row is a grid. The table-owned cells take the first line — expand
 * toggle and checkbox leading, row actions trailing — around the title
 * column; every other column is a `label  value` line beneath the title,
 * spanning to the trailing edge. Named lines place the cells, so a table
 * without expansion, selection or actions collapses those tracks to nothing.
 * Tracks carry no gap for the same reason: an empty track with a gap would
 * still cost the gap. The leading and trailing cells pay their own gutter.
 *
 * Resets use longhands on purpose. The table cells set `paddingInline` /
 * `paddingBlock` (and the selection cell its two inline edges separately);
 * StyleX ranks longhands above shorthands, so a longhand reset wins however
 * the two rules happen to be ordered in the emitted sheet.
 */
export const stackedStyles = stylex.create({
  table: {
    display: "block",
    inlineSize: "100%",
    minInlineSize: 0,
  },
  section: {
    display: "block",
  },
  row: {
    alignItems: "center",
    columnGap: 0,
    display: "grid",
    gridTemplateColumns:
      "[expand] auto [select] auto [main] minmax(0, 1fr) [trail] auto",
    paddingInlineEnd: vars["--aui-space-12"],
    paddingInlineStart: vars["--aui-space-12"],
    rowGap: vars["--aui-space-4"],
  },
  rowCompact: {
    paddingBlockEnd: densityPad.sm,
    paddingBlockStart: densityPad.sm,
  },
  rowRegular: {
    paddingBlockEnd: densityPad.md,
    paddingBlockStart: densityPad.md,
  },
  /** Undo table-cell geometry: padding, declared column widths, alignment. */
  cell: {
    display: "block",
    inlineSize: "auto",
    minInlineSize: 0,
    paddingBlockEnd: 0,
    paddingBlockStart: 0,
    paddingInlineEnd: 0,
    paddingInlineStart: 0,
    textAlign: "start",
    whiteSpace: "normal",
  },
  expandCell: {
    gridColumnStart: "expand",
    gridRowStart: "1",
    paddingInlineEnd: vars["--aui-space-8"],
  },
  selectCell: {
    display: "flex",
    gridColumnStart: "select",
    gridRowStart: "1",
    paddingInlineEnd: vars["--aui-space-8"],
  },
  titleCell: {
    gridColumnStart: "main",
    gridRowStart: "1",
  },
  /**
   * A `label  value` line. The two tracks are fractions of the same span on
   * every line, so values start on one edge down the row — the alignment a
   * table column gave them — without measuring any label.
   */
  metaCell: {
    alignItems: "center",
    columnGap: vars["--aui-space-12"],
    display: "grid",
    gridColumnEnd: "-1",
    gridColumnStart: "main",
    gridTemplateColumns: "minmax(0, 2fr) minmax(0, 3fr)",
  },
  metaLabel: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  metaValue: {
    minInlineSize: 0,
    overflowWrap: "anywhere",
  },
  actionsCell: {
    gridColumnStart: "trail",
    gridRowStart: "1",
    paddingInlineStart: vars["--aui-space-8"],
    textAlign: "end",
  },
  /** The detail row of an expanded row: one full-width block. */
  block: {
    display: "block",
  },
  /**
   * The header collapses to a strip: the select-all checkbox, the title
   * column's header, and the sort control of any other sortable column. The
   * rest of the header cells stay in the accessibility tree (they still name
   * the columns) but not on screen.
   */
  headRow: {
    alignItems: "center",
    borderBlockEndColor: vars["--aui-color-border"],
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: vars["--aui-border-width-hairline"],
    columnGap: vars["--aui-space-12"],
    display: "flex",
    flexWrap: "wrap",
    paddingInlineEnd: vars["--aui-space-12"],
    paddingInlineStart: vars["--aui-space-12"],
    rowGap: vars["--aui-space-4"],
  },
  headCell: {
    borderBlockEndWidth: 0,
    inlineSize: "auto",
    paddingInlineEnd: 0,
    paddingInlineStart: 0,
  },
  /**
   * In a table a sort button pulls itself out by `space4` on each side so its
   * hover wash overhangs the label inside the cell's `space12` padding. In the
   * strip a negative margin does not count toward the flex item's width, and
   * the button's `maxInlineSize: 100%` then capped it 8px short of its own
   * label ("Acco…"). The strip has its own gap, so the button sits flush.
   */
  sortButton: {
    marginInlineEnd: 0,
    marginInlineStart: 0,
  },
  /**
   * Keeps the select-all box over the row boxes when rows lead with a toggle:
   * the row's toggle and its gutter, less the strip's own gap.
   */
  headExpandSpacer: {
    borderBlockEndWidth: 0,
    flexShrink: 0,
    inlineSize: `calc(${vars["--aui-control-height-sm"]} + ${vars["--aui-space-8"]} - ${vars["--aui-space-12"]})`,
    paddingInlineEnd: 0,
    paddingInlineStart: 0,
  },
  headSelectCell: {
    // The checkbox sits where the row checkboxes sit, then one gutter.
    marginInlineEnd: `calc(${vars["--aui-space-8"]} - ${vars["--aui-space-12"]})`,
    paddingInlineEnd: 0,
    paddingInlineStart: 0,
  },
  /**
   * An editable meta value is an edit trigger with `space8` of inline padding
   * (its hover wash); pull it back so its text starts on the same edge as the
   * plain values on the lines around it.
   */
  metaValueEditable: {
    marginInlineStart: `calc(-1 * ${vars["--aui-space-8"]})`,
  },
});
