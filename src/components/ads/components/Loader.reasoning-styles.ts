import * as stylex from "@stylexjs/stylex";
import { vars } from "../tokens/tokens.stylex";

// reason: one 2000ms timeline. Node → its line → the spine to the next node,
// three times, a short hold, then the whole trace fades and starts over.
const firstNode = stylex.keyframes({
  "0%": { opacity: 0.3 },
  "8%, 86%": { opacity: 1 },
  "100%": { opacity: 0.3 },
});
const firstLine = stylex.keyframes({
  "0%, 8%": { strokeDashoffset: 1, opacity: 0 },
  "24%, 86%": { strokeDashoffset: 0, opacity: 0.8 },
  "100%": { strokeDashoffset: 0, opacity: 0 },
});
const firstSpine = stylex.keyframes({
  "0%, 24%": { strokeDashoffset: 1, opacity: 0 },
  "32%, 86%": { strokeDashoffset: 0, opacity: 0.8 },
  "100%": { strokeDashoffset: 0, opacity: 0 },
});
const secondNode = stylex.keyframes({
  "0%, 32%": { opacity: 0.3 },
  "38%, 86%": { opacity: 1 },
  "100%": { opacity: 0.3 },
});
const secondLine = stylex.keyframes({
  "0%, 38%": { strokeDashoffset: 1, opacity: 0 },
  "52%, 86%": { strokeDashoffset: 0, opacity: 0.8 },
  "100%": { strokeDashoffset: 0, opacity: 0 },
});
const secondSpine = stylex.keyframes({
  "0%, 52%": { strokeDashoffset: 1, opacity: 0 },
  "60%, 86%": { strokeDashoffset: 0, opacity: 0.8 },
  "100%": { strokeDashoffset: 0, opacity: 0 },
});
const thirdNode = stylex.keyframes({
  "0%, 60%": { opacity: 0.3 },
  "66%, 86%": { opacity: 1 },
  "100%": { opacity: 0.3 },
});
const thirdLine = stylex.keyframes({
  "0%, 66%": { strokeDashoffset: 1, opacity: 0 },
  "80%, 86%": { strokeDashoffset: 0, opacity: 0.8 },
  "100%": { strokeDashoffset: 0, opacity: 0 },
});

// think: the core changes shape while the halo breathes against it.
const orb = stylex.keyframes({
  "0%, 100%": {
    borderTopLeftRadius: "50%",
    borderTopRightRadius: "50%",
    borderBottomRightRadius: "50%",
    borderBottomLeftRadius: "50%",
    transform: "rotate(0deg) scale(1)",
  },
  "25%": {
    borderTopLeftRadius: "66% 40%",
    borderTopRightRadius: "34% 62%",
    borderBottomRightRadius: "48% 38%",
    borderBottomLeftRadius: "52% 60%",
    transform: "rotate(45deg) scale(1.1)",
  },
  "50%": {
    borderTopLeftRadius: "38% 60%",
    borderTopRightRadius: "62% 36%",
    borderBottomRightRadius: "60% 64%",
    borderBottomLeftRadius: "40% 42%",
    transform: "rotate(90deg) scale(0.92)",
  },
  "75%": {
    borderTopLeftRadius: "58% 46%",
    borderTopRightRadius: "42% 58%",
    borderBottomRightRadius: "36% 44%",
    borderBottomLeftRadius: "64% 54%",
    transform: "rotate(135deg) scale(1.06)",
  },
});
const halo = stylex.keyframes({
  "0%, 100%": { opacity: 0.12, transform: "scale(0.8)" },
  "50%": { opacity: 0.24, transform: "scale(1)" },
});

const loop = {
  animationDuration: vars.motionDurationLoopSlow,
  animationIterationCount: "infinite",
  animationTimingFunction: vars.motionEaseInOut,
} as const;
const reduced = (name: string) => ({
  animationName: {
    default: name,
    "@media (prefers-reduced-motion: reduce)": "none",
  },
});

export const reasoningLoaderStyles = stylex.create({
  mark: {
    blockSize: "100%",
    display: "block",
    inlineSize: "100%",
    overflow: "visible",
  },
  rail: {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    opacity: 0.18,
    strokeLinecap: "round",
  },
  // Static geometry is the fully written trace; keyframes drive it live.
  stroke: {
    ...loop,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round",
    strokeDasharray: "1",
    strokeDashoffset: 0,
    opacity: 0.8,
  },
  node: { ...loop, fill: "currentColor", opacity: 1 },
  firstNode: reduced(firstNode),
  firstLine: reduced(firstLine),
  firstSpine: reduced(firstSpine),
  secondNode: reduced(secondNode),
  secondLine: reduced(secondLine),
  secondSpine: reduced(secondSpine),
  thirdNode: reduced(thirdNode),
  thirdLine: reduced(thirdLine),

  orbMark: {
    blockSize: "100%",
    display: "grid",
    inlineSize: "100%",
    placeItems: "center",
    position: "relative",
  },
  halo: {
    ...loop,
    ...reduced(halo),
    backgroundColor: "currentColor",
    blockSize: "75%",
    borderRadius: vars.radiusFull,
    gridArea: "1 / 1",
    inlineSize: "75%",
    opacity: 0.16,
  },
  orb: {
    ...loop,
    ...reduced(orb),
    backgroundColor: "currentColor",
    blockSize: "46%",
    borderRadius: vars.radiusFull,
    gridArea: "1 / 1",
    inlineSize: "46%",
    opacity: 0.95,
  },
});
