import * as stylex from "@stylexjs/stylex";

import { vars } from "../aui/tokens/tokens.stylex";

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
    animationTimingFunction: vars["--aui-motion-ease-standard"],
    backgroundColor: {
      default: vars["--aui-color-accent"],
      ":hover": vars["--aui-color-accent-hover"],
    },
    blockSize: 28,
    borderColor: vars["--aui-color-accent"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    boxShadow: vars["--aui-elevation-lift"],
    color: vars["--aui-color-accent-text"],
    display: "flex",
    inlineSize: 28,
    justifyContent: "center",
  },
  glyph: { blockSize: 16, inlineSize: 16 },
});
