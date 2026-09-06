import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const emptySplashStyles = stylex.create({
  // ── Shared action controls ───────────────────────────────────────────
  topCardButton: {
    borderRadius: vars.radiusControl,
    height: 44,
    justifyContent: "space-between",
    paddingInline: vars.space12,
    width: "100%",
  },
  outlineButton: {
    borderColor: vars.colorBorder,
    backgroundColor: vars.colorCanvas,
  },
  buttonInner: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
    minWidth: 0,
  },
  buttonLabel: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  arrowIcon: {
    color: vars.colorAccentText,
  },
  chevronIcon: {
    color: vars.colorTextMuted,
  },
  keyGroupSpaced: {
    marginLeft: vars.space4,
  },
  onAccentKey: {
    backgroundColor: vars.colorOverlayHover,
    color: vars.colorAccentText,
  },
  onAccentSeparator: {
    color: vars.colorAccentText,
  },
  // ── Dropdown items ───────────────────────────────────────────────────
  menuContent: {
    width: 256,
  },
  menuItemStart: {
    alignItems: "flex-start",
  },
  menuItemRow: {
    alignItems: "flex-start",
    display: "flex",
    gap: vars.space8,
    minWidth: 0,
  },
  menuItemIcon: {
    color: vars.colorTextMuted,
    flexShrink: 0,
    marginTop: vars.space2,
  },
  menuItemCopy: {
    minWidth: 0,
  },
  menuItemTitle: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  menuItemDescription: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    marginTop: vars.space2,
  },
  actionGroup: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
    justifyContent: "center",
    marginTop: vars.space8,
  },
  // ── Top-card layout ──────────────────────────────────────────────────
  topSection: {
    alignItems: "flex-start",
    display: "flex",
    flexGrow: 1,
    justifyContent: "flex-start",
    minHeight: 0,
    paddingBlock: {
      default: vars.space20,
      "@media (min-width: 640px)": vars.space24,
    },
    paddingInline: {
      default: vars.space20,
      "@media (min-width: 640px)": vars.space24,
    },
    width: "100%",
  },
  card: {
    backgroundColor: vars.colorSurface,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    boxShadow: vars.elevationRaised,
    display: "grid",
    marginInline: "auto",
    overflow: "hidden",
    textAlign: "left",
    width: "100%",
  },
  cardWithActions: {
    gridTemplateColumns: {
      default: null,
      "@media (min-width: 768px)": "minmax(0, 1fr) 320px",
    },
    maxWidth: 1152,
  },
  cardPlain: {
    maxWidth: 896,
  },
  leftColumn: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space32,
    justifyContent: "space-between",
    minHeight: 320,
    minWidth: 0,
    padding: {
      default: vars.space24,
      "@media (min-width: 640px)": vars.space32,
    },
  },
  brandRow: {
    alignItems: "center",
    display: "flex",
    gap: vars.space12,
    minWidth: 0,
  },
  logoBox: {
    alignItems: "center",
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    flexShrink: 0,
    height: 40,
    justifyContent: "center",
    padding: "0.375rem",
    width: 40,
  },
  logoImage: {
    height: "100%",
    objectFit: "contain",
    width: "100%",
  },
  brandCopy: {
    minWidth: 0,
  },
  brandName: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  brandStatus: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
  },
  headingBlock: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
    maxWidth: 672,
  },
  heading: {
    color: vars.colorText,
    fontFamily: "var(--font-heading)",
    fontSize: "1.875rem",
    fontWeight: vars.fontWeightSemibold,
    lineHeight: vars.lineHeightTight,
    margin: 0,
  },
  headingDescription: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeLead,
    lineHeight: "1.75rem",
    margin: 0,
    maxWidth: 576,
  },
  metaRow: {
    alignItems: "center",
    color: vars.colorTextMuted,
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars.fontSizeBody,
    gap: vars.space8,
  },
  aside: {
    backgroundColor: vars.colorSurface,
    borderTopColor: vars.colorBorder,
    borderTopStyle: "solid",
    borderTopWidth: {
      default: vars.borderWidthHairline,
      "@media (min-width: 768px)": 0,
    },
    borderLeftColor: {
      default: null,
      "@media (min-width: 768px)": vars.colorBorder,
    },
    borderLeftStyle: {
      default: null,
      "@media (min-width: 768px)": "solid",
    },
    borderLeftWidth: {
      default: 0,
      "@media (min-width: 768px)": vars.borderWidthHairline,
    },
    padding: vars.space20,
  },
  asideInner: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space24,
    height: "100%",
    justifyContent: "space-between",
    minHeight: 260,
  },
  asideHeading: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
  },
  asideTitle: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  asideDescription: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightRelaxed,
    margin: 0,
  },
  actionColumn: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
  },
  asideNote: {
    borderTopColor: vars.colorBorder,
    borderTopStyle: "solid",
    borderTopWidth: vars.borderWidthHairline,
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
    paddingTop: vars.space12,
  },
  supplementary: {
    borderTopColor: vars.colorBorder,
    borderTopStyle: "solid",
    borderTopWidth: vars.borderWidthHairline,
    padding: vars.space20,
  },
  supplementarySpan: {
    gridColumn: {
      default: null,
      "@media (min-width: 768px)": "span 2",
    },
  },
  // ── Centered layout ──────────────────────────────────────────────────
  centeredSection: {
    alignItems: "center",
    display: "flex",
    flexGrow: 1,
    justifyContent: "center",
    minHeight: 0,
    paddingBlock: vars.space40,
    paddingInline: {
      default: vars.space20,
      "@media (min-width: 640px)": vars.space24,
    },
    width: "100%",
  },
  empty: {
    borderWidth: 0,
    padding: 0,
  },
  emptyHeader: {
    gap: vars.space12,
    maxWidth: 576,
  },
  emptyMedia: {
    backgroundColor: vars.colorAccentSoft,
    // Logical sizing so this deterministically replaces the ADS medallion's
    // `inlineSize`/`minBlockSize` instead of racing `width`/`height` against
    // them and resolving to a non-square 48x56 chip.
    blockSize: 56,
    borderRadius: vars.radiusControl,
    color: vars.colorAccent,
    inlineSize: 56,
    minBlockSize: 56,
    padding: vars.space8,
  },
  emptyCopy: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
  },
  emptyTitle: {
    fontSize: vars.fontSizeTitle,
    fontWeight: vars.fontWeightSemibold,
  },
  icon: {
    color: vars.colorTextMuted,
  },
});
