import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

// Hover and pressed washes for this file's OPAQUE resting fills. A translucent
// overlay cannot be painted onto one without dropping the fill itself, so the
// same operand is applied the other way, at the same 6/12 weights. sRGB, not
// oklab: an oklab mix is nearly invisible over a near-black fill.
const raisedWashHover = `color-mix(in srgb, ${vars["--aui-color-surface-raised"]}, ${vars["--aui-color-mix-ink"]} 6%)`;
const raisedWashPressed = `color-mix(in srgb, ${vars["--aui-color-surface-raised"]}, ${vars["--aui-color-mix-ink"]} 12%)`;
/**
 * Shared surface + state language for **bordered interactive controls** —
 * overlay triggers (Select, Popover, Menu, DatePicker), field wrappers, and
 * anything else the design direction says must "compose `Button`" (§2).
 *
 * _Why:_ `Select`, `Popover`, and the default `Menu` trigger each re-declared
 * their own resting chrome and then declared **no** `:hover` and **no**
 * `:active` at all. They looked pixel-identical to `Button variant="secondary"`
 * and did nothing under the cursor — the single loudest "this UI is dead" tell
 * in the system. The state matrix below is the one `Button` uses, so a trigger
 * and a button sitting in the same filter row now react identically.
 *
 * Compose as
 * `sx(controlChrome.trigger, controlHeights[size], focusRing.ring, transition.colors, ...layout)`.
 * The host owns height (`recipes/control-metrics`), radius, the focus ring,
 * transition, and any intentional inset. Quiet host controls start at zero
 * padding so browser button defaults never become accidental geometry.
 */
// `trigger` rests on an opaque fill, so its two steps mix the operand into that
// fill; `triggerQuiet` rests transparent and takes the translucent wash directly.
// Both weights use the same 6/12, and neither mixes the two mechanisms — a
// control that hovers to a colour following its surface and presses to one that
// does not reads as two different buttons.

/**
 * Soft focus halo for the field family (upstream F3, 2026-11-08). A focused
 * field only recoloured its 1px border, which read as almost no change; buttons
 * get the 2px `focusRing.ring` outline, while fields compose
 * `focusRing.borderOnly` and so had nothing outside the edge. This adds a
 * `ringWidthMd` (3px) wash of `colorBorderFocus` at 25% OUTSIDE the border, on
 * the same state that recolours it. It never pairs with the outline ring:
 * every consumer of these keys composes `borderOnly`. Forced colors drops
 * `box-shadow` by spec, and `borderOnly` restores a `Highlight` outline there.
 *
 * Host adaptation: `colorBorderFocus` stays the Stave theme's `--ring`
 * (`system/aui-theme.ts`), so the halo follows the saved theme. A clipping
 * ancestor owes it 3px of room; `focusRing.gutter` already reserves 4px.
 */
const focusHalo = `0 0 0 ${vars["--aui-ring-width-md"]} color-mix(in oklab, ${vars["--aui-color-border-focus"]} 25%, transparent)`;
const raisedWithHalo = `${vars["--aui-elevation-raised"]}, ${focusHalo}`;
/**
 * Halo on the state a field-shaped TRIGGER recolours on: keyboard only — a
 * button keeps DOM focus after a click, and a 3px wash left on a closed trigger
 * reads as stuck.
 *
 * Host adaptation: Stave's `trigger` still collapses its contact shadow to
 * `elevationFlat` on `:active` (upstream R0 dropped that press step). These
 * keys replace `trigger`'s whole `boxShadow` group, so the press step is
 * restated here rather than silently lost. A mouse press never matches
 * `:focus-visible`, and a keyboard press opens a popup that takes focus, so the
 * two rungs do not fight.
 */
const triggerBoxShadow = {
  default: vars["--aui-elevation-raised"],
  ":focus-visible": raisedWithHalo,
  ":active": vars["--aui-elevation-flat"],
} as const;

/**
 * The field family's state transition, owned HERE — by the recipe that paints
 * the ladder — so every field that composes `field`, `fieldTriggerBorder(ReadOnly)`
 * or `triggerFocusBorder` eases its border AND the focus halo without the call
 * site having to remember a transition key (upstream 2026-11-08 motion pass).
 *
 * `transition.colors` has no `box-shadow`, so composing it AFTER one of these
 * keys replaces this list and the halo pops in one frame again — call sites
 * drop it. 150ms (`motionDurationQuick`) both directions, with an 80ms micro
 * fade under Reduce Motion; the halo is a shadow growing from nothing, which
 * CSS interpolates by padding the shorter shadow list with a transparent zero
 * shadow, so it grows 0 → 3px rather than popping.
 *
 * The curve is `motionEaseColor` (CSS `ease`), the one every colour
 * transition in `transition.ts` uses, so the halo and the border settle
 * together.
 */
const fieldTransitionDuration = {
  default: vars["--aui-motion-duration-quick"],
  "@media (prefers-reduced-motion: reduce)":
    vars["--aui-motion-duration-micro"],
} as const;
const fieldTransitionProperty =
  "background-color, border-color, color, box-shadow";
