import { isValidElement } from "react";
import { Check } from "lucide-react";
import type * as React from "react";

import { type MenuRootProps } from "../headless/menu";
import { menu } from "../recipes/menu";
import { type PopupPlacement } from "../utils/placement";
import { sx } from "../utils/stylex";
import {
  Menu,
  type MenuPopupProps,
  type MenuTriggerProps,
  type MenuTriggerSize,
  type MenuTriggerVariant,
} from "./Menu";
import { Loader } from "./Loader";

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
  tone?: "default" | "danger";
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
  trigger: React.ReactNode;
  /** Compose the trigger directly; its own component styles are preserved by default. */
  triggerAsChild?: boolean;
  /**
   * Additional trigger class, including Base UI's open-state callback. This is
   * primarily for higher-order controls such as SplitButton that must keep an
   * already-styled trigger visibly engaged while its menu is open.
   */
  triggerClassName?: MenuTriggerProps["className"];
  /**
   * Trigger control height (sm 32 / md 36 / lg 40) — set `lg` to align with a
   * `lg` Button or TextField in the same row. Ignored for composed
   * (`triggerAsChild`) triggers, which keep their own metrics.
   */
  triggerSize?: MenuTriggerSize;
  /** Override trigger chrome. Composed triggers preserve their own styles by default. */
  triggerVariant?: MenuTriggerVariant;
};

function DropdownMenuArray({
  finalFocus,
  groups,
  placement,
  trigger,
  triggerAsChild = false,
  triggerClassName,
  triggerSize,
  triggerVariant,
  ...props
}: DropdownMenuProps) {
  const resolvedTriggerVariant =
    triggerVariant ?? (triggerAsChild ? "unstyled" : "default");
  const triggerNode =
    triggerAsChild && isValidElement(trigger) ? (
      <Menu.Trigger
        className={triggerClassName}
        render={trigger}
        variant={resolvedTriggerVariant}
      />
    ) : (
      <Menu.Trigger
        className={triggerClassName}
        size={triggerSize}
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
          <Menu.Popup finalFocus={finalFocus}>
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
                        data-ads-control-icon-slot="true"
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
