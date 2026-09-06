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
    color: vars.colorTextMuted,
    height: 16,
    width: 16,
  },
  mutedColor: {
    color: vars.colorTextMuted,
  },
  faviconImage: {
    borderRadius: vars.radiusMark,
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
    backgroundColor: vars.colorCanvas,
    borderRadius: vars.radiusMark,
    color: vars.colorTextMuted,
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
    backgroundColor: vars.colorAccent,
    borderRadius: vars.radiusFull,
    flexShrink: 0,
    height: 8,
    width: 8,
  },
  statusBadge: {
    borderRadius: vars.radiusMark,
    fontSize: 10,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  root: {
    alignItems: "center",
    display: "flex",
    gap: 6,
    height: "100%",
    minWidth: 0,
    paddingInline: vars.space8,
    // Published so the close affordance can reveal itself on hover/focus
    // without a `group-hover` utility (StyleX has no group variant).
    "--pane-close-reveal": {
      default: "0",
      ":hover": "1",
      ":focus-within": "1",
    },
  },
  renameInput: {
    fontSize: vars.fontSizeCaption,
    height: 20,
    minWidth: 0,
    paddingInline: vars.space4,
    width: 128,
  },
  title: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    maxWidth: 192,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  pinIcon: {
    color: vars.colorTextMuted,
    flexShrink: 0,
    height: 12,
    width: 12,
  },
  closeButton: {
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorOverlayHover,
    },
    borderRadius: vars.radiusMark,
    color: {
      default: vars.colorTextMuted,
      ":hover": vars.colorText,
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
    opacity: "var(--pane-close-reveal, 0)",
    transitionDuration: "150ms",
    transitionProperty: "opacity",
  },
  closeIcon: {
    height: 14,
    width: 14,
  },
});
