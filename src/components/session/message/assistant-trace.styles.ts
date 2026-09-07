import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

// A row that mounts once as a new trace entry appears. `legacy` agent style
// uses the gentler step-in; the current style uses the springier row-in.
const cotStepIn = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(4px)" },
  to: { opacity: 1, transform: "translateY(0)" },
});

const traceRowIn = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(6px)" },
  to: { opacity: 1, transform: "translateY(0)" },
});

export const assistantTraceStyles = stylex.create({
  // Icon that tracks the surrounding font size (glyphs inside a text run).
  glyphEm: {
    height: "1.15em",
    width: "1.15em",
  },
  diffSummary: {
    alignItems: "center",
    display: "inline-flex",
    fontSize: "0.8em",
    gap: 6,
    lineHeight: 1,
    marginLeft: vars.space4,
  },
  diffFiles: {
    color: `color-mix(in oklch, ${vars.colorTextMuted} 70%, transparent)`,
  },
  diffAdded: {
    color: vars.colorDiffAddedText,
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars.fontWeightMedium,
  },
  diffRemoved: {
    color: vars.colorDiffRemovedText,
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars.fontWeightMedium,
  },
  // Assistant-text bullet row.
  rowMotionLegacy: {
    animationName: {
      default: cotStepIn,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationDuration: "200ms",
    animationTimingFunction: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    // Match the global `animate-cot-step-in` transform-origin.
    transformOrigin: "top",
  },
  rowMotion: {
    animationName: {
      default: traceRowIn,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationDuration: "260ms",
    animationTimingFunction: "var(--ease-agent-spring)",
    transformOrigin: "top",
  },
  assistantTextRow: {
    color: vars.colorTextMuted,
    display: "flex",
    fontSize: "0.875em",
    gap: "0.7em",
  },
  /**
   * Host geometry composed onto ADS `StepRail.Step`. Type and ink only: the
   * gutter grid, the connector and the trailing pad belong to the rail, and
   * re-declaring `display` here would replace its grid and drop the gutter
   * track the row is indented against.
   */
  railStep: {
    fontSize: "0.875em",
  },

  assistantTextBody: {
    flex: 1,
    minWidth: 0,
    paddingBottom: vars.space8,
  },
  // Empty-state and stacking spacers.
  noResponse: {
    color: vars.colorTextMuted,
    fontSize: "0.875em",
    fontStyle: "italic",
  },
  block: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
  },
  blockTight: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  interim: {
    color: vars.colorTextMuted,
    display: "flex",
    flexDirection: "column",
    gap: vars.space8,
    opacity: 0.5,
  },
  spacedTop: {
    marginTop: vars.space12,
  },
});
