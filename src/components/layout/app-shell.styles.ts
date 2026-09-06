import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

const LG = "@media (min-width: 64rem)";
const SM = "@media (min-width: 40rem)";

/**
 * The split sash publishes its colour from the 9px hit area it lives in:
 * StyleX conditions only see the element they are declared on, so the
 * former `group-hover:`/`group-active:` reveal travels through a variable
 * instead of a descendant selector. The DOM shape is unchanged.
 */
const SASH_COLOR = "--staveResizerSashColor";

export const appShellStyles = stylex.create({
  overlayFallback: {
    alignItems: "center",
    backgroundColor: vars.colorOverlay,
    display: "flex",
    inset: 0,
    justifyContent: "center",
    padding: vars.space16,
    position: "fixed",
  },
  overlayCard: {
    backgroundColor: vars.colorCanvas,
    borderColor: vars.colorBorder,
    boxShadow: vars.elevationModal,
    maxWidth: "28rem",
    padding: vars.space24,
    width: "100%",
  },
  overlayText: { color: vars.colorTextMuted, fontSize: vars.fontSizeBody },

  root: {
    backgroundColor: vars.colorCanvas,
    color: vars.colorText,
    display: "flex",
    flexDirection: "column",
    height: "100%",
    position: "relative",
    width: "100%",
  },
  zoomHud: {
    insetBlockStart: "4rem",
    insetInlineStart: "50%",
    pointerEvents: "none",
    position: "absolute",
    transform: "translateX(-50%)",
  },
  zoomHudPill: {
    backgroundColor: vars.colorSurface,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusFull,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    boxShadow: vars.elevationOverlay,
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    paddingBlock: vars.space4,
    paddingInline: vars.space12,
  },

  shellRow: { display: "flex", flex: 1, minHeight: 0, minWidth: 0 },

  resizer: {
    [SASH_COLOR]: {
      default: vars.colorBorderSubtle,
      ":hover": vars.colorAccentSoft,
      ":active": vars.colorAccent,
    },
    cursor: "col-resize",
    display: { default: "none", [LG]: "block" },
    flexShrink: 0,
    marginInline: -4,
    position: "relative",
    width: 9,
  },
  resizerSash: {
    backgroundColor: `var(${SASH_COLOR})`,
    insetBlockEnd: 0,
    insetBlockStart: 0,
    insetInlineStart: "50%",
    position: "absolute",
    transform: "translateX(-50%)",
    width: 1,
  },

  appSurface: {
    backgroundColor: vars.colorCanvas,
    borderTopLeftRadius: { default: null, [LG]: vars.radiusPanel },
    display: "flex",
    flex: 1,
    flexDirection: "column",
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
    position: "relative",
    zIndex: 10,
  },
  lensSurfaceRoot: { inset: 0, pointerEvents: "none", position: "fixed" },

  panelRow: {
    display: "flex",
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
  },
  mainColumn: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
  },
  mainSurface: {
    flex: 1,
    minHeight: 0,
    minWidth: { default: 0, [SM]: 420 },
    overflow: "hidden",
  },
  suspenseCenter: {
    alignItems: "center",
    color: vars.colorTextMuted,
    display: "flex",
    fontSize: vars.fontSizeBody,
    height: "100%",
    justifyContent: "center",
  },
  paneHostFrame: { height: "100%", minHeight: 0, position: "relative" },
  paneHostInert: { height: "100%" },

  panelFallback: {
    backgroundColor: vars.colorSurface,
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    padding: vars.space12,
  },
  panelFallbackFull: {
    backgroundColor: vars.colorSurface,
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    height: "100%",
    padding: vars.space12,
  },
  desktopPanel: {
    display: { default: "none", [LG]: "block" },
    minHeight: 0,
    minWidth: 0,
  },
  overlayPanel: {
    borderInlineStartColor: vars.colorBorderSubtle,
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: vars.borderWidthHairline,
    maxWidth: "22rem",
    minHeight: 0,
    minWidth: 0,
    width: "min(22rem, 56vw)",
  },
});
