import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

export const notificationsStyles = stylex.create({
  triggerWrap: { display: "inline-flex" },
  trigger: {
    color: { default: vars["--aui-color-text-muted"], ":hover": vars["--aui-color-text"] },
    flexShrink: 0,
    position: "relative",
  },
  triggerIcon: { height: 16, width: 16 },
  panel: {
    backgroundColor: vars["--aui-color-surface"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-frame"],
    overflow: "hidden",
    padding: 0,
    // Logical, and clamped against the viewport so the popup never renders
    // wider than the window it is anchored in.
    inlineSize: "min(28rem, calc(100vw - 1rem))",
    maxInlineSize: "calc(100vw - 1rem)",
  },
  header: {
    borderBlockEndColor: vars["--aui-color-border"],
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: vars["--aui-border-width-hairline"],
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-16"],
  },
  headerRow: {
    alignItems: "flex-start",
    display: "flex",
    gap: vars["--aui-space-12"],
    justifyContent: "space-between",
  },
  /*
   * The title/subtitle/view-switch column. `minInlineSize: 0` is the load-
   * bearing part: as a default flex item it kept `min-width: auto`, so the
   * column refused to shrink below the min-content width of the longest
   * subtitle plus the two-tab switch and pushed `headerActions`
   * (`flexShrink: 0`) past the panel's right edge, where `overflow: hidden`
   * clipped the buttons.
   */
  headerTitleColumn: {
    flexGrow: 1,
    flexShrink: 1,
    minInlineSize: 0,
  },
  headerTitle: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  headerSubtitle: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    marginTop: vars["--aui-space-4"],
  },
  // The view switch spans the header under the title; its segments share the
  // width and their labels give before the counts do.
  viewSwitch: { marginTop: vars["--aui-space-12"] },
  headerActions: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    flexWrap: "nowrap",
    gap: vars["--aui-space-4"],
  },
  destructiveAction: {
    color: { default: vars["--aui-color-text-muted"], ":hover": vars["--aui-color-danger-text"] },
  },
  quietAction: {
    color: { default: vars["--aui-color-text-muted"], ":hover": vars["--aui-color-text"] },
  },
  scroller: { maxHeight: "min(70vh, 40rem)", overflowY: "auto" },
  emptyState: {
    paddingBlock: vars["--aui-space-32"],
    paddingInline: vars["--aui-space-16"],
    textAlign: "center",
  },
  emptyTitle: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  emptyBody: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    marginTop: vars["--aui-space-4"],
  },
  emptyAction: { marginTop: vars["--aui-space-16"] },
  /** The entries, drawn by the shared inbox row. */
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  loadMore: {
    alignItems: "center",
    borderBlockStartColor: vars["--aui-color-border"],
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    justifyContent: "center",
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-16"],
  },
  smallIcon: { height: 14, width: 14 },
  tinyIcon: { height: 12, width: 12 },
});
