import * as stylex from "@stylexjs/stylex";
import { vars } from "../aui/tokens/tokens.stylex";
import { transcriptMeasure } from "./transcript-measure.stylex";

const WIDE = transcriptMeasure["--stave-transcript-wide"];

export const transcriptWideStyles = stylex.create({
  /*
   * Grow symmetrically past the column, up to the wide measure, but never
   * past the transcript's own gutters: `100cqi` is the conversation scroller
   * (`conversationStyles.scroller` is the query container) and the gutters are
   * the list's 20px inline padding. `max(100%, …)` keeps the margins at zero
   * whenever there is no room to grow, so a narrow panel never shrinks a
   * block below the column.
   */
  breakout: {
    marginInline: `calc((100% - max(100%, min(${WIDE}, 100cqi - 2 * ${vars["--aui-space-20"]}))) / 2)`,
    minWidth: 0,
  },
});
