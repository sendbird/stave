import * as stylex from "@stylexjs/stylex";
import { vars } from "../aui/tokens/tokens.stylex";
import { transcriptMeasure } from "./transcript-measure.stylex";

const WIDE = transcriptMeasure["--stave-transcript-wide"];

export const transcriptWideStyles = stylex.create({
  /*
   * The lane keeps the column's own box; the block inside it is centred on
   * the column's axis. A flex item wider than its line overflows both sides
   * equally under `justify-content: center`, so a block that grows past the
   * column stays symmetric without knowing its own width.
   */
  lane: {
    display: "flex",
    justifyContent: "center",
    minWidth: 0,
  },
  /*
   * As wide as the content needs, never narrower than the column and never
   * wider than the wide measure or the transcript's gutters: `100cqi` is the
   * conversation scroller (`conversationStyles.scroller` is the query
   * container) and the gutters are the list's 20px inline padding. A block
   * whose content fits the column stays exactly on the column's edges; past
   * the cap it scrolls inside its own box. `max(100%, …)` keeps a narrow
   * panel from shrinking a block below the column.
   */
  breakout: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    width: "max-content",
    minWidth: "100%",
    maxWidth: `max(100%, min(${WIDE}, 100cqi - 2 * ${vars["--aui-space-20"]}))`,
  },
});
