import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/**
 * Styles for the dockview pane tab chip. Every `sx(...)` result computed from
 * these declarations is referentially stable, so values read into the Zustand
 * row-local selector (see `providerToneStyles` in the component) keep a stable
 * class string across renders.
 */
export const paneTabChipStyles = stylex.create({
  icon: {
    color: vars["--ads-color-text-muted"],
    height: 16,
    width: 16,
  },
  mutedColor: {
    color: vars["--ads-color-text-muted"],
  },
  faviconImage: {
    borderRadius: vars["--ads-radius-mark"],
    height: 16,
    objectFit: "contain",
    width: 16,
  },
  cliIconWrap: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    height: 20,
    justifyContent: "center",
    position: "relative",
    width: 20,
  },
  cliIconBadge: {
    backgroundColor: vars["--ads-color-canvas"],
    borderRadius: vars["--ads-radius-mark"],
    color: vars["--ads-color-text-muted"],
    height: 10,
    insetBlockEnd: -2,
    insetInlineEnd: -2,
    position: "absolute",
    width: 10,
  },
  taskIconWrap: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    height: 20,
    justifyContent: "center",
    width: 20,
  },
  dirtyDot: {
    backgroundColor: vars["--ads-color-accent"],
    borderRadius: vars["--ads-radius-full"],
    flexShrink: 0,
    height: 8,
    width: 8,
  },
  statusBadge: {
    borderRadius: vars["--ads-radius-mark"],
    fontSize: vars["--ads-font-size-micro"],
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  root: {
    alignItems: "center",
    display: "flex",
    gap: 6,
    height: "100%",
    minWidth: 0,
    paddingInline: vars["--ads-space-8"],
    // Published so the close affordance can reveal itself on hover/focus
    // without a `group-hover` utility (StyleX has no group variant).
    "--pane-close-reveal": {
      default: "0",
      ":hover": "1",
      ":focus-within": "1",
    },
  },
  renameInput: {
    fontSize: vars["--ads-font-size-caption"],
    height: 20,
    minWidth: 0,
    paddingInline: vars["--ads-space-4"],
    width: 128,
  },
  title: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    maxWidth: 192,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  pinIcon: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    height: 12,
    width: 12,
  },
  closeButton: {
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--ads-color-overlay-hover"],
    },
    borderRadius: vars["--ads-radius-mark"],
    color: {
      default: vars["--ads-color-text-muted"],
      ":hover": vars["--ads-color-text"],
    },
    display: "flex",
    flexShrink: 0,
    height: 20,
    justifyContent: "center",
    width: 20,
  },
  closeVisible: {
    opacity: 1,
  },
  closeHidden: {
    // Opacity is animated by `transition.control` + `motionDurationQuick` on
    // the Button below, which already had to cover this element's colour states
    // as well; the literal here named `opacity` alone and would have replaced
    // that property list, dropping the colour easing and the reduced-motion arm.
    opacity: "var(--pane-close-reveal, 0)",
  },
  /**
   * The host-layout Button now emits the glyph contract, so `ads/styles.css`
   * keeps Lucide's 24px viewport out on its own. That rule is a default for
   * host layout, so this 14px chip size still wins — it stays because a 20px
   * chip action wants a tighter glyph than the 16px control default.
   */
  closeIcon: {
    blockSize: vars["--ads-control-icon-size-sm"],
    inlineSize: vars["--ads-control-icon-size-sm"],
  },
});
