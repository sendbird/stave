import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

export const shortcutsDrawerStyles = stylex.create({
  /**
   * Top-anchored drawer: it fills the viewport height and squares off its
   * bottom edge, so the base popup's sheet geometry is overridden only in the
   * `up` swipe direction it actually renders in.
   */
  content: {
    backgroundColor: vars.colorCanvas,
    borderColor: `color-mix(in oklch, ${vars.colorBorder} 80%, transparent)`,
    overflow: "hidden",
    marginBottom: {
      default: null,
      ':is([data-swipe-direction="up"])': 0,
    },
    height: {
      default: null,
      ':is([data-swipe-direction="up"])': "100dvh",
    },
    maxHeight: {
      default: null,
      ':is([data-swipe-direction="up"])': "100dvh",
    },
    borderBottomLeftRadius: {
      default: null,
      ':is([data-swipe-direction="up"])': 0,
    },
    borderBottomRightRadius: {
      default: null,
      ':is([data-swipe-direction="up"])': 0,
    },
    borderBottomWidth: {
      default: null,
      ':is([data-swipe-direction="up"])': 0,
    },
  },
  frame: {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    inlineSize: "100%",
    marginInline: "auto",
    maxInlineSize: "72rem",
    minBlockSize: 0,
  },

  header: {
    backgroundImage: `linear-gradient(110deg, color-mix(in oklch, ${vars.colorSurface} 90%, ${vars.colorCanvas}), ${vars.colorCanvas})`,
    borderBlockEndColor: vars.colorBorderSubtle,
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: vars.borderWidthHairline,
    flexShrink: 0,
    gap: 0,
    paddingBlock: vars.space16,
    paddingInline: {
      default: vars.space20,
      "@media (min-width: 48rem)": vars.space24,
    },
  },
  headerRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space16,
    justifyContent: "space-between",
    textAlign: "left",
  },
  headerTitleGroup: {
    alignItems: "center",
    display: "flex",
    gap: 10,
    minInlineSize: 0,
  },
  headerIcon: {
    blockSize: vars.space20,
    color: vars.colorAccent,
    flexShrink: 0,
    inlineSize: vars.space20,
  },
  headerText: { minInlineSize: 0, textAlign: "left" },
  title: {
    fontSize: vars.fontSizeLead,
    fontWeight: vars.fontWeightSemibold,
    lineHeight: vars.lineHeightTight,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  description: {
    marginBlockStart: 2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  searchGroup: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
    inlineSize: { default: "100%", "@media (min-width: 40rem)": "auto" },
    minInlineSize: { default: 0, "@media (min-width: 40rem)": "16rem" },
  },
  searchField: { flexGrow: 1, minInlineSize: 0, position: "relative" },
  searchIcon: {
    blockSize: 14,
    color: vars.colorTextMuted,
    inlineSize: 14,
    insetInlineStart: 10,
    pointerEvents: "none",
    position: "absolute",
    top: "50%",
    translate: "0 -50%",
  },
  searchInput: {
    backgroundColor: `color-mix(in oklch, ${vars.colorCanvas} 55%, transparent)`,
    blockSize: 36,
    paddingInlineEnd: vars.space32,
    paddingInlineStart: vars.space32,
  },
  clearButton: {
    insetInlineEnd: 6,
    position: "absolute",
    top: "50%",
    translate: "0 -50%",
  },
  clearIcon: { blockSize: 14, inlineSize: 14 },
  shownCount: {
    color: vars.colorTextMuted,
    flexShrink: 0,
    fontSize: 11,
    fontVariantNumeric: "tabular-nums",
    inlineSize: 64,
    textAlign: "right",
  },

  grid: {
    alignContent: "start",
    alignItems: "start",
    columnGap: vars.space32,
    display: "grid",
    flexGrow: 1,
    gridAutoRows: "max-content",
    gridTemplateColumns: {
      default: "none",
      "@media (min-width: 48rem)": "repeat(2, minmax(0, 1fr))",
      "@media (min-width: 80rem)": "repeat(3, minmax(0, 1fr))",
    },
    minBlockSize: 0,
    overflowY: "auto",
    overscrollBehavior: "contain",
    paddingBlock: vars.space24,
    paddingInline: {
      default: vars.space20,
      "@media (min-width: 48rem)": vars.space24,
    },
  },
  section: {
    alignSelf: "start",
    borderBlockStartColor: `color-mix(in oklch, ${vars.colorAccent} 25%, transparent)`,
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: 2,
  },
  sectionHeader: { paddingBlock: vars.space12, paddingInline: vars.space4 },
  sectionHeaderRow: {
    alignItems: "baseline",
    display: "flex",
    gap: vars.space12,
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: vars.colorText,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightSemibold,
    letterSpacing: "0.12em",
    margin: 0,
    textTransform: "uppercase",
  },
  sectionCount: {
    color: vars.colorTextMuted,
    fontFamily: vars.fontMono,
    fontSize: 10,
    fontVariantNumeric: "tabular-nums",
  },
  sectionDescription: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightControl,
    marginBlockEnd: 0,
    marginBlockStart: vars.space4,
  },
  sectionList: {
    borderBlockEndColor: `color-mix(in oklch, ${vars.colorBorder} 55%, transparent)`,
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: vars.borderWidthHairline,
  },
  shortcutRow: {
    backgroundColor: { default: "transparent", ":hover": vars.colorOverlayHover },
    borderBlockStartColor: `color-mix(in oklch, ${vars.colorBorder} 55%, transparent)`,
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: vars.borderWidthHairline,
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
    paddingBlock: vars.space12,
    paddingInline: vars.space4,
  },
  shortcutText: { minInlineSize: 0 },
  shortcutLabel: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    margin: 0,
  },
  shortcutDescription: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightControl,
    marginBlockEnd: 0,
    marginBlockStart: vars.space4,
  },

  keys: {
    alignItems: "center",
    columnGap: vars.space8,
    display: "flex",
    flexWrap: "wrap",
    minInlineSize: 0,
    rowGap: 6,
  },
  keysJoiner: { color: vars.colorTextMuted, fontSize: vars.fontSizeCaption },

  emptyState: { gridColumn: "1 / -1", paddingBlock: 80, textAlign: "center" },
  emptyTitle: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    margin: 0,
  },
  emptyHint: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    marginBlockEnd: 0,
    marginBlockStart: vars.space4,
  },

  footer: {
    alignItems: { default: "stretch", "@media (min-width: 48rem)": "flex-start" },
    borderBlockStartColor: vars.colorBorderSubtle,
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: vars.borderWidthHairline,
    flexDirection: { default: "column", "@media (min-width: 48rem)": "row" },
    flexShrink: 0,
    justifyContent: {
      default: "normal",
      "@media (min-width: 48rem)": "space-between",
    },
    marginBlockStart: 0,
    paddingBlock: vars.space16,
    paddingInline: {
      default: vars.space20,
      "@media (min-width: 48rem)": vars.space24,
    },
  },
  footerNote: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightControl,
    margin: 0,
    maxInlineSize: "56rem",
  },
});
