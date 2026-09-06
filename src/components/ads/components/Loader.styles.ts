import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

const spin = stylex.keyframes({ to: { transform: "rotate(360deg)" } });
const spinnerDash = stylex.keyframes({
  "0%": { strokeDasharray: "0.02 1.15", strokeDashoffset: 0 },
  "50%": { strokeDasharray: "0.7 1.15", strokeDashoffset: -0.1 },
  "100%": { strokeDasharray: "0.7 1.15", strokeDashoffset: -0.96 },
});
const dotWave = stylex.keyframes({
  "0%, 62%, 100%": { opacity: 0.32, transform: "translateY(0)" },
  "31%": { opacity: 1, transform: "translateY(-2px)" },
});
const matrixPulse = stylex.keyframes({
  "0%, 18%, 100%": { opacity: 0.32, transform: "scale(0.68)" },
  "44%": { opacity: 1, transform: "scale(1)" },
  "68%": { opacity: 0.52, transform: "scale(0.82)" },
});
const pulse = stylex.keyframes({
  "0%, 100%": { opacity: 0.36, transform: "scaleY(0.4)" },
  "50%": { opacity: 1, transform: "scaleY(1)" },
});
const step = stylex.keyframes({
  "0%, 22%": { opacity: 1, transform: "scale(1)" },
  "48%, 100%": { opacity: 0.32, transform: "scale(0.8)" },
});
const ripple = stylex.keyframes({
  "0%": { opacity: 0, transform: "scale(0.25)" },
  "24%": { opacity: 0.88 },
  "78%": { opacity: 0.18 },
  "100%": { opacity: 0, transform: "scale(1)" },
});
const signal = stylex.keyframes({
  "0%, 64%, 100%": { opacity: 0.3, transform: "scaleY(0.72)" },
  "32%": { opacity: 1, transform: "scaleY(1)" },
});
const scan = stylex.keyframes({
  "0%": { opacity: 0, transform: "translateY(-260%)" },
  "18%, 82%": { opacity: 1 },
  "100%": { opacity: 0, transform: "translateY(260%)" },
});
const parallel = stylex.keyframes({
  from: { opacity: 0.38, transform: "translateX(0)" },
  "45%, 55%": { opacity: 1 },
  to: { opacity: 0.38, transform: "translateX(257%)" },
});

const loopAnimation = {
  animationDuration: vars.motionDurationLoop,
  animationFillMode: "both",
  animationIterationCount: "infinite",
  animationTimingFunction: vars.motionEaseInOut,
} as const;

