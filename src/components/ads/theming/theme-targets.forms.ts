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
 * A pressable mark that paints only its own fill and focus — no internal air,
 * because a checkbox box, a radio dot's shell, and a switch track hold nothing
 * with padding; their content is centred geometry, not a laid-out row.
 */
const mark = [...themeSurfaceProperties, ...themeFocusProperties] as const;

/**
 * The forms family: labels, the field/fieldset/form scaffolds, the four
 * selection controls, the two toggles, the slider, and the rating.
 *
 * The whole family turns on one distinction the brief names as the hard one:
 * a checkbox, radio, switch and toggle each carry a PRESSABLE box AND a label
 * that is inert paint. Only a target carries states, so the pressable box is
 * always its own target — `.ads-checkbox`, `.ads-switch`, `.ads-radio`,
 * `.ads-toggle` exist because a brand that cannot write the box's `:hover` and
 * `:disabled` cannot restyle the control at all. The label is NOT a slot on
 * that box: it is a SIBLING of the box inside the wrapping `<label>`, not a
 * descendant, so a `.ads-checkbox [data-ads-slot="label"]` rule would select
 * nothing. Its typography is the field family's one label type step (owned by
 * `.ads-label` and the anatomy that reuses its metrics), and a brand restyles
 * every label in the system through that one name rather than four control
 * names — so no control here publishes a `label` slot.
 *
 * The second distinction is validity. `field`, and every selection control
 * that carries an `error`, reflects a `tone` axis that is the component's
 * RESOLVED validity, not the caller's claim: an explicit error or Base UI's
 * `invalid` forces `danger`, computed in the component (see `useFieldAnatomy`).
 * It is reflected so a brand can paint the invalid state, and it is computed so
 * a caller cannot assert a validity the field does not have — the same contract
 * `text-field` set in the pilot family, followed here.
 */
