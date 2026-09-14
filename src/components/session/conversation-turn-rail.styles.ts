import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

// The rail's own reveal easing — an expressive ease-out the ticks and preview
// share so the whole affordance settles as one motion.
const railEase = "cubic-bezier(0.16, 1, 0.3, 1)";

export const conversationTurnRailStyles = stylex.create({
  // Floats over the conversation, so only its own affordances capture pointer
  // events; everything else stays transparent to clicks, drags, and wheel.
  root: {
    height: "min(22.5rem, calc(100% - 4rem))",
    minHeight: "10rem",
    pointerEvents: "none",
    position: "absolute",
    right: vars["--ads-space-8"],
    top: "50%",
    transform: "translateY(-50%)",
    width: "3rem",
  },
  viewport: {
    borderRadius: vars["--ads-radius-full"],
    height: "100%",
    overflowY: "auto",
    overscrollBehavior: "contain",
    paddingBlock: vars["--ads-space-8"],
    scrollbarWidth: "none",
    transitionDuration: {
      default: "150ms",
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    transitionProperty: "background-color, backdrop-filter",
    transitionTimingFunction: railEase,
  },
  viewportVisible: {
    backdropFilter: "blur(12px)",
    backgroundColor: `color-mix(in oklch, ${vars["--ads-color-canvas"]} 60%, transparent)`,
  },
  viewportHidden: {
    backdropFilter: "none",
    backgroundColor: "transparent",
  },
  tickColumn: {
    alignItems: "flex-end",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    minHeight: "100%",
  },
  trigger: {
    alignItems: "center",
    borderRadius: vars["--ads-radius-mark"],
    display: "flex",
    flexShrink: 0,
    height: 24,
    justifyContent: "flex-end",
    pointerEvents: "auto",
    width: 32,
    color: vars["--ads-color-text-muted"],
  },
  tick: {
    backgroundColor: "currentColor",
    display: "block",
    height: 1,
    opacity: 0.7,
    transformOrigin: "right",
    transitionDuration: {
      default: "150ms",
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    transitionProperty: {
      default: "transform, color, opacity",
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    transitionTimingFunction: railEase,
    width: 32,
  },
  tickDisplayed: {
    color: vars["--ads-color-text"],
    opacity: 1,
  },
  tickActive: {
    color: vars["--ads-color-accent"],
    opacity: 1,
  },
  // Bordered popover card, positioned to the left of the tick column. Composes
  // UI_ELEVATION_CLASS.floating at the call site for its shadow.
  preview: {
    borderColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 70%, transparent)`,
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    backgroundColor: vars["--ads-color-surface-raised"],
    color: vars["--ads-color-text"],
    boxShadow: `0 0 0 1px color-mix(in oklch, ${vars["--ads-color-text"]} 10%, transparent)`,
    marginRight: vars["--ads-space-8"],
    padding: vars["--ads-space-12"],
    position: "absolute",
    right: "100%",
    transformOrigin: "right",
    transitionDuration: {
      default: "150ms",
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    transitionProperty: {
      default: "opacity, transform",
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    transitionTimingFunction: railEase,
    width: "20rem",
  },
  previewOpen: {
    opacity: 1,
    pointerEvents: "auto",
    transform: "translateY(-50%) scale(1)",
    visibility: "visible",
  },
  previewClosed: {
    opacity: 0,
    pointerEvents: "none",
    // Reduced motion keeps the card at scale 1 so it simply fades.
    transform: {
      default: "translateY(-50%) scale(0.97)",
      "@media (prefers-reduced-motion: reduce)": "translateY(-50%) scale(1)",
    },
    visibility: "hidden",
  },
  previewBody: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
  },
  previewMeta: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    display: "flex",
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-8"],
  },
  previewMetaIcon: {
    height: 14,
    width: 14,
  },
  previewMetaModel: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  previewText: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
  },
  previewTitle: {
    display: "-webkit-box",
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    lineHeight: "1.25rem",
    overflow: "hidden",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
  },
  previewResponse: {
    color: vars["--ads-color-text-muted"],
    display: "-webkit-box",
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "1.25rem",
    overflow: "hidden",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 3,
  },
  previewHint: {
    color: `color-mix(in oklch, ${vars["--ads-color-text-muted"]} 75%, transparent)`,
    fontSize: vars["--ads-font-size-micro"],
    lineHeight: "1rem",
  },
});
