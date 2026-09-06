import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";

export const terminalSurfaceStyles = stylex.create({
  panel: {
    backgroundColor: "var(--terminal)",
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    position: "relative",
  },
  viewport: {
    backgroundColor: "var(--terminal)",
    height: "100%",
    overflow: "hidden",
    position: "relative",
    width: "100%",
  },
  frame: { borderRadius: "inherit", height: "100%", width: "100%" },
  surface: {
    borderRadius: "inherit",
    height: "100%",
    outline: "none",
    width: "100%",
    ':focus-visible': {
      boxShadow: `inset 0 0 0 1px ${vars.colorBorderFocus}`,
    },
  },
  dimmed: { opacity: 0.6 },
});

/** Compiled integration hooks for terminal hosts that cannot accept xstyle. */
export const TERMINAL_SURFACE_PANEL_CLASS_NAME = sx(terminalSurfaceStyles.panel);
export const TERMINAL_SURFACE_VIEWPORT_CLASS_NAME = sx(terminalSurfaceStyles.viewport);
export const TERMINAL_SURFACE_FRAME_CLASS_NAME = sx(terminalSurfaceStyles.frame);
export const TERMINAL_SURFACE_CLASS_NAME = sx(terminalSurfaceStyles.surface);
export const TERMINAL_SURFACE_DIMMED_CLASS_NAME = sx(terminalSurfaceStyles.dimmed);

// NOTE: The shell inset padding is intentionally applied to the `.xterm`
// element (see `[data-terminal-surface] > .xterm` in globals.css), NOT to this
// mount container. xterm's fit addon measures the mount container's height and
// only subtracts padding it finds on `.xterm` itself, so padding here would
// size the terminal too tall and clip the bottom rows under `overflow-hidden`.
