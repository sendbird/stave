import {
  themeFocusProperties,
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

/** A control: its surface, its own internal air, and its focus ring. */
const control = [
  ...surface,
  ...themeSpaceProperties,
  ...themeFocusProperties,
] as const;

/** A text part inside somebody else's box. */
const ink = [...themeTypographyProperties, "color", "opacity"] as const;

/**
 * The insight family: the small-scale data visuals and the developer-tool
 * readouts that sit beside the charts.
 *
 * This family is the chart family at a smaller scale, and it draws the same
 * line the chart family draws — read `theme-targets.charts.ts` first. **A
 * data-visual's data ink is not CSS.** A sparkline's stroke is an SVG
 * attribute off a `chart1–6` token; a trace bar's length *is* its magnitude; a
 * diff's `+N`/`−M`, a test's pass/fail, a trace span's `error` are
 * colour-encoded distinctions a reader relies on to tell one row from another.
 * So the rule inherited from `charts` and from `breadcrumb-trail` in the tabs
 * family holds at every turn here: a target's `properties` list its chrome —
 * the card it sits in, the gap between its rows, the ink of its labels — and
 * never the colour that carries a signal. Where an element's colour IS the
 * signal, it gets typography and geometry only, and the comment says why.
 *
 * Slot names match `charts` for the same parts: `label`, `value`, `swatch`,
 * `track`. A brand that learned the chart card's vocabulary reads a stat tile
 * without learning a second one.
 */
export const insightThemeTargets = {
  /**
   * The inline trend. `properties` is empty, and that is the honest answer,
   * not an omission — the same one `gauge` gives: the root is an unpainted box
   * sized in layout units the vocabulary does not carry, and the line/area/bar
   * ink is an SVG `stroke`/`fill` computed from a `chart1–6` token, which no
   * declaration on this target can move and no `@layer` wins against. What the
   * target buys a brand is the stable selector its `variant` axis hangs off
   * (`.ads-sparkline[data-variant="bar"]`), the same thing `gauge` gets from
   * `[data-tone]`. A brand restyles the data ink through the `chart1–6` tokens,
   * not through a rule here.
   */
  sparkline: {
    axes: { variant: ["area", "line", "bar"] },
    exports: ["Sparkline"],
    properties: [],
    root: 'the `<div role="img">` `Sparkline` renders around the responsive chart',
  },
  /**
   * A single headline metric — label · value · delta · trend. A target with
   * slots rather than several targets, the same call `card` makes: the parts
   * share the tile's box and only ever move with it, so a brand that wants a
   * different metric readout wants one rule with refinements. The delta is a
   * `Badge` and the trend is a `Sparkline`, each its own target already, so
   * they are not slots here.
   *
   * `density` is reflected because it is the tile's own surface axis — its air
   * and its readout's type role — and it is what a slot rule underneath needs
   * to be reachable (`.ads-stat-tile[data-density="compact"] [data-ads-slot="value"]`).
   */
  "stat-tile": {
    axes: { density: ["compact", "regular"] },
    exports: ["StatTile"],
    properties: [...surface, ...themeSpaceProperties],
    root: "the `<div>` `StatTile` renders",
    slots: {
      /* The metric caption row and its optional glyph's ink. */
      label: ink,
      /* Small print under the readout. */
      note: ink,
      /* The headline number. Ink only: its box is the readout grid cell. */
      value: ink,
    },
  },
  /**
   * The trace view: chronologically ordered span rows on one shared time axis.
   * A target, not a slot of `chart`, for `bar-list`'s reason — it ships on its
   * own with no card around it, so a slot rule scoped to `.ads-chart` would
   * miss every standalone one. It owns a card surface and the rhythm between
   * rows; the row's pressable name lives in `trace-waterfall-span`.
   */
  "trace-waterfall": {
    exports: ["TraceWaterfall"],
    properties: [...surface, ...themeSpaceProperties],
    root: 'the `<div role="group">` `TraceWaterfall` renders',
    slots: {
      /* The trailing time figure, machine register. */
      duration: ink,
      /*
       * The empty track behind a span bar — chrome, so themeable, exactly like
       * `bar-list`'s `track`. `backgroundColor` only: the bar's own fill is
       * data ink (`chart1`), and its `error`/`running` tint is a STATE signal a
       * brand must not be able to flatten, so neither the bar nor its status
       * colour is addressable from here.
       */
      track: ["backgroundColor"],
    },
  },
  /**
   * The span row's pressable name+meta button. Its own target because it is
   * the one pressable part of a trace row — only a target carries states, and
   * a brand that cannot write the row's `:hover`/selected paint cannot restyle
   * the waterfall. `exports: []`: the row button is module-private, the public
   * name is the `<div>` above.
   *
   * No `error`/`running` axis and no colour tied to span status: the bar
   * carries that signal (see `trace-waterfall.track`), and the row itself must
   * read the same whatever the span's state, so it stays neutral chrome the
   * brand may repaint.
   */
  "trace-waterfall-span": {
    exports: [],
    properties: control,
    root: "the select `<button>` each span row renders for its name and meta",
    states: ["hover", "active", "focus-visible", "disabled"],
  },
  /**
   * The test-run summary card plus its collapsible suites. A card surface with
   * slots; the suite disclosure trigger is `Collapsible.Trigger`, already a
   * target in the tabs family, and the per-status `Badge`/icon ink is its own
   * signal — `passed`/`failed`/`skipped` are colour-encoded distinctions, so
   * none of them is a paintable slot here.
   */
  "test-results": {
    exports: ["TestResults"],
    properties: [...surface, ...themeSpaceProperties],
    root: "the `<section>` `TestResults` renders",
    slots: {
      /* The polite count line under the heading — neutral ink, no status. */
      summary: ink,
      /* The card heading. */
      title: ink,
    },
  },
  /**
   * The one-line file-change header. A `<span>` that draws no surface — a
   * caller drops it in a disclosure trigger or a list row that already owns
   * the perimeter — so its allowance is ink on the path, and nothing else.
   *
   * No slot for the `+N`/`−M` counts and none for the status word: the counts
   * are VCS identity in `diffAddedText`/`diffRemovedText`, and the status word
   * is the `agent-state` signal. Both are colour-as-meaning a brand must not
   * be able to flatten, so the path is the only addressable part.
   */
  "file-change-summary": {
    exports: ["FileChangeSummary"],
    /* No fill, no edge, no box of its own — only the path's type and the
       gap the row lays out with. */
    properties: [...themeTypographyProperties, ...themeSpaceProperties],
    root: "the `<span>` `FileChangeSummary` renders",
    slots: {
      /* The path text — its directory and basename share one type role. */
      path: ink,
    },
  },
  /**
   * The two-version compare stage. A bare grid — the toolbar, the stage, and
   * the range row are laid out in it — so like the tabs family's grid roots it
   * owns the gap between them and nothing else. The stage's fill and the
   * compared artifacts are the caller's content, not this target's paint.
   */
  "version-compare": {
    exports: ["VersionCompare"],
    properties: [...themeSpaceProperties],
    root: "the `<div>` `VersionCompare` renders",
    slots: {
      /* The per-pane caption and the corner tags naming baseline vs current. */
      label: ink,
    },
  },
  /**
   * The compare-mode buttons (side-by-side / slider / onion / diff). Their own
   * target for the recurring reason: a pressable part with its own
   * hover/active/pressed paint carries states, and states live only on a
   * target. `exports: []` — the buttons are internal, the public name is the
   * `<div>` stage above. The selected mode is `aria-pressed` on the element,
   * which a brand already has and an axis must not shadow.
   */
  "version-compare-mode": {
    exports: [],
    properties: control,
    root: "each mode-select `<button>` in the compare toolbar",
    states: ["hover", "active", "focus-visible", "disabled"],
  },
  /**
   * The node-diagram canvas. `Flow.Controls` and `Flow.MiniMap` are covered
   * here because they resolve through the `Flow` namespace — but the corner
   * plugins paint separately from the canvas, so they get their own targets
   * below rather than folding into this one.
   *
   * `properties` is empty: the canvas is a transformed, pannable surface whose
   * only paint is a dotted-grid `background` computed from the live viewport
   * transform (an inline style that tracks pan/zoom), which no static
   * declaration can own. The stable selector is what the target is for.
   */
  flow: {
    exports: ["Flow", "Flow.Controls", "Flow.MiniMap"],
    properties: [],
    root: 'the `<div role="application">` `Flow` renders as the canvas',
    slots: {
      /* The midpoint edge chips. Ink only — an edge's `tone` is a data
         distinction (default/accent/danger) carried on the stroke, so the
         label's colour stays out of the allowance. */
      "edge-label": ink,
    },
  },
  /**
   * The positioned, draggable, focusable node shell. Its own target because it
   * is the canvas's one pressable part — Tab reaches it, Enter selects it, and
   * it paints its own focus ring, selected fill and dragging state, which only
   * a target can carry. `exports: []`: the shell is internal to `Flow`, and a
   * caller's `renderNode` content sits inside it.
   */
  "flow-node": {
    exports: [],
    properties: control,
    root: 'the `role="button"` `<div>` shell `Flow` renders around each node',
    states: ["hover", "active", "focus-visible"],
  },
  /**
   * The corner control cluster (zoom / fit / reset). A `role="group"` box that
   * owns only the air between its buttons — the buttons themselves are ADS
   * `Button`, already the `button` target. `exports: []`: the public name is
   * `Flow.Controls`, covered by `flow`.
   */
  "flow-controls": {
    exports: [],
    properties: [...themeSurfaceProperties, ...themeSpaceProperties],
    root: 'the `role="group"` `<div>` `Flow.Controls` renders',
  },
  /**
   * The corner overview map. Its own target rather than a slot of `flow`
   * because it floats above the canvas on its own fill and edge, the way
   * `chart-tooltip` is a target and not a slot of `chart`. `exports: []`: the
   * public name is `Flow.MiniMap`, covered by `flow`. The scaled node rects
   * and the viewport rectangle are SVG `fill`/`stroke`, not CSS, so the target
   * owns the panel and nothing inside it.
   */
  "flow-minimap": {
    exports: [],
    properties: [...themeSurfaceProperties, ...themeSpaceProperties],
    root: "the `<div>` `Flow.MiniMap` renders around its overview SVG",
  },
} as const satisfies ThemeTargetRegistry;
