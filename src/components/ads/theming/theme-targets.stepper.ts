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

/** A surface that also owns the air inside it. */
const panel = [...surface, ...themeSpaceProperties] as const;

/** A control: its surface, its own internal air, and its focus ring. */
const control = [...panel, ...themeFocusProperties] as const;

/** A text part inside somebody else's box. */
const ink = [...themeTypographyProperties, "color", "opacity"] as const;

/** Internal air only, for a part whose box is a track in its parent's grid. */
const space = [...themeSpaceProperties] as const;

/**
 * The progress family: the four components that draw a *sequence* — a
 * breadcrumb trail, a wizard rail, an event timeline, and an agent step rail.
 *
 * Two shapes recur here and decide every target/slot call below. A sequence
 * root is almost always a surface-less list whose parts carry all the paint, so
 * it publishes one target and reaches its parts through slots (`breadcrumb`,
 * `timeline`, `step-rail`, `state-timeline`). The exception is a part that is a
 * control or paints a mark of its own on a surface the root does not own — the
 * step marker, the step button, the event card — and those get their own
 * target, because a brand needs a selector for them that does not depend on
 * where the composition happened to nest them.
 *
 * What the family cannot offer, and the reason is worth knowing before adding a
 * property here: every connector in it is a `::before`/`::after` on the part it
 * belongs to (`Stepper.Item`'s rule, `Timeline.Dot`'s line and dot,
 * `StepRail`'s connector is the one real element). The recipe vocabulary has no
 * pseudo-element, so those marks are reachable only through the palette tokens
 * they read, and no `backgroundColor` is listed for a part whose visible mark is
 * a pseudo-element — it would paint the part's own box instead and look like
 * support.
 */