export const formsThemeTargets = {
  checkbox: {
    /*
     * `tone` is the RESOLVED validity, like `text-field`: an `error` (or a
     * Base UI `invalid`) forces `danger`, and the checked box keeps its accent
     * fill even then, so the axis only ever repaints the UNCHECKED danger box.
     * No `size` axis: the box scale is literal geometry (§2 — a `space*` token
     * would let `density` move the control size), and geometry is not themeable.
     */
    axes: { tone: ["default", "danger"] },
    exports: ["Checkbox"],
    properties: mark,
    root: "the `<button>` Base UI's checkbox root renders",
    states: ["hover", "active", "focus-visible", "disabled"],
  },
  "checkbox-group": {
    axes: { density: ["compact", "regular"] },
    /*
     * The group root paints nothing but the gap between its option rows and
     * the hairline under an optional select-all summary. The option checkboxes
     * are `.ads-checkbox` targets in their own right; this container is the
     * `role="group"` that holds them and its label, so it is a target for the
     * gap alone rather than a slot on anything.
     */
    exports: ["CheckboxGroup"],
    properties: [...themeSpaceProperties],
    root: "the `<div>` Base UI's checkbox-group root renders",
  },
  field: {
    axes: {
      size: ["xs", "sm", "md", "lg"],
      /*
       * RESOLVED validity, spelled exactly as `text-field`: Base UI's `invalid`
       * or an explicit error forces `danger`, computed by the component so a
       * caller cannot claim a validity the field does not have. `success` is a
       * confirmed-valid state the component can also resolve to.
       */
      tone: ["default", "success", "danger"],
    },
    exports: ["Field"],
    properties: control,
    root: "the `<input>` Base UI's `Field.Control` renders",
    states: ["hover", "focus-visible", "disabled"],
  },
  fieldset: {
    axes: {
      density: ["compact", "regular"],
      /* `surface` draws the bordered card, `plain` is the bare group; the two
       * want different fills and edges, so the axis is reflected on the root. */
      variant: ["plain", "surface"],
    },
    /*
     * One target, three slots. A fieldset is a titled group box: the legend,
     * the description under it, and the invalid message below the body share
     * the fieldset's surface and only ever move with it, so they are slots, not
     * targets — a brand wants one rule with refinements, not three names.
     */
    exports: ["Fieldset"],
    properties: [...surface, ...themeSpaceProperties],
    root: "the `<fieldset>` Base UI's fieldset root renders",
    slots: {
      description: ink,
      /*
       * Typography only, deliberately. The error line is the fieldset's one
       * danger signal; giving it `color` would let a brand paint it neutral and
       * erase the invalid state the surface variant already tints. Severity
       * moves with the danger tokens a brand owns, as `breadcrumb-trail` does.
       */
      error: themeTypographyProperties,
      legend: ink,
    },
  },
  form: {
    axes: {
      /* `surface` draws the raised card, `plain` is a bare grid; reflected so
       * the header/actions slots can differ between the two. */
      variant: ["plain", "surface"],
    },
    /*
     * One target, four slots. The header block, the error summary, the body,
     * and the actions row all sit on the form's surface and move with it.
     */
    exports: ["Form"],
    properties: [...surface, ...themeSpaceProperties],
    root: "the `<form>` Base UI's form root renders",
    slots: {
      actions: [...themeSpaceProperties],
      body: [...themeSpaceProperties],
      /*
       * Typography only: the error summary is the form's danger callout, and
       * its danger fill/edge/ink are the signal a theme must not be able to
       * repaint to neutral. It follows the danger tokens instead.
       */
      "error-summary": themeTypographyProperties,
      header: [...surface, ...themeSpaceProperties],
    },
  },
  "input-group": {
    axes: {
      size: ["xs", "sm", "md", "lg"],
      /* RESOLVED validity — an `error` forces `danger`, computed by the
       * component, same contract as `field`/`text-field`. */
      tone: ["default", "success", "danger"],
    },
    /*
     * The bordered wrapper owns the border, the tint, and the state (§2 — one
     * state per element), so IT is the target rather than the bare inner
     * `<input>`. The adornment glyph boxes and the affix text are static parts
     * that share the group's surface: slots. The action cluster only lays out
     * its buttons; the buttons themselves are `.ads-input-group-action`.
     */
    exports: [
      "InputGroup",
      /*
       * Both render an `InputGroup` as their single rendered root, so their
       * `<div>` is the same bordered field box that carries `.ads-input-group`.
       * They are wrappers of the group, covered here rather than re-targeted.
       */
      "PhoneNumberField",
      "SearchField",
    ],
    properties: control,
    root: "the bordered `<div>` `InputGroup` renders around the value",
    slots: {
      /* The `<span>` that lays out the trailing/leading action buttons — its
       * only paint is the gap between them; each button is its own target. */
      actions: [...themeSpaceProperties],
      /* Prefix/suffix static text (`$`, `https://`, a unit). */
      affix: ink,
      /* A leading/trailing single-glyph box. */
      adornment: ink,
    },
    states: ["hover", "focus-visible", "disabled"],
  },
  "tag-field": {
    axes: {
      size: ["xs", "sm", "md", "lg"],
      /* RESOLVED validity, like `input-group` — an `error` forces `danger`. */
      tone: ["default", "success", "danger"],
    },
    /*
     * The bordered wrapper is the target, for the same reason it is in
     * `input-group`: it owns the border, the tint, and the state. The token is
     * a slot rather than its own target because it is not independently
     * addressable — a brand that restyles a tag here and a `Combobox` chip
     * there has two vocabularies for one object, which is the divergence
     * `recipes/value-token` exists to prevent.
     */
    exports: ["TagField"],
    properties: control,
    root: "the bordered `<div>` `TagField` renders around its tokens",
    slots: {
      /* One committed value. */
      tag: [...surface, ...themeSpaceProperties, ...themeFocusProperties],
      /* Its remove button. */
      "tag-remove": ink,
      /* The wrapping `<ul>` — its only paint is the gap between tokens. */
      track: [...themeSpaceProperties],
    },
    states: ["hover", "focus-visible", "disabled"],
  },
  "input-group-action": {
    exports: ["InputGroupAction"],
    properties: control,
    root: "the `<button>` `InputGroupAction` renders inside the group",
    states: ["hover", "active", "focus-visible", "disabled"],
  },
  label: {
    /*
     * The public field label, and the one name a brand restyles label
     * typography through — which is why the selection controls do NOT publish a
     * `label` slot of their own. No states: a `<label>` is not interactive
     * paint (the cosmetic disabled dim mirrors the control and rides the
     * control's own disabled token, which a brand sets). Typography + ink only;
     * a label owns no box of its own.
     */
    exports: ["Label"],
    properties: ink,
    root: "the `<label>` `Label` renders",
    slots: {
      /* The helper line under the label text. */
      description: ink,
    },
  },
  radio: {
    /*
     * The pressable radio mark, a target of its own for the same reason
     * `checkbox` is: it carries hover/press/focus/disabled paint that only a
     * target's selector can reach. The dot inside it is the indicator, painted
     * by the accent token a brand owns, so it is not a slot.
     */
    exports: [],
    properties: mark,
    root: "the `<button>` Base UI's radio root renders inside a `RadioGroup` option",
    states: ["hover", "active", "focus-visible", "disabled"],
  },
  "radio-group": {
    axes: {
      /* RESOLVED validity — an `error` forces `danger`, moving every option
       * row's resting outline to the danger ramp. */
      tone: ["default", "danger"],
    },
    /*
     * The group root paints nothing but the gap between its option rows; the
     * option rows themselves and the radio marks inside them are painted parts.
     * The row is a `<label>` (inert paint that shares the group surface): a
     * slot. The mark is `.ads-radio`.
     */
    exports: ["RadioGroup"],
    properties: [...themeSpaceProperties],
    root: 'the `role="radiogroup"` `<div>` Base UI\'s radio-group root renders',
    slots: {
      /* Each option's clickable `<label>` row — its own surface, its resting
       * outline, and the hover wash on it. */
      option: [...surface, ...themeSpaceProperties],
    },
  },
  rating: {
    axes: { size: ["sm", "md", "lg"] },
    /*
     * The row of star marks. In display mode it is a `role="img"` `<div>`; in
     * editable mode a `role="radiogroup"`. The marks it lays out are painted by
     * the warning/border tokens (the filled star hue is the signal), so the
     * root gets the gap and the marks stay unthemed paint. The editable mark
     * button IS pressable, hence `rating-mark` below.
     */
    exports: ["Rating"],
    properties: [...themeSpaceProperties],
    root: "the `<div>` `Rating` renders around the marks",
  },
  "rating-mark": {
    /*
     * No export of its own: the editable star is an internal `<button>`, and
     * `Rating` is the one public name. It is a target rather than a slot because
     * it is the pressable, focusable element — a slot cannot carry `:focus`.
     * The star glyph's fill is the rating signal (warning amber vs. empty
     * border), so this target owns the button's own chrome, not the glyph hue.
     */
    exports: [],
    properties: mark,
    root: "each `<button>` in an editable `Rating`",
    states: ["hover", "active", "focus-visible", "disabled"],
  },
  slider: {
    axes: { density: ["compact", "regular"] },
    /*
     * `Slider.Root` is the field grid (label row, control, messages), and the
     * track is the surface a brand recolours. The thumb is the pressable,
     * focusable handle — `.ads-slider-thumb`. The filled indicator is the
     * accent (or resolved danger) fill a brand sets through its tokens, and the
     * value read-out and marks are static ink: slots.
     */
    exports: ["Slider"],
    properties: track,
    root: "the `<div>` Base UI's slider root renders",
    slots: {
      /* The tick labels rail under the track. */
      mark: ink,
      /* The numeric value beside the label. */
      value: ink,
    },
  },
  "slider-thumb": {
    exports: [],
    properties: mark,
    root: "each `<span>` Base UI's slider thumb renders",
    states: ["hover", "active", "focus-visible", "disabled"],
  },
  switch: {
    /*
     * The pressable track, a target for the same reason `checkbox` is: it owns
     * the resting/hover/press fill and the disabled paint. The thumb rides the
     * `surface-raised` token a brand owns, so it is not a slot. `tone` is
     * RESOLVED validity — an `error` forces `danger` on the OFF track only.
     */
    axes: { tone: ["default", "danger"] },
    exports: ["Switch"],
    properties: mark,
    root: "the `<button>` Base UI's switch root renders",
    states: ["hover", "active", "focus-visible", "disabled"],
  },
  toggle: {
    axes: { size: ["xs", "sm", "md", "lg"] },
    /*
     * A single pressable button with pressed/hover/focus/disabled paint. Its
     * label and icon are its own content, centred rather than laid out as
     * addressable parts, so it has no slots.
     */
    exports: ["Toggle"],
    properties: control,
    root: "the `<button>` Base UI's toggle-button root renders",
    states: ["hover", "active", "focus-visible", "disabled"],
  },
  "toggle-group": {
    axes: { density: ["compact", "regular"] },
    /*
     * The bracketing track, and the field scaffold when it carries a
     * label/description. The pressed chip is a separate indicator layer painted
     * by `surface-raised`, so it is not a slot; the items are
     * `.ads-toggle-group-item`. The label and description are the field
     * family's ink and are covered under `label`'s type step, so no slots here.
     */
    exports: ["ToggleGroup"],
    properties: track,
    root: "the `<div>` Base UI's toggle-group root renders",
  },
  "toggle-group-item": {
    axes: { density: ["compact", "regular"] },
    /*
     * The pressable segment. `pressed` is Base UI's own `data-pressed` on this
     * element (a `reservedStateAttribute`), so it is not an axis — a brand
     * already has it. It is a target because it carries hover/press ink and its
     * own focus ring.
     */
    exports: [],
    properties: control,
    root: "each `<button>` Base UI's toggle renders inside a `ToggleGroup`",
    states: ["hover", "active", "focus-visible", "disabled"],
  },
} as const satisfies ThemeTargetRegistry;
