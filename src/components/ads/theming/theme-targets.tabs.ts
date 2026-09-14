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

/** A surface that also owns the air between the things standing on it. */
const track = [...themeSurfaceProperties, ...themeSpaceProperties] as const;

/** A text part inside somebody else's box. */
const ink = [...themeTypographyProperties, "color", "opacity"] as const;

/**
 * A part that paints nothing but the gap between its rows.
 *
 * Every root in this family is a bare grid or flex column: strip then panel,
 * row then row. There is no fill, no edge and no type on those elements, so
 * the gap is the only declaration a rule could change — and it is the one a
 * brand with a tighter rhythm actually reaches for.
 */
const gutter = ["columnGap", "rowGap"] as const;

/** The same, for a single-column stack where `column-gap` computes to nothing. */
const rowGutter = ["rowGap"] as const;

/** A hairline rule: a filled 1px box, not a bordered one. */
const rule = ["backgroundColor", "borderRadius", "opacity"] as const;

/**
 * Tabs, toolbars, disclosures and the two navigational rails.
 *
 * One shape recurs across all nine components and decides every
 * target-vs-slot call below: an inert container, one or more parts that paint
 * a static surface inside it, and a pressable part that has its own
 * hover/press/focus/disabled paint. Only a TARGET carries states, so every
 * pressable part here is a target of its own even when it lives inside another
 * target's box — `.ads-accordion-trigger` exists because a brand that cannot
 * write the trigger's `:hover` cannot restyle an accordion at all. The static
 * parts stay slots, which is what keeps a strip and its track one rule with
 * refinements instead of four unrelated names.
 */
