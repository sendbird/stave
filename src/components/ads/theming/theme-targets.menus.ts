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

/** A surface that owns its internal air and never takes focus. */
const panel = [...surface, ...themeSpaceProperties] as const;

/** A text part inside somebody else's box. */
const ink = [...themeTypographyProperties, "color", "opacity"] as const;

/**
 * Menus: the trigger, the popup surface, the row.
 *
 * Three targets for three public namespaces, because `Menu`, `DropdownMenu`
 * and `ContextMenu` are one implementation — `recipes/menu.ts` — behind three
 * APIs. A target per namespace would have published three names for one
 * painted element and made a brand write the same popup rule three times to
 * change one popup. The fourth target is the one element that genuinely is not
 * shared: the panel `ContextMenu`'s array API paints around its own children.
 */
export const menusThemeTargets = {
  "context-menu-region": {
    /*
     * The array API's right-clickable panel. It is a target and not part of
     * `menu-popup` because it is not the popup: it is the surface the popup
     * opens FROM, painted by `ContextMenu`'s own local `styles.trigger`.
     *
     * The compound `ContextMenu.Trigger` deliberately does not carry this
     * class. That part is an unstyled passthrough over the caller's own
     * surface (a canvas, a row, a card), so a brand rule reaching it would
     * paint an element ADS never painted.
     */
    exports: ["ContextMenu"],
    properties: panel,
    /*
     * No states, and no focus properties. The panel has one flat resting state
     * by design (a context menu opens on right-click and leaves its trigger
     * untouched), and Base UI's trigger renders a plain `<div>` with no
     * `tabIndex` — a focus rule on it would never match.
     */
    root: "the `<div>` `ContextMenu`'s array API renders around its children",
  },
  "menu-item": {
    axes: {
      /*
       * Only where the row has a rung to report: `ContextMenu`'s rows have no
       * density prop, so they render the attribute absent rather than claiming
       * one.
       */
      density: ["compact", "regular"],
      /* `SubmenuTrigger` takes no tone — a row that opens a submenu performs
       * nothing, so it cannot be destructive. The attribute is absent there. */
      tone: ["default", "danger"],
    },
    exports: [
      "ContextMenu.CheckboxItem",
      "ContextMenu.CheckboxItemIndicator",
      "ContextMenu.Item",
      "ContextMenu.RadioItem",
      "ContextMenu.RadioItemIndicator",
      "ContextMenu.Shortcut",
      "ContextMenu.SubmenuTrigger",
      "DropdownMenu.CheckboxItem",
      "DropdownMenu.CheckboxItemIndicator",
      "DropdownMenu.Item",
      "DropdownMenu.RadioItem",
      "DropdownMenu.RadioItemIndicator",
      "DropdownMenu.Shortcut",
      "DropdownMenu.SubmenuTrigger",
      "Menu.CheckboxItem",
      "Menu.CheckboxItemIndicator",
      "Menu.Item",
      "Menu.RadioItem",
      "Menu.RadioItemIndicator",
      "Menu.Shortcut",
      "Menu.SubmenuTrigger",
    ],
    properties: panel,
    root: 'the `<div role="menuitem">` (or the caller\'s `render` element) Base UI\'s menu item renders',
    slots: {
      /*
       * `color` only. `opacity` is what keeps a `keepMounted` indicator
       * invisible on an unchecked row (`menu.itemIconHidden`), so a brand able
       * to set it here could put a check on every row in the popup.
       */
      indicator: ["color"],
      shortcut: ink,
    },
    /*
     * The two a row actually enters. The highlight ADS paints is Base UI's
     * `[data-highlighted]`, which is set by pointer AND keyboard and is not
     * this vocabulary's to reflect, so a `hover` rule here reaches the pointer
     * half only. `disabled` is absent for a harder reason: a row is a `<div>`
     * unless a caller renders a button into it, and `:disabled` matches
     * nothing on a div — the dimming is `[data-disabled]`.
     */
    states: ["hover", "active"],
  },
  "menu-popup": {
    axes: {
      /* Trigger-anchored menus only; `ContextMenu.Popup` has no density prop. */
      density: ["compact", "regular"],
    },
    exports: [
      "ContextMenu.Group",
      "ContextMenu.GroupLabel",
      "ContextMenu.Popup",
      "ContextMenu.Separator",
      "DropdownMenu.Arrow",
      "DropdownMenu.Group",
      "DropdownMenu.GroupLabel",
      "DropdownMenu.Popup",
      "DropdownMenu.Separator",
      "Menu.Arrow",
      "Menu.Group",
      "Menu.GroupLabel",
      "Menu.Popup",
      "Menu.Separator",
    ],
    properties: panel,
    /* No states: a popup is a surface, and the pointer states in a menu belong
     * to the rows inside it. */
    root: "the Base UI menu popup element",
    slots: {
      /*
       * `color`, because Base UI's arrow is an empty `<div>` and the caret is
       * the caller's own SVG inheriting `currentColor` through it. A brand that
       * repaints the popup fill has to be able to repaint the caret with it.
       */
      arrow: ["color", "opacity"],
      /* Row rhythm only. A group is a bare grid track with no paint of its
       * own, so a colour rule here would generate nothing. */
      group: [...themeSpaceProperties],
      "group-label": [...ink, ...themeSpaceProperties],
      /* A hairline drawn with a background, not a border. */
      separator: ["backgroundColor", "opacity"],
    },
  },
  "menu-trigger": {
    axes: {
      /*
       * The RESOLVED rung, not the caller's `size`. It is undefined on most
       * triggers and its default depends on the weight (quiet starts at `sm`),
       * so reflecting what the caller typed would leave the axis absent on
       * exactly the triggers a brand most wants to select.
       */
      size: ["sm", "md", "lg"],
      /*
       * `ghost` and `quiet` are one weight under two spellings and both are
       * reflected verbatim: a brand selects on what the consumer typed. There
       * is no `unstyled` value because an unstyled trigger carries no class at
       * all — it is the caller's own control, and ADS paints none of it.
       */
      variant: ["default", "ghost", "quiet"],
    },
    exports: ["DropdownMenu.Trigger", "Menu.Trigger"],
    properties: control,
    root: "the `<button>` Base UI's menu trigger renders",
    states: ["hover", "active", "focus-visible", "disabled"],
  },
} as const satisfies ThemeTargetRegistry;
