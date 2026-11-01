import * as stylex from "@stylexjs/stylex";

/**
 * The transcript's reading measure, shared by every surface that has to sit on
 * one vertical axis: assistant replies, user bubbles and the composer's outer
 * wrapper. When each owner kept its own width (a left-aligned 56rem reply, a
 * user bubble capped against a 72rem row, a centred 1152px composer), the three
 * drifted apart by up to 160px at a normal window size.
 *
 * - `column` — the centred column itself (760px). Prose, the turn trace, user
 *   bubbles and the composer frame end on its edges.
 * - `wide` — the most a top-level code block, table or diff may claim, centred
 *   on the same axis (880px), so dense content is not squeezed into the prose
 *   measure.
 *
 * Variables rather than constants so the breakout `calc()` can read them.
 */
export const transcriptMeasure = stylex.defineVars({
  "--stave-transcript-column": "47.5rem",
  "--stave-transcript-wide": "55rem",
});