export const tabsThemeTargets = {
  accordion: {
    exports: [
      "Accordion",
      "Accordion.Header",
      "Accordion.Item",
      "Accordion.Panel",
      "Accordion.Root",
    ],
    properties: rowGutter,
    root: "the `<div>` Base UI's accordion root renders",
    slots: {
      /*
       * `item` and `header` are both here because they are different boxes,
       * not two names for one: the item spans the row AND its open panel, the
       * header spans only the row. A per-item card wants the first; a banded
       * header row wants the second. Both are paintable because the trigger
       * standing in the header is transparent by decision (§1.3 — a
       * disclosure list is a reading sequence, not a stack of cards), so
       * whatever these two paint is what the reader sees.
       */
      header: themeSurfaceProperties,
      item: themeSurfaceProperties,
      panel: ink,
    },
  },
  "accordion-trigger": {
    exports: ["Accordion.Trigger"],
    properties: control,
    root: "the `<button>` Base UI's accordion trigger renders",
    states: ["hover", "active", "focus-visible", "disabled"],
  },
  "breadcrumb-trail": {
    exports: ["BreadcrumbTrail"],
    properties: rowGutter,
    root: "the `<div>` `BreadcrumbTrail` renders around the entry list",
    /*
     * No `icon` slot, deliberately. The glyph is the one element carrying the
     * entry's severity (`tone`, and a `status >= 400`), so a slot rule would
     * paint neutral, warning and danger the same colour — a brand would have
     * erased the signal by restyling it. Severity moves with the danger and
     * warning tokens instead, which a brand does own.
     */
    slots: {
      message: ink,
      meta: ink,
      summary: ink,
      /*
       * Typography only, for the same reason: the trailing figure switches to
       * danger ink at 400 and above.
       */
      status: themeTypographyProperties,
    },
  },
  collapsible: {
    axes: { variant: ["card", "plain"] },
    exports: ["Collapsible", "Collapsible.Panel", "Collapsible.Root"],
    properties: themeSurfaceProperties,
    root: "the `<div>` Base UI's collapsible root renders",
    /*
     * The disclosure's open/closed distinction is Base UI's `[data-open]`,
     * already on this element, so it is not one of the four states and does
     * not need to be.
     */
    slots: { panel: ink },
  },
  "collapsible-trigger": {
    axes: {
      density: ["compact", "regular"],
      /* Read from the root's context, not a prop of its own: a card trigger is
       * the card's header plane and a plain one is a standalone row, and the
       * two want different corners. */
      variant: ["card", "plain"],
    },
    exports: ["Collapsible.Trigger"],
    properties: control,
    root: "the `<button>` Base UI's collapsible trigger renders",
    states: ["hover", "active", "focus-visible", "disabled"],
  },
  "floating-toolbar": {
    exports: ["FloatingToolbar", "FloatingToolbar.Separator"],
    properties: track,
    root: "the `role=\"toolbar\"` `<div>` portalled to `document.body`",
    slots: { separator: rule },
  },
  pagination: {
    exports: ["Pagination"],
    properties: gutter,
    root: "the `<nav>` `Pagination` renders",
    slots: { ellipsis: ink, label: ink, summary: ink },
  },
  "pagination-page": {
    /*
     * No export of its own: the rail's buttons are internal, and the one
     * public name belongs to the `<nav>` above.
     */
    exports: [],
    properties: control,
    root: "each `<button>` in the page rail, including prev and next",
    states: ["hover", "active", "focus-visible", "disabled"],
  },
  "session-tabs": {
    axes: { size: ["xs", "sm", "md"] },
    exports: ["SessionTabs"],
    properties: rowGutter,
    root: "the `<div>` Base UI's tabs root renders for `SessionTabs`",
    slots: {
      /* The strip's baseline rule — the whole reason a browser-style tab strip
       * reads as one. A brand that drops it drops it here. */
      list: themeSurfaceProperties,
      panel: ink,
    },
  },
  "session-tabs-action": {
    axes: { size: ["xs", "sm", "md"] },
    exports: [],
    properties: control,
    root: "the scroll-backward, scroll-forward, add and close `<button>`s",
    states: ["hover", "active", "focus-visible", "disabled"],
  },
  "session-tabs-tab": {
    axes: { size: ["xs", "sm", "md"] },
    exports: [],
    properties: control,
    root: "the `<button>` Base UI's tab renders inside a session tab item",
    states: ["hover", "active", "focus-visible", "disabled"],
  },
  "table-of-contents": {
    exports: ["TableOfContents"],
    /*
     * The outline's type, and only that: the `<nav>` sets the family and size
     * the entries inherit, and paints no box of its own.
     */
    properties: themeTypographyProperties,
    root: "the `<nav>` `TableOfContents` renders",
  },
  "table-of-contents-link": {
    exports: [],
    properties: control,
    root: "each `<a>` in the outline, active or not",
    /*
     * The reading-location rail is `aria-current="location"`, which the
     * vocabulary cannot select and must not learn to: an attribute-selector
     * escape is how a closed contract stops being one. The rail follows the
     * accent token, which a brand sets.
     */
    states: ["hover", "active", "focus-visible"],
  },
  tabs: {
    axes: {
      size: ["xs", "sm", "md"],
      variant: ["pill", "line"],
    },
    exports: ["Tabs", "Tabs.Panel", "Tabs.Root"],
    properties: gutter,
    /*
     * Both axes are reflected here even though the root paints neither,
     * because the root is the only element the `panel` slot is reachable
     * through — without them a brand could not give a `line` strip's panel
     * different ink from a `pill` one. Orientation is absent for a different
     * reason: Base UI already publishes it as `data-orientation` on this
     * element, and an axis of the same name would make one attribute mean two
     * things.
     */
    root: "the `<div>` Base UI's tabs root renders",
    slots: { panel: ink },
  },
  "tabs-indicator": {
    /* `pill` and `line` are not two colourways of one mark — a chip with a
     * fill and a lift, versus a 2px bar. Nothing else moves its paint. */
    axes: { variant: ["pill", "line"] },
    exports: ["Tabs.Indicator"],
    properties: themeSurfaceProperties,
    root: "the `<span>` Base UI's tabs indicator renders",
  },
  "tabs-list": {
    axes: { variant: ["pill", "line"] },
    exports: ["Tabs.List"],
    properties: track,
    root: "the `role=\"tablist\"` `<div>` Base UI's tabs list renders",
  },
  "tabs-tab": {
    axes: {
      size: ["xs", "sm", "md"],
      variant: ["pill", "line"],
    },
    exports: ["Tabs.Tab"],
    properties: control,
    root: "the `<button>` Base UI's tab renders",
    states: ["hover", "active", "focus-visible", "disabled"],
  },
  toolbar: {
    exports: ["Toolbar", "ToolbarButtonGroup", "ToolbarDivider"],
    properties: track,
    root: "the `role=\"toolbar\"` `<div>` Base UI's toolbar root renders",
    slots: {
      /* A cluster inside the bar owns nothing but the air between its own
       * buttons; the bar's fill is already underneath it. */
      group: themeSpaceProperties,
      separator: rule,
    },
  },
  "toolbar-button": {
    exports: ["ToolbarIconButton"],
    properties: control,
    /*
     * `active` is not an axis: it is a `boolean` prop with no DOM spelling on
     * this element, so a brand cannot reach the selected weight from here. See
     * the note in `Toolbar.tsx`.
     */
    root: "the `<button>` Base UI's toolbar button renders, in a docked bar or a floating pill",
    states: ["hover", "active", "focus-visible", "disabled"],
  },
} as const satisfies ThemeTargetRegistry;
