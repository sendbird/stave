/**
 * The vocabulary a product theme is allowed to speak.
 *
 * A product brand restyles ADS by naming a **target** (`button`), optionally an
 * **axis value** (`variant="primary"`), a **state** (`hover`), or a **slot**
 * (`icon`), and then a set of **properties**. Everything in that sentence is
 * enumerated here rather than left open, for three reasons that were each a
 * defect in the first sketch of this API:
 *
 * 1. **Only longhands.** `border`, `background`, `padding`, `font` and the
 *    other shorthands are deliberately absent. A shorthand resets every
 *    longhand it covers — `background: red` also clears `background-image` —
 *    so a recipe that named one would silently undo a component declaration it
 *    never mentioned. With longhands only, a recipe can change exactly what it
 *    writes down. This is the "handle shorthand/longhand conflicts explicitly"
 *    requirement, discharged by not having the conflict.
 * 2. **Only paint and text.** Geometry that other components measure against —
 *    `display`, `position`, `inlineSize`, `flex`, `grid*` — is not themeable.
 *    A brand that could move a control out of flow could break the layout of a
 *    composition it has never seen. Layout composition stays with the host,
 *    through `xstyle`, at the call site that can see the consequence.
 * 3. **A generated rule that changes no pixel is not support.** A property is
 *    listed for a target only where that target actually paints it. Padding is
 *    on the controls that own their own box, not on a part whose box belongs to
 *    its parent's grid.
 */

/** Paint: fill, edge, elevation and ink. */
export const themeSurfaceProperties = [
  "backgroundColor",
  "backgroundImage",
  "borderBlockEndColor",
  "borderBlockStartColor",
  "borderColor",
  "borderInlineEndColor",
  "borderInlineStartColor",
  "borderRadius",
  "borderStyle",
  "borderWidth",
  "boxShadow",
  "color",
  "opacity",
] as const;

/** Text. `lineHeight` is here because it is ink metrics, not layout. */
export const themeTypographyProperties = [
  "fontFamily",
  "fontSize",
  "fontStyle",
  "fontWeight",
  "letterSpacing",
  "lineHeight",
  "textDecorationLine",
  "textTransform",
] as const;

/**
 * Internal spacing, for targets that own their own box.
 *
 * Logical properties only: ADS is RTL-correct and a brand must not be the
 * thing that reintroduces a physical left edge.
 */
export const themeSpaceProperties = [
  "columnGap",
  "paddingBlockEnd",
  "paddingBlockStart",
  "paddingInlineEnd",
  "paddingInlineStart",
  "rowGap",
] as const;

/**
 * The keyboard focus ring.
 *
 * Separate from `themeSurfaceProperties` because it is the one group with an
 * accessibility floor: a brand may recolour or thicken the ring, and the
 * generator refuses `outlineStyle: "none"` and a zero width. Not every target
 * takes focus, so only the focusable ones list it.
 */
export const themeFocusProperties = [
  "outlineColor",
  "outlineOffset",
  "outlineStyle",
  "outlineWidth",
] as const;

export type ThemeProperty =
  | (typeof themeFocusProperties)[number]
  | (typeof themeSpaceProperties)[number]
  | (typeof themeSurfaceProperties)[number]
  | (typeof themeTypographyProperties)[number];

/**
 * The states a recipe may address.
 *
 * These are CSS pseudo-classes on the target itself, not arbitrary selectors:
 * the generator maps each to exactly one suffix and nothing else, so a theme
 * definition cannot smuggle a descendant selector through a state key.
 *
 * `disabled` is last on purpose. The generator emits states in this order, so a
 * disabled control keeps its disabled paint while the pointer is over it — the
 * precedence question every themeable button system gets wrong once.
 */
export const themeStates = [
  "hover",
  "active",
  "focus-visible",
  "disabled",
] as const;

export type ThemeState = (typeof themeStates)[number];

/**
 * Data attribute names a target may NOT use for an axis.
 *
 * Base UI publishes component state as `data-*` on the same element ADS styles,
 * and a theme axis that shadowed one would make `[data-open]` mean two
 * different things depending on which component you were looking at. The guard
 * reads this list; it is here rather than in the guard because it is a fact
 * about the rendered contract, not about the check.
 */
export const reservedStateAttributes = [
  "checked",
  "closed",
  "disabled",
  "dragging",
  "highlighted",
  "index",
  "open",
  "orientation",
  "pressed",
  "readonly",
  "required",
  "selected",
  "side",
  "starting-style",
  "valid",
] as const;
