import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

const gap = vars["--aui-border-width-hairline"];
const outer = `calc(${vars["--aui-border-width-hairline"]} + ${vars["--aui-ring-width-sm"]})`;
const halo = (ink: string) =>
  `0 0 0 ${gap} ${vars["--aui-color-surface-raised"]}, 0 0 0 ${outer} ${ink}`;

/**
 * The selected and keyboard-current data mark (2026-11-16): a chart cell,
 * bar or tile that is chosen draws a 1px gap in the surface colour and a 2px
 * ring outside it (`borderWidthHairline` + `ringWidthSm`, 3px in all), in body
 * ink for selection and in the focus colour for the keyboard cursor.
 *
 * Measured on 2026-11-15 the same halo was drawn seven ways: 1.5 + 3px,
 * 1 + 3px, 1.5px + `currentColor`, inset 2 / 2.5 / 4 / 4.5px and a 4px wash.
 * Half pixels blur on a 1x screen, so the halo is whole pixels from tokens.
 * A data mark's corner is the 2px data-mark step of §7 (`borderRadius: 2`);
 * three marks used 3px.
 *
 * `selectedCurrent` paints the ring in the mark's own `currentColor`, for a
 * status-coloured bar whose selection keeps its hue (`TimelineChart` lanes).
 */
export const dataMark = stylex.create({
  selected: {
    boxShadow: halo(vars["--aui-color-text"]),
  },
  selectedCurrent: {
    boxShadow: halo("currentColor"),
  },
  focus: {
    boxShadow: halo(vars["--aui-color-border-focus"]),
  },
});
