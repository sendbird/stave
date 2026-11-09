import * as stylex from "@stylexjs/stylex";

import { vars } from "../aui/tokens/tokens.stylex";

export const attentionStyles = stylex.create({
  // Fills the band above the board; the band bounds its height.
  root: {
    backgroundColor: vars["--aui-color-surface"],
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    minHeight: 0,
    width: "100%",
  },
  header: {
    alignItems: "baseline",
    borderBottomColor: vars["--aui-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexShrink: 0,
    gap: vars["--aui-space-8"],
    justifyContent: "space-between",
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  /** Section eyebrow: Caption, uppercase, medium. */
  groupHeading: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  count: {
    fontSize: vars["--aui-font-size-body"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  countBlocking: {
    color: vars["--aui-color-warning-text"],
  },
  countClear: {
    color: vars["--aui-color-text-muted"],
  },
  // Sized by its rows up to the band's bound, then it scrolls.
  scroller: {
    flexBasis: "auto",
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
    overflowY: "auto",
  },
  // One decision per line, each answerable in place, so several fit above
  // the board without scrolling.
  list: {
    display: "flex",
    flexDirection: "column",
    margin: 0,
    minWidth: 0,
    padding: 0,
  },
  // A band with nothing waiting says so in one short block.
  empty: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
    paddingBlock: vars["--aui-space-16"],
    paddingInline: vars["--aui-space-16"],
    textAlign: "center",
  },
  emptyIcon: {
    color: vars["--aui-color-text-subtle"],
    height: 20,
    width: 20,
  },
  /*
   * Body, not Lead. This is a panel-level empty state inside a 320px column
   * whose eyebrow runs Caption and whose rows run Body — a Lead title made
   * "No action required" the largest type anywhere in the Fleet surface, two steps
   * above the copy directly beneath it, and it read as a page heading that had
   * wandered into a sidebar. Body + semibold keeps it the strongest thing in
   * the column without leaving the column's scale.
   */
  emptyTitle: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-semibold"],
    lineHeight: vars["--aui-line-height-normal"],
  },
  emptyHint: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
  },
  reviewGroup: {
    borderTopColor: vars["--aui-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--aui-border-width-hairline"],
  },
  /**
   * The toggle and the bulk clear are siblings rather than nested: a button
   * inside a button is invalid, and the disclosure must stay the wide target.
   */
  reviewHeader: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-4"],
    paddingInlineEnd: 6,
  },
  reviewToggle: {
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--aui-color-overlay-hover"],
    },
    display: "flex",
    gap: 6,
    minHeight: 32,
    paddingBlock: 6,
    paddingInline: vars["--aui-space-12"],
    textAlign: "left",
    width: "100%",
  },
  reviewIcon: {
    color: vars["--aui-color-text-muted"],
    height: vars["--aui-control-icon-size-sm"],
    width: vars["--aui-control-icon-size-sm"],
  },
  reviewCount: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
  },
  /** Keeps hidden rows accountable: a snooze must never be a silent delete. */
  snoozedFooter: {
    alignItems: "center",
    borderTopColor: vars["--aui-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    gap: 6,
    minHeight: 32,
    paddingBlock: 6,
    paddingInlineEnd: 6,
    paddingInlineStart: vars["--aui-space-12"],
  },
  snoozedLabel: {
    color: vars["--aui-color-text-muted"],
    flexGrow: 1,
    fontSize: vars["--aui-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
  },
});
