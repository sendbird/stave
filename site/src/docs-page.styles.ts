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
    borderRightWidth: vars.borderWidthHairline,
    borderRightStyle: "solid",
    borderRightColor: "color-mix(in oklab, var(--border) 70%, transparent)",
  },
  sidebarHeader: {
    borderBottomWidth: vars.borderWidthHairline,
    borderBottomStyle: "solid",
    borderBottomColor: "color-mix(in oklab, var(--sidebar-border) 80%, transparent)",
    paddingInline: vars.space16,
    paddingBlock: vars.space12,
  },
  sidebarHeaderLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars.space8,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    color: {
      default: "var(--muted-foreground)",
      ":hover": "var(--foreground)",
    },
  },
  sidebarContent: {
    paddingInline: vars.space8,
    paddingBlock: vars.space12,
  },
  sidebarGroupLabel: {
    paddingInline: vars.space8,
    fontSize: "11px",
    fontWeight: vars.fontWeightMedium,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
  },
  toc: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
  },
  tocLabel: {
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightSemibold,
    letterSpacing: "0.05em",
    color: "var(--foreground)",
    textTransform: "uppercase",
  },
  tocList: {
    borderLeftWidth: vars.borderWidthHairline,
    borderLeftStyle: "solid",
    borderLeftColor: "var(--border)",
  },
  tocLink: {
    display: "block",
    borderLeftWidth: vars.borderWidthHairline,
    borderLeftStyle: "solid",
    borderLeftColor: {
      default: "transparent",
      '[data-active="true"]': "var(--primary)",
    },
    paddingBlock: vars.space4,
    paddingLeft: vars.space12,
    fontSize: vars.fontSizeBody,
    lineHeight: "1.5rem",
    fontWeight: {
      default: vars.fontWeightRegular,
      '[data-active="true"]': vars.fontWeightMedium,
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
    paddingLeft: vars.space24,
  },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space24,
  },
  breadcrumbMuted: {
    color: "var(--muted-foreground)",
  },
  heroBody: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space16,
  },
  heroBadge: {
    borderRadius: vars.radiusFull,
    borderColor: "color-mix(in oklab, var(--border) 80%, transparent)",
    backgroundColor: "color-mix(in oklab, var(--card) 60%, transparent)",
    paddingInline: vars.space12,
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
    fontWeight: vars.fontWeightSemibold,
    letterSpacing: "-0.025em",
    textWrap: "balance",
    color: "var(--foreground)",
  },
  heroDescription: {
    maxInlineSize: "48rem",
    fontSize: {
      default: vars.fontSizeLead,
      "@media (min-width: 640px)": "1.125rem",
    },
    lineHeight: "1.75rem",
    color: "var(--muted-foreground)",
  },
  heroPreview: {
    overflow: "hidden",
    borderRadius: vars.radiusFrame,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: "var(--border)",
    backgroundColor: "color-mix(in oklab, var(--muted) 30%, transparent)",
  },
  neighbors: {
    display: "grid",
    gap: vars.space16,
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 640px)": "repeat(2, minmax(0, 1fr))",
    },
  },
  neighborCard: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    borderRadius: vars.radiusFrame,
    borderWidth: vars.borderWidthHairline,
    borderStyle: "solid",
    borderColor: {
      default: "color-mix(in oklab, var(--border) 70%, transparent)",
      ":hover": "color-mix(in oklab, var(--foreground) 20%, transparent)",
    },
    backgroundColor: "color-mix(in oklab, var(--card) 50%, transparent)",
    padding: vars.space20,
    transitionProperty: "color, background-color, border-color",
    transitionDuration: "150ms",
  },
  neighborCardNext: {
    textAlign: "right",
  },
  neighborLabel: {
    display: "flex",
    alignItems: "center",
    gap: vars.space8,
    fontSize: vars.fontSizeCaption,
    color: "var(--muted-foreground)",
  },
  neighborLabelNext: {
    justifyContent: "flex-end",
  },
  neighborTitle: {
    marginTop: vars.space8,
    fontFamily: "var(--font-heading)",
    fontSize: vars.fontSizeLead,
    fontWeight: vars.fontWeightSemibold,
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
    boxShadow: vars.elevationModal,
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
    borderBottomWidth: vars.borderWidthHairline,
    borderBottomStyle: "solid",
    borderBottomColor: "color-mix(in oklab, var(--border) 70%, transparent)",
    paddingInline: vars.space4,
    paddingBottom: vars.space4,
  },
  searchList: {
    minBlockSize: 0,
    maxBlockSize: "none",
    flexGrow: 1,
    paddingInline: vars.space8,
    paddingBottom: vars.space12,
  },
  searchEmpty: {
    paddingInline: vars.space16,
    paddingBlock: vars.space40,
    fontSize: vars.fontSizeBody,
    color: "var(--muted-foreground)",
  },
  searchGroup: {
    paddingBlock: vars.space4,
  },
  searchItemMeta: {
    marginInlineStart: "auto",
    fontSize: vars.fontSizeCaption,
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
    gap: vars.space8,
    borderBottomWidth: vars.borderWidthHairline,
    borderBottomStyle: "solid",
    borderBottomColor: "color-mix(in oklab, var(--border) 70%, transparent)",
    backgroundColor: "color-mix(in oklab, var(--background) 85%, transparent)",
    paddingInline: vars.space16,
    backdropFilter: "blur(12px)",
  },
  mobileBarSeparator: {
    blockSize: vars.space16,
  },
  mobileBarTitle: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    color: "var(--foreground)",
  },
  main: {
    marginInline: "auto",
    inlineSize: "100%",
    minInlineSize: 0,
    maxInlineSize: MAX_WIDTH,
    flexGrow: 1,
    paddingInline: {
      default: vars.space16,
      "@media (min-width: 640px)": vars.space24,
      "@media (min-width: 1024px)": vars.space40,
    },
    paddingBlock: {
      default: vars.space40,
      "@media (min-width: 1024px)": "3.5rem",
    },
  },
  contentGrid: {
    display: "grid",
    gap: vars.space40,
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 1280px)": "minmax(0, 1fr) 220px",
    },
  },
  article: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space40,
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
    gap: vars.space16,
  },
  notFoundTitle: {
    fontFamily: "var(--font-heading)",
    fontSize: vars.fontSizeTitle,
    fontWeight: vars.fontWeightSemibold,
  },
  notFoundText: {
    color: "var(--muted-foreground)",
  },
  notFoundLink: {
    color: "var(--primary)",
    textDecorationLine: "underline",
  },
  icon: {
    inlineSize: vars.controlIconSizeMd,
    blockSize: vars.controlIconSizeMd,
  },
});
