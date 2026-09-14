import type { ThemeTargetExclusions } from "./theme-target-types";

/**
 * Public exports that are deliberately NOT theme targets, and why.
 *
 * This is half the coverage claim. "Every component is themeable" is only
 * meaningful next to a list of the things that are not, with a reason each —
 * otherwise a component quietly missing from the registry and a component
 * deliberately outside it are indistinguishable, which is how a coverage
 * number becomes decoration.
 *
 * A reason is prose, not a code: `check:theme-targets` requires the string and
 * never parses it. A reviewer reads it.
 *
 * Not to be confused with the pending list in
 * `scripts/theme-target-baseline.json`. That one holds exports that SHOULD be
 * targets and are not yet; it may only shrink. This one holds exports that
 * should never be, and grows only when the system does.
 */
export const themeTargetExclusions = {
  AtelierMotionProvider: "Context provider; renders no element.",
  DirectionProvider: "Context provider; renders no element.",
  ProductThemeProvider:
    "Scopes a brand. It renders a `display: contents` scope root — an element `@scope` needs and nothing paints — so it has no surface to theme, and theming the thing that selects the theme would be circular.",
  SidebarProvider: "Context provider; renders no element.",
  ThemeProvider: "Context provider; renders no element.",
  ThreadAnnouncerContext: "A React context object, not a component.",
  "ThreadAnnouncerContext.Consumer":
    "React's context consumer; renders its render-prop child, no element of its own.",
  "ThreadAnnouncerContext.Provider": "Context provider; renders no element.",
  TooltipProvider: "Context provider; renders no element.",

  Dialog:
    "The convenience composition — it renders Root/Portal/Backdrop/Popup and owns no element of its own. Its surface is `dialog-popup`.",
  DialogClose:
    "Base UI's dismiss part, rendered unstyled so a caller can wrap any control in it. It carries no ADS paint to theme.",
  DialogPortal: "Renders a portal, not an element.",
  DialogRoot: "Base UI's state root; renders no element.",
  DialogTrigger:
    "Renders the caller's own element unstyled. The trigger's paint belongs to whatever control the caller put in it.",

  "Combobox.Group":
    "Base UI's option-group `<div role=\"group\">`, rendered unstyled; the section heading it holds is the `combobox-popup` `group-label` slot, and the group box itself carries no ADS paint.",
  "Combobox.Portal": "Renders a portal, not an element.",
  "Combobox.Positioner":
    "Renders the popup's positioning wrapper `<div>`; it carries only the dropdown stacking context, no paint.",
  "Combobox.Root": "Base UI's combobox state root; renders no element.",
  "Combobox.Separator":
    "Base UI's separator, rendered unstyled; it carries no ADS paint.",
  "Combobox.Value":
    "Base UI's selected-value part, rendered unstyled; it prints the current value and carries no ADS paint of its own.",
  "Command.Collection":
    "Maps one group's items to their rows; renders a fragment of `Command.Item`s, not an element of its own.",
  "Command.Root": "Base UI's autocomplete state root; renders no element.",
  "ContextMenu.Portal": "Renders a portal, not an element.",
  "ContextMenu.Positioner":
    "Renders the popup's positioning wrapper `<div>`; it carries only the dropdown stacking context, no paint.",
  "ContextMenu.RadioGroup":
    "Base UI's `<div role=\"group\">` value container, rendered unstyled; it carries no ADS paint.",
  "ContextMenu.Root": "Base UI's context-menu state root; renders no element.",
  "ContextMenu.SubmenuRoot":
    "Base UI's submenu state root; renders no element.",
  "ContextMenu.Trigger":
    "The right-clickable area, an unstyled passthrough over the caller's own surface (a canvas, row, card); ADS paints none of it.",
  ContextMenuGroups:
    "Fans an array config out into `Group`/`Item` parts; renders a fragment, not an element of its own.",
  DropdownMenu:
    "The array-API convenience composition — it renders a `Menu.Trigger` and a `Menu.Popup` and owns no element of its own; their paint is `menu-trigger` and `menu-popup`.",
  "DropdownMenu.Portal": "Renders a portal, not an element.",
  "DropdownMenu.Positioner":
    "Renders the popup's positioning wrapper `<div>`; it carries only the dropdown stacking context, no paint.",
  "DropdownMenu.RadioGroup":
    "Base UI's `<div role=\"group\">` value container, rendered unstyled; it carries no ADS paint.",
  "DropdownMenu.Root": "Base UI's menu state root; renders no element.",
  "DropdownMenu.SubmenuRoot":
    "Base UI's submenu state root; renders no element.",
  Menu:
    "The compound namespace object; it renders nothing itself — its parts (`Menu.Trigger`, `Menu.Popup`, …) carry the `menu-*` targets.",
  "Menu.Portal": "Renders a portal, not an element.",
  "Menu.Positioner":
    "Renders the popup's positioning wrapper `<div>`; it carries only the dropdown stacking context, no paint.",
  "Menu.RadioGroup":
    "Base UI's `<div role=\"group\">` value container, rendered unstyled; it carries no ADS paint.",
  "Menu.Root": "Base UI's menu state root; renders no element.",
  "Menu.SubmenuRoot": "Base UI's submenu state root; renders no element.",
  "Menubar.Menu": "Base UI's menu state root; renders no element.",
  "Menubar.Portal": "Renders a portal, not an element.",
  "Menubar.SubmenuRoot": "Base UI's submenu state root; renders no element.",
  "NavigationMenu.Portal": "Renders a portal, not an element.",
  "Select.Group":
    "Base UI's option-group `<div role=\"group\">`, rendered unstyled; the section heading it holds is the `select-popup` `group-label` slot, and the group box itself carries no ADS paint.",
  "Select.Portal": "Renders a portal, not an element.",
  "Select.Positioner":
    "Renders the popup's positioning wrapper `<div>`; it carries only the dropdown stacking context, no paint.",
  "Select.Root": "Base UI's select state root; renders no element.",

  AsyncBoundary:
    "The pending/error/empty/ready switch; it renders one of `LoadingSurface`, `EmptyState`, or a `Banner` plus the ready content, and owns no element of its own.",
  FieldMessages:
    "Renders a fragment of the field's description/error/success message `<span>`s; it has no root element of its own.",
  SecretField:
    "Renders an `InputGroup` (`.ads-input-group`), but in `one-time` mode with a notice it wraps that group in a plain `<div>` and a status `<p>`, so its own root does not always carry the group's class.",

  AvatarBadge:
    "Renders a `<div>` that positions a status dot on an `Avatar`; the disc is the wrapped `Avatar` (`.ads-avatar`) and the dot is signal, so it paints no themeable surface of its own.",
  AvatarGroupItem:
    "Renders a `<span>` that positions a presence dot on an `Avatar`; the disc is the wrapped `Avatar` (`.ads-avatar`) and the dot is signal, so it paints no themeable surface of its own.",
  PriorityIcon:
    "Renders a `role=\"img\"` `<span>` whose bar glyph and colour encode the priority level; the colour is the signal, so it has no themeable surface.",
  SidebarMenuChevron:
    "Renders a decorative `aria-hidden` `<span>` disclosure chevron; the glyph inherits the row's ink and it paints no surface of its own.",
  StateIcon:
    "Renders a `role=\"img\"` `<span>` whose ring/pie glyph and colour encode the workflow state; the colour is the signal, so it has no themeable surface.",
  StreamCaret:
    "Renders a decorative `aria-hidden` `<span>` whose `::after` bar is the answer's blinking live-edge caret; it paints only that fixed marker, no surface a brand addresses.",
  VisuallyHidden:
    "Renders a `<span>` clipped out of view for assistive tech; it has no visible surface to theme.",
} as const satisfies ThemeTargetExclusions;
