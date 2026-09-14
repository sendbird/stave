import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const notificationsStyles = stylex.create({
  triggerWrap: { display: "inline-flex" },
  trigger: {
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
    flexShrink: 0,
    position: "relative",
  },
  triggerIcon: { height: 16, width: 16 },
  panel: {
    backgroundColor: vars["--ads-color-surface"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-frame"],
    overflow: "hidden",
    padding: 0,
    // Logical, and clamped against the viewport so the popup never renders
    // wider than the window it is anchored in.
    inlineSize: "min(28rem, calc(100vw - 1rem))",
    maxInlineSize: "calc(100vw - 1rem)",
  },
  header: {
    borderBlockEndColor: vars["--ads-color-border"],
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: vars["--ads-border-width-hairline"],
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-16"],
  },
  headerRow: {
    alignItems: "flex-start",
    display: "flex",
    gap: vars["--ads-space-12"],
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
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
  },
  headerSubtitle: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    marginTop: vars["--ads-space-4"],
  },
  /*
   * A segmented switch is one row by definition — the track, its radius and
   * its inset frame all describe a single line of choices, and a wrapped
   * second row leaves the active tab's raised pill floating inside a
   * two-line box. `flexWrap: "wrap"` let exactly that happen as soon as the
   * two nowrap tabs (each widened by its own count badge) outgrew the
   * shrinking title column. The row now holds, and the tabs absorb the
   * pressure instead (see `viewTab`).
   */
  viewSwitch: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "inline-flex",
    flexWrap: "nowrap",
    marginTop: vars["--ads-space-12"],
    maxInlineSize: "100%",
    padding: vars["--ads-space-4"],
  },
  /*
   * `minInlineSize: 0` is what makes the strip's `nowrap` safe: a flex item
   * keeps `min-width: auto` by default, so a tab could not shrink below the
   * min-content width of its label plus its badge and would have overflowed
   * the track instead of wrapping. With the floor removed the label is the
   * part that gives (`viewTabLabel`), and the badge — which is a count and
   * cannot be abbreviated — keeps its size.
   */
  viewTab: {
    alignItems: "center",
    borderRadius: vars["--ads-radius-control"],
    color: vars["--ads-color-text-muted"],
    display: "inline-flex",
    flexShrink: 1,
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
    gap: vars["--ads-space-8"],
    minInlineSize: 0,
    paddingBlock: vars["--ads-space-4"],
    paddingInline: 10,
  },
  viewTabLabel: {
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  viewTabActive: {
    backgroundColor: vars["--ads-color-canvas"],
    boxShadow: vars["--ads-elevation-raised"],
    color: vars["--ads-color-text"],
  },
  viewTabIdle: {
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
  },
  viewTabCount: {
    borderRadius: vars["--ads-radius-full"],
    fontSize: vars["--ads-font-size-micro"],
    minHeight: 16,
    minWidth: 16,
    paddingInline: 6,
  },
  headerActions: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    flexWrap: "nowrap",
    gap: vars["--ads-space-4"],
  },
  destructiveAction: {
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-danger-text"] },
  },
  quietAction: {
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
  },
  scroller: { maxHeight: "min(70vh, 40rem)", overflowY: "auto" },
  emptyState: {
    paddingBlock: vars["--ads-space-32"],
    paddingInline: vars["--ads-space-16"],
    textAlign: "center",
  },
  emptyTitle: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  emptyBody: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    marginTop: vars["--ads-space-4"],
  },
  emptyAction: { marginTop: vars["--ads-space-16"] },
  row: {
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
      ":focus-within": vars["--ads-color-overlay-hover"],
    },
    borderBlockEndColor: vars["--ads-color-border"],
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: {
      default: vars["--ads-border-width-hairline"],
      ":last-child": 0,
    },
  },
  rowUnread: {
    backgroundColor: {
      default: vars["--ads-color-accent-soft"],
      ":hover": vars["--ads-color-overlay-hover"],
      ":focus-within": vars["--ads-color-overlay-hover"],
    },
  },
  rowBody: { paddingBlock: vars["--ads-space-12"], paddingInline: vars["--ads-space-16"] },
  rowLead: { alignItems: "flex-start", display: "flex", position: "relative" },
  unreadDot: {
    borderRadius: vars["--ads-radius-full"],
    flexShrink: 0,
    height: 6,
    position: "absolute",
    insetInlineStart: -10,
    top: vars["--ads-space-8"],
    width: 6,
  },
  unreadDotOn: { backgroundColor: vars["--ads-color-accent"] },
  unreadDotOff: { backgroundColor: "transparent" },
  rowMain: { flex: 1, minWidth: 0 },
  rowMainTop: {
    alignItems: "flex-start",
    display: "flex",
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
  },
  openAction: {
    display: "block",
    borderRadius: vars["--ads-radius-control"],
    flex: 1,
    minWidth: 0,
    pointerEvents: { default: null, ":disabled": "none" },
    textAlign: "start",
  },
  openActionHead: { alignItems: "center", display: "flex", gap: 6 },
  kindIcon: { flexShrink: 0, height: 14, width: 14 },
  kindIconWarning: { color: vars["--ads-color-warning-text"] },
  kindIconDanger: { color: vars["--ads-color-danger-text"] },
  kindIconSuccess: { color: vars["--ads-color-success-text"] },
  rowTitle: {
    color: vars["--ads-color-text"],
    flex: 1,
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowTime: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--ads-font-size-micro"],
  },
  rowDetail: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    marginTop: vars["--ads-space-4"],
    overflow: "hidden",
    paddingInlineStart: vars["--ads-space-20"],
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowMeta: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars["--ads-font-size-micro"],
    gap: vars["--ads-space-4"],
    marginTop: 6,
    paddingInlineStart: vars["--ads-space-20"],
  },
  locationChip: {
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-mark"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    paddingBlock: vars["--ads-space-2"],
    paddingInline: 6,
  },
  archivedChip: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-warning-soft"],
    borderColor: vars["--ads-color-warning-border"],
    borderRadius: vars["--ads-radius-mark"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-warning-text"],
    display: "inline-flex",
    fontSize: vars["--ads-font-size-micro"],
    gap: vars["--ads-space-4"],
    paddingBlock: vars["--ads-space-2"],
    paddingInline: 6,
  },
  chipIcon: { height: 12, width: 12 },
  markReadAction: {
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
    flexShrink: 0,
    marginTop: vars["--ads-space-4"],
  },
  actionRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
    justifyContent: "flex-end",
    marginTop: vars["--ads-space-12"],
  },
  archivedPrompt: {
    backgroundColor: vars["--ads-color-warning-soft"],
    borderColor: vars["--ads-color-warning-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    marginTop: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-12"],
  },
  promptTitle: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  promptBody: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    marginTop: vars["--ads-space-4"],
  },
  promptEmphasis: { color: vars["--ads-color-text"], fontWeight: vars["--ads-font-weight-medium"] },
  loadMore: {
    alignItems: "center",
    borderBlockStartColor: vars["--ads-color-border"],
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    justifyContent: "center",
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-16"],
  },
  smallIcon: { height: 14, width: 14 },
  tinyIcon: { height: 12, width: 12 },
});
