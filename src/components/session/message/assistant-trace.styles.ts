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
  // Shared "target" chip — the file, command, pattern, or URL a step acted on.
  // One mono treatment for every kind so a trace column reads as a single list
  // of targets instead of four competing chip styles.
  targetChip: {
    alignItems: "center",
    backgroundColor: `color-mix(in oklch, ${vars.colorSurfaceTint} 80%, transparent)`,
    borderRadius: vars.radiusPanel,
    color: vars.colorTextMuted,
    display: "inline-flex",
    fontFamily: vars.fontMono,
    fontSize: "0.85em",
    gap: vars.space4,
    lineHeight: 1,
    marginLeft: vars.space4,
    maxWidth: "42rem",
    overflow: "hidden",
    paddingBlock: vars.space4,
    paddingInline: "0.625rem",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  chipIcon: {
    flexShrink: 0,
    height: "0.85em",
    width: "0.85em",
  },
  // Plain-text summary chip (no card), dimmer than the target chip.
  textSummary: {
    color: `color-mix(in oklch, ${vars.colorTextMuted} 70%, transparent)`,
    display: "inline-block",
    marginLeft: vars.space4,
    maxWidth: "42rem",
    overflow: "hidden",
    fontSize: "0.75em",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  // Subagent type chip — a soft accent pill.
  subagentChip: {
    backgroundColor: `color-mix(in oklch, ${vars.colorAccent} 10%, transparent)`,
    borderRadius: vars.radiusMark,
    color: vars.colorAccent,
    fontSize: "0.85em",
    fontWeight: vars.fontWeightMedium,
    lineHeight: 1,
    marginLeft: vars.space4,
    paddingBlock: "0.125rem",
    paddingInline: 6,
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
    color: vars.colorSuccess,
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars.fontWeightMedium,
  },
  diffRemoved: {
    color: vars.colorDanger,
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
    paddingBottom: "1em",
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
    display: "flex",
    flexDirection: "column",
    gap: 6,
    opacity: 0.5,
  },
  spacedTop: {
    marginTop: vars.space16,
  },
});
