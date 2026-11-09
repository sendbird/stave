import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

export const emptySplashStyles = stylex.create({
  // ── Shared action controls ───────────────────────────────────────────
  topCardButton: {
    borderRadius: vars["--aui-radius-control"],
    height: 44,
    justifyContent: "space-between",
    paddingInline: vars["--aui-space-12"],
    width: "100%",
  },
  outlineButton: {
    borderColor: vars["--aui-color-border"],
    backgroundColor: vars["--aui-color-canvas"],
  },
  buttonInner: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
    minWidth: 0,
  },
  buttonLabel: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  arrowIcon: {
    color: vars["--aui-color-accent-text"],
  },
  chevronIcon: {
    color: vars["--aui-color-text-muted"],
  },
  keyGroupSpaced: {
    marginLeft: vars["--aui-space-4"],
  },
  onAccentKey: {
    backgroundColor: vars["--aui-color-overlay-hover"],
    color: vars["--aui-color-accent-text"],
  },
  onAccentSeparator: {
    color: vars["--aui-color-accent-text"],
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
    gap: vars["--aui-space-8"],
    minWidth: 0,
  },
  menuItemIcon: {
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    marginTop: vars["--aui-space-2"],
  },
  menuItemCopy: {
    minWidth: 0,
  },
  menuItemTitle: {
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  menuItemDescription: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    marginTop: vars["--aui-space-2"],
  },
  actionGroup: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
    justifyContent: "center",
    marginTop: vars["--aui-space-8"],
  },
  // ── Top-card layout ──────────────────────────────────────────────────
  topSection: {
    alignItems: "flex-start",
    display: "flex",
    flexGrow: 1,
    justifyContent: "flex-start",
    minHeight: 0,
    paddingBlock: {
      default: vars["--aui-space-20"],
      "@media (min-width: 640px)": vars["--aui-space-24"],
    },
    paddingInline: {
      default: vars["--aui-space-20"],
      "@media (min-width: 640px)": vars["--aui-space-24"],
    },
    width: "100%",
  },
  card: {
    backgroundColor: vars["--aui-color-surface"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    boxShadow: vars["--aui-elevation-raised"],
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
    gap: vars["--aui-space-32"],
    justifyContent: "space-between",
    minHeight: 320,
    minWidth: 0,
    padding: {
      default: vars["--aui-space-24"],
      "@media (min-width: 640px)": vars["--aui-space-32"],
    },
  },
  brandRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-12"],
    minWidth: 0,
  },
  logoBox: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-canvas"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
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
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  brandStatus: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
  },
  headingBlock: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-12"],
    maxWidth: 672,
  },
  heading: {
    color: vars["--aui-color-text"],
    fontFamily: "var(--font-heading)",
    fontSize: vars["--aui-font-size-title"],
    fontWeight: vars["--aui-font-weight-semibold"],
    lineHeight: vars["--aui-line-height-tight"],
    margin: 0,
  },
  headingDescription: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-lead"],
    lineHeight: "1.75rem",
    margin: 0,
    maxWidth: 576,
  },
  metaRow: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars["--aui-font-size-body"],
    gap: vars["--aui-space-8"],
  },
  aside: {
    backgroundColor: vars["--aui-color-surface"],
    borderTopColor: vars["--aui-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: {
      default: vars["--aui-border-width-hairline"],
      "@media (min-width: 768px)": 0,
    },
    borderLeftColor: {
      default: null,
      "@media (min-width: 768px)": vars["--aui-color-border"],
    },
    borderLeftStyle: {
      default: null,
      "@media (min-width: 768px)": "solid",
    },
    borderLeftWidth: {
      default: 0,
      "@media (min-width: 768px)": vars["--aui-border-width-hairline"],
    },
    padding: vars["--aui-space-20"],
  },
  asideInner: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-24"],
    height: "100%",
    justifyContent: "space-between",
    minHeight: 260,
  },
  asideHeading: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
  },
  asideTitle: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  asideDescription: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-relaxed"],
    margin: 0,
  },
  actionColumn: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
  },
  asideNote: {
    borderTopColor: vars["--aui-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    paddingTop: vars["--aui-space-12"],
  },
  supplementary: {
    borderTopColor: vars["--aui-color-border"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--aui-border-width-hairline"],
    padding: vars["--aui-space-20"],
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
    paddingBlock: vars["--aui-space-40"],
    paddingInline: {
      default: vars["--aui-space-20"],
      "@media (min-width: 640px)": vars["--aui-space-24"],
    },
    width: "100%",
  },
  empty: {
    borderWidth: 0,
    padding: 0,
  },
  emptyHeader: {
    gap: vars["--aui-space-12"],
    // Logical, matching the `maxInlineSize: 360` the AUI header declares.
    // `maxWidth` is a separate atomic property in StyleX, so the physical
    // spelling left both rules live and the header still capped at 360px.
    maxInlineSize: 576,
  },
  emptyMedia: {
    backgroundColor: vars["--aui-color-accent-soft"],
    // Logical sizing so this deterministically replaces the AUI medallion's
    // `inlineSize`/`minBlockSize` instead of racing `width`/`height` against
    // them and resolving to a non-square 48x56 chip.
    blockSize: 56,
    borderRadius: vars["--aui-radius-control"],
    color: vars["--aui-color-accent"],
    inlineSize: 56,
    minBlockSize: 56,
    padding: vars["--aui-space-8"],
  },
  emptyCopy: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
  },
  emptyTitle: {
    fontSize: vars["--aui-font-size-title"],
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  icon: {
    color: vars["--aui-color-text-muted"],
  },
});
