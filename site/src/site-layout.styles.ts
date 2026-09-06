import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

const MAX_WIDTH = "1536px";

export const siteLayoutStyles = stylex.create({
  mark: {
    display: "inline-block",
    inlineSize: vars.space20,
    blockSize: vars.space20,
    borderRadius: "var(--radius-md)",
    backgroundImage:
      "linear-gradient(to bottom right, var(--primary), color-mix(in oklab, var(--primary) 70%, transparent))",
    boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--primary) 40%, transparent)",
  },
  brand: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.625rem",
    fontFamily: "var(--font-heading)",
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightSemibold,
    letterSpacing: "-0.025em",
    color: "var(--foreground)",
  },
  brandLabel: {
    lineHeight: 1,
  },
  brandSublabel: {
    fontWeight: vars.fontWeightMedium,
    color: "var(--muted-foreground)",
  },
  header: {
    position: "sticky",
    top: 0,
    zIndex: vars.zIndexOverlay,
    inlineSize: "100%",
    borderBottomWidth: vars.borderWidthHairline,
    borderBottomStyle: "solid",
    borderBottomColor: "color-mix(in oklab, var(--border) 70%, transparent)",
    backgroundColor: "color-mix(in oklab, var(--background) 85%, transparent)",
    backdropFilter: "blur(12px)",
  },
  headerInner: {
    marginInline: "auto",
    display: "flex",
    blockSize: "3.5rem",
    maxInlineSize: MAX_WIDTH,
    alignItems: "center",
    gap: vars.space16,
    paddingInline: {
      default: vars.space16,
      "@media (min-width: 640px)": vars.space24,
      "@media (min-width: 1024px)": vars.space32,
    },
  },
  nav: {
    display: {
      default: "none",
      "@media (min-width: 768px)": "flex",
    },
    alignItems: "center",
    gap: vars.space4,
  },
  navLink: {
    borderRadius: "var(--radius-md)",
    paddingInline: "0.625rem",
    paddingBlock: "0.375rem",
    fontSize: vars.fontSizeBody,
    transitionProperty: "color, background-color, border-color",
    transitionDuration: "150ms",
    color: {
      default: "var(--muted-foreground)",
      ":hover": "var(--foreground)",
    },
  },
  navLinkActive: {
    color: "var(--foreground)",
  },
  headerActions: {
    marginInlineStart: "auto",
    display: "flex",
    alignItems: "center",
    gap: vars.space8,
  },
  searchButton: {
    display: {
      default: "none",
      "@media (min-width: 768px)": "inline-flex",
    },
    blockSize: vars.controlHeightLg,
    inlineSize: "15rem",
    justifyContent: "space-between",
    gap: vars.space8,
    borderColor: "color-mix(in oklab, var(--border) 80%, transparent)",
    backgroundColor: {
      default: "color-mix(in oklab, var(--muted) 40%, transparent)",
      ":hover": "var(--muted)",
    },
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightRegular,
    color: "var(--muted-foreground)",
  },
  searchButtonInner: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars.space8,
  },
  searchKbd: {
    pointerEvents: "none",
  },
  searchButtonMobile: {
    display: {
      default: "inline-flex",
      "@media (min-width: 768px)": "none",
    },
  },
  footer: {
    borderTopWidth: vars.borderWidthHairline,
    borderTopStyle: "solid",
    borderTopColor: "color-mix(in oklab, var(--border) 70%, transparent)",
  },
  footerInner: {
    marginInline: "auto",
    display: "flex",
    maxInlineSize: MAX_WIDTH,
    flexDirection: {
      default: "column",
      "@media (min-width: 640px)": "row",
    },
    gap: vars.space24,
    paddingInline: {
      default: vars.space16,
      "@media (min-width: 640px)": vars.space24,
      "@media (min-width: 1024px)": vars.space32,
    },
    paddingBlock: vars.space40,
    fontSize: vars.fontSizeBody,
    color: "var(--muted-foreground)",
    alignItems: {
      default: null,
      "@media (min-width: 640px)": "center",
    },
    justifyContent: {
      default: null,
      "@media (min-width: 640px)": "space-between",
    },
  },
  footerBrandRow: {
    display: "flex",
    alignItems: "center",
    gap: vars.space12,
  },
  footerVerticalSeparator: {
    blockSize: vars.space16,
  },
  footerLinks: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: vars.space20,
    rowGap: vars.space8,
  },
  footerLink: {
    color: {
      default: "var(--muted-foreground)",
      ":hover": "var(--foreground)",
    },
  },
  icon: {
    inlineSize: vars.controlIconSizeMd,
    blockSize: vars.controlIconSizeMd,
  },
});
