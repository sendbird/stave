import * as stylex from "@stylexjs/stylex";

/**
 * The transcript's reading measure, shared by every surface that has to sit on
 * one vertical axis: assistant replies, user bubbles and the composer's outer
 * wrapper. When each owner kept its own width (a left-aligned 56rem reply, a
 * user bubble capped against a 72rem row, a centred 1152px composer), the three
 * drifted apart by up to 160px at a normal window size.
 *
 * - `column` — the centred column itself. Prose, code blocks, cards, the turn
 *   trace, user bubbles and the composer frame end on its edges.
 * - `wide` — the most a top-level table or diagram may claim when its content
 *   needs more than the column, centred on the same axis.
 *
 * These are the fallbacks for a transcript outside a conversation surface.
 * The task chat and Tars set both per width tier and per the reader's chosen
 * conversation width (`transcript-width.ts`), so the defaults here equal that
 * scale's narrowest default step.
 *
 * Variables rather than constants so the breakout `calc()` can read them.
 */
export const transcriptMeasure = stylex.defineVars({
  "--stave-transcript-column": "48rem",
  "--stave-transcript-wide": "56rem",
});
