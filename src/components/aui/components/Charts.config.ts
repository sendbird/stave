/**
 * Chart geometry and palette constants. Split out of `Charts.tsx` alongside
 * `Charts.styles.ts` and `Charts.states.tsx` so the chart module keeps to the
 * repository's source-size guard. Values and comments moved verbatim.
 */
import { createElement } from "react";

import { i18n } from "@/i18n";

import { vars } from "../tokens/tokens.stylex";
import { BandCursor, LineCursor } from "./Charts.cursor";

// The axis line is a non-text mark, so the 3:1 subtle ink is enough for it.
export const axisColor = vars["--aui-color-text-subtle"];
// Tick labels are text a reader must read to decode a value, so they take
// muted ink (4.5:1), not the axis line's subtle ink.
export const axisTickColor = vars["--aui-color-text-muted"];
export const gridColor = vars["--aui-color-border-subtle"];
// Single-series default: the first data slot (blue). It is data ink rather than
// the near-black interactive accent; status tokens remain reserved for stable
// domain states.
export const accentColor = vars["--aui-chart-1"];

/**
 * Categorical palette — the dedicated `chart1–6` tokens in fixed slot order
 * (ocean blue → teal → violet → coral → amber → magenta; red is slot 7,
 * kept out of the identity six because it reads as `colorDanger`). They are
 * AUI-owned data-viz primitives (2026-11-08): every pair clears the CVD gate
 * in every theme with no recorded exception, and every mark but amber clears
 * 3:1 on the card (`bun run check:colors`, `color-policy.mjs`).
 * Nominal identities use this palette and never cycle past slot 6: a repeated
 * hue makes two different entities look like one, which is exactly what the
 * legend cannot fix. Past six, fold the tail into "Other" (`foldSeries`).
 * Stable domain states may opt into explicit semantic colors; their labels,
 * shapes, and table twin must still carry the meaning without color.
 */
// prettier-ignore
export const chartPalette = [vars["--aui-chart-1"], vars["--aui-chart-2"], vars["--aui-chart-3"], vars["--aui-chart-4"], vars["--aui-chart-5"], vars["--aui-chart-6"]];

/**
 * The negative side of every diverging encoding — `SeriesChart diverging`,
 * `signedFill`, `HorizonChart` and `Heatmap scale="diverging"` — is this one
 * colour: coral (`chart4`), the warm slot opposite the ocean-blue positive
 * (`chart1`). A diverging scale reads polarity from a temperature change; a
 * second cool hue (teal, slot 2) erases it, and green reads as "good" on the
 * side that means "bad". `check:colors` gates it: warm hue and ΔE from
 * `chart1` above a floor in every theme (`color-chart-diverging.mjs`).
 */
export const chartNegative = vars["--aui-chart-4"];

/** Palette length — the hard ceiling on distinct categorical series. */
export const CHART_PALETTE_SIZE = chartPalette.length;
/**
 * Pie wedges compare every pair. `check:colors` now gates all-pairs CVD
 * across the full identity six (was slots 1–3 only), so this ceiling is a
 * Charts-side call, not a colour-policy one — left at 3 pending that review.
 */
export const PIE_CHART_MAX_SLICES = 3;

/** Label for the summed tail row; read at call time so it follows the app language. */
export const chartOtherLabel = () => i18n.t("ui:chart.other");

/**
 * Tick text at the caption size (12px), the size every reference kit reads its
 * axes at; 11px read as print fine-print beside 14px body copy.
 */
export const axisTick = { fill: axisTickColor, fontSize: 12 } as const;
export const chartMargin = { bottom: 4, left: 4, right: 8, top: 8 } as const;
/**
 * Bars are marks, not slabs: capped, they stay quiet and the band's leftover
 * reads as air. Filling the slot is what makes a two-category chart look like
 * a wall of ink. 32px (was 24 until the 2026-11 refresh) is wide enough for the
 * rounded cap to read as a shape rather than a sliver.
 */
export const maxBarSize = 32;
/**
 * The rounded data end of a bar — the end away from the baseline — and only
 * that end, so a bar still sits on its axis. `barRadius` caps a column,
 * `rowBarRadius` a bar drawn in rows.
 */
export const BAR_CAP_RADIUS = 6;
export const barRadius: [number, number, number, number] = [
  BAR_CAP_RADIUS,
  BAR_CAP_RADIUS,
  0,
  0,
];
export const rowBarRadius: [number, number, number, number] = [
  0,
  BAR_CAP_RADIUS,
  BAR_CAP_RADIUS,
  0,
];
/**
 * Hover feedback behind the categorical forms: a soft rounded band the height
 * of the plot, in the hairline-border ink so it reads on any card surface
 * (`Charts.cursor.tsx`).
 */
export const bandCursor = createElement(BandCursor);
/**
 * The band cursor for a mixed (Composed) chart, which recharts hands a rule
 * rather than a band: `count` categories share the plot. A brushed window
 * passes `undefined` and keeps the rule.
 */
export const bandCursorFor = (count: number | undefined) =>
  count ? createElement(BandCursor, { bands: count }) : bandCursor;
/**
 * The continuous forms' cursor with the category pill under the axis
 * (`Charts.cursor.tsx` `LineCursor`); `labelOf` names the hovered row.
 */
export const pillCursor = (labelOf: (row: Record<string, unknown>) => string) =>
  createElement(LineCursor, { labelOf });
/** Hover feedback on scatter and bump forms: a quiet dashed rule at the point. */
export const lineCursor = {
  stroke: vars["--aui-color-border-strong"],
  strokeDasharray: "3 3",
  strokeWidth: 1,
} as const;
/*
 * Entrance motion. Two rules, and neither moves a value.
 *
 * 1. Updates are immediate (2026-11 consensus review; frequency and purpose
 *    gates: motion that runs on every interaction, or serves no purpose,
 *    goes). A tween on a data update, legend toggle, brush or resize moves
 *    the very values the reader is looking at, so every mark is drawn with
 *    `isAnimationActive={false}` and recharts never animates.
 * 2. The first appearance is the entrance (on by default since 2026-11-15,
 *    the maintainer's decision): the marks are uncovered once, a clip or a
 *    mask travelling along the form's scale while the marks sit at their final
 *    geometry, so nothing grows and no frame shows a value the data does not
 *    have. That is CSS on the plot (`Charts.entrance.ts`,
 *    `chart-entrance-motion.css`), not recharts' animation, which would also
 *    tween every later update. A chart past the three-at-once budget, a
 *    streaming chart, a `SmallMultiples` panel, a `Sparkline` (unless asked),
 *    a form without a move, `entrance={false}` and Reduce Motion all fall
 *    back to the plot fading in once over the normal step (`styles.plot`).
 */
/**
 * The tooltip wrapper mounts at the plot origin, so animating its position
 * makes the first hover visibly fly in from the top-left corner. Position is
 * pointer feedback, never motion design — snap it.
 */
export const tooltipMotion = {
  animationDuration: 0,
  isAnimationActive: false,
} as const;
