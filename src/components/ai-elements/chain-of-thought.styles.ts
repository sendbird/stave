import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

/*
 * This module used to run a private motion vocabulary: three local
 * `cubic-bezier` constants and raw 150/200/220/250/260ms literals. Every one of
 * them is now a token, per the motion table in `docs/design/turn-events.md`.
 *
 * The mapping, and the two judgement calls in it:
 *
 * - `cubic-bezier(0.2, 0.8, 0.2, 1)` and `cubic-bezier(0.16, 1, 0.3, 1)` were
 *   hand-tuned near-duplicates of `motionEaseStandard`
 *   (`cubic-bezier(0.2, 0, 0, 1)`) and `motionEaseExpressive`
 *   (`cubic-bezier(0.22, 1, 0.36, 1)`). They are gone rather than "kept for
 *   fidelity": a curve nobody can tell apart from the token is a fourth copy of
 *   the token that drifts on the next edit.
 * - `cubic-bezier(0.34, 1.56, 0.64, 1)` overshot past 1. The agent-surface
 *   grammar §5 spends its one attention-taking animation on the composer's
 *   working state and names spring overshoot as a thing reduced motion drops,
 *   so an overshoot on *every* trace row was the wrong place for it. It becomes
 *   `motionEaseExpressive` — the same decelerating arrival without the bounce.
 * - 220ms and 260ms round to `motionDurationEmphasis` (250ms) and 200ms to
 *   `motionDurationNormal` (180ms). 150ms and 250ms and the 2s shimmer loop
 *   were already exactly `motionDurationQuick`, `motionDurationEmphasis` and
 *   `motionDurationLoopSlow`.
 *
 * The reduced-motion arms stay on every key: the tokens carry no media query of
 * their own, so dropping the arm here would re-enable the translation the
 * grammar requires be removed.
 */

/*
 * Local keyframes, replacing the global `@utility animate-*` classes. The
 * `cot-*` / `trace-*` keyframes these were named after are gone from
 * `globals.css`; nothing outside this module references them any more, which is
 * why the matching `cot-trace-content` hook was dropped from the content
 * container rather than being given a definition it never had.
 */
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
    transitionDuration: {
      default: vars.motionDurationQuick,
      [reduced]: "0ms",
    },
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
    animationDuration: { default: vars.motionDurationNormal, [reduced]: "0ms" },
    animationTimingFunction: vars.motionEaseStandard,
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
    transitionDuration: {
      default: vars.motionDurationQuick,
      [reduced]: "0ms",
    },
    transitionTimingFunction: vars.motionEaseStandard,
  },
  chevronAuto: { marginLeft: "auto" },
  chevronOpen: { transform: "rotate(180deg)" },

  // ── Content container ────────────────────────────────────────
  content: { marginTop: "0.75em" },
  contentLegacyMotion: {
    animationName: { default: cotContentIn, [reduced]: "none" },
    animationDuration: {
      default: vars.motionDurationEmphasis,
      [reduced]: "0ms",
    },
    animationTimingFunction: vars.motionEaseStandard,
    transformOrigin: "top",
  },
  contentTraceMotion: {
    animationName: { default: traceReveal, [reduced]: "none" },
    animationDuration: {
      default: vars.motionDurationEmphasis,
      [reduced]: "0ms",
    },
    animationTimingFunction: vars.motionEaseExpressive,
    transformOrigin: "top",
  },

  // ── Streaming thought viewport ───────────────────────────────
  /*
   * The cap, the mask band and the live-edge follow now belong to ADS
   * `CappedViewport`; what stays here is the one thing the host owns, the
   * reading measure of the prose inside it.
   */
  viewportBody: {
    minWidth: 0,
  },

  // ── Step ─────────────────────────────────────────────────────
  /*
   * Composed as `xstyle` onto ADS `StepRail.Step`, which owns the gutter grid
   * and the connector, so this key carries type and ink only: re-declaring
   * `display` here would replace the rail's grid with a flex row and drop the
   * gutter track the connector lives in.
   */
  step: {
    fontSize: "0.875em",
  },
  stepActive: { color: vars.colorText },
  stepDone: { color: vars.colorTextMuted },
  stepPending: {
    color: `color-mix(in oklch, ${vars.colorTextMuted} 50%, transparent)`,
  },
  stepMotionRowLegacy: {
    animationName: { default: cotStepIn, [reduced]: "none" },
    animationDuration: { default: vars.motionDurationNormal, [reduced]: "0ms" },
    animationTimingFunction: vars.motionEaseStandard,
    transformOrigin: "top",
  },
  stepMotionRowTrace: {
    animationName: { default: traceRowIn, [reduced]: "none" },
    animationDuration: {
      default: vars.motionDurationEmphasis,
      [reduced]: "0ms",
    },
    animationTimingFunction: vars.motionEaseExpressive,
    transformOrigin: "top",
  },
  contentColumn: {
    minWidth: 0,
  },
  /*
   * `controlHeightSm` on the title row is what puts this row on the same
   * rhythm as the ADS `ToolRun` and `Thinking` rows beside it in the rail.
   */
  disclosure: {
    display: "flex",
    alignItems: "center",
    gap: "0.35em",
    minHeight: vars.controlHeightSm,
    textAlign: "left",
  },
  disclosureChevron: {
    width: "0.85em",
    height: "0.85em",
    flexShrink: 0,
    color: `color-mix(in oklch, ${vars.colorTextMuted} 70%, transparent)`,
    transitionProperty: "transform",
    transitionDuration: {
      default: vars.motionDurationQuick,
      [reduced]: "0ms",
    },
    transitionTimingFunction: vars.motionEaseStandard,
  },
  disclosureChevronOpen: { transform: "rotate(180deg)" },
  staticRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.35em",
    minHeight: vars.controlHeightSm,
  },
  description: { marginTop: "0.25em", color: vars.colorTextMuted },
  reveal: { marginTop: "0.5em" },
  revealMotionLegacy: {
    animationName: { default: cotStepIn, [reduced]: "none" },
    animationDuration: { default: vars.motionDurationNormal, [reduced]: "0ms" },
    animationTimingFunction: vars.motionEaseStandard,
    transformOrigin: "top",
  },
  revealMotionTrace: {
    animationName: { default: traceReveal, [reduced]: "none" },
    animationDuration: {
      default: vars.motionDurationEmphasis,
      [reduced]: "0ms",
    },
    animationTimingFunction: vars.motionEaseExpressive,
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
    animationDuration: vars.motionDurationLoopSlow,
    animationTimingFunction: vars.motionEaseInOut,
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
