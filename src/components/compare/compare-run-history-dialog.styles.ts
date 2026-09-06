import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

/**
 * The row button publishes its hover colour into a custom property so the
 * leading status mark can shift to `colorText` on hover. StyleX conditions
 * only see the element they are declared on, so a parent-driven reveal travels
 * through a variable rather than a `group-hover` descendant selector.
 */
const ROW_MARK_COLOR = "--compareHistoryRowMarkColor";

export const compareRunHistoryDialogStyles = stylex.create({
  content: {
    display: "flex",
    flexDirection: "column",
    gap: 0,
    height: "min(82vh, 44rem)",
    maxHeight: "82vh",
    maxWidth: "48rem",
    overflow: "hidden",
    padding: 0,
  },
  header: {
    borderBottomColor: vars.colorBorder,
    borderBottomStyle: "solid",
    borderBottomWidth: vars.borderWidthHairline,
    paddingBlock: vars.space20,
    paddingInline: vars.space24,
    paddingRight: vars.space64,
  },
  headerRow: {
    alignItems: "flex-start",
    display: "flex",
    gap: vars.space12,
  },
  headerMark: {
    alignItems: "center",
    backgroundColor: vars.colorAccentSoft,
    borderRadius: vars.radiusControl,
    color: vars.colorAccent,
    display: "flex",
    flexShrink: 0,
    height: 36,
    justifyContent: "center",
    marginTop: 2,
    width: 36,
  },
  headerText: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: vars.fontSizeLead,
    fontWeight: vars.fontWeightSemibold,
    letterSpacing: "-0.015em",
  },

  filters: {
    borderBottomColor: vars.colorBorder,
    borderBottomStyle: "solid",
    borderBottomWidth: vars.borderWidthHairline,
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
    paddingBlock: vars.space16,
    paddingInline: vars.space24,
  },
  searchWrap: {
    position: "relative",
  },
  searchIcon: {
    color: vars.colorTextMuted,
    height: 16,
    insetInlineStart: vars.space12,
    pointerEvents: "none",
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    width: 16,
  },
  searchInput: {
    height: 36,
    paddingInlineStart: vars.space32,
  },
  filterGroup: {
    display: "flex",
    gap: vars.space4,
    overflowX: "auto",
    paddingBottom: 2,
  },
  filterButton: {
    flexShrink: 0,
    gap: 6,
    height: 28,
    paddingInline: 10,
    fontSize: vars.fontSizeCaption,
  },
  filterButtonActive: {
    color: vars.colorText,
  },
  filterCount: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
    fontVariantNumeric: "tabular-nums",
  },

  list: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    paddingBlock: vars.space8,
    paddingInline: vars.space8,
  },
  listItem: {
    borderBottomColor: vars.colorBorderSubtle,
    borderBottomStyle: "solid",
    borderBottomWidth: vars.borderWidthHairline,
  },
  listItemLast: {
    borderBottomWidth: 0,
  },
  rowButton: {
    alignItems: "flex-start",
    borderRadius: vars.radiusControl,
    display: "flex",
    gap: vars.space12,
    paddingBlock: vars.space12,
    paddingInline: vars.space16,
    textAlign: "left",
    width: "100%",
    [ROW_MARK_COLOR]: {
      default: vars.colorTextMuted,
      ":hover": vars.colorText,
    },
  },
  rowMark: {
    alignItems: "center",
    backgroundColor: vars.colorSelectionFill,
    borderRadius: vars.radiusMark,
    color: ROW_MARK_COLOR,
    display: "flex",
    flexShrink: 0,
    height: 28,
    justifyContent: "center",
    marginTop: 2,
    width: 28,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTitleRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
    minWidth: 0,
  },
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
  rowPrompt: {
    color: vars.colorTextMuted,
    display: "-webkit-box",
    fontSize: vars.fontSizeCaption,
    lineHeight: "1.25rem",
    marginTop: vars.space4,
    overflow: "hidden",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
  },
  rowMeta: {
    alignItems: "center",
    color: vars.colorTextMuted,
    columnGap: vars.space12,
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars.fontSizeMicro,
    marginTop: vars.space8,
    rowGap: vars.space4,
  },

  empty: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    height: "100%",
    justifyContent: "center",
    minHeight: "14rem",
    paddingInline: vars.space24,
    textAlign: "center",
  },
  emptyMark: {
    alignItems: "center",
    backgroundColor: vars.colorSelectionFill,
    borderRadius: vars.radiusFull,
    color: vars.colorTextMuted,
    display: "flex",
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  emptyTitle: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    marginTop: vars.space12,
  },
  emptyText: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    lineHeight: "1.25rem",
    marginTop: vars.space4,
    maxWidth: "24rem",
  },
  clearButton: {
    marginTop: vars.space16,
  },

  footer: {
    alignItems: "center",
    borderTopColor: vars.colorBorder,
    borderTopStyle: "solid",
    borderTopWidth: vars.borderWidthHairline,
    color: vars.colorTextMuted,
    display: "flex",
    fontSize: vars.fontSizeCaption,
    justifyContent: "space-between",
    paddingBlock: vars.space12,
    paddingInline: vars.space24,
  },

  // Icons
  markIcon: { height: 18, width: 18 },
  statusIcon: { height: 14, width: 14 },
  statusIconDanger: { color: vars.colorDanger, height: 14, width: 14 },
  statusIconMuted: { color: vars.colorTextMuted, height: 14, width: 14 },
  statusIconSuccess: { color: vars.colorSuccessText, height: 14, width: 14 },
  statusIconAccent: { color: vars.colorAccent, height: 14, width: 14 },
});
