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
    animationTimingFunction: vars.motionEaseStandard,
    backgroundColor: {
      default: vars.colorAccent,
      ":hover": vars.colorAccentHover,
    },
    blockSize: 28,
    borderColor: vars.colorAccent,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    boxShadow: vars.elevationLift,
    color: vars.colorAccentText,
    display: "flex",
    inlineSize: 28,
    justifyContent: "center",
  },
  glyph: { blockSize: 16, inlineSize: 16 },
});
