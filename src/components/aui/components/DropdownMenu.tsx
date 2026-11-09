import { Check } from "lucide-react";
import type * as React from "react";

import { type MenuRootProps } from "../headless/menu";
import { menu } from "../recipes/menu";
import { type PopupPlacement } from "../utils/placement";
import { sx, type XstyleProp } from "../utils/stylex";
import {
  Menu,
  type MenuItemTone,
  type MenuPopupProps,
  type MenuTriggerProps,
} from "./Menu";
import { Loader } from "./Loader";
import { resolveComposedTrigger } from "./overlay-trigger";

export type DropdownMenuItem = {
  disabled?: boolean;
  icon?: React.ReactNode;
  label: React.ReactNode;
  onSelect?: () => void;
  /** Prevent repeat selection while the async action is in flight. */
  pending?: boolean;
  /** Marks the item as the currently applied choice. */
  selected?: boolean;
  shortcut?: string;
  tone?: MenuItemTone;
};

export type DropdownMenuGroup = {
  items: DropdownMenuItem[];
  label?: string;
};

export type DropdownMenuProps = Omit<MenuRootProps, "children"> & {
  /** Controls where focus moves when the popup closes. */
  finalFocus?: MenuPopupProps["finalFocus"];
  groups: DropdownMenuGroup[];
  /** Where the menu opens against its trigger. @default "bottom-start" */
  placement?: PopupPlacement;
  /**
   * The trigger. A `Button` element is composed directly as the trigger and
   * keeps its own styles; any other content (text, an icon) renders inside the
   * menu's own trigger chrome, or inside `triggerProps.render`.
   */
  trigger: React.ReactNode;
  /**
   * Props passed straight through to the trigger part — `size` (sm 32 / md 36
   * / lg 40, ignored for a composed element), `variant`, `className` (including
   * Base UI's open-state callback, for a higher-order control that must keep
   * an already-styled trigger visibly engaged while its menu is open) and any
   * other `Menu.Trigger` prop, including `render` to compose any element as
   * the trigger. A composed element defaults to `variant="unstyled"` and keeps
   * its own styles.
   */
  triggerProps?: Omit<MenuTriggerProps, "children">;
} & XstyleProp;

function DropdownMenuArray({
  finalFocus,
  groups,
  placement,
  trigger,
  triggerProps,
  xstyle,
  ...props
}: DropdownMenuProps) {
  // `triggerProps` is the one channel for the trigger part; a `Button` passed
  // as `trigger` is composed as the trigger itself.
  const {
    className,
    render: triggerRender,
    size,
    variant,
    ...triggerPassThrough
  } = triggerProps ?? {};
  const composed = resolveComposedTrigger({ render: triggerRender, trigger });
  const resolvedTriggerVariant =
    variant ?? (composed.render ? "unstyled" : "default");
  const triggerNode = composed.render ? (
    <Menu.Trigger
      {...triggerPassThrough}
      className={className}
      render={composed.render}
      variant={resolvedTriggerVariant}
    >
      {composed.content}
    </Menu.Trigger>
  ) : (
    <Menu.Trigger
      {...triggerPassThrough}
      className={className}
      size={size}
      variant={resolvedTriggerVariant}
    >
      {trigger}
    </Menu.Trigger>
  );

  // Keep the leading icon cell scoped to each group. A later action group may
  // use icons without forcing unrelated typography choices to carry an empty
  // gutter, which makes compact menus look left-padded and uneven. `selected`
  // renders as a trailing check, so it never reserves leading space.
  const groupHasIcons = groups.map((group) =>
    group.items.some((item) => item.icon || item.pending),
  );

  return (
    <Menu.Root {...props}>
      {triggerNode}
      <Menu.Portal>
        <Menu.Positioner placement={placement}>
          <Menu.Popup finalFocus={finalFocus} xstyle={xstyle}>
            <Menu.Arrow className={sx(menu.arrow)} />
            {groups.map((group, groupIndex) => (
              <Menu.Group key={group.label ?? groupIndex}>
                {group.label ? (
                  <Menu.GroupLabel>{group.label}</Menu.GroupLabel>
                ) : null}
                {group.items.map((item, itemIndex) => (
                  <Menu.Item
                    aria-current={item.selected ? "true" : undefined}
                    aria-busy={item.pending || undefined}
                    disabled={item.disabled || item.pending}
                    key={`${group.label ?? groupIndex}-${itemIndex}`}
                    onClick={item.onSelect}
                    selected={item.selected}
                    tone={item.tone}
                  >
                    {groupHasIcons[groupIndex] ? (
                      <span
                        className={sx(menu.itemIcon)}
                        data-aui-control-icon-slot="true"
                      >
                        {item.pending ? (
                          <Loader aria-hidden size="xs" />
                        ) : (
                          item.icon
                        )}
                      </span>
                    ) : null}
                    <span className={sx(menu.itemLabel)}>{item.label}</span>
                    {item.shortcut ? (
                      <Menu.Shortcut>{item.shortcut}</Menu.Shortcut>
                    ) : null}
                    {/* Trailing check: the applied choice is
                        marked without disturbing the leading icon column, so
                        icon-less choice groups stay left-aligned. */}
                    {item.selected ? (
                      <Check
                        aria-hidden
                        className={sx(menu.selectedIndicator)}
                        size={14}
                      />
                    ) : null}
                  </Menu.Item>
                ))}
                {groupIndex < groups.length - 1 ? <Menu.Separator /> : null}
              </Menu.Group>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/**
 * DropdownMenu supports two coexisting APIs (non-breaking):
 *
 * - **Array (convenience):** `<DropdownMenu trigger="Open" groups={[…]} />`
 * - **Compound (compositional):**
 *   `<DropdownMenu.Root>…<DropdownMenu.Item/>…</DropdownMenu.Root>`
 *
 * The compound namespace re-exposes the styled `Menu` parts (a dropdown menu IS
 * the trigger-anchored Menu — same positioning defaults: `sideOffset={8}`,
 * pointer-cursor items), so the array API and hand-composed trees render
 * identically. Includes `SubmenuRoot`/`SubmenuTrigger`, `CheckboxItem` and
 * `RadioGroup`/`RadioItem` for capabilities the array API doesn't model, plus
 * `Shortcut` — the same part the array API's `item.shortcut` renders through.
 */
export const DropdownMenu = Object.assign(DropdownMenuArray, {
  Root: Menu.Root,
  Trigger: Menu.Trigger,
  Portal: Menu.Portal,
  Positioner: Menu.Positioner,
  Popup: Menu.Popup,
  Arrow: Menu.Arrow,
  Item: Menu.Item,
  Group: Menu.Group,
  GroupLabel: Menu.GroupLabel,
  Separator: Menu.Separator,
  SubmenuRoot: Menu.SubmenuRoot,
  SubmenuTrigger: Menu.SubmenuTrigger,
  CheckboxItem: Menu.CheckboxItem,
  CheckboxItemIndicator: Menu.CheckboxItemIndicator,
  RadioGroup: Menu.RadioGroup,
  RadioItem: Menu.RadioItem,
  RadioItemIndicator: Menu.RadioItemIndicator,
  Shortcut: Menu.Shortcut,
});
