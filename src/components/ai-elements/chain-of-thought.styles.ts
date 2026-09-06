import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

const EASE_STEP = "cubic-bezier(0.2, 0.8, 0.2, 1)";
const EASE_AGENT_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
const EASE_AGENT_SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)";

/* Local keyframes replacing the global `@utility animate-*` classes. The
   global `cot-step-in` / `cot-content-in` / `trace-*` keyframes remain in
   globals.css because sibling trace components still reference them. */
const cotStepIn = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(4px)" },
  to: { opacity: 1, transform: "translateY(0)" },
});

const cotContentIn = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(-4px)" },
  to: { opacity: 1, transform: "translateY(0)" },
});

const traceReveal = stylex.keyframes({
  from: {
    opacity: 0,
    clipPath: "inset(0 0 100% 0)",
    transform: "translateY(-4px)",
  },
  to: {
    opacity: 1,
    clipPath: "inset(0 0 0 0)",
    transform: "translateY(0)",
  },
});

const traceRowIn = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(6px)" },
  to: { opacity: 1, transform: "translateY(0)" },
});

const thinkingShimmer = stylex.keyframes({
  "0%, 100%": { opacity: 0.5 },
  "50%": { opacity: 1 },
});

const reduced = "@media (prefers-reduced-motion: reduce)";

