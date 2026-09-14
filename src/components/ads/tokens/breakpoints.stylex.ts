import * as stylex from "@stylexjs/stylex";

/**
 * Breakpoint constants for `@media` conditions in `stylex.create`.
 *
 * CSS custom properties cannot appear inside media queries, so these cannot be
 * `defineVars` tokens. They must be `defineConsts`, NOT a plain object: StyleX
 * only inlines a computed condition key it can resolve at compile time, and
 * `defineConsts` is the one API that makes an imported value resolvable.
 *
 * This was a plain `as const` object for its whole life, which is exactly why it
 * accumulated zero call sites: `[breakpoints.md]: …` against a plain object does
 * not fail at the call site, it compiles the key to an empty condition and blows
 * up in CSS generation with `SyntaxError: Invalid empty selector` from
 * lightningcss, naming no file. Anyone who tried it reverted. With
 * `defineConsts` the emitted CSS is byte-identical to the literal (verified).
 *
 * Use these when the surface is sized against the VIEWPORT; a component's own
 * reflow belongs in `@container` (§10), so most remaining ADS width literals are
 * correct as literals. `scripts/check-tokens.mjs` records which, and why.
 *
 * ONE SHAPE ONLY in StyleX 0.19 — a VALUE-level condition key, never a
 * RULE-level at-rule block:
 *
 *     inlineSize: { default: "220px", [breakpoints.md]: "100%" }   // works
 *     [breakpoints.md]: { inlineSize: "100%" }                     // FAILS
 *
 * The second form dies at build time with `Invalid pseudo or at-rule` — the
 * second reason this went unused, since several ADS width queries are written
 * that way. Restructure to the value-level shape, or keep the literal.
 *
 * `tokens.stylex.ts` re-exports this for JS/types. StyleX condition keys
 * (`[breakpoints.md]`) must import THIS module; a re-export compiles to an
 * empty media condition and fails CSS generation with `Invalid empty selector`.
 */
export const breakpoints = stylex.defineConsts({
  /** Phones / narrow panels. */
  sm: "@media (max-width: 560px)",
  /** Tablets / collapsed sidebars. */
  md: "@media (max-width: 768px)",
  /** Small desktops / docs top-nav collapse. */
  lg: "@media (max-width: 960px)",
});
