import { themeSpaceProperties } from "./theme-contract";
import {
  control,
  field,
  ink,
  rows,
  surface,
} from "./theme-targets.picker.properties";
import type { ThemeTargetRegistry } from "./theme-target-types";

/**
 * The picker EXTENSION: the five popup pickers that hang a grid or a list off a
 * trigger — `Calendar`, `DatePicker`, `EmojiPicker`, `PersonPicker`,
 * `CannedResponsePicker`.
 *
 * They repeat the field/popup/item shape the family already solved for the
 * comboboxes, with one addition the list-of-options pickers never had: a
 * pressable cell that is not a text row. A calendar day and an emoji cell paint
 * their own selected/hover state, so each is a TARGET of its own — the same
 * reason `combobox-item` is broken out — while the month title, the weekday
 * heading and the section label stay slots, because they are static text
 * sharing their surface's box.
 *
 * A separate module from `theme-targets.picker.ts` because the family outgrew
 * the source-size limit, and this is where the seam actually is: a generic list
 * picker takes whatever the caller put in the list, these five pick a value of
 * a known KIND. One family, one property vocabulary
 * (`./theme-targets.picker.properties`), two files.
 */
export const valuePickerThemeTargets = {
  calendar: {
    axes: { density: ["compact", "regular"] },
    exports: ["Calendar"],
    /*
     * The panel IS the surface: the `<div role="group">` paints the raised
     * fill, the hairline, the radius and the flat elevation, and owns the gap
     * between its header, presets and month grids. Its day cells and nav
     * buttons are separate targets below, so nothing here needs states.
     */
    properties: [...surface, ...themeSpaceProperties],
    root: 'the `<div role="group">` `Calendar` renders',
    slots: {
      /* The `YYYY-MM-DD` readout beside the header in range mode. */
      "range-meta": ink,
      /* The preset rail's own air; the buttons inside it are `Button`s and
       * carry `.ads-button`, so this slot only owns the row's gap. */
      presets: rows,
      /* The per-panel month name shown only in the two-up layout. */
      "panel-title": ink,
      /* The centred month/year heading. */
      title: ink,
      /* The Sun–Sat column headings — static labels, not day cells. */
      weekday: ink,
    },
  },
  "calendar-day": {
    axes: { density: ["compact", "regular"] },
    /*
     * No export of its own — the day cells are rendered inside `Calendar`. It
     * is still a target, not a slot of `calendar`: a day is pressable and
     * paints its own hover, selected, today and disabled states, and only a
     * target carries states. `density` is reflected because the cell's minimum
     * height is the one thing the density prop changes on it.
     */
    exports: [],
    properties: control,
    root: "each `<button>` day cell in the calendar grid",
    states: ["hover", "active", "disabled"],
  },
  "calendar-nav": {
    /*
     * The previous/next month `<button>`s. A target rather than a `calendar`
     * slot for the same reason as the day cell — its hover and disabled paint
     * are its own — and it takes no axis because it is one fixed icon square
     * regardless of the panel's density.
     */
    exports: [],
    properties: control,
    root: "the previous- and next-month `<button>`s in the calendar header",
    states: ["hover", "active", "disabled"],
  },
  "date-picker": {
    axes: {
      size: ["xs", "sm", "md", "lg"],
      /*
       * The resolved validity tone. `DatePicker` recolours its border to
       * danger when `error` is set and to nothing otherwise, so the only value
       * a brand can paint against is the error state; there is no success arm
       * on this field.
       */
      tone: ["default", "danger"],
    },
    exports: [
      "DatePicker",
      /*
       * Renders `<DatePicker mode="range" />`, so its rendered root is the same
       * read-only `<input>` that carries `.ads-date-picker`; a wrapper of the
       * picker, covered here rather than given a second target.
       */
      "FilterBarDateRange",
    ],
    properties: field,
    /*
     * The read-only `<input>` that opens the calendar, exactly as
     * `tree-select` targets its read-only trigger input. The calendar in the
     * popover is a whole `Calendar`, which carries `.ads-calendar` itself, so
     * this component publishes no popup target of its own — the popup element
     * paints nothing the calendar does not already own. The leading calendar
     * glyph and the description/error lines are siblings of this input, not
     * descendants, so they are not reachable as slots from here.
     */
    root: "the read-only `<input>` `DatePicker` renders as its calendar trigger",
    /*
     * `:disabled` matches — it is a real `<input>`. `:focus-visible` is absent
     * for the family's `borderOnly` reason, sharpened here: the input is
     * permanently `readOnly`, so it never matches `:focus-visible` on the
     * click that opens it, and the border carries focus instead.
     */
    states: ["hover", "disabled"],
  },
  "emoji-picker": {
    exports: ["EmojiPicker"],
    /*
     * The outer `<div>` is the only box a standalone mount can paint: it is
     * transparent-on-its-parent by default, but a brand giving the picker its
     * own panel fill, border or radius does it here, and the element owns the
     * gap between the search band and the scrolling sections. The cells are a
     * separate target below.
     */
    properties: [...surface, ...themeSpaceProperties],
    root: "the outer `<div>` `EmojiPicker` renders",
    slots: {
      /* The live-region "no emoji found" message. */
      empty: [...ink, ...themeSpaceProperties],
      /* The scrolling column of category sections — it owns the inter-section
       * gutter, the way every list slot in this family does. */
      list: rows,
      /* Each category `<h3>`: static text, not a pressable cell. */
      "section-label": ink,
      /*
       * The search field's box. It carries its own border and `borderOnly`
       * focus, so the surface it paints is themeable here; its focus ring is
       * the border, which `borderColor` already covers.
       */
      search: [...surface, ...themeSpaceProperties],
      "search-icon": ink,
    },
  },
  "emoji-picker-cell": {
    /*
     * The 36px glyph `<button>`s. A target, not a slot: each is pressable with
     * its own hover, press and focus paint, and only a target carries states.
     * It keeps `focusRing.ring`, so the four `outline*` properties are its
     * focus indicator — hence `control`, not `field`.
     */
    exports: [],
    properties: control,
    root: "each `<button>` emoji cell in the picker grid",
    states: ["hover", "active"],
  },
  "person-picker": {
    axes: { size: ["xs", "sm", "md"] },
    exports: ["PersonPicker"],
    /*
     * `PersonPicker` renders in two shapes and the class rides both, so a
     * brand's rule works in either: the field-mode wrapper `<div>` and the
     * anchored `Combobox.Trigger` `<button>`. The paint that matters is the
     * anchored trigger's — a quiet cell surface with its own hover, press and
     * focus — so the allowance is a full `control` and the states are its. In
     * field mode the query field itself is a `Combobox.InputGroup`, which
     * carries `.ads-combobox-field`; this target only wraps the label column
     * there, which is why `label` is the sole slot.
     */
    properties: control,
    root: "the field-mode wrapper `<div>`, and the anchored `Combobox.Trigger` `<button>` — the one element `PersonPicker` owns in each shape",
    slots: {
      /* The field-mode `<label>`. Absent in anchored mode, where the trigger
       * is the label. */
      label: ink,
    },
    states: ["hover", "active"],
  },
  "canned-response-picker": {
    /*
     * `standalone` draws its own card perimeter; `embedded` drops the border
     * and radius to sit inside an existing Popover or Drawer. The two want
     * different edges, so it is an axis, and the root paints the surface both
     * modes share plus owns nothing between bands — the search and list bands
     * own their own boxes below.
     */
    axes: { variant: ["standalone", "embedded"] },
    exports: ["CannedResponsePicker"],
    properties: [...surface, ...themeSpaceProperties],
    root: "the outer `<div>` `CannedResponsePicker` renders",
    slots: {
      /* The live-region "no matching replies" message. */
      empty: [...ink, ...themeSpaceProperties],
      /* The scrolling result list — its inner gutter, like every list here. */
      list: rows,
      /*
       * The search band is a `<label>` with a bottom hairline; it owns that
       * edge and its inline padding. The bare input inside it is transparent
       * and rides on this box, so the band is the surface a brand paints.
       */
      search: [...surface, ...themeSpaceProperties],
      "search-icon": ink,
    },
  },
  "canned-response-picker-item": {
    /*
     * The response row `<button>`. A target, not a slot: it is pressable with
     * its own hover, press and focus paint. Unlike the field pickers it keeps
     * `focusRing.ring` (inset, because the list clips), so `:focus-visible` is
     * a real state here and the `outline*` properties are its ring.
     */
    exports: [],
    properties: control,
    root: "each response row `<button>` in the list",
    slots: {
      /* The trailing category tag beside the enter glyph. */
      category: ink,
      /* The muted supporting line under the title. */
      description: ink,
      /* The tag chips' row: they are `Badge`s and carry their own class, so
       * this slot owns only the row's wrap gap. */
      tags: rows,
      /* The response's headline. */
      title: ink,
    },
    states: ["hover", "active", "focus-visible"],
  },
} as const satisfies ThemeTargetRegistry;
