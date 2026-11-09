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

/**
 * The three bar-and-palette families: `Menubar`, `NavigationMenu`, `Command`.
 *
 * They are one family here because they answer the same brand question — the
 * horizontal command chrome at the top of a tool — and because all three ship
 * a bar, a portalled panel and a row, which is one shape repeated three times
 * rather than three unrelated components.
 *
 * Two decisions run through every entry below:
 *
 * 1. **A bar's track is a different target from the element that wraps it.**
 *    `NavigationMenu.Root` renders a `<nav>` that paints ink and nothing else;
 *    the fill, the hairline and the inset that make the bar read as one
 *    grouped control are on the `<ul>` one level in. A single target spanning
 *    both would put `backgroundColor` on the element that does not paint it.
 * 2. **The parts inside a panel are slots, not targets.** They share the
 *    panel's surface and only ever move with it, which is the `card` rule from
 *    the pilot module. The exceptions are the rows — `command-item` — which
 *    paint their own fill and enter their own hover/press/disabled states.
 */
export const menubarThemeTargets = {
  command: {
    exports: [
      "Command",
      "Command.Empty",
      "Command.Frame",
      "Command.Group",
      "Command.GroupLabel",
      "Command.Input",
      "Command.List",
    ],
    /*
     * No padding: the frame is a grid whose rows — the field, the toolbar, the
     * list — each own their own air. A padding rule here would move all three
     * at once, which is the composition's business and not a brand's.
     */
    properties: surface,
    root: "the `<div>` `Command.Frame` renders — the palette's own surface",
    slots: {
      empty: [...ink, ...themeSpaceProperties],
      group: [...themeSpaceProperties],
      "group-label": [...ink, ...themeSpaceProperties],
      /* The leading search glyph. */
      icon: ink,
      /*
       * The `<input>` itself, separately from its row: it declares its own
       * `color`, so a brand that only recoloured the frame's ink left the
       * query text behind.
       */
      input: ink,
      /* The field row — the hairline under the query and the air around it. */
      "input-group": panel,
      list: [...themeSpaceProperties],
    },
  },
  "command-dialog": {
    axes: {
      /* The panel-width axis, which `CommandDialog` spells `width`. */
      size: ["md", "lg"],
    },
    exports: ["CommandDialog"],
    properties: surface,
    root: "the Base UI dialog popup `CommandDialog` renders around the palette",
    slots: {
      /* The keyboard-hint strip under the list. */
      footer: panel,
      hint: ink,
    },
  },
  "command-dialog-trigger": {
    /*
     * No export of its own — `CommandDialog` renders the launcher itself. It
     * is a target rather than a slot of `command-dialog` because it is not
     * inside the popup: it sits in a topbar beside real `Button`s, is the one
     * part of the palette visible before it opens, and no descendant selector
     * from the popup can reach it.
     */
    exports: [],
    properties: control,
    root: "the `<button>` `CommandDialog` renders as its ⌘K launcher",
    states: ["hover", "active", "focus-visible"],
  },
  "command-item": {
    exports: ["Command.Item"],
    properties: panel,
    root: "the Base UI autocomplete item element `Command.Item` renders",
    /*
     * No slots. The icon/label/description/shortcut spans exist only on the
     * array API's row; a caller composing `Command.Item` children — which the
     * part explicitly invites — renders none of them, so a slot there would be
     * a contract that holds for one of two documented call styles.
     */
    states: ["hover", "active", "disabled"],
  },
  menubar: {
    axes: { density: ["compact", "regular"] },
    exports: ["Menubar", "Menubar.Root"],
    properties: panel,
    root: "the `<div>` Base UI's menubar renders — the bar track itself",
  },
  "menubar-popup": {
    axes: { density: ["compact", "regular"] },
    /*
     * Everything the `Menubar` namespace publishes below the bar. Only
     * `Menubar.Popup` carries this class: the rest are `Menu.*` re-exported
     * under this namespace — the same functions, so the paint a brand reaches
     * for a row or a group label is the `menu-*` target the menus family
     * attaches, not a second one invented here. They are listed against this
     * target because it is the surface they render into and `Menubar` is the
     * name a consumer writes them under. `Menubar.Menu`, `Menubar.Portal` and
     * `Menubar.SubmenuRoot` render no element at all.
     */
    exports: [
      "Menubar.Arrow",
      "Menubar.CheckboxItem",
      "Menubar.CheckboxItemIndicator",
      "Menubar.Group",
      "Menubar.GroupLabel",
      "Menubar.Item",
      "Menubar.Popup",
      "Menubar.Positioner",
      "Menubar.RadioGroup",
      "Menubar.RadioItem",
      "Menubar.RadioItemIndicator",
      "Menubar.Separator",
      "Menubar.Shortcut",
      "Menubar.SubmenuTrigger",
    ],
    properties: panel,
    root: "the Base UI menu popup element `Menubar.Popup` renders",
  },
  "menubar-trigger": {
    /*
     * `size` is optional on this trigger and the attribute is omitted when a
     * caller does not pass one — absent means "the bar's own 28px resting
     * height", which is a different statement from any rung it could name.
     */
    axes: { size: ["sm", "md", "lg"] },
    exports: ["Menubar.Trigger"],
    properties: control,
    root: "the `<button>` Base UI's menu trigger renders inside the bar",
    states: ["hover", "active", "focus-visible", "disabled"],
  },
  "navigation-menu": {
    exports: ["NavigationMenu", "NavigationMenu.Root"],
    /*
     * Ink only. The `<nav>` paints its text colour and nothing else — the
     * bar's fill, edge and inset belong to `navigation-menu-list`.
     */
    properties: ink,
    root: "the `<nav>` Base UI's navigation menu renders",
  },
  "navigation-menu-link": {
    exports: ["NavigationMenu.Link"],
    properties: control,
    root: "the `<a>` `NavigationMenu.Link` renders inside a panel",
    /*
     * No `disabled`: the link reads its disabled state from `aria-disabled` on
     * an `<a>`, which `:disabled` never matches. No `active` either — the card
     * paints hover and its current state, not a press.
     */
    states: ["hover", "focus-visible"],
  },
  "navigation-menu-list": {
    axes: { variant: ["plain", "segmented"] },
    exports: ["NavigationMenu.Item", "NavigationMenu.List"],
    properties: panel,
    root: "the `<ul>` `NavigationMenu.List` renders — the bar track",
    slots: {
      /*
       * The `<li>` segment cell. Space only: it paints no fill of its own, and
       * per-segment air is the one thing the track's `columnGap` cannot say.
       */
      item: [...themeSpaceProperties],
    },
  },
  "navigation-menu-popup": {
    /*
     * `NavigationMenu.Positioner` and `NavigationMenu.Viewport` carry no class:
     * every declaration on either is geometry — `z-index`, `position`,
     * `block-size`, `overflow` — which the contract keeps out of a brand's
     * reach. They are listed here because this is the surface they position and
     * clip.
     */
    exports: [
      "NavigationMenu.Arrow",
      "NavigationMenu.Content",
      "NavigationMenu.Popup",
      "NavigationMenu.Positioner",
      "NavigationMenu.Viewport",
    ],
    properties: surface,
    root: "the Base UI navigation-menu popup element `NavigationMenu.Popup` renders",
    slots: {
      /*
       * The arrow is a glyph tinted with the popup's own fill, so a brand that
       * repaints the panel and cannot reach this leaves a wrong-coloured notch
       * pointing at it.
       */
      arrow: ["color", "opacity"],
      /* One section's panel body, inside the shared viewport. */
      content: panel,
    },
  },
  "navigation-menu-trigger": {
    exports: ["NavigationMenu.Icon", "NavigationMenu.Trigger"],
    properties: control,
    root: "the `<button>` (or the bar's top-level `<a>`) that opens a section",
    slots: {
      /* The caret. It inherits the trigger's ink today and paints no fill. */
      icon: ["color", "opacity"],
    },
    states: ["hover", "active", "focus-visible", "disabled"],
  },
} as const satisfies ThemeTargetRegistry;
