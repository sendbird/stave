import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

const MAX_WIDTH = "1536px";

export const docsStyles = stylex.create({
  provider: {
    display: "flex",
    minBlockSize: "100svh",
    flexDirection: "column",
  },
  sidebar: {
    borderRightWidth: vars["--aui-border-width-hairline"],
    borderRightStyle: "solid",
    borderRightColor: "color-mix(in oklab, var(--border) 70%, transparent)",
  },
  sidebarHeader: {
    borderBottomWidth: vars["--aui-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: "color-mix(in oklab, var(--sidebar-border) 80%, transparent)",
    paddingInline: vars["--aui-space-16"],
    paddingBlock: vars["--aui-space-12"],
  },
  sidebarHeaderLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    color: {
      default: "var(--muted-foreground)",
      ":hover": "var(--foreground)",
    },
  },
  sidebarContent: {
    paddingInline: vars["--aui-space-8"],
    paddingBlock: vars["--aui-space-12"],
  },
  sidebarGroupLabel: {
    paddingInline: vars["--aui-space-8"],
    fontSize: "11px",
    fontWeight: vars["--aui-font-weight-medium"],
    letterSpacing: "0.05em",
    textTransform: "uppercase",
  },
  toc: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
  },
  tocLabel: {
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-semibold"],
    letterSpacing: "0.05em",
    color: "var(--foreground)",
    textTransform: "uppercase",
  },
  tocList: {
    borderLeftWidth: vars["--aui-border-width-hairline"],
    borderLeftStyle: "solid",
    borderLeftColor: "var(--border)",
  },
  tocLink: {
    display: "block",
    borderLeftWidth: vars["--aui-border-width-hairline"],
    borderLeftStyle: "solid",
    borderLeftColor: {
      default: "transparent",
      '[data-active="true"]': "var(--primary)",
    },
    paddingBlock: vars["--aui-space-4"],
    paddingLeft: vars["--aui-space-12"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: "1.5rem",
    fontWeight: {
      default: vars["--aui-font-weight-regular"],
      '[data-active="true"]': vars["--aui-font-weight-medium"],
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
    paddingLeft: vars["--aui-space-24"],
  },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-24"],
  },
  breadcrumbMuted: {
    color: "var(--muted-foreground)",
  },
  heroBody: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-16"],
  },
  heroBadge: {
    borderRadius: vars["--aui-radius-full"],
    borderColor: "color-mix(in oklab, var(--border) 80%, transparent)",
    backgroundColor: "color-mix(in oklab, var(--card) 60%, transparent)",
    paddingInline: vars["--aui-space-12"],
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
    fontWeight: vars["--aui-font-weight-semibold"],
    letterSpacing: "-0.025em",
    textWrap: "balance",
    color: "var(--foreground)",
  },
  heroDescription: {
    maxInlineSize: "48rem",
    fontSize: {
      default: vars["--aui-font-size-lead"],
      "@media (min-width: 640px)": "1.125rem",
    },
    lineHeight: "1.75rem",
    color: "var(--muted-foreground)",
  },
  heroPreview: {
    overflow: "hidden",
    borderRadius: vars["--aui-radius-frame"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: "var(--border)",
    backgroundColor: "color-mix(in oklab, var(--muted) 30%, transparent)",
  },
  neighbors: {
    display: "grid",
    gap: vars["--aui-space-16"],
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 640px)": "repeat(2, minmax(0, 1fr))",
    },
  },
  neighborCard: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    borderRadius: vars["--aui-radius-frame"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    borderColor: {
      default: "color-mix(in oklab, var(--border) 70%, transparent)",
      ":hover": "color-mix(in oklab, var(--foreground) 20%, transparent)",
    },
    backgroundColor: "color-mix(in oklab, var(--card) 50%, transparent)",
    padding: vars["--aui-space-20"],
    transitionProperty: "color, background-color, border-color",
    transitionDuration: "150ms",
  },
  neighborCardNext: {
    textAlign: "right",
  },
  neighborLabel: {
    display: "flex",
    alignItems: "center",
    gap: vars["--aui-space-8"],
    fontSize: vars["--aui-font-size-caption"],
    color: "var(--muted-foreground)",
  },
  neighborLabelNext: {
    justifyContent: "flex-end",
  },
  neighborTitle: {
    marginTop: vars["--aui-space-8"],
    fontFamily: "var(--font-heading)",
    fontSize: vars["--aui-font-size-lead"],
    fontWeight: vars["--aui-font-weight-semibold"],
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
    boxShadow: vars["--aui-elevation-modal"],
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
    borderBottomWidth: vars["--aui-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: "color-mix(in oklab, var(--border) 70%, transparent)",
    paddingInline: vars["--aui-space-4"],
    paddingBottom: vars["--aui-space-4"],
  },
  searchList: {
    minBlockSize: 0,
    maxBlockSize: "none",
    flexGrow: 1,
    paddingInline: vars["--aui-space-8"],
    paddingBottom: vars["--aui-space-12"],
  },
  searchEmpty: {
    paddingInline: vars["--aui-space-16"],
    paddingBlock: vars["--aui-space-40"],
    fontSize: vars["--aui-font-size-body"],
    color: "var(--muted-foreground)",
  },
  searchGroup: {
    paddingBlock: vars["--aui-space-4"],
  },
  searchItemMeta: {
    marginInlineStart: "auto",
    fontSize: vars["--aui-font-size-caption"],
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
    gap: vars["--aui-space-8"],
    borderBottomWidth: vars["--aui-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: "color-mix(in oklab, var(--border) 70%, transparent)",
    backgroundColor: "color-mix(in oklab, var(--background) 85%, transparent)",
    paddingInline: vars["--aui-space-16"],
    backdropFilter: "blur(12px)",
  },
  mobileBarSeparator: {
    blockSize: vars["--aui-space-16"],
  },
  mobileBarTitle: {
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    color: "var(--foreground)",
  },
  main: {
    marginInline: "auto",
    inlineSize: "100%",
    minInlineSize: 0,
    maxInlineSize: MAX_WIDTH,
    flexGrow: 1,
    paddingInline: {
      default: vars["--aui-space-16"],
      "@media (min-width: 640px)": vars["--aui-space-24"],
      "@media (min-width: 1024px)": vars["--aui-space-40"],
    },
    paddingBlock: {
      default: vars["--aui-space-40"],
      "@media (min-width: 1024px)": "3.5rem",
    },
  },
  contentGrid: {
    display: "grid",
    gap: vars["--aui-space-40"],
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 1280px)": "minmax(0, 1fr) 220px",
    },
  },
  article: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-40"],
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
    gap: vars["--aui-space-16"],
  },
  notFoundTitle: {
    fontFamily: "var(--font-heading)",
    fontSize: vars["--aui-font-size-title"],
    fontWeight: vars["--aui-font-weight-semibold"],
  },
  notFoundText: {
    color: "var(--muted-foreground)",
  },
  notFoundLink: {
    color: "var(--primary)",
    textDecorationLine: "underline",
  },
  icon: {
    inlineSize: vars["--aui-control-icon-size-md"],
    blockSize: vars["--aui-control-icon-size-md"],
  },
});
