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

/** A part that paints nothing but the gap between the controls standing on it. */
const gutter = ["columnGap", "rowGap"] as const;

/**
 * Action clusters and the one hand-rolled control among them.
 *
 * The decision every entry here turns on is whether the element is an ADS
 * `Button` or a control the component drew itself. `Button` already carries
 * `.ads-button` with its full size/tone/variant matrix, so a wrapper of it must
 * NOT claim a second target for the same `<button>` — the wrapper covers the
 * cluster's geometry (the air between the actions), never the button's paint.
 * The one exception is `ThemeToggle`, which hand-rolls a raw `<button>` with
 * its own resting fill, hover wash and focus ring: a brand's `.ads-button` rule
 * has never reached it, so it is a target of its own. This is the same fork the
 * pilot family recorded for `DialogCloseButton` (a slot, because it is drawn by
 * hand) — read in the other direction here.
 */
export const actionsThemeTargets = {
  "button-group": {
    /*
     * Only `density` is reflected. It is the axis this target actually paints —
     * the label↔actions gap and the button↔button gap both step with it. `size`
     * and `variant` belong to the `.ads-button` children, not to this wrapper,
     * and reflecting an axis a target neither paints nor needs a slot to reach
     * would put an attribute in the DOM that means nothing here. `orientation`
     * and `appearance` are not reflected at all: they are not in the closed axis
     * set, and both are already legible from the layout the gaps sit in.
     */
    axes: { density: ["compact", "regular"] },
    /*
     * `SplitButton` renders a `ButtonGroup` and owns no element of its own, so
     * it is covered here rather than given a target — its two halves are
     * `ButtonGroupButton`s, i.e. `.ads-button`. `ButtonGroupButton` itself is
     * NOT listed: it renders `Button`, so the pilot `button` target already
     * covers that element and claiming it twice is the double-target error.
     */
    exports: ["ButtonGroup", "SplitButton"],
    properties: gutter,
    root: "the `<div role=\"group\">` `ButtonGroup` renders",
    slots: {
      /*
       * The cluster's own rhythm: the flex/grid box the buttons stand in, whose
       * only paint is the gap between them. A brand with a tighter action
       * cluster reaches for this, not for the button. Spacing only — it has no
       * fill, edge or type of its own.
       */
      actions: gutter,
      /* The optional group caption: static text in the group's own box. */
      label: ink,
    },
  },
  "theme-toggle": {
    /*
     * Its own target because it is its own control: a raw `<button>` with a
     * resting `surface-raised` fill, a hover wash and a focus ring, none of it
     * routed through `Button`. `.ads-button` has never selected this element, so
     * a slot on some other target would be a lie and a shared `button` claim
     * would double-cover an element `button` does not render. All four states
     * because a native button enters every one of them and each has paint a
     * brand may want to own (the hover wash today, the focus ring, a disabled
     * dimming). No axes: it takes no size/tone/variant/density prop.
     */
    exports: ["ThemeToggle"],
    properties: control,
    root: "the `<button>` `ThemeToggle` renders",
    states: ["hover", "active", "focus-visible", "disabled"],
  },
} as const satisfies ThemeTargetRegistry;
