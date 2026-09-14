import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

export const shortcutsDrawerStyles = stylex.create({
  /**
   * Top-anchored drawer: it fills the viewport height and squares off its
   * bottom edge, so the base popup's sheet geometry is overridden only in the
   * `up` swipe direction it actually renders in.
   */
  content: {
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 80%, transparent)`,
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
    backgroundImage: `linear-gradient(110deg, color-mix(in oklch, ${vars["--ads-color-surface"]} 90%, ${vars["--ads-color-canvas"]}), ${vars["--ads-color-canvas"]})`,
    borderBlockEndColor: vars["--ads-color-border-subtle"],
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: vars["--ads-border-width-hairline"],
    flexShrink: 0,
    gap: 0,
    paddingBlock: vars["--ads-space-16"],
    paddingInline: {
      default: vars["--ads-space-20"],
      "@media (min-width: 48rem)": vars["--ads-space-24"],
    },
  },
  headerRow: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-16"],
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
    blockSize: vars["--ads-space-20"],
    // Decorative section glyph, not an action or a selection marker: accent is
    // reserved for the primary action, active/selected state, and links.
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    inlineSize: vars["--ads-space-20"],
  },
  headerText: { minInlineSize: 0, textAlign: "left" },
  title: {
    fontSize: vars["--ads-font-size-lead"],
    fontWeight: vars["--ads-font-weight-semibold"],
    lineHeight: vars["--ads-line-height-tight"],
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
    gap: vars["--ads-space-8"],
    inlineSize: { default: "100%", "@media (min-width: 40rem)": "auto" },
    minInlineSize: { default: 0, "@media (min-width: 40rem)": "16rem" },
  },
  searchField: { flexGrow: 1, minInlineSize: 0, position: "relative" },
  searchIcon: {
    blockSize: 14,
    color: vars["--ads-color-text-muted"],
    inlineSize: 14,
    insetInlineStart: 10,
    pointerEvents: "none",
    position: "absolute",
    top: "50%",
    translate: "0 -50%",
  },
  searchInput: {
    blockSize: 36,
    paddingInlineEnd: vars["--ads-space-32"],
    paddingInlineStart: vars["--ads-space-32"],
  },
  clearButton: {
    insetInlineEnd: 6,
    position: "absolute",
    top: "50%",
    translate: "0 -50%",
  },
  clearIcon: { blockSize: 14, inlineSize: 14 },
  shownCount: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--ads-font-size-micro"],
    fontVariantNumeric: "tabular-nums",
    inlineSize: 64,
    textAlign: "right",
  },

  grid: {
    alignContent: "start",
    alignItems: "start",
    columnGap: vars["--ads-space-32"],
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
    paddingBlock: vars["--ads-space-24"],
    paddingInline: {
      default: vars["--ads-space-20"],
      "@media (min-width: 48rem)": vars["--ads-space-24"],
    },
  },
  section: {
    alignSelf: "start",
    borderBlockStartColor: `color-mix(in oklch, ${vars["--ads-color-accent"]} 25%, transparent)`,
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: 2,
  },
  sectionHeader: { paddingBlock: vars["--ads-space-12"], paddingInline: vars["--ads-space-4"] },
  sectionHeaderRow: {
    alignItems: "baseline",
    display: "flex",
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "0.12em",
    margin: 0,
    textTransform: "uppercase",
  },
  sectionCount: {
    color: vars["--ads-color-text-muted"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-micro"],
    fontVariantNumeric: "tabular-nums",
  },
  sectionDescription: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-control"],
    marginBlockEnd: 0,
    marginBlockStart: vars["--ads-space-4"],
  },
  sectionList: {
    borderBlockEndColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 55%, transparent)`,
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: vars["--ads-border-width-hairline"],
  },
  shortcutRow: {
    backgroundColor: { default: "transparent", ":hover": vars["--ads-color-overlay-hover"] },
    borderBlockStartColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 55%, transparent)`,
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-4"],
  },
  shortcutText: { minInlineSize: 0 },
  shortcutLabel: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    margin: 0,
  },
  shortcutDescription: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-control"],
    marginBlockEnd: 0,
    marginBlockStart: vars["--ads-space-4"],
  },

  keys: {
    alignItems: "center",
    columnGap: vars["--ads-space-8"],
    display: "flex",
    flexWrap: "wrap",
    minInlineSize: 0,
    rowGap: 6,
  },
  keysJoiner: { color: vars["--ads-color-text-muted"], fontSize: vars["--ads-font-size-caption"] },

  emptyState: { gridColumn: "1 / -1", paddingBlock: 80, textAlign: "center" },
  emptyTitle: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    margin: 0,
  },
  emptyHint: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    marginBlockEnd: 0,
    marginBlockStart: vars["--ads-space-4"],
  },

  footer: {
    alignItems: { default: "stretch", "@media (min-width: 48rem)": "flex-start" },
    borderBlockStartColor: vars["--ads-color-border-subtle"],
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: vars["--ads-border-width-hairline"],
    flexDirection: { default: "column", "@media (min-width: 48rem)": "row" },
    flexShrink: 0,
    justifyContent: {
      default: "normal",
      "@media (min-width: 48rem)": "space-between",
    },
    marginBlockStart: 0,
    paddingBlock: vars["--ads-space-16"],
    paddingInline: {
      default: vars["--ads-space-20"],
      "@media (min-width: 48rem)": vars["--ads-space-24"],
    },
  },
  footerNote: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-control"],
    margin: 0,
    maxInlineSize: "56rem",
  },
});
