import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/**
 * A display number (2026-11-16): the figure a tile, a chart or a gauge exists
 * to show — a KPI, a total, a gauge reading. Two steps, both semibold with
 * tabular numerals and no tracking, in the text face:
 *
 * | Key       | Where                                                        | Size / line |
 * | --------- | ------------------------------------------------------------ | ----------- |
 * | `display` | the figure is the surface's headline: `StatTile`, a chart headline, a donut centre, `GaugeChart` | 24 / 32 |
 * | `compact` | the figure sits in a row beside its label: `StatTile` compact, `Meter` segments total, a sunburst centre | 16 / 24 |
 *
 * Measured on 2026-11-15 the same job was eleven styles across the package,
 * the docs blocks and templates: 24/600, 24/600 at -0.01em, 24/500, 26/600
 * (an inline style on the gauge), 20/600, 20/500, 16/600, 15/600, 15/500,
 * 15/500 mono and 14/600. Size and weight carry the hierarchy here as they do
 * everywhere in AUI: the tracking tokens are retired (design direction §5),
 * so the chart headline's -0.01em goes.
 *
 * The text face, not mono: the machine register stops at 14px and a display
 * number keeps its face with `measured.tabular` (recipes/measured.ts), and an
 * emphasised number gets its own proportional `metric` style. Ink is the caller's (a value with a tone is not
 * `colorText`). Compose: `sx(metric.display, styles.value)`.
 */
export const metric = stylex.create({
  display: {
    fontSize: vars["--aui-font-size-title"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--aui-font-weight-semibold"],
    lineHeight: vars["--aui-line-height-title"],
  },
  compact: {
    fontSize: vars["--aui-font-size-lead"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--aui-font-weight-semibold"],
    lineHeight: vars["--aui-line-height-lead"],
  },
});
