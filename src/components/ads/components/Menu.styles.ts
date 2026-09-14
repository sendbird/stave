import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/**
 * Menu's own local styles, split out of `Menu.tsx` verbatim.
 *
 * A move, not a rewrite: the declaration below is byte-identical to the one
 * that lived near the top of `Menu.tsx`, and it left because the stable
 * theme-target attributes pushed that file over the 500-line source limit.
 * Everything else a menu paints still comes from `recipes/menu`.
 */
export const styles = stylex.create({
  // Local styles for the radio dot. The shared `recipes/menu.ts` has no
  // equivalent (and must not be edited), so the dot is defined here, mirroring the
  // `itemIcon` convention by inheriting `currentColor` so it follows the item's
  // tone/highlight state.
  radioDot: {
    backgroundColor: "currentColor",
    borderRadius: vars["--ads-radius-full"],
    blockSize: 8,
    inlineSize: 8,
  },
});
