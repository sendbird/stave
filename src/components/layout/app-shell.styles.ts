import * as stylex from "@stylexjs/stylex";

import { vars } from "../aui/tokens/tokens.stylex";

const LG = "@media (min-width: 64rem)";
const SM = "@media (min-width: 40rem)";

/**
 * The split sash publishes its colour from the 9px hit area it lives in:
 * StyleX conditions only see the element they are declared on, so the
 * former `group-hover:`/`group-active:` reveal travels through a variable
 * instead of a descendant selector. The DOM shape is unchanged.
 */
const SASH_COLOR = "--staveResizerSashColor";
const SASH_WIDTH = "--staveResizerSashWidth";

export const appShellStyles = stylex.create({
  overlayFallback: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-overlay"],
    display: "flex",
    inset: 0,
    justifyContent: "center",
    padding: vars["--aui-space-16"],
    position: "fixed",
  },

  root: {
    backgroundColor: vars["--aui-color-canvas"],
    color: vars["--aui-color-text"],
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
    backgroundColor: vars["--aui-color-surface"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-full"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    boxShadow: vars["--aui-elevation-overlay"],
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    paddingBlock: vars["--aui-space-4"],
    paddingInline: vars["--aui-space-12"],
  },

  shellRow: { display: "flex", flex: 1, minHeight: 0, minWidth: 0 },

  // At rest the sash is the panel's hairline; under the pointer it thickens
  // to a 3px accent bar, so the 9px hit area announces itself as a handle
  // (`col-resize`, a "double-click to reset" title) before it is dragged.
  resizer: {
    [SASH_COLOR]: {
      default: vars["--aui-color-border-subtle"],
      ":hover": vars["--aui-color-accent"],
      ":active": vars["--aui-color-accent"],
    },
    [SASH_WIDTH]: { default: "1px", ":hover": "3px", ":active": "3px" },
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
    width: `var(${SASH_WIDTH}, 1px)`,
  },

  appSurface: {
    backgroundColor: vars["--aui-color-canvas"],
    display: "flex",
    flex: 1,
    flexDirection: "column",
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
    position: "relative",
    // Stacked on `layers.lensSurface` at the call site: the surface and the
    // Lens root it hosts share one band, so the nested root paints over it.
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
  paneHostFrame: { height: "100%", minHeight: 0, position: "relative" },
  paneHostInert: { height: "100%" },

  panelFallback: {
    backgroundColor: vars["--aui-color-surface"],
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
    padding: vars["--aui-space-12"],
  },
  panelFallbackFull: {
    backgroundColor: vars["--aui-color-surface"],
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
    height: "100%",
    padding: vars["--aui-space-12"],
  },
  desktopPanel: {
    display: { default: "none", [LG]: "block" },
    minHeight: 0,
    minWidth: 0,
  },
  overlayPanel: {
    borderInlineStartColor: vars["--aui-color-border-subtle"],
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: vars["--aui-border-width-hairline"],
    maxWidth: "22rem",
    minHeight: 0,
    minWidth: 0,
    width: "min(22rem, 56vw)",
  },
});
