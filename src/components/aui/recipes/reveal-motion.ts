import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/**
 * In-place reveal: content an expand puts on screen when there is no panel to
 * animate a height on — a tree branch's child rows (the tree is one flat
 * `ul > li` list), a table's detail row, a node's children in a code viewer.
 * Those used to mount in one frame while the chevron beside them turned over
 * 220ms, so the glyph said "opening" and the content had already arrived.
 *
 * The content fades in and drops 4px from the row that revealed it, on the
 * disclosure beat (220ms, ease-out) — the same distance, direction and timing
 * as the content inside an animated disclosure panel, so a tree, an accordion
 * and a sidebar group open alike. No spring: these are lists being read, and
 * the expand is a frequent action. Collapse stays a cut — the rows unmount,
 * and the chevron turning back is the feedback.
 *
 * Apply it only to content an expand revealed, never on first paint, a
 * search filter or a windowed scroll — `utils/revealed-ids.ts` for a flat
 * list, `useChangeCount(expanded) > 0` for a single detail. Keyframes run UP to the element's own resting
 * style and `translate` composes with any transform the host owns (a dragged
 * row), so nothing is left offset if the class stays on. Reduce Motion: an
 * 80ms opacity fade, no travel.
 */
const drop = stylex.keyframes({
  from: {
    opacity: 0,
    translate: `0 calc(${vars["--aui-motion-distance-small"]} * -1)`,
  },
  to: { opacity: 1, translate: "0 0" },
});

const fade = stylex.keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const REDUCED = "@media (prefers-reduced-motion: reduce)";

export const revealMotion = stylex.create({
  enter: {
    animationDuration: {
      default: vars["--aui-motion-duration-normal"],
      [REDUCED]: vars["--aui-motion-duration-micro"],
    },
    animationFillMode: "backwards",
    animationName: { default: drop, [REDUCED]: fade },
    animationTimingFunction: vars["--aui-motion-ease-standard"],
  },
});
