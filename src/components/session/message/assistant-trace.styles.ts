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

// In-progress todo spinner. Reduced motion holds the glyph still.
const spin = stylex.keyframes({
  from: { transform: "rotate(0deg)" },
  to: { transform: "rotate(360deg)" },
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
  todoProgress: {
    color: `color-mix(in oklch, ${vars.colorTextMuted} 70%, transparent)`,
    fontSize: "0.75em",
    marginLeft: vars.space4,
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
  // Row meta wrapper (elapsed + failure badge).
  stepMeta: {
    alignItems: "center",
    display: "inline-flex",
    gap: "0.35em",
    marginLeft: vars.space4,
  },
  stepElapsed: {
    color: `color-mix(in oklch, ${vars.colorTextMuted} 70%, transparent)`,
    fontSize: "0.75em",
    fontVariantNumeric: "tabular-nums",
  },
  // Todo detail list.
  todoList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  todoItem: {
    alignItems: "flex-start",
    color: vars.colorText,
    display: "flex",
    fontSize: "0.875em",
    gap: vars.space8,
  },
  todoIcon: {
    flexShrink: 0,
    height: 14,
    marginTop: "0.125rem",
    width: 14,
  },
  todoIconDone: {
    color: vars.colorSuccess,
  },
  todoIconActive: {
    animationName: {
      default: spin,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationDuration: "1s",
    animationIterationCount: "infinite",
    animationTimingFunction: "linear",
    color: vars.colorAccent,
  },
  todoIconPending: {
    color: `color-mix(in oklch, ${vars.colorTextMuted} 50%, transparent)`,
  },
  todoTextDone: {
    color: vars.colorTextMuted,
    textDecorationLine: "line-through",
  },
  todoTextActive: {
    color: vars.colorText,
    fontWeight: vars.fontWeightMedium,
  },
  todoTextPending: {
    color: vars.colorTextMuted,
  },
  // Subagent progress bullet list.
  progressList: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space4,
  },
  progressItem: {
    alignItems: "flex-start",
    color: vars.colorTextMuted,
    display: "flex",
    fontSize: "0.875em",
    gap: vars.space8,
  },
  progressDot: {
    backgroundColor: vars.colorBorder,
    borderRadius: vars.radiusFull,
    flexShrink: 0,
    height: 6,
    marginTop: "0.375rem",
    width: 6,
  },
  // Worker execution badge on a subagent row.
  workerBadge: {
    backgroundColor: `color-mix(in oklch, ${vars.colorAccent} 5%, transparent)`,
    borderColor: `color-mix(in oklch, ${vars.colorAccent} 25%, transparent)`,
    borderRadius: vars.radiusFull,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    color: vars.colorTextMuted,
    fontSize: "0.6875rem",
    paddingBlock: "0.125rem",
    paddingInline: vars.space8,
  },
  trailingRow: {
    alignItems: "center",
    display: "inline-flex",
    gap: vars.space8,
  },
  // Reasoning prose.
  reasoningDuration: {
    color: `color-mix(in oklch, ${vars.colorTextMuted} 70%, transparent)`,
    fontSize: "0.85em",
    marginLeft: vars.space4,
  },
  reasoningText: {
    color: vars.colorTextMuted,
    whiteSpace: "pre-wrap",
  },
  // A sub-pixel baseline nudge that drops the animated label onto the icon's
  // cap line.
  reasoningTitle: {
    fontWeight: vars.fontWeightMedium,
    lineHeight: 1,
    position: "relative",
    top: "0.08em",
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
  assistantTextRail: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    marginTop: "0.265em",
    position: "relative",
  },
  assistantTextMarker: {
    alignItems: "center",
    display: "flex",
    height: "1.15em",
    justifyContent: "center",
    width: "1.15em",
  },
  assistantTextDot: {
    backgroundColor: `color-mix(in oklch, ${vars.colorTextMuted} 50%, transparent)`,
    borderRadius: vars.radiusFull,
    height: "0.35em",
    width: "0.35em",
  },
  // The vertical connector line the parent's `:last-child` rule hides — the
  // `cot-connector` class name stays for that cross-component contract.
  assistantTextConnector: {
    backgroundColor: vars.colorBorder,
    flex: 1,
    marginTop: "0.35em",
    width: 1,
  },
  assistantTextBody: {
    flex: 1,
    minWidth: 0,
    paddingBottom: "1em",
  },
  // Subagent title shimmer host publishes its base color for the Shimmer.
  shimmerBaseForeground: {
    "--shimmer-base-color": vars.colorText,
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
