import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/**
 * Shared control metrics — THE single source of the control-height map
 * (design-direction §5): xs 28 / sm 32 / md 36 (default) / lg 40, each bumped
 * to `controlHeightXl` (44px) under `(pointer: coarse)` for the WCAG 2.5.8
 * touch-target minimum.
 *
 * Compose into a control's `sx(...)` call (after the component's base style,
 * like `focusRing`) instead of re-declaring `minBlockSize`. Per-component
 * copies of this map are how heights drift: a filter row mixing a default
 * TextField (36) with an off-map control renders uneven. Every sized form
 * control (Button, TextField, Select, NativeSelect, Combobox, Autocomplete,
 * DatePicker, NumberField, InputGroup, Field, ...) must consume these styles.
 *
 * A caller CANNOT raise a control's height from outside by passing a
 * `minBlockSize` through `className`. Components merge that with `cx()`, a plain
 * string join, so the caller's atomic class and the class below carry equal
 * specificity and the winner is stylesheet order — and StyleX emits same-
 * property rules sorted by value, which puts every literal ahead of every
 * `var()`. So the `var()` rule here always wins on a fine pointer, and under
 * `(pointer: coarse)` the media-query rule's doubled specificity wins outright.
 * Measured in a browser against the built platform CSS: `size="sm"` + an
 * external `minBlockSize: 44` renders 32px, not 44px. `public/src/platform/
 * ApiTokensDialog.tsx` shipped exactly that literal on four Buttons as a
 * hand-rolled touch target; it never applied, and it was never needed, because
 * the coarse-pointer bump below is already the WCAG 2.5.8 floor. Need a taller
 * control? Ask for a larger `size`.
 */
export const controlHeights = stylex.create({
  xs: {
    minBlockSize: {
      default: vars.controlHeightXs,
      "@media (pointer: coarse)": vars.controlHeightXl,
    },
  },
  sm: {
    minBlockSize: {
      default: vars.controlHeightSm,
      "@media (pointer: coarse)": vars.controlHeightXl,
    },
  },
  md: {
    minBlockSize: {
      default: vars.controlHeight,
      "@media (pointer: coarse)": vars.controlHeightXl,
    },
  },
  lg: {
    minBlockSize: {
      default: vars.controlHeightLg,
      "@media (pointer: coarse)": vars.controlHeightXl,
    },
  },
});

/**
 * Square variant for icon-only controls: the same height map applied to both
 * axes (icon buttons, steppers).
 */
export const controlSquares = stylex.create({
  xs: {
    inlineSize: {
      default: vars.controlHeightXs,
      "@media (pointer: coarse)": vars.controlHeightXl,
    },
    minBlockSize: {
      default: vars.controlHeightXs,
      "@media (pointer: coarse)": vars.controlHeightXl,
    },
  },
  sm: {
    inlineSize: {
      default: vars.controlHeightSm,
      "@media (pointer: coarse)": vars.controlHeightXl,
    },
    minBlockSize: {
      default: vars.controlHeightSm,
      "@media (pointer: coarse)": vars.controlHeightXl,
    },
  },
  md: {
    inlineSize: {
      default: vars.controlHeight,
      "@media (pointer: coarse)": vars.controlHeightXl,
    },
    minBlockSize: {
      default: vars.controlHeight,
      "@media (pointer: coarse)": vars.controlHeightXl,
    },
  },
  lg: {
    inlineSize: {
      default: vars.controlHeightLg,
      "@media (pointer: coarse)": vars.controlHeightXl,
    },
    minBlockSize: {
      default: vars.controlHeightLg,
      "@media (pointer: coarse)": vars.controlHeightXl,
    },
  },
});

/**
 * Canonical prop-axis → height mappings (design-direction §2/§5):
 * `size` xs → 28 / sm → 32 / md → 36 (default) / lg → 40. Look heights up
 * through this map so the convention cannot fork.
 *
 * `size` is the ONLY scale axis a control exposes (design-direction §5's axis
 * rule). `density` is a different axis and belongs to surfaces: it buys
 * internal air, not a height off this ramp. The two are orthogonal — a theme
 * density preset offsets the whole ramp while `size` picks a step within it —
 * which is precisely why a control must not offer both. Field-shaped controls
 * used to accept `density` as a second spelling of this axis, resolved as
 * `size ?? mapped(density)`; that made them mutually exclusive, so it was one
 * axis wearing two names rather than two axes, and it let a density
 * vocabulary absorb the t-shirt value `lg`.
 */
export const controlHeightBySize = {
  lg: controlHeights.lg,
  md: controlHeights.md,
  sm: controlHeights.sm,
  xs: controlHeights.xs,
} as const;

/** The canonical control scale vocabulary. xs 28 / sm 32 / md 36 / lg 40. */
export type ControlScale = "xs" | "sm" | "md" | "lg";

/**
 * Canonical glyph sizes for icons placed inside sized controls.
 *
 * `xs` holds at the `sm` rung (14px) rather than continuing the ramp's 2px
 * step down to 12px. The ramp is §9's, and §9 puts the token set in
 * `tokens.stylex.ts` — it stops at `controlIconSizeSm`, and a consumer recipe
 * minting its own `12px` literal would fork the glyph scale exactly the way
 * per-component height maps fork the height scale (see `controlHeights`
 * above). 14px in a 28px square is a 0.50 fill against the ramp's 0.44–0.45,
 * which reads as a *slightly* denser control rather than as a different one;
 * the alternative — an `xs` Button whose glyph is off the token scale
 * entirely — is the drift this map exists to prevent. If `xs` earns a real
 * rung, it is one token in §9 and one line here.
 */
export const controlIconSizes = {
  lg: vars.controlIconSizeLg,
  md: vars.controlIconSizeMd,
  sm: vars.controlIconSizeSm,
  xs: vars.controlIconSizeSm,
} as const;

/** Tree row metrics: compact scan rows vs. the regular nav row. */
export const treeRowHeights = stylex.create({
  compact: {
    blockSize: vars.treeRowHeightCompact,
  },
  regular: {
    blockSize: vars.treeRowHeightRegular,
  },
});
