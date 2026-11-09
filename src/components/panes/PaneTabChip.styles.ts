import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

/**
 * Styles for the dockview pane tab chip. Every `sx(...)` result computed from
 * these declarations is referentially stable, so values read into the Zustand
 * row-local selector (see `toProviderWaveHueClass`) keep a stable
 * class string across renders.
 */
export const paneTabChipStyles = stylex.create({
  icon: {
    color: vars["--aui-color-text-muted"],
    height: 16,
    width: 16,
  },
  mutedColor: {
    color: vars["--aui-color-text-muted"],
  },
  faviconImage: {
    borderRadius: vars["--aui-radius-mark"],
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
    backgroundColor: vars["--aui-color-canvas"],
    borderRadius: vars["--aui-radius-mark"],
    color: vars["--aui-color-text-muted"],
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
    backgroundColor: vars["--aui-color-accent"],
    borderRadius: vars["--aui-radius-full"],
    flexShrink: 0,
    height: 8,
    width: 8,
  },
  statusBadge: {
    borderRadius: vars["--aui-radius-mark"],
    fontSize: vars["--aui-font-size-micro"],
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  root: {
    alignItems: "center",
    display: "flex",
    // The 24px close target carries its own air around a 14px glyph, so the
    // chip's gap is the 4px step: the tab keeps its width.
    gap: vars["--aui-space-4"],
    height: "100%",
    minWidth: 0,
    paddingInline: vars["--aui-space-8"],
    // Published so the close affordance can reveal itself on hover/focus
    // without a `group-hover` utility (StyleX has no group variant).
    "--pane-close-reveal": {
      default: "0",
      ":hover": "1",
      ":focus-within": "1",
    },
  },
  renameInput: {
    fontSize: vars["--aui-font-size-caption"],
    height: 20,
    minWidth: 0,
    paddingInline: vars["--aui-space-4"],
    width: 128,
  },
  title: {
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    maxWidth: 192,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  pinIcon: {
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    height: 12,
    width: 12,
  },
  closeButton: {
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--aui-color-overlay-hover"],
    },
    borderRadius: vars["--aui-radius-mark"],
    color: {
      default: vars["--aui-color-text-muted"],
      ":hover": vars["--aui-color-text"],
    },
    display: "flex",
    flexShrink: 0,
    // A 24px hit area; shown on hover, focus and the active tab.
    height: vars["--aui-space-24"],
    justifyContent: "center",
    width: vars["--aui-space-24"],
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
   * The host-layout Button now emits the glyph contract, so `aui/styles.css`
   * keeps Lucide's 24px viewport out on its own. That rule is a default for
   * host layout, so this 14px chip size still wins — it stays because a 24px
   * chip action wants a tighter glyph than the 16px control default.
   */
  closeIcon: {
    blockSize: vars["--aui-control-icon-size-sm"],
    inlineSize: vars["--aui-control-icon-size-sm"],
  },
});
