import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/**
 * Shared state-transition recipe.
 *
 * The same three declarations — duration, property list, timing function —
 * were copy-pasted across ~110
 * call sites, and the property list alone had drifted into eight different
 * spellings. Several of those lists animated properties the component never
 * changes (a dead `box-shadow` on every text input), which costs a real
 * compositor check per frame and hides which properties actually move.
 *
 * Compose one *property* key with an optional *duration* key:
 *
 * ```ts
 * sx(styles.trigger, transition.colors)             // 120ms, both ways
 * sx(styles.panel, transition.colors, transition.motionDurationNormal)
 * ```
 *
 * Rules:
 * - Never animate `all`. Name the properties.
 * - Never add `transform` here — Motion owns transform on its own element
 *   (see `decisions/motion-architecture.md`). `transformFallback` exists only
 *   for the CSS press path used when a component renders a non-Motion element.
 * - Non-spatial colour/opacity/shadow STATE feedback (`colors`, `control`,
 *   `ring`) eases over 150ms on `--aui-motion-ease-color`, and keeps an 80ms
 *   micro transition under reduced motion. Transform and layout-adjacent
 *   timing becomes instant.
 * - Two curves, by what moves: travel (`bar`, `slide`, `transform`, the
 *   duration overrides) rides the ease-out `--aui-motion-ease-standard`,
 *   `cubic-bezier(0.22, 1, 0.36, 1)`; a colour change rides the CSS `ease`
 *   curve `--aui-motion-ease-color` (2026-11-08 motion pass, below). That
 *   split is Emil Kowalski's own easing table — "hover / color change →
 *   ease", entering and exiting → ease-out — so the 2026-11-08 motion review
 *   kept it.
 */

/**
 * Colour feedback eases over 150ms (`--aui-motion-duration-quick`) on the
 * colour curve (`--aui-motion-ease-color`, CSS `ease`), in both directions.
 *
 * History, because each step was a real complaint: it answered in 120ms and let
 * go in 80ms, but a CSS transition takes the duration of the state it moves
 * INTO, so the 80ms rest arm was what every press, focus and release played —
 * effectively a cut (F3, 2026-11-08: "transitions look absent"). F3 moved both
 * arms to 120ms and the complaint came back the same day for a field's hover
 * border: the curve, not the duration, was the cut. On the travel ease-out
 * `cubic-bezier(0.22, 1, 0.36, 1)` a 120ms colour change is 50% done at 16ms
 * and 90% done at 45ms — one frame, then three. On `ease` over 150ms it is
 * 50% done at 44ms and 90% at 94ms: still quick enough that a hover never
 * trails the pointer, and long enough to read as easing (2026-11-08 motion
 * pass). Under Reduce Motion both directions stay the 80ms micro fade —
 * non-spatial, so it is kept rather than removed. Press transforms are not
 * here: Motion owns them (`whileTap`), and the CSS fallback keeps the spatial
 * timing below.
 */
const nonSpatialDuration = {
  default: vars["--aui-motion-duration-quick"],
  "@media (prefers-reduced-motion: reduce)":
    vars["--aui-motion-duration-micro"],
} as const;

/**
 * A reveal driven by an ANCESTOR's hover (row actions, selection boxes) never
 * matches `:hover` itself, so it keeps one symmetric duration.
 */
const revealDuration = {
  default: vars["--aui-motion-duration-fast"],
  "@media (prefers-reduced-motion: reduce)":
    vars["--aui-motion-duration-micro"],
} as const;

const spatialDuration = {
  default: vars["--aui-motion-duration-fast"],
  "@media (prefers-reduced-motion: reduce)": "0ms",
} as const;

