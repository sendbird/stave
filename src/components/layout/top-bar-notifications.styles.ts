import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const notificationsStyles = stylex.create({
  triggerWrap: { display: "inline-flex" },
  trigger: {
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
    flexShrink: 0,
    position: "relative",
  },
  triggerIcon: { height: 16, width: 16 },
  panel: {
    backgroundColor: vars.colorSurface,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusFrame,
    overflow: "hidden",
    padding: 0,
    // Logical, and clamped against the viewport so the popup never renders
    // wider than the window it is anchored in.
    inlineSize: "min(28rem, calc(100vw - 1rem))",
    maxInlineSize: "calc(100vw - 1rem)",
  },
  header: {
    borderBlockEndColor: vars.colorBorder,
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: vars.borderWidthHairline,
    paddingBlock: vars.space12,
    paddingInline: vars.space16,
  },
  headerRow: {
    alignItems: "flex-start",
    display: "flex",
    gap: vars.space12,
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
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightSemibold,
  },
  headerSubtitle: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    marginTop: vars.space4,
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
    backgroundColor: vars.colorCanvasSubtle,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "inline-flex",
    flexWrap: "nowrap",
    marginTop: vars.space12,
    maxInlineSize: "100%",
    padding: vars.space4,
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
    borderRadius: vars.radiusControl,
    color: vars.colorTextMuted,
    display: "inline-flex",
    flexShrink: 1,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    gap: vars.space8,
    minInlineSize: 0,
    paddingBlock: vars.space4,
    paddingInline: 10,
  },
  viewTabLabel: {
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  viewTabActive: {
    backgroundColor: vars.colorCanvas,
    boxShadow: vars.elevationRaised,
    color: vars.colorText,
  },
  viewTabIdle: {
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
  },
  viewTabCount: {
    borderRadius: vars.radiusFull,
    fontSize: vars.fontSizeMicro,
    minHeight: 16,
    minWidth: 16,
    paddingInline: 6,
  },
  headerActions: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    flexWrap: "nowrap",
    gap: vars.space4,
  },
  destructiveAction: {
    color: { default: vars.colorTextMuted, ":hover": vars.colorDangerText },
  },
  quietAction: {
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
  },
  scroller: { maxHeight: "min(70vh, 40rem)", overflowY: "auto" },
  emptyState: {
    paddingBlock: vars.space32,
    paddingInline: vars.space16,
    textAlign: "center",
  },
  emptyTitle: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  emptyBody: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    marginTop: vars.space4,
  },
  emptyAction: { marginTop: vars.space16 },
  row: {
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorOverlayHover,
      ":focus-within": vars.colorOverlayHover,
    },
    borderBlockEndColor: vars.colorBorder,
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: {
      default: vars.borderWidthHairline,
      ":last-child": 0,
    },
  },
  rowUnread: {
    backgroundColor: {
      default: vars.colorAccentSoft,
      ":hover": vars.colorOverlayHover,
      ":focus-within": vars.colorOverlayHover,
    },
  },
  rowBody: { paddingBlock: vars.space12, paddingInline: vars.space16 },
  rowLead: { alignItems: "flex-start", display: "flex", position: "relative" },
  unreadDot: {
    borderRadius: vars.radiusFull,
    flexShrink: 0,
    height: 6,
    position: "absolute",
    insetInlineStart: -10,
    top: vars.space8,
    width: 6,
  },
  unreadDotOn: { backgroundColor: vars.colorAccent },
  unreadDotOff: { backgroundColor: "transparent" },
  rowMain: { flex: 1, minWidth: 0 },
  rowMainTop: {
    alignItems: "flex-start",
    display: "flex",
    gap: vars.space12,
    justifyContent: "space-between",
  },
  openAction: {
    display: "block",
    borderRadius: vars.radiusControl,
    flex: 1,
    minWidth: 0,
    pointerEvents: { default: null, ":disabled": "none" },
    textAlign: "start",
  },
  openActionHead: { alignItems: "center", display: "flex", gap: 6 },
  kindIcon: { flexShrink: 0, height: 14, width: 14 },
  kindIconWarning: { color: vars.colorWarningText },
  kindIconDanger: { color: vars.colorDangerText },
  kindIconSuccess: { color: vars.colorSuccessText },
  rowTitle: {
    color: vars.colorText,
    flex: 1,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowTime: {
    color: vars.colorTextMuted,
    flexShrink: 0,
    fontSize: vars.fontSizeMicro,
  },
  rowDetail: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    marginTop: vars.space4,
    overflow: "hidden",
    paddingInlineStart: vars.space20,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowMeta: {
    alignItems: "center",
    color: vars.colorTextMuted,
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars.fontSizeMicro,
    gap: vars.space4,
    marginTop: 6,
    paddingInlineStart: vars.space20,
  },
  locationChip: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusMark,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    paddingBlock: vars.space2,
    paddingInline: 6,
  },
  archivedChip: {
    alignItems: "center",
    backgroundColor: vars.colorWarningSoft,
    borderColor: vars.colorWarningBorder,
    borderRadius: vars.radiusMark,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorWarningText,
    display: "inline-flex",
    fontSize: vars.fontSizeMicro,
    gap: vars.space4,
    paddingBlock: vars.space2,
    paddingInline: 6,
  },
  chipIcon: { height: 12, width: 12 },
  markReadAction: {
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
    flexShrink: 0,
    marginTop: vars.space4,
  },
  actionRow: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
    justifyContent: "flex-end",
    marginTop: vars.space12,
  },
  archivedPrompt: {
    backgroundColor: vars.colorWarningSoft,
    borderColor: vars.colorWarningBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    marginTop: vars.space12,
    paddingBlock: vars.space12,
    paddingInline: vars.space12,
  },
  promptTitle: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  promptBody: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    marginTop: vars.space4,
  },
  promptEmphasis: { color: vars.colorText, fontWeight: vars.fontWeightMedium },
  loadMore: {
    alignItems: "center",
    borderBlockStartColor: vars.colorBorder,
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: vars.borderWidthHairline,
    display: "flex",
    justifyContent: "center",
    paddingBlock: vars.space12,
    paddingInline: vars.space16,
  },
  smallIcon: { height: 14, width: 14 },
  tinyIcon: { height: 12, width: 12 },
});