export const loaderMarkStyles = stylex.create({
  mark: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    justifyContent: "center",
    overflow: "hidden",
  },
  spinner: {
    animationDuration: vars.motionDurationLoop,
    animationIterationCount: "infinite",
    animationName: {
      default: spin,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationTimingFunction: "linear",
    // The mark owns a stable status slot; the arc is optically inset so it
    // reads like a 16px inline indicator beside caption text at the default
    // 20px size instead of filling the whole slot.
    blockSize: "75%",
    inlineSize: "75%",
    overflow: "visible",
  },
  spinnerArc: {
    animationDuration: vars.motionDurationLoop,
    animationIterationCount: "infinite",
    animationName: {
      default: spinnerDash,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationTimingFunction: vars.motionEaseInOut,
    fill: "none",
    stroke: "currentColor",
    // Dashboard's default spinner uses a 3px stroke at 24px. The matching ADS
    // ring token keeps that ratio as the SVG scales with every Loader size.
    strokeDasharray: "0.28 1.15",
    strokeLinecap: "round",
    strokeWidth: vars.ringWidthMd,
    transformOrigin: "center",
  },
  dots: { gap: 2 },
  dot: {
    ...loopAnimation,
    animationName: {
      default: dotWave,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    backgroundColor: "currentColor",
    borderRadius: vars.radiusFull,
    opacity: {
      default: null,
      "@media (prefers-reduced-motion: reduce)": 0.64,
    },
  },
  matrix: {
    alignContent: "center",
    display: "grid",
    // A 1px optical grid is the smallest interval that keeps 16 marks legible
    // in the 16px AI status slot. It is geometry, not layout spacing.
    gap: 1,
    gridTemplateColumns: "repeat(4, auto)",
    justifyContent: "center",
  },
  matrixDot: {
    ...loopAnimation,
    animationDuration: vars.motionDurationLoopSlow,
    animationName: {
      default: matrixPulse,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    backgroundColor: "currentColor",
    borderRadius: vars.radiusFull,
    opacity: {
      default: null,
      "@media (prefers-reduced-motion: reduce)": 0.64,
    },
  },
  pulse: { gap: 2 },
  pulseBar: {
    ...loopAnimation,
    animationName: {
      default: pulse,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    backgroundColor: "currentColor",
    borderRadius: vars.radiusFull,
    transformOrigin: "center",
  },
  steps: { gap: 1 },
  step: {
    ...loopAnimation,
    animationName: {
      default: step,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    backgroundColor: "currentColor",
    borderRadius: vars.radiusMark,
    opacity: {
      default: null,
      "@media (prefers-reduced-motion: reduce)": 0.64,
    },
  },
  orbit: { position: "relative" },
  orbitRail: {
    borderColor: "currentColor",
    borderRadius: vars.radiusFull,
    borderStyle: "solid",
    borderWidth: vars.ringWidthSm,
    insetBlock: "14%",
    insetInline: "14%",
    opacity: 0.2,
    position: "absolute",
  },
  orbitMotion: {
    animationDuration: vars.motionDurationLoopSlow,
    animationIterationCount: "infinite",
    animationName: {
      default: spin,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationTimingFunction: "linear",
    insetBlock: "14%",
    insetInline: "14%",
    position: "absolute",
  },
  orbitPoint: {
    backgroundColor: "currentColor",
    borderRadius: vars.radiusFull,
    insetBlockStart: 0,
    insetInlineStart: "50%",
    position: "absolute",
    transform: "translate(-50%, -50%)",
  },
  orbitPointOpposite: {
    insetBlockEnd: 0,
    insetBlockStart: "auto",
    transform: "translate(-50%, 50%) scale(0.72)",
  },
  orbitCore: {
    backgroundColor: "currentColor",
    blockSize: "20%",
    borderRadius: vars.radiusFull,
    inlineSize: "20%",
    opacity: 0.8,
  },
  ripple: { position: "relative" },
  rippleRing: {
    animationDuration: vars.motionDurationLoopSlow,
    animationIterationCount: "infinite",
    animationName: {
      default: ripple,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationTimingFunction: vars.motionEaseStandard,
    borderColor: "currentColor",
    borderRadius: vars.radiusFull,
    borderStyle: "solid",
    borderWidth: vars.ringWidthSm,
    insetBlock: 1,
    insetInline: 1,
    position: "absolute",
  },
  rippleInner: { animationDelay: "-1200ms", transform: "scale(0.34)" },
  rippleMiddle: { animationDelay: "-600ms", transform: "scale(0.64)" },
  rippleOuter: { animationDelay: "0ms", transform: "scale(0.94)" },
  signal: { alignItems: "flex-end", gap: 1 },
  signalBar: {
    ...loopAnimation,
    animationName: {
      default: signal,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    backgroundColor: "currentColor",
    borderRadius: vars.radiusFull,
    opacity: {
      default: null,
      "@media (prefers-reduced-motion: reduce)": 0.64,
    },
    transformOrigin: "bottom",
  },
  signal1: { blockSize: "34%" },
  signal2: { blockSize: "52%" },
  signal3: { blockSize: "72%" },
  signal4: { blockSize: "92%" },
  scan: { position: "relative" },
  scanFrame: {
    borderColor: "currentColor",
    borderRadius: vars.radiusMark,
    borderStyle: "solid",
    borderWidth: vars.ringWidthSm,
    blockSize: "72%",
    inlineSize: "72%",
    opacity: 0.42,
  },
  scanBeam: {
    animationDuration: vars.motionDurationLoopSlow,
    animationIterationCount: "infinite",
    animationName: {
      default: scan,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationTimingFunction: vars.motionEaseInOut,
    backgroundColor: "currentColor",
    borderRadius: vars.radiusFull,
    inlineSize: "58%",
    position: "absolute",
  },
  parallel: { alignItems: "center", flexDirection: "column", gap: 2 },
  parallelLane: {
    inlineSize: "76%",
    position: "relative",
  },
  parallelRail: {
    backgroundColor: "currentColor",
    blockSize: "100%",
    borderRadius: vars.radiusFull,
    inlineSize: "100%",
    opacity: 0.24,
    position: "absolute",
  },
  parallelRunner: {
    animationDuration: vars.motionDurationLoopSlow,
    animationIterationCount: "infinite",
    animationName: {
      default: parallel,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationTimingFunction: vars.motionEaseInOut,
    backgroundColor: "currentColor",
    blockSize: "100%",
    borderRadius: vars.radiusFull,
    inlineSize: "28%",
    position: "absolute",
  },
  parallelReverse: { animationDirection: "reverse" },
  parallelStart: { transform: "translateX(0)" },
  parallelMiddle: { transform: "translateX(110%)" },
  parallelEnd: { transform: "translateX(220%)" },
  phase0: { animationDelay: "0ms" },
  phase1: { animationDelay: "120ms" },
  phase2: { animationDelay: "240ms" },
  phase3: { animationDelay: "360ms" },
  phase4: { animationDelay: "480ms" },
  phase5: { animationDelay: "600ms" },
  phase6: { animationDelay: "720ms" },
  phase7: { animationDelay: "840ms" },
  xs: { blockSize: 16, inlineSize: 16 },
  sm: { blockSize: 20, inlineSize: 20 },
  md: { blockSize: 24, inlineSize: 24 },
  lg: { blockSize: 32, inlineSize: 32 },
  dotXs: { blockSize: 3, inlineSize: 3 },
  dotSm: { blockSize: 4, inlineSize: 4 },
  dotMd: { blockSize: 5, inlineSize: 5 },
  dotLg: { blockSize: 6, inlineSize: 6 },
  matrixDotXs: { blockSize: 2, inlineSize: 2 },
  matrixDotSm: { blockSize: 3, inlineSize: 3 },
  matrixDotMd: { blockSize: 4, inlineSize: 4 },
  matrixDotLg: { blockSize: 5, inlineSize: 5 },
  pulseBarXs: { blockSize: 12, inlineSize: 2 },
  pulseBarSm: { blockSize: 15, inlineSize: 3 },
  pulseBarMd: { blockSize: 18, inlineSize: 3 },
  pulseBarLg: { blockSize: 24, inlineSize: 4 },
  stepXs: { blockSize: 4, inlineSize: 2 },
  stepSm: { blockSize: 5, inlineSize: 3 },
  stepMd: { blockSize: 6, inlineSize: 4 },
  stepLg: { blockSize: 8, inlineSize: 5 },
  orbitPointXs: { blockSize: 2, inlineSize: 2 },
  orbitPointSm: { blockSize: 3, inlineSize: 3 },
  orbitPointMd: { blockSize: 3, inlineSize: 3 },
  orbitPointLg: { blockSize: 4, inlineSize: 4 },
  signalBarXs: { inlineSize: 2 },
  signalBarSm: { inlineSize: 3 },
  signalBarMd: { inlineSize: 3 },
  signalBarLg: { inlineSize: 4 },
  scanBeamXs: { blockSize: 1 },
  scanBeamSm: { blockSize: 1 },
  scanBeamMd: { blockSize: 2 },
  scanBeamLg: { blockSize: 2 },
  parallelLaneXs: { blockSize: 1 },
  parallelLaneSm: { blockSize: 1 },
  parallelLaneMd: { blockSize: 2 },
  parallelLaneLg: { blockSize: 2 },
});
