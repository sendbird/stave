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

/** A bounded block: its surface, its text, and its own internal air. */
const panel = [...surface, ...themeSpaceProperties] as const;

/** A text part inside somebody else's box. */
const ink = [...themeTypographyProperties, "color", "opacity"] as const;

/**
 * A bar — a track, a fill, a segment. Paint with no glyphs in it, so the
 * typography group would generate rules that move nothing.
 */
const bar = [...themeSurfaceProperties] as const;

/**
 * The signal family: progress and meter readouts, the loading surfaces, and
 * the live numeric/temporal readouts.
 *
 * Two shapes recur here and both are worth stating once.
 *
 * **A bar control is a root plus two painted parts.** `Progress`, `Meter` and
 * `SegmentedProgress` each own a container that does no painting of its own and
 * a track/fill pair that does all of it. The container is still the target,
 * because the label and the value sit beside the track rather than inside it
 * and a slot resolves as a descendant of the target root.
 *
 * **A hover-card component publishes two targets, not one.** `ContextGauge`
 * and `RelativeTime` portal their panel out of the trigger's subtree, so the
 * panel can never be a slot of the trigger — a descendant selector would not
 * reach it. The panel is its own target with an empty `exports`, the shape
 * `dialog-backdrop` already established.
 */
export const signalThemeTargets = {
  "animated-number": {
    exports: ["AnimatedNumber"],
    /*
     * Ink only. The glyph track, its per-digit slots and the rolling glyph are
     * Motion's transform surface — clipping windows with no paint of their
     * own — and the readout's `font-variant-numeric` is load-bearing layout
     * (equal digit advances, so the line cannot jitter mid-roll) rather than
     * something a brand may move.
     */
    properties: ink,
    root: "the `<span>` wrapping the odometer glyph track",
  },
  "context-gauge": {
    axes: { size: ["xs", "sm", "md", "lg"] },
    exports: ["ContextGauge"],
    properties: [...panel, ...themeFocusProperties],
    root: "the `<button>` the Base UI preview-card trigger renders",
    slots: {
      /* The optional caption. The arc is `progress-circle`, its own target. */
      label: ink,
      value: ink,
    },
    states: ["hover", "active", "focus-visible"],
  },
  "context-gauge-panel": {
    exports: [],
    properties: panel,
    root: "the Base UI preview-card popup element `ContextGauge` opens",
    slots: {
      heading: ink,
      /*
       * The breakdown rows and the total row are the same two-part shape, so
       * they publish the same two slots rather than a third pair a brand would
       * have to keep in sync with the first.
       */
      "row-label": ink,
      "row-value": ink,
    },
  },
  "duration-timer": {
    exports: ["DurationTimer"],
    properties: ink,
    root: 'the `<span role="timer">` carrying the elapsed clock',
  },
  "loading-surface": {
    /* Padding is what the ramp actually varies here; the floor heights are geometry. */
    axes: { size: ["sm", "md", "fill"] },
    exports: ["LoadingSurface"],
    /* No typography: the visible label belongs to the `Loader` inside it. */
    properties: [...themeSurfaceProperties, ...themeSpaceProperties],
    root: 'the `<section aria-busy>` that holds the activity indicator',
  },
  meter: {
    /*
     * Reflected on the root, where the axis can only reach the root's own
     * paint: the generator emits slot rules unqualified by axis, so a brand
     * that wants a per-tone fill sets one `indicator` rule and switches the
     * hue on the container. Same constraint as `progress`.
     */
    axes: {
      tone: ["accent", "danger", "info", "success", "warning", "warm"],
    },
    exports: ["Meter"],
    properties: panel,
    root: "the `<div>` Base UI's meter root renders",
    slots: {
      /* The fill. Its width is Base UI's, its paint is the brand's. */
      indicator: bar,
      label: ink,
      track: bar,
      value: ink,
    },
  },
  "number-flow": {
    exports: ["NumberFlow"],
    /*
     * ADS gives this span no paint of its own — the spring drives text content
     * through a MotionValue and nothing else. Ink is therefore the whole
     * allowance, and it is real: a brand's weight and colour land on the
     * readout that the count-up renders.
     */
    properties: ink,
    root: "the `<span>` Motion renders for the springing readout",
  },
  progress: {
    /*
     * `tone` names the fill, but the generator qualifies axis rules on the
     * target element only — never a slot — so a recipe reaches the bar's hue
     * through the `indicator` slot and uses `data-tone` to repaint the
     * container that frames it. Reflecting it anyway is what keeps the DOM
     * honest about which tone a caller asked for.
     */
    axes: { tone: ["default", "info", "success", "warning", "danger"] },
    exports: ["Progress"],
    properties: panel,
    root: "the `<div>` Base UI's progress root renders",
    slots: {
      /*
       * The determinate fill AND the indeterminate sweep — one element in both
       * states, so a brand paints the bar once.
       */
      indicator: bar,
      label: ink,
      track: bar,
      value: ink,
    },
  },
  "progress-circle": {
    /*
     * The one axis that reaches paint. `size` is the SVG's px geometry —
     * stroke width and radius are attributes, not themeable properties — so
     * declaring it would buy a selector with nothing behind it.
     */
    axes: { tone: ["default", "info", "success", "warning", "danger"] },
    exports: ["ProgressCircle"],
    /*
     * `color` and `opacity`, and that is the honest list: the arc strokes
     * `currentColor`, so the root's ink IS the ring's hue. The track circle
     * strokes a token directly and `stroke` is outside the contract, so the
     * unfilled remainder is not addressable and does not get a slot that
     * could only move its opacity.
     */
    properties: ["color", "opacity"],
    root: 'the `<span role="meter">` wrapping the ring `<svg>`',
  },
  "relative-time": {
    exports: ["RelativeTime"],
    /*
     * No space group. The trigger is deliberately padding-free because it
     * renders mid-sentence in a table cell or a feed, and padding on it would
     * push the running text it sits in apart.
     */
    properties: [...surface, ...themeFocusProperties],
    root: "the `<button>` the Base UI preview-card trigger renders around the `<time>`",
    /* Hover swaps the ink and raises the dotted underline; no press state. */
    states: ["hover", "focus-visible"],
  },
  "relative-time-panel": {
    exports: [],
    properties: panel,
    root: "the Base UI preview-card popup element `RelativeTime` opens",
    slots: { timestamp: ink, zone: ink },
  },
  "segmented-progress": {
    exports: ["SegmentedProgress"],
    /*
     * The root IS the track here — there is no separate track element — so it
     * carries the surface and the `columnGap` that shows that surface between
     * adjacent fills. No typography: the bar holds no glyphs.
     */
    properties: [...themeSurfaceProperties, "columnGap"],
    root: 'the `<div role="meter">` that is itself the track',
    slots: {
      /*
       * Every fill, not one of them. Per-segment tone is a property of the
       * caller's data, so a slot rule is necessarily the whole set — which is
       * what a brand wants for the segment's radius and what it must not use
       * to flatten six semantic hues into one.
       */
      segment: bar,
    },
  },
  "text-shimmer": {
    exports: ["TextShimmer"],
    /*
     * `backgroundImage` is the sweep. The recipe clips the gradient to the
     * glyphs, so the gradient a brand writes here is the animated highlight
     * itself; `color` is the trough the reduced-motion arm falls back to.
     */
    properties: [...themeTypographyProperties, "backgroundImage", "color", "opacity"],
    root: "the `<span>` whose glyphs the gradient sweep is clipped to",
  },
  "text-shimmer-lines": {
    exports: ["TextShimmerLines"],
    /*
     * Font metrics, because the placeholder is measured in them: each bar is
     * `0.7em` centred in a `1lh` slot, so the root's own type is what decides
     * how much space the not-yet-arrived paragraph reserves. `rowGap` is
     * withheld on purpose — it is zero so the rhythm is the type's own
     * leading, and a brand that added one would reserve more room than the
     * text it stands in for.
     */
    properties: ["fontSize", "lineHeight", "opacity"],
    root: 'the `<div role="status">` that reserves the paragraph',
    slots: {
      /* The elapsed-time caption, when a `duration` is composed in. */
      caption: ink,
      /*
       * One placeholder bar. `backgroundImage` is its travelling gradient and
       * `backgroundColor` is the flat fill left standing under reduced
       * motion — both, or the block collapses for the reader who opted out.
       */
      line: bar,
    },
  },
  "typing-indicator": {
    exports: ["TypingIndicator"],
    properties: panel,
    root: 'the `<div role="status">` holding the avatars, dots and label',
    /* The dots are a `Loader`; only the trailing phrase is ours to address. */
    slots: { label: ink },
  },
} as const satisfies ThemeTargetRegistry;
