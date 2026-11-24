import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/**
 * F2 (R5, 2026-11-07): a framed DataTable is ONE panel — its filter toolbar,
 * the scroll frame and the pagination footer share the panel's ring, radius
 * and raised contact shadow, the way the data-operations mockup draws it.
 * Before, the toolbar floated above a framed scroll box and the footer below
 * it, three loose pieces that read as a table plus two accessories.
 *
 * The perimeter moves from the scroll frame to the root; the scroll frame
 * keeps every job it had (overflow, sticky header, the empty slot's `100cqi`,
 * the PeekPanel host beside it) and only drops its own edge. `frame={false}`
 * still opts the whole table out of a perimeter.
 */
export const panelStyles = stylex.create({
  root: {
    backgroundColor: vars["--aui-color-surface-raised"],
    borderColor: vars["--aui-color-ring"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    boxShadow: vars["--aui-elevation-raised"],
    gap: 0,
    // Clips the frameless scroll area's square corners to the panel radius.
    overflow: "hidden",
  },
  // Mockup `.tb`: 10px / 12px → space8 / space12 on the AUI scale.
  toolbar: {
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  // The scroll frame inside the panel: no edge, no lift, no corner of its own.
  frame: {
    borderRadius: 0,
    borderWidth: 0,
    boxShadow: "none",
  },
  // Mockup `.tfoot`: hairline above, 8px / 12px.
  footer: {
    borderBlockStartColor: vars["--aui-color-border-subtle"],
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: vars["--aui-border-width-hairline"],
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
});
