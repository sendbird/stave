import {
  themeSpaceProperties,
  themeSurfaceProperties,
  themeTypographyProperties,
} from "./theme-contract";
import type { ThemeTargetRegistry } from "./theme-target-types";

/** Paint + text, the allowance a target that owns a surface gets. */
const surface = [
  ...themeSurfaceProperties,
  ...themeTypographyProperties,
] as const;

/** A text part inside somebody else's box. */
const ink = [...themeTypographyProperties, "color", "opacity"] as const;

/**
 * The chart family.
 *
 * The line this family had to draw, and the reason its property lists look
 * short: **a chart's data ink is not CSS.** Series colour arrives as an SVG
 * `fill`/`stroke` attribute computed from a `chart1–6` token (or from the
 * caller's `color`), and a heatmap cell's fill is an inline `color-mix()` — no
 * declaration on any target here can move it, and no layer wins against an
 * attribute. So what a brand can address is the chart's own chrome: the card,
 * its heading block, the legend, the tooltip panel, the empty track behind a
 * bar. Listing `backgroundColor` on a series mark would generate a rule that
 * loses to the attribute every time, which is the decorative coverage this
 * contract exists to prevent.
 *
 * The palette is the other half of the answer, and it is already themeable:
 * `chart1–6` are theme-varying tokens, so a brand restyles data ink by setting
 * the tokens, in slot order, through the gates in `tokens.stylex.ts` — not by
 * hand-picking a hue per component.
 */
export const chartsThemeTargets = {
  /**
   * One target for eleven plot types plus the bar-list card, because they are
   * one card: `ChartFrame` renders the `<section>` for all eleven, and
   * `Chart`'s own element repeats the same paint. A brand that wants a
   * different chart card wants one rule, not twelve.
   */
  chart: {
    exports: [
      "AreaChart",
      "BarChart",
      "Chart",
      "ComposedChart",
      "FunnelChart",
      "GaugeChart",
      "LineChart",
      "PieChart",
      "RadarChart",
      "RadialBarChart",
      "ScatterChart",
      "SeriesChart",
    ],
    properties: [...surface, ...themeSpaceProperties],
    root: "the `<section>` the shared chart frame renders, and `Chart`'s own card element",
    slots: {
      description: ink,
      /* The heading block: a grid that owns the gap between title and
         description and paints nothing else. */
      header: [...themeSpaceProperties],
      /* The legend list itself — its row and column rhythm. The rows' ink is
         addressed through `legend-label` / `legend-value` / `legend-share`,
         which declare their own colour and so cannot inherit it from here. */
      legend: [...themeSpaceProperties],
      "legend-label": ink,
      "legend-share": ink,
      "legend-value": ink,
      /*
       * The colour key beside a legend row, and the same part inside the
       * tooltip. Radius only: the fill IS the series colour, set inline from
       * the palette slot, so a brand's `backgroundColor` here would never
       * paint. What it can change is whether a key is a dot or a chip.
       */
      swatch: ["borderRadius"],
      title: ink,
    },
  },
  /**
   * The tooltip panel, a target rather than a slot of `chart`: it does not
   * share the card's surface, it floats above the plot on its own fill,
   * hairline and lift. `exports` is empty because no public name renders it —
   * the frame passes it to recharts as tooltip content, the way
   * `dialog-backdrop` is rendered by the popup's own compound.
   */
  "chart-tooltip": {
    exports: [],
    properties: [...surface, ...themeSpaceProperties],
    root: "the tooltip panel the chart frame renders as recharts' tooltip content",
    slots: {
      label: ink,
      name: ink,
      swatch: ["borderRadius"],
      value: ink,
    },
  },
  /**
   * `BarList` is a target and not a slot of `chart` because it ships on its
   * own: a stat block renders one with no card around it, and a slot rule is
   * scoped to `.ads-chart`, so it would reach the one inside `Chart` and miss
   * every standalone one.
   */
  "bar-list": {
    exports: ["BarList"],
    /* The list is a grid of rows in somebody else's box: it paints no fill of
       its own, and the only thing it owns is the rhythm between rows. */
    properties: [...themeSpaceProperties],
    root: 'the `<div role="list">` `BarList` renders',
    slots: {
      label: ink,
      /*
       * The empty track behind a bar — chrome, so it is themeable, unlike the
       * bar's own fill (a `chart1` datum colour). `backgroundColor` only: the
       * track and the bar share one radius, and letting a brand move one of
       * them would round a bar into a slot that is still square.
       */
      track: ["backgroundColor"],
      value: ink,
    },
  },
  /**
   * Its own target rather than a second `chart`: a heatmap's addressable parts
   * are a grid of cells and a scale ramp, which no plot card has, and pushing
   * them onto `chart` would publish six slots that eleven charts never render.
   */
  heatmap: {
    exports: ["Heatmap"],
    properties: [...surface, ...themeSpaceProperties],
    root: "the `<section>` `Heatmap` renders",
    slots: {
      /* Radius only — magnitude is an inline `color-mix()` off the ramp hue,
         so a brand's fill here would lose to the style attribute. */
      cell: ["borderRadius"],
      description: ink,
      header: [...themeSpaceProperties],
      /* Both axes' tick labels: one part, one name. */
      label: ink,
      swatch: ["borderRadius"],
      title: ink,
    },
  },
  /**
   * The circular meter.
   *
   * `properties` is empty and that is the honest answer, not an omission: the
   * root is an unpainted `inline-grid`, and the track and value arc are SVG
   * `stroke`, which the property vocabulary deliberately does not carry. What
   * the target buys a brand is the stable selector its axes hang off —
   * `.ads-gauge[data-tone="danger"]` — and the one part of a gauge that is
   * painted in CSS, its centre readout.
   */
  gauge: {
    axes: {
      size: ["sm", "md", "lg"],
      /*
       * The RESOLVED tone: `thresholds` overrides `tone` when the current
       * percentage meets one. Reflecting the resolved value is what makes
       * `[data-tone]` mean the colour the arc is actually painted in.
       */
      tone: ["default", "info", "success", "warning", "danger"],
    },
    exports: ["Gauge"],
    properties: [],
    root: 'the `<div>` `Gauge` renders, carrying `role="meter"`',
    slots: { label: ink },
  },
} as const satisfies ThemeTargetRegistry;
