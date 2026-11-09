import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/**
 * The agent-surface motion vocabulary shared by RunMonitor, ToolRun, Plan,
 * Checkpoint and the scoped Approval. A run is something that happens; at
 * rest these surfaces are flat text and rules, so motion only marks where the
 * work just changed.
 *
 * | Role | Duration | Curve |
 * | --- | --- | --- |
 * | row entrance | `normal` | ease-out, opacity only |
 * | card entrance | `normal` | ease-out, opacity + scale .98 → 1 |
 * | list stagger | 40 → 15ms steps, capped at the sixth (130ms) | — |
 * | reorder glide (`useFlipReorder`) | `emphasis` | strong in-out |
 * | status glyph swap | `quick` | ease-out, scale .7 → 1, no overshoot |
 * | label swap | `quick` | ease-out, in-place fade (new after old) |
 * | current-step highlight | `loop`, once | ease-out tint that fades |
 * | bar draw-in | `emphasis` | ease-out |
 * | state pulse | `loop-fast`, once | ease-out |
 * | active edge flow | `loop`, linear, infinite | — |
 *
 * Host-authored (Stave): the entrance, glyph swap, label swap and highlight
 * are Stave's own design on AUI motion tokens; the stagger, pulse, breathe,
 * flow, bar, live fill and tone roles follow AUI.
 *
 * Rules:
 * - Scale uses the individual `scale` property, never `transform`, so it
 *   composes with a transform the host already owns.
 * - Keyframes run UP to the resting state. The element's own style is the
 *   end state, so the reduced-motion arm only drops `animationName` and the
 *   reader who opted out sees the settled frame at once.
 * - Motion never carries meaning alone: every animated state already has a
 *   shape, a word or a live-region announcement.
 * - Never animate a value the caller did not provide.
 */

/**
 * The FIRST stagger step. Later gaps shrink by 5ms (40, 30, 25, 20, 15), so
 * the cascade reads as one wave rather than a queue.
 */
export const AGENT_STAGGER_STEP_MS = 40;
/** Rows past this index arrive with the sixth (130ms); a long list never waits. */
export const AGENT_STAGGER_CAP = 5;

const fadeIn = stylex.keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const settleIn = stylex.keyframes({
  from: { opacity: 0, scale: "0.98" },
  to: { opacity: 1, scale: "1" },
});

const glyphArrive = stylex.keyframes({
  from: { opacity: 0, scale: "0.7" },
  to: { opacity: 1, scale: "1" },
});

const glyphDepart = stylex.keyframes({
  from: { opacity: 1, scale: "1" },
  to: { opacity: 0, scale: "0.7" },
});

// The new label waits out the first part of the old one's fade, so the two
// words are never both legible in the same cell.
const textArrive = stylex.keyframes({
  "0%": { opacity: 0 },
  "40%": { opacity: 0 },
  "100%": { opacity: 1 },
});

const fadeOut = stylex.keyframes({
  from: { opacity: 1 },
  to: { opacity: 0 },
});

const tintFade = stylex.keyframes({
  from: { opacity: 1 },
  to: { opacity: 0 },
});

const clipReveal = stylex.keyframes({
  from: { clipPath: "inset(0 100% 0 0)" },
  to: { clipPath: "inset(0 0 0 0)" },
});

const fillShine = stylex.keyframes({
  from: { backgroundPosition: "-150% 0" },
  to: { backgroundPosition: "250% 0" },
});

const pulseOnce = stylex.keyframes({
  from: {
    boxShadow: `0 0 0 0 color-mix(in oklab, ${vars["--aui-color-info"]} 38%, transparent)`,
    opacity: 1,
  },
  to: {
    boxShadow: `0 0 0 ${vars["--aui-space-8"]} color-mix(in oklab, ${vars["--aui-color-info"]} 0%, transparent)`,
    opacity: 0,
  },
});

const breatheRing = stylex.keyframes({
  "0%": {
    boxShadow: `0 0 0 0 color-mix(in oklab, ${vars["--aui-color-info"]} 40%, transparent)`,
  },
  "70%": {
    boxShadow: `0 0 0 ${vars["--aui-space-4"]} color-mix(in oklab, ${vars["--aui-color-info"]} 0%, transparent)`,
  },
  "100%": {
    boxShadow: `0 0 0 0 color-mix(in oklab, ${vars["--aui-color-info"]} 0%, transparent)`,
  },
});

