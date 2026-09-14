import {
  themeFocusProperties,
  themeSpaceProperties,
} from "./theme-contract";
import {
  field,
  ink,
  mark,
  rows,
  surface,
} from "./theme-targets.picker.properties";
import type { ThemeTargetRegistry } from "./theme-target-types";
import { valuePickerThemeTargets } from "./theme-targets.picker.values";

/**
 * The picker family: `Combobox`, `Select`, `Autocomplete`, `NativeSelect`,
 * `TreeSelect`, and the two standalone parts their popups compose from
 * (`Group`, `Separator`).
 *
 * Every one of these is a field plus a portalled list, and the portal is what
 * decides the shape of the registry. A slot is generated as a DESCENDANT of its
 * target's class, so nothing inside the popup can be a slot of the field: they
 * are in different DOM trees the moment the list opens. Hence the pairing that
 * repeats below — `<name>-field` (or `-trigger`) for the closed control,
 * `<name>-popup` for the surface the portal moves, and `<name>-item` for the
 * option row, which is broken out because a row's `:hover` is the single thing
 * a brand restyles most in a list and `states` only applies to a target.
 */
export const pickerThemeTargets = {
  ...valuePickerThemeTargets,
  "autocomplete-field": {
    axes: { size: ["xs", "sm", "md", "lg"] },
    exports: ["Autocomplete"],
    properties: field,
    root: "the `<div>` Base UI's autocomplete input group renders — the bordered field row",
    slots: {
      clear: mark,
      input: [...ink, ...themeSpaceProperties],
      "search-icon": ink,
    },
    /*
     * `:hover` only. The group is a `<div>`, so `:disabled` never matches it
     * (the disabled paint arrives through Base UI's state callback) and
     * `:focus-visible` never does either — focus lives on the inner input.
     */
    states: ["hover"],
  },
  "autocomplete-item": {
    axes: { size: ["xs", "sm", "md", "lg"] },
    /*
     * No export of its own: `Autocomplete` is a single-export component and its
     * option rows are rendered internally. The target exists anyway, for the
     * same reason `dialog-backdrop` does — a brand cannot restyle a suggestion
     * list it has no selector for.
     */
    exports: [],
    properties: field,
    root: "the option row Base UI's autocomplete item renders",
    states: ["hover", "active"],
  },
  "autocomplete-popup": {
    exports: [],
    properties: surface,
    root: "the Base UI autocomplete popup element",
    slots: {
      empty: [...ink, ...themeSpaceProperties],
      "group-label": [...ink, ...themeSpaceProperties],
      list: rows,
    },
  },
  "combobox-field": {
    axes: { size: ["xs", "sm", "md"] },
    exports: [
      "Combobox",
      "ComboboxArray",
      "Combobox.Actions",
      "Combobox.Chip",
      "Combobox.ChipRemove",
      "Combobox.Chips",
      "Combobox.Clear",
      "Combobox.Input",
      "Combobox.InputGroup",
      "Combobox.Loading",
      "Combobox.Trigger",
    ],
    properties: field,
    root: "the `<div>` Base UI's combobox input group renders — the bordered field row",
    slots: {
      actions: rows,
      chip: [...surface, ...themeSpaceProperties, ...themeFocusProperties],
      "chip-remove": mark,
      chips: rows,
      clear: mark,
      input: [...ink, ...themeSpaceProperties],
      loading: ink,
      "search-icon": ink,
      trigger: [...mark, ...themeSpaceProperties],
    },
    states: ["hover"],
  },
  "combobox-item": {
    axes: { size: ["xs", "sm", "md"] },
    exports: ["Combobox.Item", "Combobox.ItemIndicator"],
    properties: field,
    root: "the option row Base UI's combobox item renders",
    slots: { indicator: ink },
    states: ["hover", "active"],
  },
  "combobox-popup": {
    exports: [
      "Combobox.Empty",
      "Combobox.GroupLabel",
      "Combobox.List",
      "Combobox.Popup",
    ],
    /*
     * Surface only. The popup sets `padding: 0` on purpose — the inner gutter
     * lives on the list, inside the scroll area, so a height-clamped list never
     * clips its last row — so padding here would paint nothing and move the
     * gutter to the element that must not own it.
     */
    properties: surface,
    root: "the Base UI combobox popup element",
    slots: {
      empty: [...ink, ...themeSpaceProperties],
      "group-label": [...ink, ...themeSpaceProperties],
      list: rows,
    },
  },
  group: {
    axes: { density: ["compact", "regular"] },
    exports: ["Group"],
    /*
     * A `Group` paints nothing but the air between its children: the root is a
     * bare grid and the density prop is a `gap`. Listing the surface here would
     * generate rules for a box that has no border, no fill and no type of its
     * own.
     */
    properties: ["columnGap", "rowGap"],
    root: 'the `<div role="group">` `Group` renders',
    slots: {
      content: rows,
      description: ink,
      label: ink,
    },
  },
  "native-select": {
    axes: { size: ["xs", "sm", "md", "lg"] },
    exports: ["NativeSelect"],
    properties: field,
    root: "the `<select>` `NativeSelect` renders",
    /*
     * `:disabled` is real here, unlike on the `<div>`-shaped field rows above:
     * this target IS the form control, so the native pseudo-class matches it.
     */
    states: ["hover", "disabled"],
  },
  "select-item": {
    axes: { size: ["xs", "sm", "md", "lg"] },
    exports: ["Select.Item", "Select.ItemIndicator", "Select.ItemText"],
    properties: field,
    root: "the option row Base UI's select item renders",
    slots: { indicator: ink, text: ink },
    states: ["hover", "active"],
  },
  "select-label": {
    /*
     * Its own target rather than a slot of `select-trigger`: the label is the
     * trigger's SIBLING in the field column, and a slot is generated as a
     * descendant selector, which would never reach it.
     */
    exports: ["Select.Label"],
    properties: ink,
    root: "the `<label>` Base UI's select label renders",
  },
  "select-popup": {
    exports: [
      "Select.GroupLabel",
      "Select.List",
      "Select.Popup",
      "Select.ScrollDownArrow",
      "Select.ScrollUpArrow",
      "Select.Separator",
    ],
    properties: surface,
    root: "the Base UI select popup element",
    slots: {
      "group-label": [...ink, ...themeSpaceProperties],
      list: rows,
      /*
       * The two scroll affordances are separate slots because they are not
       * interchangeable: each rounds the corner it sits in and each fades
       * towards the middle of the list, so a brand that changed the popup's
       * radius has to be able to correct one without the other.
       */
      "scroll-down-arrow": surface,
      "scroll-up-arrow": surface,
      separator: [...surface, ...themeSpaceProperties],
    },
  },
  "select-trigger": {
    axes: { size: ["xs", "sm", "md", "lg"] },
    exports: [
      "Select",
      "SelectArray",
      "Select.Icon",
      "Select.Trigger",
      "Select.Value",
    ],
    properties: field,
    root: "the `<button>` Base UI's select trigger renders",
    slots: { icon: ink, value: [...ink, ...themeSpaceProperties] },
    /*
     * A native `<button>`, so `:disabled` matches. `:focus-visible` is still
     * absent for the `borderOnly` reason above — and a `<select>`-shaped
     * trigger does not match it on a click anyway, which is why the whole
     * family settled on the border.
     */
    states: ["hover", "active", "disabled"],
  },
  separator: {
    axes: { variant: ["solid", "dashed", "dotted"] },
    exports: ["Separator"],
    /*
     * The hairline is drawn with a BORDER, not a fill, because `border-style`
     * is the only thing that can be dashed. So the addressable paint is the
     * border trio; `backgroundColor` is not listed because nothing here has a
     * box to fill. Orientation is not an axis — Base UI already publishes
     * `data-orientation`, and shadowing it is what `reservedStateAttributes`
     * forbids.
     */
    properties: ["borderColor", "borderStyle", "borderWidth", "opacity"],
    root: 'the `<div role="separator">` `Separator` renders, or the flex row it renders instead when given a `label`',
    slots: {
      /* Only present on the labelled form, where the rule breaks in two. */
      label: ink,
      rule: ["borderBlockStartColor", "borderColor", "borderStyle", "opacity"],
    },
  },
  "tree-select": {
    axes: { size: ["xs", "sm", "md", "lg"] },
    exports: ["TreeSelect"],
    properties: field,
    /*
     * The trigger is a read-only `<input>` — that is what gives the summary its
     * ellipsis and its field paint — so this target is the input, not the
     * wrapper. The chevron beside it is a sibling of the input, not a child, so
     * it is not reachable as a slot from here.
     */
    root: "the read-only `<input>` `TreeSelect` renders as its popover trigger",
    states: ["hover", "disabled"],
  },
  "tree-select-popup": {
    exports: [],
    properties: surface,
    root: "the Base UI popover popup `TreeSelect` renders its tree in",
    slots: {
      count: ink,
      empty: [...ink, ...themeSpaceProperties],
      footer: [...surface, ...themeSpaceProperties],
      list: rows,
      row: [...surface, ...themeSpaceProperties],
      search: [...surface, ...themeSpaceProperties],
      status: [...ink, ...themeSpaceProperties],
    },
  },
} as const satisfies ThemeTargetRegistry;
