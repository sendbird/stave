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
    height: "100dvh",
    inset: 0,
    outline: "none",
    position: "fixed",
    width: "100%",
  },
  provider: {
    // The ADS `SidebarProvider` wrapper is `display: contents` by default, so
    // its children collapse into the dialog `Popup`'s own column flow and the
    // sidebar stacks above the content instead of beside it. Re-establish the
    // provider as the sidebar↔content flex row this shell needs; the old
    // `flex items-start` utilities did the same before the migration.
    alignItems: "flex-start",
    display: "flex",
    flexDirection: "row",
    flexGrow: 1,
    height: "100%",
    minHeight: 0,
    overflow: "hidden",
  },
  sidebar: {
    display: {
      default: "none",
      "@media (min-width: 640px)": "flex",
    },
  },
  sidebarContent: {
    paddingTop: vars.space8,
  },
  sidebarSection: {
    paddingBottom: vars.space8,
    paddingInline: vars.space8,
  },
  searchWrap: {
    position: "relative",
  },
  searchIcon: {
    color: vars.colorTextMuted,
    height: vars.controlIconSizeSm,
    insetInlineStart: 10,
    pointerEvents: "none",
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    width: vars.controlIconSizeSm,
  },
  searchInput: {
    height: vars.controlHeightSm,
    paddingInlineEnd: vars.space32,
    paddingInlineStart: vars.space32,
  },
  searchClear: {
    color: vars.colorTextMuted,
    insetInlineEnd: 6,
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
    fontSize: 13,
    height: vars.controlHeightSm,
  },
  menuButtonGap: {
    fontSize: 13,
    gap: vars.space8,
    height: vars.controlHeightSm,
  },
  menuSectionLabel: {
    color: vars.colorTextMuted,
    fontSize: 10,
  },
  currentPill: {
    backgroundColor: vars.colorSurfaceTint,
    borderRadius: vars.radiusMark,
    color: vars.colorTextMuted,
    fontSize: 9,
    fontWeight: vars.fontWeightSemibold,
    letterSpacing: "0.14em",
    paddingBlock: 2,
    paddingInline: 6,
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
    gap: 6,
    justifyContent: "flex-start",
    width: "100%",
  },
  main: {
    backgroundColor: vars.colorCanvas,
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    height: "100%",
    minHeight: 0,
    overflow: "hidden",
  },
  header: {
    alignItems: "center",
    borderBottomColor: vars.colorBorder,
    borderBottomStyle: "solid",
    borderBottomWidth: vars.borderWidthHairline,
    display: "flex",
    flexShrink: 0,
    minHeight: 80,
    paddingBlock: vars.space12,
    paddingInline: {
      default: vars.space16,
      "@media (min-width: 640px)": vars.space32,
    },
  },
  headerMacPad: {
    paddingBottom: {
      default: null,
      "@media (min-width: 640px)": vars.space16,
    },
    paddingTop: {
      default: vars.space40,
      "@media (min-width: 640px)": vars.space16,
    },
  },
  headerDesktop: {
    display: {
      default: "none",
      "@media (min-width: 640px)": "block",
    },
    minWidth: 0,
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
    marginTop: vars.space4,
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
    minWidth: 0,
  },
  headerMobileRow: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
    minWidth: 0,
  },
  mobileBack: {
    flexShrink: 0,
    height: vars.controlHeightMd,
    width: vars.controlHeightMd,
  },
  mobileSelectTrigger: {
    flex: 1,
    height: vars.controlHeightSm,
    minWidth: 0,
  },
  mobileSearchIcon: {
    color: vars.colorTextMuted,
    height: vars.controlIconSizeSm,
    insetInlineStart: 10,
    pointerEvents: "none",
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    width: vars.controlIconSizeSm,
  },
  mobileSearchInput: {
    height: vars.controlHeightSm,
    paddingInlineEnd: vars.space32,
    paddingInlineStart: vars.space32,
  },
  mobileSearchClear: {
    insetInlineEnd: 6,
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
  },
  body: {
    flexGrow: 1,
    minHeight: 0,
    overflow: "auto",
    paddingBlock: vars.space20,
    paddingInline: {
      default: vars.space16,
      "@media (min-width: 640px)": vars.space32,
    },
  },
  bodyInner: {
    maxWidth: "70rem",
    width: "100%",
  },
  icon: {
    height: vars.controlIconSizeMd,
    width: vars.controlIconSizeMd,
  },
});