export const transition = stylex.create({
  /**
   * Color-only state change — THE default for interactive chrome (buttons,
   * triggers, menu items, rows, links).
   */
  colors: {
    transitionDuration: nonSpatialDuration,
    transitionProperty: "background-color, border-color, color",
    transitionTimingFunction: vars["--aui-motion-ease-color"],
  },
  /**
   * Colors plus `opacity` plus `box-shadow`, for controls that fade as a whole
   * on disabled/loading AND for the bordered pressables that now carry
   * `elevationRaised` (`Button` primary/secondary/outline/danger, `controlChrome.trigger`):
   * their box-shadow collapses to `elevationFlat` on `:active`, so the shadow is
   * part of the state matrix, not a static decoration. A control whose shadow
   * never changes gets this recipe as a no-op — nothing else needed auditing.
   */
  control: {
    transitionDuration: nonSpatialDuration,
    transitionProperty:
      "background-color, border-color, color, opacity, box-shadow",
    transitionTimingFunction: vars["--aui-motion-ease-color"],
  },
  /**
   * Colors plus `box-shadow`, for controls that actually grow a ring or halo
   * on a state change. Do NOT use this for a control whose shadow never
   * changes.
   */
  ring: {
    transitionDuration: nonSpatialDuration,
    transitionProperty: "background-color, border-color, color, box-shadow",
    transitionTimingFunction: vars["--aui-motion-ease-color"],
  },
  /** Reveal-on-hover chrome (row actions, table selection checkboxes). */
  fade: {
    transitionDuration: revealDuration,
    transitionProperty: "opacity",
    transitionTimingFunction: vars["--aui-motion-ease-standard"],
  },
  /**
   * Determinate bar fill — `width` plus `background-color`, for a progress or
   * usage meter whose track stays put while the fill grows and recolors across
   * its thresholds. Named as its own key because `colors` alone leaves the
   * width a hard jump, and a bar is the one place a width transition is not a
   * layout animation: the fill is absolutely sized inside a fixed track, so
   * nothing around it reflows.
   *
   * Spatial: a bar that grows IS motion, so under reduced motion the fill
   * snaps to its new value rather than keeping a micro ease.
   */
  bar: {
    transitionDuration: spatialDuration,
    transitionProperty: "width, background-color",
    transitionTimingFunction: vars["--aui-motion-ease-standard"],
  },
  /**
   * Edge-anchored surface enter/exit — `translate` plus `opacity`, for a
   * sheet/drawer that slides in from a viewport edge on the CSS layer (Base UI
   * `[data-starting-style]` / `[data-ending-style]` arms) rather than through
   * Motion. `translate` and not `transform`, so it composes with the
   * transform Motion owns on the same element without either overwriting the
   * other.
   *
   * Spatial, and the strictest case for it: an off-screen slide is exactly the
   * vestibular trigger `prefers-reduced-motion` exists for, so it must be
   * instant there, not merely quick.
   */
  slide: {
    transitionDuration: spatialDuration,
    transitionProperty: "translate, opacity",
    transitionTimingFunction: vars["--aui-motion-ease-standard"],
  },
  /**
   * `transform` alone — a chevron rotating open, a zoom/pan surface, an
   * indicator sliding. Separate from `transformFallback` because those call
   * sites change nothing but the transform, and pulling in four color
   * properties they never animate costs a compositor check per frame and lies
   * about what moves.
   *
   * Motion still owns transform wherever a component renders an `m.*` element
   * (see `decisions/motion-architecture.md`); this key is for the CSS-layer
   * elements that do not.
   */
  transform: {
    transitionDuration: spatialDuration,
    transitionProperty: "transform",
    transitionTimingFunction: vars["--aui-motion-ease-standard"],
  },
  /**
   * CSS press fallback for components that render a non-Motion element and so
   * cannot use `whileTap`. Names `transform` alongside the color set.
   */
  transformFallback: {
    transitionDuration: spatialDuration,
    transitionProperty:
      "background-color, border-color, color, opacity, transform",
    transitionTimingFunction: vars["--aui-motion-ease-standard"],
  },

  // ---- Duration overrides (compose after a property key) -------------------
  /** 80ms — a press/release tick. */
  motionDurationMicro: {
    transitionDuration: {
      default: vars["--aui-motion-duration-micro"],
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
  },
  /** 150ms — a change the eye should follow (indicator slide, reveal). */
  motionDurationQuick: {
    transitionDuration: {
      default: vars["--aui-motion-duration-quick"],
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
  },
  /** 220ms — a small layout/size change. */
  motionDurationNormal: {
    transitionDuration: {
      default: vars["--aui-motion-duration-normal"],
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
  },
  /** 250ms — an emphasized surface change. */
  motionDurationEmphasis: {
    transitionDuration: {
      default: vars["--aui-motion-duration-emphasis"],
      "@media (prefers-reduced-motion: reduce)": "0ms",
    },
  },
});
