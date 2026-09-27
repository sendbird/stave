import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

const MAX_WIDTH = "1536px";

export const docsStyles = stylex.create({
  provider: {
    display: "flex",
    minBlockSize: "100svh",
    flexDirection: "column",
  },
  sidebar: {
    borderRightWidth: vars["--ads-border-width-hairline"],
    borderRightStyle: "solid",
    borderRightColor: "color-mix(in oklab, var(--border) 70%, transparent)",
  },
  sidebarHeader: {
    borderBottomWidth: vars["--ads-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: "color-mix(in oklab, var(--sidebar-border) 80%, transparent)",
    paddingInline: vars["--ads-space-16"],
    paddingBlock: vars["--ads-space-12"],
  },
  sidebarHeaderLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: {
      default: "var(--muted-foreground)",
      ":hover": "var(--foreground)",
    },
  },
  sidebarContent: {
    paddingInline: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-12"],
  },
  sidebarGroupLabel: {
    paddingInline: vars["--ads-space-8"],
    fontSize: "11px",
    fontWeight: vars["--ads-font-weight-medium"],
    letterSpacing: "0.05em",
    textTransform: "uppercase",
  },
  toc: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
  },
  tocLabel: {
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "0.05em",
    color: "var(--foreground)",
    textTransform: "uppercase",
  },
  tocList: {
    borderLeftWidth: vars["--ads-border-width-hairline"],
    borderLeftStyle: "solid",
    borderLeftColor: "var(--border)",
  },
  tocLink: {
    display: "block",
    borderLeftWidth: vars["--ads-border-width-hairline"],
    borderLeftStyle: "solid",
    borderLeftColor: {
      default: "transparent",
      '[data-active="true"]': "var(--primary)",
    },
    paddingBlock: vars["--ads-space-4"],
    paddingLeft: vars["--ads-space-12"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: "1.5rem",
    fontWeight: {
      default: vars["--ads-font-weight-regular"],
      '[data-active="true"]': vars["--ads-font-weight-medium"],
    },
    color: {
      default: "var(--muted-foreground)",
      ":hover": "var(--foreground)",
      '[data-active="true"]': "var(--foreground)",
    },
    transitionProperty: "color, background-color, border-color",
    transitionDuration: "150ms",
  },
  tocLinkNested: {
    paddingLeft: vars["--ads-space-24"],
  },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-24"],
  },
  breadcrumbMuted: {
    color: "var(--muted-foreground)",
  },
  heroBody: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-16"],
  },
  heroBadge: {
    borderRadius: vars["--ads-radius-full"],
    borderColor: "color-mix(in oklab, var(--border) 80%, transparent)",
    backgroundColor: "color-mix(in oklab, var(--card) 60%, transparent)",
    paddingInline: vars["--ads-space-12"],
    paddingBlock: "0.125rem",
    fontSize: "11px",
    letterSpacing: "0.05em",
    color: "var(--muted-foreground)",
    textTransform: "uppercase",
  },
  heroTitle: {
    fontFamily: "var(--font-heading)",
    fontSize: {
      default: "2.25rem",
      "@media (min-width: 640px)": "3rem",
    },
    lineHeight: 1.1,
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "-0.025em",
    textWrap: "balance",
    color: "var(--foreground)",
  },
  heroDescription: {
    maxInlineSize: "48rem",
    fontSize: {
      default: vars["--ads-font-size-lead"],
      "@media (min-width: 640px)": "1.125rem",
    },
    lineHeight: "1.75rem",
    color: "var(--muted-foreground)",
  },
  heroPreview: {
    overflow: "hidden",
    borderRadius: vars["--ads-radius-frame"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: "var(--border)",
    backgroundColor: "color-mix(in oklab, var(--muted) 30%, transparent)",
  },
  neighbors: {
    display: "grid",
    gap: vars["--ads-space-16"],
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 640px)": "repeat(2, minmax(0, 1fr))",
    },
  },
  neighborCard: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    borderRadius: vars["--ads-radius-frame"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: {
      default: "color-mix(in oklab, var(--border) 70%, transparent)",
      ":hover": "color-mix(in oklab, var(--foreground) 20%, transparent)",
    },
    backgroundColor: "color-mix(in oklab, var(--card) 50%, transparent)",
    padding: vars["--ads-space-20"],
    transitionProperty: "color, background-color, border-color",
    transitionDuration: "150ms",
  },
  neighborCardNext: {
    textAlign: "right",
  },
  neighborLabel: {
    display: "flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-caption"],
    color: "var(--muted-foreground)",
  },
  neighborLabelNext: {
    justifyContent: "flex-end",
  },
  neighborTitle: {
    marginTop: vars["--ads-space-8"],
    fontFamily: "var(--font-heading)",
    fontSize: vars["--ads-font-size-lead"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "-0.025em",
    color: "var(--foreground)",
  },
  neighborArrow: {
    inlineSize: "0.875rem",
    blockSize: "0.875rem",
  },
  searchDialog: {
    maxInlineSize: "42rem",
    borderColor: "color-mix(in oklab, var(--border) 80%, transparent)",
    backgroundColor: "color-mix(in oklab, var(--background) 95%, transparent)",
    padding: 0,
    boxShadow: vars["--ads-elevation-modal"],
  },
  searchCommand: {
    display: "flex",
    blockSize: "min(70vh, 32rem)",
    minBlockSize: 0,
    flexDirection: "column",
    backgroundColor: "transparent",
  },
  searchInputWrap: {
    flexShrink: 0,
    borderBottomWidth: vars["--ads-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: "color-mix(in oklab, var(--border) 70%, transparent)",
    paddingInline: vars["--ads-space-4"],
    paddingBottom: vars["--ads-space-4"],
  },
  searchList: {
    minBlockSize: 0,
    maxBlockSize: "none",
    flexGrow: 1,
    paddingInline: vars["--ads-space-8"],
    paddingBottom: vars["--ads-space-12"],
  },
  searchEmpty: {
    paddingInline: vars["--ads-space-16"],
    paddingBlock: vars["--ads-space-40"],
    fontSize: vars["--ads-font-size-body"],
    color: "var(--muted-foreground)",
  },
  searchGroup: {
    paddingBlock: vars["--ads-space-4"],
  },
  searchItemMeta: {
    marginInlineStart: "auto",
    fontSize: vars["--ads-font-size-caption"],
    color: "var(--muted-foreground)",
  },
  layoutRow: {
    display: "flex",
    flexGrow: 1,
  },
  inset: {
    minInlineSize: 0,
    backgroundColor: "var(--background)",
  },
  mobileBar: {
    display: {
      default: "flex",
      "@media (min-width: 1024px)": "none",
    },
    blockSize: "3rem",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    borderBottomWidth: vars["--ads-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: "color-mix(in oklab, var(--border) 70%, transparent)",
    backgroundColor: "color-mix(in oklab, var(--background) 85%, transparent)",
    paddingInline: vars["--ads-space-16"],
    backdropFilter: "blur(12px)",
  },
  mobileBarSeparator: {
    blockSize: vars["--ads-space-16"],
  },
  mobileBarTitle: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: "var(--foreground)",
  },
  main: {
    marginInline: "auto",
    inlineSize: "100%",
    minInlineSize: 0,
    maxInlineSize: MAX_WIDTH,
    flexGrow: 1,
    paddingInline: {
      default: vars["--ads-space-16"],
      "@media (min-width: 640px)": vars["--ads-space-24"],
      "@media (min-width: 1024px)": vars["--ads-space-40"],
    },
    paddingBlock: {
      default: vars["--ads-space-40"],
      "@media (min-width: 1024px)": "3.5rem",
    },
  },
  contentGrid: {
    display: "grid",
    gap: vars["--ads-space-40"],
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 1280px)": "minmax(0, 1fr) 220px",
    },
  },
  article: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-40"],
    minInlineSize: 0,
    maxInlineSize: "48rem",
  },
  asideToc: {
    display: {
      default: "none",
      "@media (min-width: 1280px)": "block",
    },
  },
  asideTocSticky: {
    position: "sticky",
    top: "5rem",
  },
  notFound: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-16"],
  },
  notFoundTitle: {
    fontFamily: "var(--font-heading)",
    fontSize: vars["--ads-font-size-title"],
    fontWeight: vars["--ads-font-weight-semibold"],
  },
  notFoundText: {
    color: "var(--muted-foreground)",
  },
  notFoundLink: {
    color: "var(--primary)",
    textDecorationLine: "underline",
  },
  icon: {
    inlineSize: vars["--ads-control-icon-size-md"],
    blockSize: vars["--ads-control-icon-size-md"],
  },
});
