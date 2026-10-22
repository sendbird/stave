import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

export const attentionStyles = stylex.create({
  // Fills the band above the board; the band bounds its height.
  root: {
    backgroundColor: vars["--ads-color-surface"],
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    minHeight: 0,
    width: "100%",
  },
  header: {
    alignItems: "baseline",
    borderBottomColor: vars["--ads-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexShrink: 0,
    gap: vars["--ads-space-8"],
    justifyContent: "space-between",
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  /** Section eyebrow: Caption, uppercase, medium. */
  groupHeading: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  count: {
    fontSize: vars["--ads-font-size-body"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--ads-font-weight-semibold"],
  },
  countBlocking: {
    color: vars["--ads-color-warning-text"],
  },
  countClear: {
    color: vars["--ads-color-text-muted"],
  },
  // Sized by its rows up to the band's bound, then it scrolls.
  scroller: {
    flexBasis: "auto",
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
    overflowY: "auto",
  },
  // Decisions sit side by side when the band is wide enough, so several are
  // answerable without scrolling.
  list: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 24rem), 1fr))",
    minWidth: 0,
  },
  /** A cell of that grid draws its own trailing rule. */
  gridRow: {
    borderInlineEndColor: vars["--ads-color-border"],
    borderInlineEndStyle: "solid",
    borderInlineEndWidth: vars["--ads-border-width-hairline"],
  },
  // A band with nothing waiting says so in one short block.
  empty: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    paddingBlock: vars["--ads-space-16"],
    paddingInline: vars["--ads-space-16"],
    textAlign: "center",
  },
  emptyIcon: {
    color: vars["--ads-color-text-subtle"],
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
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
    lineHeight: vars["--ads-line-height-normal"],
  },
  emptyHint: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
  },
  reviewGroup: {
    borderTopColor: vars["--ads-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--ads-border-width-hairline"],
  },
  /**
   * The toggle and the bulk clear are siblings rather than nested: a button
   * inside a button is invalid, and the disclosure must stay the wide target.
   */
  reviewHeader: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-4"],
    paddingInlineEnd: 6,
  },
  reviewToggle: {
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
    },
    display: "flex",
    gap: 6,
    minHeight: 32,
    paddingBlock: 6,
    paddingInline: vars["--ads-space-12"],
    textAlign: "left",
    width: "100%",
  },
  reviewIcon: {
    color: vars["--ads-color-text-muted"],
    height: vars["--ads-control-icon-size-sm"],
    width: vars["--ads-control-icon-size-sm"],
  },
  reviewCount: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
  },
  /** Keeps hidden rows accountable: a snooze must never be a silent delete. */
  snoozedFooter: {
    alignItems: "center",
    borderTopColor: vars["--ads-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    gap: 6,
    minHeight: 32,
    paddingBlock: 6,
    paddingInlineEnd: 6,
    paddingInlineStart: vars["--ads-space-12"],
  },
  snoozedLabel: {
    color: vars["--ads-color-text-muted"],
    flexGrow: 1,
    fontSize: vars["--ads-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
  },
});
