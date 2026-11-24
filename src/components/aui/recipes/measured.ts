import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/**
 * The **machine register**, system-wide (2026-11-15): what a person wrote is
 * in the text face; what the system measured is in the mono face.
 *
 * A measured value is one the product computed or recorded rather than one
 * somebody typed as language: relative and absolute times, durations, counts,
 * ratios and percentages, money, sizes, ids, keys and versions. The rule began
 * as §2 of `docs/design-system/decisions/agent-surface-grammar.md` (agent
 * surfaces only, as `agentSurface.meta`); this recipe is the single source for
 * the whole system, and `scripts/check-machine-register.ts` fails a component
 * that sets the mono family or `tabular-nums` by hand instead.
 *
 * The rules:
 *
 * - **Tabular numerals wherever figures are compared, stacked or change.**
 * - **Mono for figures** is AUI's own identity rule, with these limits:
 *   - mono stops at label sizes (14px and below), never headings, buttons or
 *     display;
 *   - a display number (`StatTile` value) stays in the text face and takes
 *     `measured.tabular` alone;
 *   - the register goes on the value node, never on the sentence around it.
 * - **A numeric column is `align="end"`.** AUI already had that; `measured`
 *   on a column is the face, and stays independent of the alignment because a
 *   time or an id is measured and still reads from the start edge.
 * - The face and ink of a timestamp or an id: subtle ink, from the agent
 *   grammar's ink ramp.
 *
 * Where it must NOT go — too much mono reads as a developer tool:
 *
 * - a display number or anything above 14px (`StatTile`, a chart headline);
 * - prose, a title, a label or a button, even when it contains a digit;
 * - a count inside a chip or badge (`Badge`, a tab counter): the chip is one
 *   word-shaped object and keeps its face — `statusChip` already gives it
 *   tabular numerals;
 * - a page number in the `Pagination` rail, or a value the person picks or
 *   types (its page-size select, its jump field): those are control labels
 *   and input;
 * - a table cell that is the row's primary content, unless its column declares
 *   `measured`.
 *
 * Three rules, because "subtle" is a 3:1 metadata ink (design-direction §1.6)
 * and may not carry a value the reader came for:
 */
export const measured = stylex.create({
  /**
   * The meta value: a time, a count, a duration, an id beside the content it
   * describes. Mono, tabular, subtle. Size and line box are inherited, so the
   * value sits at the size of the text beside it; give it a size where the
   * slot sets one.
   */
  base: {
    color: vars["--aui-color-text-subtle"],
    fontFamily: vars["--aui-font-mono"],
    fontVariantNumeric: "tabular-nums",
  },
  /**
   * The same face with the ink left to the context: a measured table column
   * (the amount IS the row's point, so it keeps the cell's ink), a control
   * that holds a number, a readout with its own tone.
   */
  face: {
    fontFamily: vars["--aui-font-mono"],
    fontVariantNumeric: "tabular-nums",
  },
  /**
   * The limit case: a figure that must stay in the text face (a display
   * number, a count in a chip) still holds its digit columns still.
   */
  tabular: {
    fontVariantNumeric: "tabular-nums",
  },
});

/**
 * The opt-out every component that applies the register by default shares:
 * `"measured"` is the rule above; `"text"` keeps the text face and the
 * surrounding ink (tabular numerals stay) for a value that is part of a
 * sentence a person wrote, or that is the content rather than its metadata.
 */
export type MeasuredRegister = "measured" | "text";
