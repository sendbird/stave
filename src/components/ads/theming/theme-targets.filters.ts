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
 * The gap between rows/controls, and nothing else.
 *
 * Both bars in this family are bare flex rows: no fill, no edge, no type of
 * their own. The gap they own is the only declaration a rule could change, and
 * it is the one a brand with a denser query row actually reaches for.
 */
const gutter = ["columnGap", "rowGap"] as const;

/**
 * Filter query surfaces: the two toolbars that carry a query, the removable
 * chips that report it, and the automation-rule editor.
 *
 * The shape that decides every call: a BAR owns the air between its controls
 * but paints no surface of its own (a track, gap only); the pressable parts —
 * the "Clear all" action, a chip's clickable body, a chip's remove button, a
 * rule row's remove button — each have their own hover/press/focus paint, and
 * only a TARGET carries states, so each is its own target even when it lives
 * inside another target's box. The static text parts of the rule panel stay
 * slots, because they share the panel's surface and only ever move with it.
 */
export const filtersThemeTargets = {
  "applied-filters": {
    /*
     * A track: the `role="group"` row owns the gap between its chips and the
     * "Clear all" action and paints nothing else. `inlineSize: 100%` is
     * layout, which the vocabulary deliberately cannot express, so this is
     * gap-only. The `scroller` and `addSlot` wrappers are pure layout with no
     * paint; a slot for either would be public API the implementation could no
     * longer delete, for no brand gain.
     */
    exports: ["AppliedFilters"],
    properties: gutter,
    root: "the `<div role=\"group\">` `AppliedFilters` renders",
  },
  "applied-filters-clear": {
    /*
     * No export of its own: the "Clear all" `<button>` is internal to
     * `AppliedFilters`, and the one public name belongs to the group above. It
     * is a target rather than a slot because it is pressable with its own
     * hover/active/focus paint, and a slot cannot carry states.
     */
    exports: [],
    properties: control,
    root: "the `<button>` `AppliedFilters` renders for \"Clear all\"",
    states: ["hover", "active", "focus-visible"],
  },
  "filter-bar": {
    /*
     * A track. The `role="search"` row owns the gap between search, quick
     * filters, the facet menu, the chips group and the trailing controls, and
     * paints no fill/edge/type of its own. `size` is not reflected here: it
     * flows to the child targets (the search field, the chips, the facet
     * button) that actually paint at scale, and no slot underneath this root
     * needs it to be reachable. The region wrappers (search/quick/chips/
     * trailing) are layout-only and get no slot for the same reason as
     * `applied-filters`.
     */
    exports: ["FilterBar"],
    properties: gutter,
    root: "the `<div role=\"search\">` `FilterBar` renders",
  },
  "filter-chip": {
    axes: {
      /*
       * Reflected because the chip's own box paints its border-radius and
       * type, and the `sm`/`md`/… scale is what a brand keys a denser chip
       * off. It is a target and not a slot of `applied-filters` because the
       * box carries a paintable surface of its own (tint fill + hairline),
       * distinct from the transparent track it sits on.
       */
      size: ["xs", "sm", "md", "lg"],
    },
    exports: ["FilterChip"],
    properties: surface,
    root: "the `<span>` (Motion `m.span`) `FilterChip` renders as the chip box",
  },
  "filter-chip-edit": {
    /*
     * The chip's clickable body, rendered as a `<button>` only when `onEdit`
     * is supplied. It is its own target, not a slot on `filter-chip`, because
     * it is pressable with its own hover/active overlay and focus ring — paint
     * that differs from the chip box and from the remove button — and only a
     * target carries states. The static (`onEdit`-absent) body is a plain
     * `<span>` that paints nothing and takes no state, so it needs no target.
     */
    exports: [],
    properties: control,
    root: "the `<button>` `FilterChip` renders for its clickable body",
    states: ["hover", "active", "focus-visible"],
  },
  "filter-chip-remove": {
    /*
     * The remove affordance is its OWN target, not a slot on `filter-chip`.
     * The question the brief poses — slot vs target — resolves on states: the
     * remove `<button>` has a hover/active background wash, a hover ink shift,
     * a leading hairline divider, and its own focus ring, all different from
     * the chip body's paint. A slot cannot carry states, so a slot here would
     * hand a brand a name it could not restyle the interaction of. It is a
     * target.
     */
    exports: [],
    properties: control,
    root: "the `<button>` `FilterChip` renders for its remove affordance",
    states: ["hover", "active", "focus-visible"],
  },
  "rule-builder": {
    /*
     * One target, four slots. The panel is the only surface: the section
     * grids, the rail and the rows share it and only ever move with it, so a
     * brand that wants a different rule editor wants one rule with refinements,
     * not five unrelated names.
     *
     * On nesting: the brief asks how a brand paints a nested condition group
     * differently from a top-level one. It deliberately CANNOT, because this
     * builder renders no nested groups — `conditions` is a flat list of rows
     * under one "When" clause, not a recursive tree, so there is no
     * nested-group element for an axis to reflect or a slot to name. `depth`
     * is also not one of the four closed axes, and inventing it would reflect
     * an attribute onto DOM that does not vary. If recursive groups are added
     * later, the nested group becomes its own target then; the vocabulary is
     * silent here because the rendered shape is silent, not because nesting is
     * forbidden.
     */
    exports: ["RuleBuilder"],
    properties: [...surface, ...themeSpaceProperties],
    root: "the `<section>` `RuleBuilder` renders",
    slots: {
      /*
       * The "When"/"Then" rail label. Typography only, not `ink`'s colour: the
       * label's uppercase micro-caps and weight are the clause marker, and its
       * subtle colour is a rhythm a brand tunes through the text tokens rather
       * than by overriding this one part to an arbitrary hue.
       */
      "clause-label": themeTypographyProperties,
      description: ink,
      /*
       * A condition/action row shares the panel surface and paints only its
       * own internal air and a hairline divider — it owns its box's padding
       * but not a fill. Space plus the surface edge, no full surface: a filled
       * row would rebuild the nested-card stack the row divider exists to
       * avoid (see `RuleBuilder.tsx`).
       */
      row: [...themeSpaceProperties, ...themeSurfaceProperties],
      title: ink,
    },
  },
  "rule-builder-remove": {
    /*
     * The per-row remove `<button>`. Its own target, not a `rule-builder`
     * slot, for the same reason as `filter-chip-remove`: it is pressable with
     * its own hover wash (a danger-soft tint) and focus ring, and a slot
     * cannot carry those states. `exports: []` — it is internal to the row.
     */
    exports: [],
    properties: control,
    root: "each `<button>` `RuleBuilder` renders to remove a condition or action row",
    states: ["hover", "active", "focus-visible"],
  },
} as const satisfies ThemeTargetRegistry;
