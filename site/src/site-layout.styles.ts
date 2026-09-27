import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

const MAX_WIDTH = "1536px";

export const siteLayoutStyles = stylex.create({
  mark: {
    display: "inline-block",
    inlineSize: vars["--ads-space-20"],
    blockSize: vars["--ads-space-20"],
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
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "-0.025em",
    color: "var(--foreground)",
  },
  brandLabel: {
    lineHeight: 1,
  },
  brandSublabel: {
    fontWeight: vars["--ads-font-weight-medium"],
    color: "var(--muted-foreground)",
  },
  header: {
    position: "sticky",
    top: 0,
    zIndex: vars["--ads-z-index-overlay"],
    inlineSize: "100%",
    borderBottomWidth: vars["--ads-border-width-hairline"],
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
    gap: vars["--ads-space-16"],
    paddingInline: {
      default: vars["--ads-space-16"],
      "@media (min-width: 640px)": vars["--ads-space-24"],
      "@media (min-width: 1024px)": vars["--ads-space-32"],
    },
  },
  nav: {
    display: {
      default: "none",
      "@media (min-width: 768px)": "flex",
    },
    alignItems: "center",
    gap: vars["--ads-space-4"],
  },
  navLink: {
    borderRadius: "var(--radius-md)",
    paddingInline: "0.625rem",
    paddingBlock: "0.375rem",
    fontSize: vars["--ads-font-size-body"],
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
    gap: vars["--ads-space-8"],
  },
  searchButton: {
    display: {
      default: "none",
      "@media (min-width: 768px)": "inline-flex",
    },
    blockSize: vars["--ads-control-height-lg"],
    inlineSize: "15rem",
    justifyContent: "space-between",
    gap: vars["--ads-space-8"],
    borderColor: "color-mix(in oklab, var(--border) 80%, transparent)",
    backgroundColor: {
      default: "color-mix(in oklab, var(--muted) 40%, transparent)",
      ":hover": "var(--muted)",
    },
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-regular"],
    color: "var(--muted-foreground)",
  },
  searchButtonInner: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
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
    borderTopWidth: vars["--ads-border-width-hairline"],
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
    gap: vars["--ads-space-24"],
    paddingInline: {
      default: vars["--ads-space-16"],
      "@media (min-width: 640px)": vars["--ads-space-24"],
      "@media (min-width: 1024px)": vars["--ads-space-32"],
    },
    paddingBlock: vars["--ads-space-40"],
    fontSize: vars["--ads-font-size-body"],
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
    gap: vars["--ads-space-12"],
  },
  footerVerticalSeparator: {
    blockSize: vars["--ads-space-16"],
  },
  footerLinks: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: vars["--ads-space-20"],
    rowGap: vars["--ads-space-8"],
  },
  footerLink: {
    color: {
      default: "var(--muted-foreground)",
      ":hover": "var(--foreground)",
    },
  },
  icon: {
    inlineSize: vars["--ads-control-icon-size-md"],
    blockSize: vars["--ads-control-icon-size-md"],
  },
});