const dashFlow = stylex.keyframes({
  from: { strokeDashoffset: 0 },
  to: { strokeDashoffset: -16 },
});

const REDUCED = "@media (prefers-reduced-motion: reduce)";

/**
 * Static stagger steps (0–130ms, gaps 40/30/25/20/15). Static keys rather
 * than a dynamic style so they compose through `sx` (class names only)
 * everywhere, apps included. Was a uniform 35ms × 10 (350ms): item eleven
 * waited longer than the whole entrance takes.
 */
const staggerSteps = stylex.create({
  s0: { animationDelay: "0ms" },
  s1: { animationDelay: "40ms" },
  s2: { animationDelay: "70ms" },
  s3: { animationDelay: "95ms" },
  s4: { animationDelay: "115ms" },
  s5: { animationDelay: "130ms" },
});

const STAGGER_KEYS = [
  staggerSteps.s0,
  staggerSteps.s1,
  staggerSteps.s2,
  staggerSteps.s3,
  staggerSteps.s4,
  staggerSteps.s5,
] as const;

/**
 * The stagger offset for the item at `index` — its arrival rank (see
 * `useArrivalRank`), on shrinking steps, capped at the sixth. Compose after
 * `agentMotion.enter` / `enterCard`.
 */
export function agentStagger(index: number): (typeof STAGGER_KEYS)[number] {
  const step = Math.min(Math.max(Math.floor(index), 0), AGENT_STAGGER_CAP);
  // Host: strict indexed access; `step` is clamped to the table's range.
  return STAGGER_KEYS[step] ?? staggerSteps.s0;
}

