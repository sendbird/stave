import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/**
 * Coarse-pointer hit-area expansion for controls whose **painted** box is
 * deliberately smaller than the 44px WCAG 2.5.8 touch minimum.
 *
 * `recipes/control-metrics` grows a control's own box to `controlHeightXl`
 * under `(pointer: coarse)`. That is right for buttons, fields, and triggers,
 * and wrong for the toggles: a checkbox, radio, or switch has a fixed painted
 * geometry that must not inflate to 44px on a phone. So those three shipped
 * with 20×20 / 20×20 / 42×24 targets — only their *labels* carried the 44px
 * row, which means tapping the control itself was a sub-minimum target.
 *
 * This recipe adds the missing area *around* the paint: an out-of-flow
 * pseudo-element, generated only under `(pointer: coarse)`, that centers a
 * `controlHeightXl` box on the control. Taps inside it still hit the control
 * (it is the control's own pseudo-element), and because it is absolutely
 * positioned it contributes nothing to layout — desktop geometry and every
 * rendered metric assertion stay exactly as they are.
 *
 * Compose on the element that owns the paint:
 * `sx(styles.root, touchTarget.coarse, focusRing.ring)`.
 */
export const touchTarget = stylex.create({
  coarse: {
    position: "relative",
    /*
     * How far the hit area bleeds past every painted edge.
     *
     * `0px` on a fine pointer, so the pseudo-element sits exactly on the
     * painted box and desktop behaviour is byte-identical. Under a coarse
     * pointer it becomes (painted size − 44px) / 2, i.e. negative — the inset
     * percentages resolve against the control's own padding box once
     * substituted, so one formula covers every toggle geometry, and a control
     * that is already ≥44px simply gets a zero-or-inward inset instead of
     * growing.
     *
     * The condition lives on the host because StyleX only types conditional
     * values on the element itself, never inside a pseudo-element block.
     */
    "--ads-touch-bleed": {
      default: "0px",
      "@media (pointer: coarse)": `calc((100% - ${vars.controlHeightXl}) / 2)`,
    },
    "::after": {
      content: '""',
      insetBlock: "var(--ads-touch-bleed)",
      insetInline: "var(--ads-touch-bleed)",
      position: "absolute",
    },
  },
});
