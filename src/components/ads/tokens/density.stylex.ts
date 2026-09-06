import * as stylex from "@stylexjs/stylex";

/**
 * Fixed density-padding scale (§8) — the padding counterpart of
 * `controlHeightXs..Xl`.
 *
 * A component's own `density`/`size` prop takes its padding and gap from HERE,
 * never from the `spaceN` ramp. `compactDensityTheme` shifts that ramp down one
 * name step from `space12` up and cannot shift the bottom (one step below
 * `space8` is `space4`), so under the compact preset `space12` === `space8`.
 * Seven components expressed a density prop as exactly that pair, which made
 * the prop resolve to ONE value and do nothing — `Group` and `DataTable` had no
 * other consumer of `density` at all, so their whole prop was inert.
 * `ThemeProvider` documents the precedence as "per-component `density`/`size`
 * props win ... no double compaction"; that is only true of a scale the theme
 * cannot reach.
 *
 * `defineConsts`, not `defineVars`, and that is the point: a theme can override
 * any `vars` entry, so keeping this scale out of `vars` makes "no theme touches
 * these" a compile-time property instead of a convention someone has to
 * remember. It also inlines, so `Table`'s inline custom property gets a literal
 * rather than a `var()` chain.
 *
 * Values are the padding vocabulary's own numbers (4 / 8 / 12) — the same three
 * steps `space4..space12` names under the default theme.
 */
export const densityPad = stylex.defineConsts({
  /** 4px — the tightest padded step; inline chips and dense rails. */
  xs: "0.25rem",
  /** 8px — `density="compact"`. */
  sm: "0.5rem",
  /** 12px — `density="regular"`, the default. */
  md: "0.75rem",
});
