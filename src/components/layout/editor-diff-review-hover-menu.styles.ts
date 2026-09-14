import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

/** Matches the `animate-in fade-in-0 zoom-in-95` entrance the menu had. */
const enter = stylex.keyframes({
  from: { opacity: 0, transform: "scale(0.95)" },
  to: { opacity: 1, transform: "scale(1)" },
});

export const diffReviewHoverMenuStyles = stylex.create({
  trigger: {
    alignItems: "center",
    animationDuration: "100ms",
    animationName: { default: enter, "@media (prefers-reduced-motion: reduce)": "none" },
    animationTimingFunction: vars["--ads-motion-ease-standard"],
    backgroundColor: {
      default: vars["--ads-color-accent"],
      ":hover": vars["--ads-color-accent-hover"],
    },
    blockSize: 28,
    borderColor: vars["--ads-color-accent"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    boxShadow: vars["--ads-elevation-lift"],
    color: vars["--ads-color-accent-text"],
    display: "flex",
    inlineSize: 28,
    justifyContent: "center",
  },
  glyph: { blockSize: 16, inlineSize: 16 },
});