export const stepperThemeTargets = {
  breadcrumb: {
    axes: { density: ["compact", "default"] },
    /*
     * One target, five slots. The trail has no surface of its own and its
     * crumbs are the same face in two states — navigable and current — so a
     * brand that wants a different breadcrumb wants one rule with refinements,
     * not two targets whose relationship it has to reconstruct.
     */
    exports: [
      "Breadcrumb",
      "Breadcrumb.Item",
      "Breadcrumb.Link",
      "Breadcrumb.List",
      "Breadcrumb.Page",
      "Breadcrumb.Root",
      "Breadcrumb.Separator",
    ],
    properties: surface,
    root: 'the `<nav aria-label="Breadcrumb">` landmark `Breadcrumb.Root` renders',
    slots: {
      item: space,
      /* The one focusable part, which is why the ring properties are here. */
      link: control,
      list: space,
      page: panel,
      /*
       * The `<li>`. Its ink reaches a caller's own separator (`<Separator>/`);
       * the built-in chevron declares its own colour on the glyph, which an
       * inherited value cannot outrank whatever layer it comes from.
       */
      separator: panel,
    },
    /*
     * The crumb's states, entered by the `link` slot — slot rules share the
     * target's state set, and the trail root itself only ever sees `:hover`.
     */
    states: ["hover", "focus-visible"],
  },
  stepper: {
    axes: {
      size: ["sm", "md"],
      variant: ["navigation", "track"],
    },
    exports: [
      "Stepper",
      "Stepper.Content",
      "Stepper.Description",
      "Stepper.Item",
      "Stepper.Root",
      "Stepper.Title",
    ],
    properties: panel,
    root: 'the `<nav aria-label="Progress">` landmark `Stepper.Root` renders around the step `<ol>`',
    slots: {
      /*
       * The step's inner surface — the part that actually paints in the
       * `navigation` variant, where a step is a bordered chip rather than a
       * marker beside a label. The `<li>` above it owns only the connector.
       */
      body: panel,
      content: space,
      description: ink,
      item: panel,
      title: ink,
    },
    /*
     * `disabled` only. A disabled step carries `aria-disabled` on its `<li>`,
     * which the generator's `disabled` pseudo covers; nothing in the rail
     * hovers or takes focus except `Stepper.Trigger`, which is its own target.
     */
    states: ["disabled"],
  },
  "stepper-flow": {
    exports: ["Stepper.Flow", "Stepper.Panel", "Stepper.PanelStep"],
    /*
     * The wizard's frame rather than the rail's: `Flow` owns the gap between
     * the rail and the step content, so a brand that wants the whole wizard on
     * a panel sets it here and does not have to wrap ADS in one more div.
     */
    properties: panel,
    root: "the `<div>` `Stepper.Flow` renders around a rail and its panels",
    slots: {
      panel: space,
      "panel-step": panel,
    },
  },
  "stepper-indicator": {
    axes: {
      size: ["sm", "md"],
      /*
       * The step's `status`, which is what the marker's fill, border and ink
       * are entirely made of. Reflected as `tone` because that is the axis name
       * the vocabulary has for "which hue does this take"; the values are the
       * `status` prop's own.
       */
      tone: ["complete", "current", "pending", "error"],
      variant: ["navigation", "track"],
    },
    exports: ["Stepper.Indicator"],
    /*
     * No space group: the marker is a fixed square sized by the rail's
     * `--ads-stepper-marker-size`, which the grid track beside it measures
     * against, so padding here would move the label column too.
     */
    properties: surface,
    root: "the `<span>` `Stepper.Indicator` renders as the step marker",
  },
  "stepper-trigger": {
    axes: {
      size: ["sm", "md"],
      /* The step's `status`, as on `stepper-indicator`. */
      tone: ["complete", "current", "pending", "error"],
      variant: ["navigation", "track"],
    },
    exports: ["Stepper.Trigger"],
    properties: control,
    root: "the `<button>` `Stepper.Trigger` renders around a step's anatomy",
    states: ["hover", "active", "focus-visible", "disabled"],
  },
  timeline: {
    axes: { density: ["compact", "regular"] },
    exports: ["Timeline", "Timeline.Dot", "Timeline.Item", "Timeline.Root"],
    properties: panel,
    root: "the `<ol>` `Timeline.Root` renders",
    slots: {
      /*
       * The rail cell, not the mark in it. Both the dot and the connecting
       * hairline are pseudo-elements on this span, so `opacity` is the only
       * thing a recipe can say about them; the dot's tone comes from the
       * palette tokens `Timeline.Dot` reads.
       */
      dot: ["opacity"],
      item: space,
    },
  },
  "timeline-content": {
    exports: [
      "Timeline.Content",
      "Timeline.Description",
      "Timeline.Time",
      "Timeline.Title",
    ],
    /*
     * Its own target rather than a `timeline` slot: the event card is the one
     * surface in the component, and it is the part a consumer renders on its
     * own inside somebody else's row often enough that a brand needs a selector
     * that does not depend on the `<ol>` being an ancestor.
     */
    properties: panel,
    root: "the `<div>` `Timeline.Content` renders as the event card",
    slots: {
      description: ink,
      time: ink,
      title: ink,
    },
  },
  "step-rail": {
    axes: { density: ["compact", "regular"] },
    exports: ["StepRail", "StepRail.Step"],
    properties: panel,
    root: "the `<div>` `StepRail` renders around its steps",
    slots: {
      /* The trailing pad that gives a one-line step a visible connector. */
      body: space,
      /* The centred marker box; the mark inside it belongs to the caller. */
      marker: surface,
      /*
       * The rule itself, and the one connector in this family that is a real
       * element rather than a pseudo — so it is the one a brand can recolour.
       */
      connector: surface,
      step: space,
    },
  },
  "state-timeline": {
    exports: ["StateTimeline"],
    properties: panel,
    root: "the `<div>` `StateTimeline` renders around its header and entry list",
    slots: {
      detail: panel,
      /* The `<li>`, which owns the hairline between entries. */
      entry: panel,
      /* The mono ink the component is mostly made of. */
      key: ink,
      meta: ink,
      preview: ink,
      /* The entry row, which is a `<button>` whenever it has a detail to open. */
      row: control,
      summary: ink,
      timestamp: ink,
      /* The expand/collapse-all text control in the header. */
      toggle: control,
    },
    /*
     * The entry row's states, entered by the `row` slot. The root is a plain
     * column and enters none of them itself.
     */
    states: ["hover", "active", "focus-visible"],
  },
} as const satisfies ThemeTargetRegistry;
