import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

// Hover and pressed washes for this file's OPAQUE resting fills. A translucent
// overlay cannot be painted onto one without dropping the fill itself, so the
// same operand is applied the other way, at the same 6/12 weights. sRGB, not
// oklab: an oklab mix is nearly invisible over a near-black fill.
const raisedWashHover = `color-mix(in srgb, ${vars.colorSurfaceRaised}, ${vars.colorMixInk} 6%)`;
const raisedWashPressed = `color-mix(in srgb, ${vars.colorSurfaceRaised}, ${vars.colorMixInk} 12%)`;
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
 * The host still owns height (`recipes/control-metrics`), padding, radius, the
 * focus ring, and the transition — this recipe owns only color state.
 */
// `trigger` rests on an opaque fill, so its two steps mix the operand into that
// fill; `triggerQuiet` rests transparent and takes the translucent wash directly.
// Both weights use the same 6/12, and neither mixes the two mechanisms — a
// control that hovers to a colour following its surface and presses to one that
// does not reads as two different buttons.

export const controlChrome = stylex.create({
  /** Resting/hover/press surface of a bordered "secondary"-weight control. */
  trigger: {
    backgroundColor: {
      default: vars.colorSurfaceRaised,
      ":hover": raisedWashHover,
      ":active": raisedWashPressed,
    },
    borderColor: vars.colorBorder,
    // Collapses to `elevationFlat` on `:active` — the shadow half of the press,
    // paired with `transition.control` (now animating `box-shadow`) at the
    // call site.
    boxShadow: {
      default: vars.elevationRaised,
      ":active": vars.elevationFlat,
    },
    color: vars.colorText,
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
      ":hover": vars.colorOverlayHover,
      ":active": vars.colorOverlayPressed,
    },
    borderColor: "transparent",
    color: {
      default: vars.colorTextMuted,
      ":hover": vars.colorText,
      ":active": vars.colorText,
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
      default: vars.colorBorder,
      ":focus-within": vars.colorBorderFocus,
    },
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
    backgroundColor: vars.colorOverlayPressed,
  },
  /**
   * Field-shaped control (text entry and its wrappers). Unlike `trigger` it
   * does NOT wash on hover — hovering a text field should not imply a press —
   * but its border strengthens so the target stays discoverable.
   */
  field: {
    backgroundColor: vars.colorSurfaceRaised,
    // `:focus-within` last so focus beats hover when both match — the tone
    // yields to focus (contract: header of `TextField.tsx`). This recipe had no
    // focus step and, for that reason, no consumer: every field-shaped control
    // hand-rolled its own border and each one dropped the hover half.
    borderColor: {
      default: vars.colorBorder,
      ":hover": vars.colorBorderStrong,
      ":focus-within": vars.colorBorderFocus,
    },
    color: vars.colorText,
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
    opacity: vars.opacityDisabled,
  },
  /**
   * Disabled for a **field** (text input, textarea, number field, select
   * shell, input group). A disabled field's value is still information, so it
   * tints and mutes instead of fading: dropping a bordered box to 50% opacity
   * washes out its border and its content together and leaves the text below
   * any usable contrast.
   */
  disabledField: {
    backgroundColor: vars.colorSurfaceTint,
    borderColor: vars.colorBorder,
    color: vars.colorTextMuted,
    cursor: "not-allowed",
  },
  /**
   * Read-only field: the value is authoritative, just not editable, so it keeps
   * full text contrast and loses only the editable affordance.
   */
  readOnlyField: {
    backgroundColor: vars.colorSurfaceTint,
    cursor: "default",
  },
});
