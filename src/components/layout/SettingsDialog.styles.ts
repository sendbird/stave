import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

/**
 * Styles for the fullscreen Settings dialog shell.
 *
 * The left navigation is the AUI AppShell `Sidebar`, which owns its own
 * palette; the reverted revision re-skinned it with product `--sidebar-*`
 * utility classes. Those color overrides were cosmetic drift over the AUI
 * default and are dropped here.
 */
export const settingsDialogStyles = stylex.create({
  backdrop: {
    backgroundColor: vars["--aui-color-canvas"],
    inset: 0,
    outline: "none",
    position: "fixed",
  },
  popup: {
    backgroundColor: vars["--aui-color-canvas"],
    display: "flex",
    flexDirection: "column",
    blockSize: "100dvh",
    inset: 0,
    outline: "none",
    position: "fixed",
    inlineSize: "100%",
  },
  provider: {
    // The AUI `SidebarProvider` wrapper is `display: contents` by default, so
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
    paddingBlockStart: vars["--aui-space-8"],
  },
  sidebarSection: {
    paddingBlockEnd: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-8"],
  },
  searchWrap: {
    position: "relative",
  },
  searchIcon: {
    color: vars["--aui-color-text-muted"],
    blockSize: vars["--aui-control-icon-size-sm"],
    insetInlineStart: vars["--aui-space-8"],
    pointerEvents: "none",
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    inlineSize: vars["--aui-control-icon-size-sm"],
  },
  searchInput: {
    minBlockSize: vars["--aui-control-height-sm"],
    paddingInlineEnd: vars["--aui-space-32"],
    paddingInlineStart: vars["--aui-space-32"],
  },
  searchClear: {
    color: vars["--aui-color-text-muted"],
    insetInlineEnd: vars["--aui-space-8"],
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
  },
  groupLabel: {
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    letterSpacing: "0.14em",
    lineHeight: "15px",
    textTransform: "uppercase",
  },
  menuButton: {
    fontSize: vars["--aui-font-size-body"],
    minBlockSize: vars["--aui-control-height-sm"],
  },
  menuSectionLabel: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
  },
  emptyResults: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-control"],
    paddingBlock: vars["--aui-space-24"],
    paddingInline: vars["--aui-space-16"],
  },
  backButton: {
    gap: vars["--aui-space-8"],
    justifyContent: "flex-start",
    inlineSize: "100%",
  },
  main: {
    backgroundColor: vars["--aui-color-canvas"],
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    blockSize: "100%",
    minBlockSize: 0,
    overflow: "hidden",
  },
  header: {
    alignItems: "center",
    borderBottomColor: vars["--aui-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexShrink: 0,
    minBlockSize: "5rem",
    paddingBlock: vars["--aui-space-12"],
    paddingInline: {
      default: vars["--aui-space-16"],
      "@media (min-width: 640px)": vars["--aui-space-32"],
    },
  },
  // A page with tabs: the tab strip under the header draws the rule.
  headerAboveTabs: {
    borderBottomWidth: 0,
  },
  headerMacPad: {
    paddingBlockEnd: {
      default: null,
      "@media (min-width: 640px)": vars["--aui-space-16"],
    },
    paddingBlockStart: {
      default: vars["--aui-space-40"],
      "@media (min-width: 640px)": vars["--aui-space-16"],
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
    gap: vars["--aui-space-8"],
  },
  eyebrow: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-semibold"],
    letterSpacing: "0.1em",
    lineHeight: "16px",
    textTransform: "uppercase",
  },
  breadcrumbSep: {
    color: vars["--aui-color-text-muted"],
  },
  headerTitle: {
    color: vars["--aui-color-text"],
    fontFamily: vars["--aui-font-sans"],
    fontSize: vars["--aui-font-size-lead"],
    fontWeight: vars["--aui-font-weight-semibold"],
    letterSpacing: "-0.015em",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  headerDescription: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
    marginBlockStart: vars["--aui-space-4"],
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
    gap: vars["--aui-space-8"],
    minInlineSize: 0,
  },
  headerMobileRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
    minInlineSize: 0,
  },
  mobileBack: {
    flexShrink: 0,
    blockSize: vars["--aui-control-height-md"],
    inlineSize: vars["--aui-control-height-md"],
  },
  mobileSelectTrigger: {
    flex: 1,
    minBlockSize: vars["--aui-control-height-sm"],
    minInlineSize: 0,
  },
  mobileSearchIcon: {
    color: vars["--aui-color-text-muted"],
    blockSize: vars["--aui-control-icon-size-sm"],
    insetInlineStart: vars["--aui-space-8"],
    pointerEvents: "none",
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    inlineSize: vars["--aui-control-icon-size-sm"],
  },
  mobileSearchInput: {
    minBlockSize: vars["--aui-control-height-sm"],
    paddingInlineEnd: vars["--aui-space-32"],
    paddingInlineStart: vars["--aui-space-32"],
  },
  mobileSearchClear: {
    insetInlineEnd: vars["--aui-space-8"],
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
  },
  // Results under the narrow search input scroll on their own, so a broad
  // query cannot push the setting it opens out of the window.
  mobileResults: {
    maxBlockSize: "min(40dvh, 20rem)",
    minInlineSize: 0,
    overflowY: "auto",
  },
  body: {
    flexGrow: 1,
    minBlockSize: 0,
    overflow: "auto",
    paddingBlock: vars["--aui-space-20"],
    paddingInline: {
      default: vars["--aui-space-16"],
      "@media (min-width: 640px)": vars["--aui-space-32"],
    },
  },
  bodyInner: {
    inlineSize: "100%",
    maxInlineSize: "70rem",
  },
  icon: {
    blockSize: vars["--aui-control-icon-size-md"],
    inlineSize: vars["--aui-control-icon-size-md"],
  },
});
