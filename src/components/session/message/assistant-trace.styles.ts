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
    marginLeft: vars["--ads-space-4"],
  },
  diffFiles: {
    color: `color-mix(in oklch, ${vars["--ads-color-text-muted"]} 70%, transparent)`,
  },
  diffAdded: {
    color: vars["--ads-color-diff-added-text"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--ads-font-weight-medium"],
  },
  diffRemoved: {
    color: vars["--ads-color-diff-removed-text"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--ads-font-weight-medium"],
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
    color: vars["--ads-color-text-muted"],
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

  /**
   * Interim prose on the rail. It carries no object glyph — nothing produced
   * it but the model writing a sentence — and inventing a mark just to fill
   * the column would name a kind this row does not have.
   *
   * What it may not do is start *in* that column. Every other row on this
   * rail (`ToolRun`, `Thinking`, a notice) is `agentSurface.row` plus an
   * `InlineDisclosureIcon`, so its text begins one glyph column in; prose
   * flush to the rail's own edge was the single ragged left edge in the
   * transcript, and it read as though the sentence had escaped the run it
   * belongs to. So the column is reserved and left empty.
   *
   * The inset is that column's own construction rather than a measured
   * constant: `agentSurface.row`'s inline padding, the glyph slot's
   * `controlIconSizeMd` box, and `inlineDisclosure.trigger`'s gap. The
   * trailing pad closes the row on the same edge the triggers do.
   */
  assistantTextBody: {
    flex: 1,
    minWidth: 0,
    paddingBottom: vars["--ads-space-8"],
    paddingInlineEnd: vars["--ads-space-8"],
    paddingInlineStart: `calc(${vars["--ads-space-8"]} + ${vars["--ads-control-icon-size-md"]} + ${vars["--ads-space-8"]})`,
  },
  // Empty-state and stacking spacers.
  noResponse: {
    color: vars["--ads-color-text-muted"],
    fontSize: "0.875em",
    fontStyle: "italic",
  },
  block: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
  },
  blockTight: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  interim: {
    color: vars["--ads-color-text-muted"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    opacity: 0.5,
  },
  spacedTop: {
    marginTop: vars["--ads-space-12"],
  },
});
