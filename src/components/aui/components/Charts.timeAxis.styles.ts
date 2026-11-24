import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/**
 * The time-axis marks every time surface shares (F7, 2026-11-08):
 * `TimelineChart` bars, its `lanes` variant and `Plan`'s schedule view each
 * drew their own hairline grid and "now" rule. The grid line is one hairline
 * everywhere; the now rule's geometry (absolute, full track height) is here
 * and each surface keeps only its own ink and weight on top — the bars'
 * danger rule, the lanes' info rule, the schedule's text rule — because those
 * say different things (a deadline row, a live agent, a run clock).
 * Tick positions come from `stepTicks` / `thinTicks` in
 * `Charts.timeline.utils`.
 */
export const timeAxisStyles = stylex.create({
  gridLine: {
    backgroundColor: vars["--aui-color-border-subtle"],
    blockSize: "100%",
    inlineSize: 1,
    position: "absolute",
  },
  nowRule: {
    blockSize: "100%",
    position: "absolute",
  },
});
