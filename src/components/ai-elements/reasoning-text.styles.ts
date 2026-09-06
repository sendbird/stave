import * as stylex from "@stylexjs/stylex";

const easeAgentOut = "cubic-bezier(0.16, 1, 0.3, 1)";

const cascadeChar = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(100%)" },
  to: { opacity: 1, transform: "translateY(0)" },
});

const thinkingPhraseSoft = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(4px)", filter: "blur(4px)" },
  to: { opacity: 1, transform: "translateY(0)", filter: "blur(0)" },
});

export const reasoningTextStyles = stylex.create({
  root: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.4em",
  },
  // `lineHeight: 1.25` gives the clip box room for the full glyph box. A tighter
  // line box makes the cascade's `overflow: hidden` shear descenders off g/y/p.
  anchorGrid: {
    display: "grid",
    lineHeight: 1.25,
  },
  widthAnchor: {
    visibility: "hidden",
    gridColumnStart: 1,
    gridRowStart: 1,
    whiteSpace: "pre",
  },
  bodyCell: {
    gridColumnStart: 1,
    gridRowStart: 1,
    display: "flex",
    alignItems: "center",
  },
  surface: {
    display: "flex",
  },
  surfaceClipped: {
    display: "flex",
    overflow: "hidden",
  },
  surfacePre: {
    display: "flex",
    whiteSpace: "pre",
  },
  cascadeChar: {
    display: "inline-block",
    whiteSpace: "pre",
    animationName: {
      default: cascadeChar,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationDuration: "320ms",
    animationTimingFunction: easeAgentOut,
    animationFillMode: "backwards",
    animationDelay: "calc(var(--cascade-i, 0) * 25ms)",
  },
  swapPhrase: {
    display: "flex",
    animationName: {
      default: thinkingPhraseSoft,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationDuration: "220ms",
    animationTimingFunction: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  },
});
