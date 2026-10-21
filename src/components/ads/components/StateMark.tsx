import * as stylex from "@stylexjs/stylex";
import type { LucideIcon } from "lucide-react";
import { cx, sx, type StyleXValue, type XstyleProp } from "../utils/stylex";
import { vars } from "../tokens/tokens.stylex";
import { WORK_STATE, type WorkState } from "./state-vocabulary";

/** Glyph size in px. */
export type StateMarkSize = "xs" | "sm" | "md";
const SIZE_PX: Record<StateMarkSize, number> = { xs: 12, sm: 14, md: 16 };

export interface StateMarkProps extends XstyleProp {
  state: WorkState;
  size?: StateMarkSize;
  /** Shows the word next to the glyph. */
  showLabel?: boolean;
  /**
   * The word to show, or to announce when the word is not shown. Without
   * either, the mark is decorative and the caller says the state in text.
   */
  label?: string;
  /** `still` keeps `working` from pulsing where its surroundings already move. */
  motion?: "pulse" | "still";
  /** A domain glyph in place of the state's, keeping the state color. */
  icon?: LucideIcon;
  /** Host layout for the word, such as hiding it on narrow rows. */
  labelXstyle?: StyleXValue;
  title?: string;
  className?: string;
}

/**
 * How every surface draws an agent work state: the vocabulary's glyph in the
 * state's theme color (`--state-*`), optionally with its word. Each domain
 * keeps its own state type and maps it to a `WorkState`; only the drawing is
 * shared. `working` is the one state that moves, and reduced motion keeps its
 * shape still.
 */
export function StateMark({
  state,
  size = "sm",
  showLabel = false,
  label,
  motion = "pulse",
  icon,
  labelXstyle,
  title,
  xstyle,
  className,
}: StateMarkProps) {
  const visual = WORK_STATE[state];
  const Icon = icon ?? visual.icon;
  const px = SIZE_PX[size];
  const pulsing = visual.pulses && motion === "pulse";
  const a11y = showLabel
    ? {}
    : label
      ? ({ role: "img", "aria-label": label } as const)
      : ({ "aria-hidden": true } as const);
  return (
    <span
      data-state={state}
      data-motion={pulsing ? "pulse" : undefined}
      title={title}
      {...a11y}
      className={cx(sx(styles.root, xstyle), className)}
    >
      <Icon
        aria-hidden
        width={px}
        height={px}
        className={sx(styles.glyph, glyphColor[visual.color], pulsing && styles.pulse)}
      />
      {showLabel ? <span className={sx(styles.label, labelColor[visual.color], labelXstyle)}>{label ?? visual.label}</span> : null}
    </span>
  );
}

const pulse = stylex.keyframes({
  "0%": { opacity: 1 },
  "50%": { opacity: 0.4 },
  "100%": { opacity: 1 },
});

const styles = stylex.create({
  root: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    gap: vars["--ads-space-4"],
    minInlineSize: 0,
  },
  glyph: { flexShrink: 0 },
  pulse: {
    animationDuration: vars["--ads-motion-duration-loop-slow"],
    animationIterationCount: "infinite",
    animationName: { default: pulse, "@media (prefers-reduced-motion: reduce)": "none" },
    animationTimingFunction: vars["--ads-motion-ease-in-out"],
  },
  label: {
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

// Literal custom properties: the theme writes `--state-*` (src/globals.css,
// src/lib/themes/state-colors.ts).
const glyphColor = stylex.create({
  running: { color: "var(--state-running)" },
  needsAnswer: { color: "var(--state-needs-answer)" },
  paused: { color: "var(--state-paused)" },
  halted: { color: "var(--state-halted)" },
  completed: { color: "var(--state-completed)" },
  stopped: { color: "var(--state-stopped)" },
  failed: { color: vars["--ads-color-danger"] },
  subtle: { color: vars["--ads-color-text-subtle"] },
  muted: { color: vars["--ads-color-text-muted"] },
});

// The word mixes the state color with the body ink, as ADS semantic text does,
// so it keeps 4.5:1 on cards (checked by `checkStateColors`).
const labelColor = stylex.create({
  running: { color: `color-mix(in oklab, ${vars["--ads-color-text"]} 45%, var(--state-running))` },
  needsAnswer: { color: `color-mix(in oklab, ${vars["--ads-color-text"]} 45%, var(--state-needs-answer))` },
  paused: { color: vars["--ads-color-text-subtle"] },
  halted: { color: `color-mix(in oklab, ${vars["--ads-color-text"]} 45%, var(--state-halted))` },
  completed: { color: `color-mix(in oklab, ${vars["--ads-color-text"]} 45%, var(--state-completed))` },
  stopped: { color: vars["--ads-color-text-subtle"] },
  failed: { color: vars["--ads-color-danger-text"] },
  subtle: { color: vars["--ads-color-text-subtle"] },
  muted: { color: vars["--ads-color-text-muted"] },
});