export const chainOfThoughtStyles = stylex.create({
  root: {
    width: "100%",
  },

  // ── Trigger ──────────────────────────────────────────────────
  trigger: {
    display: "flex",
    width: "100%",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: "0.5em",
    rowGap: "0.3em",
    fontSize: "0.875em",
    color: {
      default: vars.colorTextMuted,
      ":hover": vars.colorText,
    },
    transitionProperty: "color",
    transitionDuration: { default: "150ms", [reduced]: "0ms" },
    transitionTimingFunction: vars.motionEaseStandard,
  },
  streamingLabel: {
    display: "inline-flex",
    minWidth: 0,
    alignItems: "center",
    gap: "0.5em",
    fontWeight: vars.fontWeightMedium,
  },
  streamingLoader: { flexShrink: 0, color: vars.colorText },
  brainIcon: { width: "1.15em", height: "1.15em", flexShrink: 0 },
  completionLabel: {
    flexShrink: 0,
    whiteSpace: "nowrap",
    fontWeight: vars.fontWeightMedium,
  },
  durationLabel: {
    flexShrink: 0,
    fontSize: "0.9em",
    fontVariantNumeric: "tabular-nums",
    color: `color-mix(in oklch, ${vars.colorTextMuted} 70%, transparent)`,
  },
  summary: {
    marginLeft: "auto",
    display: "flex",
    flexShrink: 0,
    alignItems: "center",
    columnGap: "0.6em",
    whiteSpace: "nowrap",
    fontSize: "0.75em",
    color: `color-mix(in oklch, ${vars.colorTextMuted} 70%, transparent)`,
    animationName: { default: cotStepIn, [reduced]: "none" },
    animationDuration: "200ms",
    animationTimingFunction: EASE_STEP,
  },
  summaryItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.3em",
  },
  summaryDivider: { color: vars.colorBorder },
  summaryItemIcon: {
    display: "inline-flex",
    alignItems: "center",
  },
  chevron: {
    width: "1.15em",
    height: "1.15em",
    flexShrink: 0,
    transitionProperty: "transform",
    transitionDuration: { default: "150ms", [reduced]: "0ms" },
    transitionTimingFunction: vars.motionEaseStandard,
  },
  chevronAuto: { marginLeft: "auto" },
  chevronOpen: { transform: "rotate(180deg)" },

  // ── Content container ────────────────────────────────────────
  content: { marginTop: "0.75em" },
  contentLegacyMotion: {
    animationName: { default: cotContentIn, [reduced]: "none" },
    animationDuration: "250ms",
    animationTimingFunction: EASE_STEP,
    transformOrigin: "top",
  },
  contentTraceMotion: {
    animationName: { default: traceReveal, [reduced]: "none" },
    animationDuration: "220ms",
    animationTimingFunction: EASE_AGENT_OUT,
    transformOrigin: "top",
  },

  // ── Streaming thought viewport ───────────────────────────────
  viewport: {
    display: "flex",
    maxHeight: "14em",
    flexDirection: "column",
    justifyContent: "flex-end",
    overflow: "hidden",
    maskImage: "linear-gradient(to bottom, transparent 0, black 2.5em)",
    maskSize: "100% 14em",
    maskPosition: "bottom",
    maskRepeat: "no-repeat",
  },

  // ── Step ─────────────────────────────────────────────────────
  step: {
    display: "flex",
    gap: "0.7em",
    fontSize: "0.875em",
  },
  stepActive: { color: vars.colorText },
  stepDone: { color: vars.colorTextMuted },
  stepPending: {
    color: `color-mix(in oklch, ${vars.colorTextMuted} 50%, transparent)`,
  },
  stepMotionRowLegacy: {
    animationName: { default: cotStepIn, [reduced]: "none" },
    animationDuration: "200ms",
    animationTimingFunction: EASE_STEP,
    transformOrigin: "top",
  },
  stepMotionRowTrace: {
    animationName: { default: traceRowIn, [reduced]: "none" },
    animationDuration: "260ms",
    animationTimingFunction: EASE_AGENT_SPRING,
    transformOrigin: "top",
  },
  iconColumn: {
    position: "relative",
    marginTop: "0.265em",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  connector: {
    marginTop: "0.35em",
    width: 1,
    flex: 1,
    backgroundColor: vars.colorBorder,
  },
  contentColumn: {
    minWidth: 0,
    flex: 1,
    paddingBottom: "1em",
  },
  disclosure: {
    display: "flex",
    alignItems: "center",
    gap: "0.35em",
    textAlign: "left",
  },
  disclosureChevron: {
    width: "0.85em",
    height: "0.85em",
    flexShrink: 0,
    color: `color-mix(in oklch, ${vars.colorTextMuted} 70%, transparent)`,
    transitionProperty: "transform",
    transitionDuration: { default: "150ms", [reduced]: "0ms" },
    transitionTimingFunction: vars.motionEaseStandard,
  },
  disclosureChevronOpen: { transform: "rotate(180deg)" },
  staticRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.35em",
  },
  description: { marginTop: "0.25em", color: vars.colorTextMuted },
  reveal: { marginTop: "0.5em" },
  revealMotionLegacy: {
    animationName: { default: cotStepIn, [reduced]: "none" },
    animationDuration: "200ms",
    animationTimingFunction: EASE_STEP,
    transformOrigin: "top",
  },
  revealMotionTrace: {
    animationName: { default: traceReveal, [reduced]: "none" },
    animationDuration: "220ms",
    animationTimingFunction: EASE_AGENT_OUT,
    transformOrigin: "top",
  },

  // ── Step icons ───────────────────────────────────────────────
  iconBox: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "1.15em",
    height: "1.15em",
  },
  bullet: {
    width: "0.35em",
    height: "0.35em",
    borderRadius: vars.radiusFull,
  },
  bulletActive: { backgroundColor: vars.colorText },
  bulletIdle: {
    backgroundColor: `color-mix(in oklch, ${vars.colorTextMuted} 50%, transparent)`,
  },
  iconChild: {
    display: "inline-flex",
  },
  iconThinking: {
    color: vars.colorText,
    animationName: { default: thinkingShimmer, [reduced]: "none" },
    animationDuration: "2s",
    animationTimingFunction: "ease-in-out",
    animationIterationCount: "infinite",
  },
  iconAgent: { color: vars.colorText },
  iconDone: { color: vars.colorTextMuted },
  iconPending: {
    color: `color-mix(in oklch, ${vars.colorTextMuted} 50%, transparent)`,
  },
  loaderColor: { color: vars.colorText },
  statusIcon: { width: "1.15em", height: "1.15em" },
});
