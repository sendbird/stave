import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

/** The column only grows its trailing rule once it sits beside the board. */
const BESIDE_BOARD = "@media (min-width: 40rem)";

export const attentionStyles = stylex.create({
  root: {
    backgroundColor: vars.colorSurface,
    borderRightColor: vars.colorBorder,
    borderRightStyle: "solid",
    borderRightWidth: {
      default: 0,
      [BESIDE_BOARD]: vars.borderWidthHairline,
    },
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
    width: "100%",
  },
  header: {
    alignItems: "baseline",
    borderBottomColor: vars.colorBorder,
    borderBottomStyle: "solid",
    borderBottomWidth: vars.borderWidthHairline,
    display: "flex",
    flexShrink: 0,
    gap: vars.space8,
    justifyContent: "space-between",
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
  },
  groupHeading: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightSemibold,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  count: {
    fontSize: vars.fontSizeBody,
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars.fontWeightSemibold,
  },
  countBlocking: {
    color: vars.colorWarningText,
  },
  countClear: {
    color: vars.colorTextMuted,
  },
  scroller: {
    flexBasis: 0,
    flexGrow: 1,
    minHeight: 0,
    overflowY: "auto",
  },
  list: {
    minWidth: 0,
  },
  empty: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    paddingBlock: vars.space32,
    paddingInline: vars.space16,
    textAlign: "center",
  },
  emptyIcon: {
    color: vars.colorTextSubtle,
    height: 20,
    width: 20,
  },
  emptyTitle: {
    color: vars.colorText,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
  },
  emptyHint: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
  },
  row: {
    borderBottomColor: vars.colorBorder,
    borderBottomStyle: "solid",
    borderBottomWidth: {
      default: vars.borderWidthHairline,
      ":last-child": 0,
    },
  },
  rowSelected: {
    backgroundColor: vars.colorSelectionFill,
  },
  rowTrigger: {
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorOverlayHover,
    },
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
    minWidth: 0,
    paddingBlock: vars.space8,
    paddingInline: vars.space12,
    textAlign: "left",
    width: "100%",
    zIndex: {
      default: null,
      ":focus-visible": vars.zIndexPanel,
    },
  },
  rowTop: {
    alignItems: "center",
    display: "flex",
    gap: 6,
    minWidth: 0,
  },
  /** The badge states the need; it must never stretch to the row's width. */
  needBadge: {
    flexShrink: 0,
  },
  needIcon: {
    height: 12,
    width: 12,
  },
  rowTime: {
    color: vars.colorTextMuted,
    flexShrink: 0,
    fontSize: vars.fontSizeMicro,
    marginInlineStart: "auto",
  },
  rowTitle: {
    color: vars.colorText,
    display: "block",
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowMeta: {
    alignItems: "center",
    color: vars.colorTextMuted,
    display: "flex",
    fontSize: vars.fontSizeMicro,
    gap: vars.space4,
    minWidth: 0,
  },
  rowMetaPart: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowDetail: {
    color: vars.colorTextMuted,
    display: "-webkit-box",
    fontSize: vars.fontSizeMicro,
    overflow: "hidden",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
  },
  rowActions: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space4,
    paddingBottom: 6,
    paddingInline: vars.space8,
  },
  rowAction: {
    fontSize: vars.fontSizeMicro,
    height: 24,
    paddingInline: 6,
  },
  rowControls: {
    backgroundColor: vars.colorCanvas,
    borderTopColor: vars.colorBorder,
    borderTopStyle: "solid",
    borderTopWidth: vars.borderWidthHairline,
  },
  reviewGroup: {
    borderTopColor: vars.colorBorder,
    borderTopStyle: "solid",
    borderTopWidth: vars.borderWidthHairline,
  },
  reviewToggle: {
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorOverlayHover,
    },
    display: "flex",
    gap: 6,
    minHeight: 32,
    paddingBlock: 6,
    paddingInline: vars.space12,
    textAlign: "left",
    width: "100%",
  },
  reviewIcon: {
    color: vars.colorTextMuted,
    height: 12,
    width: 12,
  },
  reviewCount: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
    fontVariantNumeric: "tabular-nums",
  },
});