const fieldTransitionTiming = vars["--aui-motion-ease-color"];

export const controlChrome = stylex.create({
  /** Resting/hover/press surface of a bordered "secondary"-weight control. */
  trigger: {
    backgroundColor: {
      default: vars["--aui-color-surface-raised"],
      ":hover": raisedWashHover,
      ":active": raisedWashPressed,
    },
    borderColor: vars["--aui-color-border"],
    // Width and style, not just colour. These recipes land on native `<button>`
    // elements, which arrive with the UA's `2px outset` box; stating only
    // `border-color` recolours that box instead of replacing it. Callers that
    // compose a geometry recipe on top (`menu.trigger`) were hiding the gap,
    // and the ones that do not were 4px larger than their own height contract
    // while painting a 2px ridge in whatever colour was in scope.
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    // Collapses to `elevationFlat` on `:active` — the shadow half of the press,
    // paired with `transition.control` (now animating `box-shadow`) at the
    // call site.
    boxShadow: {
      default: vars["--aui-elevation-raised"],
      ":active": vars["--aui-elevation-flat"],
    },
    color: vars["--aui-color-text"],
  },
  /** Borderless "quiet"-weight variant of the same language. */
  triggerQuiet: {
    backgroundColor: {
      default: "transparent",
      // Translucent on BOTH steps. `trigger` rests on an opaque fill and mixes
      // the operand in; this one rests transparent, so it takes the wash
      // directly. Mixing the two mechanisms in one control is what made a quiet
      // button hover to a colour that follows its surface and then press to one
      // that does not.
      ":hover": vars["--aui-color-overlay-hover"],
      ":active": vars["--aui-color-overlay-pressed"],
    },
    borderColor: "transparent",
    // Borderless means zero width, stated. `border-color: transparent` alone
    // leaves the UA's `2px outset` in the box model on a native button — an
    // invisible 4px of the control's own size, and a visible ridge the moment
    // anything downstream sets a border colour.
    borderStyle: "solid",
    borderWidth: 0,
    // `Button layout="host"` may compose no geometry recipe at all. Native
    // buttons otherwise retain the UA's 1px 6px padding, so its layout starts
    // from a browser-dependent inset rather than the host's xstyle contract.
    // An xstyle padding value still composes last and wins.
    padding: 0,
    // The wash is the only box this recipe paints, so this recipe owns its
    // SHAPE. The header below hands "radius" to the host along with height and
    // padding, and for the bordered `trigger` that is right — a geometry recipe
    // (`menu.trigger`, `buttonStyles.base`) always follows it and states one.
    // Nothing follows `triggerQuiet` on the borderless paths: `Button
    // layout="host"` composes it with only `focusRing.ring` and
    // `transition.colors`, so every host-layout caller that did not re-derive a
    // radius was painting a hard-cornered rectangle on hover inside a system
    // whose every other surface is rounded — a chain-of-thought row, a trace
    // disclosure, a file row. `radiusControl` is the same value
    // `buttonStyles.base` falls back to, so the control and host paths now agree
    // rather than differing by whether the caller remembered. A caller that
    // wants another shape still wins: `xstyle` merges last on both paths, and a
    // geometry recipe composed after this one overrides it as before.
    borderRadius: vars["--aui-radius-control"],
    color: {
      default: vars["--aui-color-text-muted"],
      ":hover": vars["--aui-color-text"],
      ":active": vars["--aui-color-text"],
    },
  },
  /**
   * Focus border for a bordered **overlay trigger** (Select, Popover, the
   * default Menu trigger). Compose after `trigger`, and pair it with
   * `focusRing.borderOnly` at the same call site.
   *
   * `trigger` alone rests on a flat `colorBorder` and never recolored, so a
   * trigger showed nothing at all on a mouse click: unlike a text input, a
   * button does not match `:focus-visible` when clicked, so its only indicator
   * was the Tab-only ring. This states the one-line focus contract the
   * text-entry family already has (see the header of `TextField.tsx`) for the
   * trigger shape, so a field and a dropdown in one filter row light up the
   * same way.
   *
   * Declares `default` as well as the focused value on purpose: it REPLACES
   * `trigger`'s flat `borderColor` rather than layering a lone condition onto
   * it, which is the only composition order-independent way to state this.
   */
  triggerFocusBorder: {
    borderColor: {
      default: vars["--aui-color-border"],
      ":focus-within": vars["--aui-color-border-focus"],
    },
    // The halo follows the keyboard only (see `triggerBoxShadow`).
    boxShadow: triggerBoxShadow,
    transitionDuration: fieldTransitionDuration,
    transitionProperty: fieldTransitionProperty,
    transitionTimingFunction: fieldTransitionTiming,
  },
  /**
   * Border ladder for a field-shaped BUTTON trigger (`Combobox.FieldTrigger`):
   * rest, a stronger hover rung, and the focus colour on `:focus-visible`, so a
   * field trigger and a text field in one row light up the same way. The
   * `:not(:focus-visible)` guard keeps focus above hover, because StyleX emits
   * conditions by pseudo-class priority. No `:active` rung: the list opens on
   * pointer down and the consumer's open style repaints this border.
   */
  fieldTriggerBorder: {
    borderColor: {
      default: vars["--aui-color-border"],
      ":focus-visible": vars["--aui-color-border-focus"],
      "@media (hover: hover)": {
        default: vars["--aui-color-border"],
        ":hover:not(:focus-visible)": vars["--aui-color-border-strong"],
        ":focus-visible": vars["--aui-color-border-focus"],
      },
    },
    // Replaces `field`'s `:focus-within` halo with the `:focus-visible` one,
    // for the same reason the border ladder above is keyed that way.
    boxShadow: triggerBoxShadow,
    transitionDuration: fieldTransitionDuration,
    transitionProperty: fieldTransitionProperty,
    transitionTimingFunction: fieldTransitionTiming,
  },
  /**
   * The same ladder without the pointer rung, for a **read-only** trigger.
   *
   * A read-only Select does not open — `Select.Trigger` swallows pointer-down
   * and the opening keys — so a hover step would advertise a target that does
   * nothing. Focus stays: the control is deliberately still focusable so its
   * value is announced.
   */
  fieldTriggerBorderReadOnly: {
    borderColor: {
      default: vars["--aui-color-border"],
      ":focus-visible": vars["--aui-color-border-focus"],
    },
    boxShadow: triggerBoxShadow,
    transitionDuration: fieldTransitionDuration,
    transitionProperty: fieldTransitionProperty,
    transitionTimingFunction: fieldTransitionTiming,
  },
  /**
   * Engaged state for an overlay trigger. While its popup is on screen the
   * trigger must stay visibly held down even though the pointer has moved off
   * it onto the popup. Base UI sets `data-popup-open` on the trigger.
   */
  triggerOpen: {
    // The press, held — not a fill of its own. It painted `colorCanvasSubtle`,
    // an opaque Neutral100 unrelated to the trigger's own ladder, so one
    // control hovered and pressed in washes and then opened to a different
    // colour entirely. This is `trigger`'s `:active` value, kept on screen.
    backgroundColor: raisedWashPressed,
  },
  /** `triggerOpen` for a `triggerQuiet` base: the same press, translucent. */
  triggerQuietOpen: {
    backgroundColor: vars["--aui-color-overlay-pressed"],
  },
  /**
   * Field-shaped control (text entry and its wrappers). Unlike `trigger` it
   * does NOT wash on hover — hovering a text field should not imply a press —
   * but its border strengthens so the target stays discoverable.
   */
  field: {
    backgroundColor: vars["--aui-color-surface-raised"],
    // `:focus-within` last so focus beats hover when both match — the tone
    // yields to focus (contract: header of `TextField.tsx`). This recipe had no
    // focus step and, for that reason, no consumer: every field-shaped control
    // hand-rolled its own border and each one dropped the hover half.
    borderColor: {
      default: vars["--aui-color-border"],
      ":hover": vars["--aui-color-border-strong"],
      ":focus-within": vars["--aui-color-border-focus"],
    },
    // Focus adds the soft halo (F3) on the same `:focus-within` that recolours
    // the border. Host adaptation: Stave's text fields rest FLAT — upstream
    // R0 · S4 moved them to `elevationRaised`, which Stave has not adopted —
    // so the halo stands alone here. A field-shaped trigger that composes this
    // after `trigger` restores its raised rest through `fieldTriggerBorder`.
    boxShadow: {
      default: vars["--aui-elevation-flat"],
      ":focus-within": focusHalo,
    },
    color: vars["--aui-color-text"],
    transitionDuration: fieldTransitionDuration,
    transitionProperty: fieldTransitionProperty,
    transitionTimingFunction: fieldTransitionTiming,
  },

  // ---- One disabled language, three shapes ---------------------------------
  /**
   * Disabled for a **pressable** control (button, trigger, toggle, radio,
   * checkbox). Opacity + `not-allowed`, nothing else.
   *
   * Apply on exactly ONE element per composite control. Stacking it on a
   * wrapper *and* its child multiplies the fades — RadioGroup shipped at
   * 0.5 × 0.5 = 0.25 effective opacity, well past legibility.
   */
  disabled: {
    cursor: "not-allowed",
    opacity: vars["--aui-opacity-disabled"],
  },
  /**
   * Disabled for a **field** (text input, textarea, number field, select
   * shell, input group). A disabled field's value is still information, so it
   * tints and mutes instead of fading: dropping a bordered box to 50% opacity
   * washes out its border and its content together and leaves the text below
   * any usable contrast.
   */
  disabledField: {
    backgroundColor: vars["--aui-color-surface-tint"],
    borderColor: vars["--aui-color-border"],
    color: vars["--aui-color-text-muted"],
    cursor: "not-allowed",
  },
  /**
   * Read-only field: the value is authoritative, just not editable, so it keeps
   * full text contrast and loses only the editable affordance.
   */
  readOnlyField: {
    backgroundColor: vars["--aui-color-surface-tint"],
    cursor: "default",
  },
});
