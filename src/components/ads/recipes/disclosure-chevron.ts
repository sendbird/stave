import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/**
 * The one disclosure chevron motion: every expand/collapse glyph in the
 * system turns on the same duration and curve, and stops turning under
 * reduced motion.
 *
 * _Why a recipe:_ before 2026-09-30 each family hand-rolled its own. Accordion,
 * Tree and DataTable turned in 120ms, the Sidebar in 180ms, inline evidence in
 * 150ms on the expressive curve, and JsonViewer, TraceWaterfall, StackTrace,
 * StateTimeline and TreeSelect snapped with no transition at all — so two
 * disclosures on one screen opened at visibly different speeds.
 * `scripts/check-disclosure-motion.mjs` fails a `rotate(90deg|180deg)` open
 * state written anywhere else.
 *
 * `base` carries no resting `transform`, so Accordion and Collapsible — whose
 * open state lives on the Base UI trigger, not the glyph, and is rotated from
 * `styles.css` — compose it too and keep one timing.
 *
 * Compose `base` on the glyph (or its wrapper) and exactly one open key while
 * expanded: `openQuarter` for a trailing-edge `ChevronRight` (tree rows, nested
 * lists), `openHalf` for a `ChevronDown` that flips to point up (section
 * headers, menus).
 */
export const disclosureChevron = stylex.create({
  base: {
    transitionDuration: {
      default: vars["--ads-motion-duration-fast"],
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
    transitionProperty: "transform",
    transitionTimingFunction: vars["--ads-motion-ease-standard"],
  },
  openQuarter: {
    transform: "rotate(90deg)",
  },
  openHalf: {
    transform: "rotate(180deg)",
  },
});
