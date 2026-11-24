import { vars } from "../tokens/tokens.stylex";

/*
 * The sequential magnitude ramp shared by `Heatmap` and `CalendarHeatmap`.
 *
 * One hue, light → dark, quantised into five steps so neighbouring cells are
 * actually distinguishable (a continuous ramp reads as one smear). Step 0 is
 * "nothing happened" and takes the canvas-subtle fill; a missing reading is not
 * a step at all and is drawn as an outline by each component. Split out so the
 * two grids cannot drift into two different readings of the same scale.
 */

export const RAMP_STEPS = 5;

/** Quantised so adjacent cells differ by a visible step, not a hair. */
export function rampStep(value: number, ceiling: number): number {
  if (ceiling <= 0) return 0;
  const ratio = Math.max(0, Math.min(1, value / ceiling));
  return ratio === 0 ? 0 : Math.max(1, Math.ceil(ratio * RAMP_STEPS));
}

/** The fill of one ramp step, mixed from `hue` into the raised surface. */
export function rampFill(step: number, hue: string): string {
  return step === 0
    ? vars["--aui-color-canvas-subtle"]
    : `color-mix(in oklab, ${hue} ${step * (100 / RAMP_STEPS)}%, ${vars["--aui-color-surface-raised"]})`;
}

/**
 * The diverging ramp (`Heatmap scale="diverging"`, 2026-11 refresh): values on
 * both sides of zero, three steps a side, each side its own hue mixed into the
 * raised surface, and zero itself the neutral canvas-subtle fill — never a hue
 * at the midpoint. Quantised for the same reason as the sequential ramp.
 */
export const DIVERGING_STEPS = 3;

/** −3…3: the side by sign, the step by |value| against the largest magnitude. */
export function divergingStep(value: number, ceiling: number): number {
  if (ceiling <= 0 || value === 0) return 0;
  const ratio = Math.min(1, Math.abs(value) / ceiling);
  return Math.sign(value) * Math.max(1, Math.ceil(ratio * DIVERGING_STEPS));
}

/** The fill of one diverging step: `negative` below zero, `positive` above. */
export function divergingFill(
  step: number,
  negative: string,
  positive: string,
): string {
  if (step === 0) return vars["--aui-color-canvas-subtle"];
  const hue = step < 0 ? negative : positive;
  const share = Math.round((Math.abs(step) * 100) / DIVERGING_STEPS);
  return `color-mix(in oklab, ${hue} ${share}%, ${vars["--aui-color-surface-raised"]})`;
}
