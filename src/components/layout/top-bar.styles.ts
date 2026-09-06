import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

/**
 * Top bar chrome. The header itself is the macOS drag region, so its geometry
 * (height, padding, the no-drag islands inside it) is behavioral, not
 * decorative — keep the measurements literal rather than re-deriving them.
 */
export const topBarStyles = stylex.create({
  header: {
    alignItems: "center",
    backgroundColor: vars.colorSurface,
    borderBottomColor: vars.colorBorderSubtle,
    borderBottomStyle: "solid",
    borderBottomWidth: vars.borderWidthHairline,
    display: "flex",
    gap: vars.space12,
    height: "3rem",
    justifyContent: "space-between",
    paddingInline: "0.875rem",
    position: "relative",
    zIndex: vars.zIndexAppChrome,
  },
  lead: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars.space8,
    minWidth: 0,
  },
  sidebarToggle: {
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorOverlayHover,
    },
    borderRadius: vars.radiusControl,
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
    flexShrink: 0,
    height: 28,
    padding: 0,
    width: 28,
  },
  pathGroup: { alignItems: "center", display: "flex", minWidth: 0 },
  pathChip: {
    alignItems: "center",
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorderSubtle,
    borderEndStartRadius: vars.radiusControl,
    borderInlineEndWidth: 0,
    borderStartStartRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorTextMuted,
    display: "inline-flex",
    fontSize: vars.fontSizeCaption,
    gap: vars.space8,
    height: 28,
    maxWidth: 220,
    paddingInline: "0.625rem",
  },
  pathIcon: { flexShrink: 0, height: 14, width: 14 },
  pathLabel: {
    fontFamily: vars.fontMono,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  pathMenuTrigger: {
    alignItems: "center",
    backgroundColor: {
      default: vars.colorCanvas,
      ":hover": vars.colorOverlayHover,
    },
    borderColor: vars.colorBorderSubtle,
    borderEndEndRadius: vars.radiusControl,
    borderStartEndRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: { default: vars.colorTextSubtle, ":hover": vars.colorText },
    display: "flex",
    height: 28,
    justifyContent: "center",
    padding: 0,
    width: 28,
  },
  pathMenu: { minWidth: 184 },
  gitGraphButton: {
    backgroundColor: {
      default: vars.colorCanvas,
      ":hover": vars.colorOverlayHover,
    },
    borderColor: vars.colorBorderSubtle,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: { default: vars.colorTextMuted, ":hover": vars.colorText },
    flexShrink: 0,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightRegular,
    gap: 6,
    height: 28,
    paddingInline: "0.625rem",
  },
  trail: {
    alignItems: "center",
    display: "flex",
    flex: 1,
    gap: vars.space8,
    justifyContent: "flex-end",
    minWidth: 0,
  },
  // The file search only earns its width on a wide window; below `lg` the slot
  // collapses entirely rather than competing with the action cluster.
  searchSlot: {
    display: { default: "none", "@media (min-width: 64rem)": "flex" },
    flex: 1,
    justifyContent: "flex-end",
    minWidth: 0,
  },
  windowControls: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: 6,
  },
});