export const agentMotion = stylex.create({
  /** A row/step/plate arriving: a plain fade, no travel, on the ease-out. */
  enter: {
    animationDuration: vars["--aui-motion-duration-normal"],
    animationFillMode: "backwards",
    animationName: { default: fadeIn, [REDUCED]: "none" },
    animationTimingFunction: vars["--aui-motion-ease-expressive"],
  },
  /** A card arriving: a fade that settles from 98% scale, anchored at its top. */
  enterCard: {
    animationDuration: vars["--aui-motion-duration-normal"],
    animationFillMode: "backwards",
    animationName: { default: settleIn, [REDUCED]: "none" },
    animationTimingFunction: vars["--aui-motion-ease-expressive"],
    transformOrigin: "50% 0",
  },
  /** The incoming status glyph: grows from 70% while it fades in, no overshoot. */
  glyphIn: {
    animationDuration: vars["--aui-motion-duration-quick"],
    animationFillMode: "backwards",
    animationName: { default: glyphArrive, [REDUCED]: "none" },
    animationTimingFunction: vars["--aui-motion-ease-expressive"],
  },
  /** The outgoing glyph in the same cell, shrinking away. Invisible under reduced motion. */
  glyphOut: {
    animationDuration: vars["--aui-motion-duration-quick"],
    animationFillMode: "forwards",
    animationName: { default: glyphDepart, [REDUCED]: "none" },
    animationTimingFunction: vars["--aui-motion-ease-expressive"],
    opacity: { default: null, [REDUCED]: 0 },
    pointerEvents: "none",
  },
  /** A changed label fading in where the old one stood, after the old one has mostly gone. */
  textIn: {
    animationDuration: vars["--aui-motion-duration-quick"],
    animationFillMode: "backwards",
    animationName: { default: textArrive, [REDUCED]: "none" },
    animationTimingFunction: vars["--aui-motion-ease-expressive"],
  },
  /** The previous label fading out in the same cell. Invisible under reduced motion. */
  textOut: {
    animationDuration: vars["--aui-motion-duration-quick"],
    animationFillMode: "forwards",
    animationName: { default: fadeOut, [REDUCED]: "none" },
    animationTimingFunction: vars["--aui-motion-ease-expressive"],
    opacity: { default: null, [REDUCED]: 0 },
    pointerEvents: "none",
  },
  /** The positioned host of an `AgentHighlight` / `AgentPulse` layer. */
  layerHost: {
    isolation: "isolate",
    position: "relative",
  },
  /**
   * A step that just became current is tinted once and the tint fades out.
   * An absolutely positioned layer (`AgentHighlight`) under the step's
   * content, so remounting it replays the cue. Compose `layerHost` on the
   * step. Reduced motion shows no tint.
   */
  highlight: {
    animationDuration: vars["--aui-motion-duration-loop"],
    animationFillMode: "forwards",
    animationName: { default: tintFade, [REDUCED]: "none" },
    animationTimingFunction: vars["--aui-motion-ease-expressive"],
    backgroundColor: `color-mix(in oklab, ${vars["--aui-color-info"]} 12%, transparent)`,
    borderRadius: "inherit",
    inset: 0,
    opacity: 0,
    pointerEvents: "none",
    position: "absolute",
    // layer-ok: keeps the tint under its own step's content (layerHost isolates it)
    zIndex: -1,
  },
  /**
   * A live determinate fill (the current segment, a running bar) breathing a
   * travelling shine. The fill colour itself still says "current"; reduced
   * motion keeps the colour and drops the travel.
   */
  liveFill: {
    animationDuration: vars["--aui-motion-duration-loop-slow"],
    animationIterationCount: "infinite",
    animationName: { default: fillShine, [REDUCED]: "none" },
    animationTimingFunction: "linear",
    backgroundImage: {
      default: `linear-gradient(90deg, transparent 0%, color-mix(in oklab, ${vars["--aui-color-surface-raised"]} 45%, transparent) 50%, transparent 100%)`,
      [REDUCED]: "none",
    },
    backgroundRepeat: "no-repeat",
    backgroundSize: "60% 100%",
  },
  /**
   * A one-shot ring for a node whose state just changed. Lives on its own
   * absolutely positioned span (`AgentPulse`) so remounting it replays the
   * pulse without touching the host's box-shadow.
   */
  pulse: {
    animationDuration: vars["--aui-motion-duration-loop-fast"],
    animationFillMode: "forwards",
    animationName: { default: pulseOnce, [REDUCED]: "none" },
    animationTimingFunction: vars["--aui-motion-ease-standard"],
    borderRadius: "inherit",
    inset: 0,
    opacity: { default: null, [REDUCED]: 0 },
    pointerEvents: "none",
    position: "absolute",
  },
  /**
   * A live dot (a running checkpoint, an active node's status point) breathing
   * a soft ring. The dot's own fill/outline already says "running"; reduced
   * motion keeps the dot and drops the ring.
   */
  breathe: {
    animationDuration: vars["--aui-motion-duration-loop-slow"],
    animationIterationCount: "infinite",
    animationName: { default: breatheRing, [REDUCED]: "none" },
    animationTimingFunction: vars["--aui-motion-ease-standard"],
  },
  /**
   * The flowing dash on an active path's edge (SVG stroke). The dash pattern
   * itself stays under reduced motion — only the flow stops — and the edge's
   * own colour/weight already says "active".
   */
  flow: {
    animationDuration: vars["--aui-motion-duration-loop"],
    animationIterationCount: "infinite",
    animationName: { default: dashFlow, [REDUCED]: "none" },
    animationTimingFunction: "linear",
    // Mostly ink with short travelling gaps (period 8, two periods per loop),
    // so a flowing solid edge still reads as solid next to a dashed one.
    strokeDasharray: "6 2",
  },
  /**
   * A determinate fill easing to the caller's new value (width + colour),
   * 220ms. Spatial, so it snaps under reduced motion.
   */
  bar: {
    transitionDuration: {
      default: vars["--aui-motion-duration-normal"],
      [REDUCED]: "0ms",
    },
    transitionProperty:
      "inline-size, width, inset-inline-start, left, background-color, flex-grow",
    transitionTimingFunction: vars["--aui-motion-ease-standard"],
  },
  /**
   * A bar drawing in from its start edge on mount (a schedule's actual span,
   * a lane's segment): a clip reveal, so the bar's measured geometry is
   * never scaled. Ease-out, no spring — data does not overshoot.
   */
  barDraw: {
    animationDuration: vars["--aui-motion-duration-emphasis"],
    animationFillMode: "backwards",
    animationName: { default: clipReveal, [REDUCED]: "none" },
    animationTimingFunction: vars["--aui-motion-ease-standard"],
  },
  /**
   * A state change painted in colour (a segment filling, a node retoning),
   * 220ms. Non-spatial, so reduced motion keeps an 80ms fade.
   */
  tone: {
    transitionDuration: {
      default: vars["--aui-motion-duration-normal"],
      [REDUCED]: vars["--aui-motion-duration-micro"],
    },
    transitionProperty:
      "background-color, border-color, color, box-shadow, opacity",
    transitionTimingFunction: vars["--aui-motion-ease-standard"],
  },
});
