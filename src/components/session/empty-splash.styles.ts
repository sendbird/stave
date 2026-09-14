import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const emptySplashStyles = stylex.create({
  // ── Shared action controls ───────────────────────────────────────────
  topCardButton: {
    borderRadius: vars["--ads-radius-control"],
    height: 44,
    justifyContent: "space-between",
    paddingInline: vars["--ads-space-12"],
    width: "100%",
  },
  outlineButton: {
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-canvas"],
  },
  buttonInner: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
    minWidth: 0,
  },
  buttonLabel: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  arrowIcon: {
    color: vars["--ads-color-accent-text"],
  },
  chevronIcon: {
    color: vars["--ads-color-text-muted"],
  },
  keyGroupSpaced: {
    marginLeft: vars["--ads-space-4"],
  },
  onAccentKey: {
    backgroundColor: vars["--ads-color-overlay-hover"],
    color: vars["--ads-color-accent-text"],
  },
  onAccentSeparator: {
    color: vars["--ads-color-accent-text"],
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
    gap: vars["--ads-space-8"],
    minWidth: 0,
  },
  menuItemIcon: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    marginTop: vars["--ads-space-2"],
  },
  menuItemCopy: {
    minWidth: 0,
  },
  menuItemTitle: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  menuItemDescription: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    marginTop: vars["--ads-space-2"],
  },
  actionGroup: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
    justifyContent: "center",
    marginTop: vars["--ads-space-8"],
  },
  // ── Top-card layout ──────────────────────────────────────────────────
  topSection: {
    alignItems: "flex-start",
    display: "flex",
    flexGrow: 1,
    justifyContent: "flex-start",
    minHeight: 0,
    paddingBlock: {
      default: vars["--ads-space-20"],
      "@media (min-width: 640px)": vars["--ads-space-24"],
    },
    paddingInline: {
      default: vars["--ads-space-20"],
      "@media (min-width: 640px)": vars["--ads-space-24"],
    },
    width: "100%",
  },
  card: {
    backgroundColor: vars["--ads-color-surface"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    boxShadow: vars["--ads-elevation-raised"],
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
    gap: vars["--ads-space-32"],
    justifyContent: "space-between",
    minHeight: 320,
    minWidth: 0,
    padding: {
      default: vars["--ads-space-24"],
      "@media (min-width: 640px)": vars["--ads-space-32"],
    },
  },
  brandRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-12"],
    minWidth: 0,
  },
  logoBox: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
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
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  brandStatus: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
  },
  headingBlock: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    maxWidth: 672,
  },
  heading: {
    color: vars["--ads-color-text"],
    fontFamily: "var(--font-heading)",
    fontSize: "1.875rem",
    fontWeight: vars["--ads-font-weight-semibold"],
    lineHeight: vars["--ads-line-height-tight"],
    margin: 0,
  },
  headingDescription: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-lead"],
    lineHeight: "1.75rem",
    margin: 0,
    maxWidth: 576,
  },
  metaRow: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars["--ads-font-size-body"],
    gap: vars["--ads-space-8"],
  },
  aside: {
    backgroundColor: vars["--ads-color-surface"],
    borderTopColor: vars["--ads-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: {
      default: vars["--ads-border-width-hairline"],
      "@media (min-width: 768px)": 0,
    },
    borderLeftColor: {
      default: null,
      "@media (min-width: 768px)": vars["--ads-color-border"],
    },
    borderLeftStyle: {
      default: null,
      "@media (min-width: 768px)": "solid",
    },
    borderLeftWidth: {
      default: 0,
      "@media (min-width: 768px)": vars["--ads-border-width-hairline"],
    },
    padding: vars["--ads-space-20"],
  },
  asideInner: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-24"],
    height: "100%",
    justifyContent: "space-between",
    minHeight: 260,
  },
  asideHeading: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
  },
  asideTitle: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  asideDescription: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-relaxed"],
    margin: 0,
  },
  actionColumn: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
  },
  asideNote: {
    borderTopColor: vars["--ads-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    paddingTop: vars["--ads-space-12"],
  },
  supplementary: {
    borderTopColor: vars["--ads-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--ads-border-width-hairline"],
    padding: vars["--ads-space-20"],
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
    paddingBlock: vars["--ads-space-40"],
    paddingInline: {
      default: vars["--ads-space-20"],
      "@media (min-width: 640px)": vars["--ads-space-24"],
    },
    width: "100%",
  },
  empty: {
    borderWidth: 0,
    padding: 0,
  },
  emptyHeader: {
    gap: vars["--ads-space-12"],
    // Logical, matching the `maxInlineSize: 360` the ADS header declares.
    // `maxWidth` is a separate atomic property in StyleX, so the physical
    // spelling left both rules live and the header still capped at 360px.
    maxInlineSize: 576,
  },
  emptyMedia: {
    backgroundColor: vars["--ads-color-accent-soft"],
    // Logical sizing so this deterministically replaces the ADS medallion's
    // `inlineSize`/`minBlockSize` instead of racing `width`/`height` against
    // them and resolving to a non-square 48x56 chip.
    blockSize: 56,
    borderRadius: vars["--ads-radius-control"],
    color: vars["--ads-color-accent"],
    inlineSize: 56,
    minBlockSize: 56,
    padding: vars["--ads-space-8"],
  },
  emptyCopy: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
  },
  emptyTitle: {
    fontSize: vars["--ads-font-size-title"],
    fontWeight: vars["--ads-font-weight-semibold"],
  },
  icon: {
    color: vars["--ads-color-text-muted"],
  },
});
