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
 * The text-entry family that is not `text-field`: the multi-line boxes, the
 * composite fields that wrap a box around several controls, and the two
 * presentational pieces mentions render with.
 *
 * `text-field` (the pilot's fourth target) is the model every field here is
 * kept consistent with: a control that OWNS ITS OWN BOX takes `control` —
 * paint, text, its own internal padding, and a focus ring — reflects `size`
 * and the RESOLVED `tone` (the one the component computes, `error` ⇒ `danger`,
 * so a caller cannot claim a validity the field does not have), and enters
 * `hover`/`focus-visible`/`disabled` but not `active`: a text box has no press
 * paint. A brand writes one `.ads-text-field`-shaped rule per field type and
 * gets the same result.
 *
 * Composite fields split on the target-vs-slot rule the tabs family states:
 * only a target carries states, so a pressable part with its own
 * hover/press/focus/disabled paint (a number stepper, an OTP cell) is a target
 * of its own even inside another target's box, while a static part (a JSON
 * ruler, an editor that delegates its ring to the surface around it) stays a
 * slot. The fields that paint NO box of their own — the ones built on
 * `InputGroup`/`TextField`, whose border, height and ring belong to that
 * composed target — are exclusions, reported to the dispatcher rather than
 * given a second name here.
 */
export const inputsThemeTargets = {
  textarea: {
    axes: {
      size: ["xs", "sm", "md", "lg"],
      /*
       * The resolved tone, exactly as `text-field` reflects it: the component
       * forces `danger` under `error`, so the invalid paint is reachable and a
       * caller cannot assert a validity the field does not hold. `success` is
       * the third value a `FieldTone` field resolves to.
       */
      tone: ["default", "success", "danger"],
    },
    exports: ["Textarea"],
    properties: control,
    root: "the `<textarea>` `Textarea` renders",
    /*
     * The sizer and the auto-resize wrapper are not slots: they are the
     * invisible measurement machinery (a `visibility: hidden` mirror, a grid
     * cell the control fills), painting nothing a brand could restyle without
     * breaking the height it computes. Naming them would freeze an
     * implementation detail into public API.
     */
    states: ["hover", "focus-visible", "disabled"],
  },
  "number-field": {
    axes: {
      size: ["xs", "sm", "md", "lg"],
      tone: ["default", "success", "danger"],
    },
    exports: ["NumberField"],
    properties: control,
    /*
     * The bordered GROUP, not the inner input. The group owns the border, the
     * tint and the focus-within ring; the `<input>` inside it paints nothing
     * and inherits its colour, so it is the group's surface a brand restyles.
     * Same arrangement `text-field` names on `TextField`'s bare input, one
     * level out because this field wraps its input in a box.
     */
    root: "the `<div>` `NumberFieldGroup` renders",
    states: ["hover", "focus-visible", "disabled"],
  },
  "number-field-stepper": {
    axes: { size: ["xs", "sm", "md", "lg"] },
    /*
     * No export of its own: the two steppers are internal, and the one public
     * name belongs to the group above. Its own target because it is pressable
     * with its own hover/press/focus/disabled paint — a brand that cannot
     * write the stepper's `:active` cannot restyle the plus/minus at all.
     */
    exports: [],
    properties: control,
    root: "the increment and decrement `<button>`s inside the number field group",
    states: ["hover", "active", "focus-visible", "disabled"],
  },
  "otp-field": {
    axes: {
      size: ["xs", "sm", "md", "lg"],
      tone: ["default", "success", "danger"],
    },
    /*
     * The CELL, not the `role="group"` root. The root is a bare flex container
     * that paints nothing; every cell is an `<input>` that owns its box, its
     * border, its filled tint and its focus ring, so the cell is where a brand
     * needs a selector. The one public name rides the cell because the cell is
     * the only element in this field that paints. `filled` and the loading
     * mark are Base UI/loader state, not axes.
     */
    exports: ["OTPField"],
    properties: control,
    root: "each cell `<input>` `OTPField` renders",
    states: ["hover", "focus-visible", "disabled"],
  },
  "json-field": {
    /*
     * `size` is `sm`/`md` only — this field's own ramp — and it is reflected on
     * the surface because the surface is the box the ruler and editor slots are
     * reachable through. `tone` is the shared `FieldTone` the anatomy resolves
     * (`error` ⇒ `danger`); a JSON document is well-formed or not, so in
     * practice only `default` and `danger` paint, but the axis stays the whole
     * resolved set so it cannot mean something narrower than the field's own
     * `tone`.
     */
    axes: {
      size: ["sm", "md"],
      tone: ["default", "success", "danger"],
    },
    exports: ["JsonField"],
    properties: [...surface, ...themeSpaceProperties],
    /*
     * The bordered SURFACE, not the textarea. The surface owns the border and
     * the keyboard ring (`focusRing.ringWithin`); the editor delegates both to
     * it, exactly as `Textarea`'s `ringOwner="wrapper"` describes. So the
     * surface takes the states and the editor is a slot beneath it.
     */
    root: "the bordered `<div>` surface `JsonField` renders",
    slots: {
      /* The line ruler: a static gutter that paints its own subtle fill and
       * the numbers' ink. It never takes focus and never moves on its own. */
      gutter: [...themeSurfaceProperties, ...ink],
      /* The code textarea. Ink only — its box, border and ring are the
       * surface's, and its fill is transparent by decision. */
      editor: ink,
      /* The caption/Format/Copy strip. It owns the air between its controls
       * and the hairline under itself; the buttons inside are `Button`. */
      toolbar: track,
    },
    states: ["hover", "focus-visible", "disabled"],
  },
  "key-value-editor": {
    exports: ["KeyValueEditor"],
    properties: [...surface, ...themeSpaceProperties],
    /*
     * The bordered PANEL, not a row. The root owns the surface, the hairline
     * and the rounded corners the rows sit inside; the rows themselves are a
     * grid of cells whose only paint is the divider between them. No states:
     * the panel is inert — hover and focus live on the cell inputs below,
     * which are their own target.
     */
    root: "the `role=\"group\"` `<div>` `KeyValueEditor` renders",
    slots: {
      /* A row's static parts: the muted column-header cells and the row
       * divider. A brand tightening the row rhythm reaches the gutter here. */
      header: [...ink, ...themeSpaceProperties],
      row: [...themeSurfaceProperties, ...themeSpaceProperties],
    },
  },
  "key-value-editor-input": {
    /*
     * No export of its own — the cell inputs are internal. Its own target
     * because each is an editable, focusable `<input>` with its own focus
     * ring; a brand that cannot write the cell's `:focus-visible` cannot
     * restyle where the editing actually happens. Only `focus-visible` and
     * `disabled`: the borderless cell has no hover paint of its own.
     */
    exports: [],
    properties: control,
    root: "each key/value/description `<input>` inside a `KeyValueEditor` row",
    states: ["focus-visible", "disabled"],
  },
  "file-upload": {
    /*
     * The picker `<button>` — the dropzone or the compact row — which is the
     * one element in this component that paints a surface and takes states.
     * `variant` distinguishes the generous dashed dropzone from the dense
     * solid row; they are two boxes, not one recoloured, so the axis is
     * reflected. `active` is absent: the button is a click target with a hover
     * wash, not a press-lit control.
     */
    axes: { variant: ["compact", "dropzone"] },
    exports: ["FileUpload"],
    properties: control,
    root: "the picker `<button>` `FileUpload` renders (the dropzone or the compact row)",
    /*
     * The uploaded-file rows are `Attachment`, a component of its own with its
     * own target; the hidden `<input type=\"file\">` and the icon paint nothing
     * a brand restyles here, so neither is a slot.
     */
    states: ["hover", "focus-visible", "disabled"],
  },
  "mention-input": {
    /*
     * No `size`/`tone`: `MentionInput` exposes neither, so reflecting them
     * would publish an attribute that is always absent. The `<textarea>` owns
     * its box and its `:focus-within` border and `focusRing.ring`, so it takes
     * the control allowance and the text-box states — no `active`.
     */
    exports: ["MentionInput"],
    properties: control,
    root: "the `<textarea>` `MentionInput` renders",
    slots: {
      /*
       * The suggestion listbox and its options. A separate slot pair because
       * the popup is a floating surface with its own fill and elevation, and
       * the active option is the pointer/keyboard highlight a brand recolours
       * — the same wash the rest of the system's menus use.
       */
      option: [...surface, ...themeSpaceProperties],
      popup: track,
    },
  },
  "mention-token": {
    /*
     * The inline chip in a rendered message body — a `<span>` that paints its
     * own soft tint. `tone` is reflected because `self` and `default` are two
     * chips a brand genuinely restyles as a pair (an ordinary mention vs. "you
     * were pinged"); this is deliberate chrome theming, not the danger/warning
     * signal `breadcrumb-trail` withholds, because a mention chip carries no
     * validity a reader must not be able to erase. Presentational only — no
     * interactive states.
     */
    axes: { tone: ["default", "self"] },
    exports: ["MentionToken"],
    properties: surface,
    root: "the `<span>` `MentionToken` renders",
  },
} as const satisfies ThemeTargetRegistry;
