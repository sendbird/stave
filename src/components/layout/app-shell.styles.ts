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
    backgroundColor: vars["--ads-color-overlay"],
    display: "flex",
    inset: 0,
    justifyContent: "center",
    padding: vars["--ads-space-16"],
    position: "fixed",
  },
  overlayCard: {
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border"],
    boxShadow: vars["--ads-elevation-modal"],
    maxWidth: "28rem",
    padding: vars["--ads-space-24"],
    width: "100%",
  },
  overlayText: { color: vars["--ads-color-text-muted"], fontSize: vars["--ads-font-size-body"] },

  root: {
    backgroundColor: vars["--ads-color-canvas"],
    color: vars["--ads-color-text"],
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
    backgroundColor: vars["--ads-color-surface"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-full"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    boxShadow: vars["--ads-elevation-overlay"],
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    paddingBlock: vars["--ads-space-4"],
    paddingInline: vars["--ads-space-12"],
  },

  shellRow: { display: "flex", flex: 1, minHeight: 0, minWidth: 0 },

  resizer: {
    [SASH_COLOR]: {
      default: vars["--ads-color-border-subtle"],
      ":hover": vars["--ads-color-accent-soft"],
      ":active": vars["--ads-color-accent"],
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
    backgroundColor: vars["--ads-color-canvas"],
    borderTopLeftRadius: { default: null, [LG]: vars["--ads-radius-panel"] },
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
    color: vars["--ads-color-text-muted"],
    display: "flex",
    fontSize: vars["--ads-font-size-body"],
    height: "100%",
    justifyContent: "center",
  },
  paneHostFrame: { height: "100%", minHeight: 0, position: "relative" },
  paneHostInert: { height: "100%" },

  panelFallback: {
    backgroundColor: vars["--ads-color-surface"],
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    padding: vars["--ads-space-12"],
  },
  panelFallbackFull: {
    backgroundColor: vars["--ads-color-surface"],
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    height: "100%",
    padding: vars["--ads-space-12"],
  },
  desktopPanel: {
    display: { default: "none", [LG]: "block" },
    minHeight: 0,
    minWidth: 0,
  },
  overlayPanel: {
    borderInlineStartColor: vars["--ads-color-border-subtle"],
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: vars["--ads-border-width-hairline"],
    maxWidth: "22rem",
    minHeight: 0,
    minWidth: 0,
    width: "min(22rem, 56vw)",
  },
});
