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
    backgroundColor: vars["--ads-color-canvas"],
    inset: 0,
    outline: "none",
    position: "fixed",
  },
  popup: {
    backgroundColor: vars["--ads-color-canvas"],
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
    paddingBlockStart: vars["--ads-space-8"],
  },
  sidebarSection: {
    paddingBlockEnd: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-8"],
  },
  searchWrap: {
    position: "relative",
  },
  searchIcon: {
    color: vars["--ads-color-text-muted"],
    blockSize: vars["--ads-control-icon-size-sm"],
    insetInlineStart: vars["--ads-space-8"],
    pointerEvents: "none",
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    inlineSize: vars["--ads-control-icon-size-sm"],
  },
  searchInput: {
    minBlockSize: vars["--ads-control-height-sm"],
    paddingInlineEnd: vars["--ads-space-32"],
    paddingInlineStart: vars["--ads-space-32"],
  },
  searchClear: {
    color: vars["--ads-color-text-muted"],
    insetInlineEnd: vars["--ads-space-8"],
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
  },
  groupLabel: {
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-medium"],
    letterSpacing: "0.18em",
    textTransform: "uppercase",
  },
  menuButton: {
    fontSize: vars["--ads-font-size-body"],
    minBlockSize: vars["--ads-control-height-sm"],
  },
  menuButtonGap: {
    fontSize: vars["--ads-font-size-body"],
    gap: vars["--ads-space-8"],
    minBlockSize: vars["--ads-control-height-sm"],
  },
  menuSectionLabel: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
  },
  currentPill: {
    backgroundColor: vars["--ads-color-surface-tint"],
    borderRadius: vars["--ads-radius-mark"],
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "0.14em",
    paddingBlock: vars["--ads-space-2"],
    paddingInline: vars["--ads-space-4"],
    textTransform: "uppercase",
  },
  currentPillActive: {
    color: "var(--sidebar-primary)",
  },
  emptyResults: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-control"],
    paddingBlock: vars["--ads-space-24"],
    paddingInline: vars["--ads-space-16"],
  },
  backButton: {
    gap: vars["--ads-space-8"],
    justifyContent: "flex-start",
    inlineSize: "100%",
  },
  main: {
    backgroundColor: vars["--ads-color-canvas"],
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    blockSize: "100%",
    minBlockSize: 0,
    overflow: "hidden",
  },
  header: {
    alignItems: "center",
    borderBottomColor: vars["--ads-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexShrink: 0,
    minBlockSize: "5rem",
    paddingBlock: vars["--ads-space-12"],
    paddingInline: {
      default: vars["--ads-space-16"],
      "@media (min-width: 640px)": vars["--ads-space-32"],
    },
  },
  headerMacPad: {
    paddingBlockEnd: {
      default: null,
      "@media (min-width: 640px)": vars["--ads-space-16"],
    },
    paddingBlockStart: {
      default: vars["--ads-space-40"],
      "@media (min-width: 640px)": vars["--ads-space-16"],
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
    gap: vars["--ads-space-8"],
  },
  eyebrow: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  breadcrumbSep: {
    color: vars["--ads-color-text-muted"],
  },
  headerTitle: {
    color: vars["--ads-color-text"],
    fontFamily: vars["--ads-font-sans"],
    fontSize: vars["--ads-font-size-lead"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "-0.015em",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  headerDescription: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    marginBlockStart: vars["--ads-space-4"],
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
    gap: vars["--ads-space-8"],
    minInlineSize: 0,
  },
  headerMobileRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
    minInlineSize: 0,
  },
  mobileBack: {
    flexShrink: 0,
    blockSize: vars["--ads-control-height-md"],
    inlineSize: vars["--ads-control-height-md"],
  },
  mobileSelectTrigger: {
    flex: 1,
    minBlockSize: vars["--ads-control-height-sm"],
    minInlineSize: 0,
  },
  mobileSearchIcon: {
    color: vars["--ads-color-text-muted"],
    blockSize: vars["--ads-control-icon-size-sm"],
    insetInlineStart: vars["--ads-space-8"],
    pointerEvents: "none",
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    inlineSize: vars["--ads-control-icon-size-sm"],
  },
  mobileSearchInput: {
    minBlockSize: vars["--ads-control-height-sm"],
    paddingInlineEnd: vars["--ads-space-32"],
    paddingInlineStart: vars["--ads-space-32"],
  },
  mobileSearchClear: {
    insetInlineEnd: vars["--ads-space-8"],
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
  },
  body: {
    flexGrow: 1,
    minBlockSize: 0,
    overflow: "auto",
    paddingBlock: vars["--ads-space-20"],
    paddingInline: {
      default: vars["--ads-space-16"],
      "@media (min-width: 640px)": vars["--ads-space-32"],
    },
  },
  bodyInner: {
    inlineSize: "100%",
    maxInlineSize: "70rem",
  },
  icon: {
    blockSize: vars["--ads-control-icon-size-md"],
    inlineSize: vars["--ads-control-icon-size-md"],
  },
});
