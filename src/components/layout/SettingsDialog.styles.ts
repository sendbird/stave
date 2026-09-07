import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/**
 * Styles for the fullscreen Settings dialog shell.
 *
 * The left navigation is the ADS AppShell `Sidebar`, which owns its own
 * palette; the reverted revision re-skinned it with product `--sidebar-*`
 * utility classes. Those color overrides were cosmetic drift over the ADS
 * default and are dropped here. The few product-owned marks that have no ADS
 * token (the search field tint, the "current" pill) read the `--sidebar-*`
 * custom properties from `globals.css`, which is the AppShell sidebar theme
 * contract and an intentional engine-integration hook.
 */
export const settingsDialogStyles = stylex.create({
  backdrop: {
    backgroundColor: vars.colorCanvas,
    inset: 0,
    outline: "none",
    position: "fixed",
  },
  popup: {
    backgroundColor: vars.colorCanvas,
    display: "flex",
    flexDirection: "column",
    blockSize: "100dvh",
    inset: 0,
    outline: "none",
    position: "fixed",
    inlineSize: "100%",
  },
  provider: {
    // The ADS `SidebarProvider` wrapper is `display: contents` by default, so
    // its children collapse into the dialog `Popup`'s own column flow and the
    // sidebar stacks above the content instead of beside it. Re-establish the
    // provider as the sidebar↔content flex row this shell needs; the old
    // `flex items-start` utilities did the same before the migration.
    alignItems: "start",
    display: "flex",
    flexDirection: "row",
    flexGrow: 1,
    blockSize: "100%",
    minBlockSize: 0,
    overflow: "hidden",
  },
  sidebar: {
    display: {
      default: "none",
      "@media (min-width: 640px)": "flex",
    },
  },
  sidebarContent: {
    paddingBlockStart: vars.space8,
  },
  sidebarSection: {
    paddingBlockEnd: vars.space8,
    paddingInline: vars.space8,
  },
  searchWrap: {
    position: "relative",
  },
  searchIcon: {
    color: vars.colorTextMuted,
    blockSize: vars.controlIconSizeSm,
    insetInlineStart: vars.space8,
    pointerEvents: "none",
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    inlineSize: vars.controlIconSizeSm,
  },
  searchInput: {
    minBlockSize: vars.controlHeightSm,
    paddingInlineEnd: vars.space32,
    paddingInlineStart: vars.space32,
  },
  searchClear: {
    color: vars.colorTextMuted,
    insetInlineEnd: vars.space8,
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
  },
  groupLabel: {
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightMedium,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
  },
  menuButton: {
    fontSize: vars.fontSizeBody,
    minBlockSize: vars.controlHeightSm,
  },
  menuButtonGap: {
    fontSize: vars.fontSizeBody,
    gap: vars.space8,
    minBlockSize: vars.controlHeightSm,
  },
  menuSectionLabel: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
  },
  currentPill: {
    backgroundColor: vars.colorSurfaceTint,
    borderRadius: vars.radiusMark,
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightSemibold,
    letterSpacing: "0.14em",
    paddingBlock: vars.space2,
    paddingInline: vars.space4,
    textTransform: "uppercase",
  },
  currentPillActive: {
    color: "var(--sidebar-primary)",
  },
  emptyResults: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightControl,
    paddingBlock: vars.space24,
    paddingInline: vars.space16,
  },
  backButton: {
    gap: vars.space8,
    justifyContent: "flex-start",
    inlineSize: "100%",
  },
  main: {
    backgroundColor: vars.colorCanvas,
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    blockSize: "100%",
    minBlockSize: 0,
    overflow: "hidden",
  },
  header: {
    alignItems: "center",
    borderBottomColor: vars.colorBorder,
    borderBottomStyle: "solid",
    borderBottomWidth: vars.borderWidthHairline,
    display: "flex",
    flexShrink: 0,
    minBlockSize: "5rem",
    paddingBlock: vars.space12,
    paddingInline: {
      default: vars.space16,
      "@media (min-width: 640px)": vars.space32,
    },
  },
  headerMacPad: {
    paddingBlockEnd: {
      default: null,
      "@media (min-width: 640px)": vars.space16,
    },
    paddingBlockStart: {
      default: vars.space40,
      "@media (min-width: 640px)": vars.space16,
    },
  },
  headerDesktop: {
    display: {
      default: "none",
      "@media (min-width: 640px)": "block",
    },
    minInlineSize: 0,
  },
  breadcrumbRow: {
    alignItems: "baseline",
    display: "flex",
    gap: vars.space8,
  },
  eyebrow: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeMicro,
    fontWeight: vars.fontWeightSemibold,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  breadcrumbSep: {
    color: vars.colorTextMuted,
  },
  headerTitle: {
    color: vars.colorText,
    fontFamily: vars.fontSans,
    fontSize: vars.fontSizeLead,
    fontWeight: vars.fontWeightSemibold,
    letterSpacing: "-0.015em",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  headerDescription: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    marginBlockStart: vars.space4,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  headerMobile: {
    display: {
      default: "flex",
      "@media (min-width: 640px)": "none",
    },
    flexDirection: "column",
    flexGrow: 1,
    gap: vars.space8,
    minInlineSize: 0,
  },
  headerMobileRow: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
    minInlineSize: 0,
  },
  mobileBack: {
    flexShrink: 0,
    blockSize: vars.controlHeightMd,
    inlineSize: vars.controlHeightMd,
  },
  mobileSelectTrigger: {
    flex: 1,
    minBlockSize: vars.controlHeightSm,
    minInlineSize: 0,
  },
  mobileSearchIcon: {
    color: vars.colorTextMuted,
    blockSize: vars.controlIconSizeSm,
    insetInlineStart: vars.space8,
    pointerEvents: "none",
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    inlineSize: vars.controlIconSizeSm,
  },
  mobileSearchInput: {
    minBlockSize: vars.controlHeightSm,
    paddingInlineEnd: vars.space32,
    paddingInlineStart: vars.space32,
  },
  mobileSearchClear: {
    insetInlineEnd: vars.space8,
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
  },
  body: {
    flexGrow: 1,
    minBlockSize: 0,
    overflow: "auto",
    paddingBlock: vars.space20,
    paddingInline: {
      default: vars.space16,
      "@media (min-width: 640px)": vars.space32,
    },
  },
  bodyInner: {
    inlineSize: "100%",
    maxInlineSize: "70rem",
  },
  icon: {
    blockSize: vars.controlIconSizeMd,
    inlineSize: vars.controlIconSizeMd,
  },
});
