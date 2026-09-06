import { Menu as BaseMenu } from "@base-ui/react/menu";
import * as stylex from "@stylexjs/stylex";
import { Check } from "lucide-react";
import type * as React from "react";

import {
  MenuArrow,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuPortal,
  MenuPositioner,
  MenuRoot,
  MenuSeparator,
} from "../headless/menu";
import { menu } from "../recipes/menu";
import { transition } from "../recipes/transition";
import { vars } from "../tokens/tokens.stylex";
import {
  POPUP_SIDE_OFFSET,
  type PopupPlacement,
  resolveAlign,
} from "../utils/placement";
import { cx, sx } from "../utils/stylex";
import { MenuShortcut } from "./Menu.shortcut";
import { MenuTriggerPart } from "./Menu.trigger";

export type { MenuShortcutProps } from "./Menu.shortcut";
export type {
  MenuTriggerProps,
  MenuTriggerSize,
  MenuTriggerVariant,
} from "./Menu.trigger";

// Base UI submenu / checkbox / radio parts are not re-exported by
// `headless/menu`. Imported directly so the styled compound layer can wrap them
// without editing the headless module.
const MenuSubmenuRootPart = BaseMenu.SubmenuRoot;
const MenuSubmenuTriggerPart = BaseMenu.SubmenuTrigger;
const MenuCheckboxItemPart = BaseMenu.CheckboxItem;
const MenuCheckboxItemIndicatorPart = BaseMenu.CheckboxItemIndicator;
const MenuRadioGroupPart = BaseMenu.RadioGroup;
const MenuRadioItemPart = BaseMenu.RadioItem;
const MenuRadioItemIndicatorPart = BaseMenu.RadioItemIndicator;

// Local styles for the radio dot. The shared `recipes/menu.ts` has no
// equivalent (and must not be edited), so the dot is defined here, mirroring the
// `itemIcon` convention by inheriting `currentColor` so it follows the item's
// tone/highlight state.
const styles = stylex.create({
  radioDot: {
    backgroundColor: "currentColor",
    borderRadius: vars.radiusFull,
    blockSize: 8,
    inlineSize: 8,
  },
});

/**
 * `className` on a Base UI part may be a string or a `(state) => string`
 * callback. Merge Atelier's base styles with a caller-supplied `className` of
 * either shape, preserving the state argument.
 */
type ClassNameProp<State> =
  | string
  | undefined
  | ((state: State) => string | undefined);

function mergeClassName<State>(
  base: (state: State) => string | undefined,
  className: ClassNameProp<State>,
): (state: State) => string | undefined {
  return (state) =>
    cx(
      base(state),
      typeof className === "function" ? className(state) : className,
    );
}

// ---------------------------------------------------------------------------
// Compound parts (compositional Menu API, shared by DropdownMenu / ContextMenu /
// Menubar). Styled wrappers over the Base UI `headless/menu` parts.
// ---------------------------------------------------------------------------

export type MenuRootCompoundProps = React.ComponentProps<typeof MenuRoot>;

function Root(props: MenuRootCompoundProps) {
  return <MenuRoot {...props} />;
}

export type MenuPortalProps = React.ComponentProps<typeof MenuPortal>;

function Portal(props: MenuPortalProps) {
  return <MenuPortal {...props} />;
}

export type MenuPositionerProps = React.ComponentProps<
  typeof MenuPositioner
> & {
  /**
   * Where the menu opens against its trigger. @default "bottom-start"
   *
   * A submenu keeps Base UI's `inline-end` side and takes only the `start`
   * alignment; pass `placement` to override both halves. Explicit
   * `side`/`align` still win — that is the escape hatch for the logical sides
   * (`inline-start`/`inline-end`) this vocabulary does not name.
   */
  placement?: PopupPlacement;
};

function Positioner({
  align,
  className,
  placement,
  side,
  sideOffset = POPUP_SIDE_OFFSET,
  ...props
}: MenuPositionerProps) {
  const resolved = resolveAlign(placement);
  return (
    <MenuPositioner
      {...props}
      align={align ?? resolved.align}
      className={mergeClassName(() => sx(menu.positioner), className)}
      side={side ?? resolved.side}
      sideOffset={sideOffset}
    />
  );
}

export type MenuPopupProps = React.ComponentProps<typeof MenuPopup>;

function Popup({ className, ...props }: MenuPopupProps) {
  return (
    <MenuPopup
      {...props}
      className={mergeClassName(
        () => cx(sx(menu.popup), "atelier-motion-dropdown"),
        className,
      )}
    />
  );
}

export type MenuArrowProps = React.ComponentProps<typeof MenuArrow>;

function Arrow(props: MenuArrowProps) {
  return <MenuArrow {...props} />;
}

export type MenuItemProps = React.ComponentProps<typeof MenuItem> & {
  /**
   * Pointer behavior: `"pointer"` (default — used by trigger menus) or
   * `"default"` (used by context menus, which open on right-click).
   */
  itemKind?: "default" | "pointer";
  /** The currently applied choice; takes a `Select` row's fill. See menu.ts. */
  selected?: boolean;
  tone?: "danger" | "default";
};

function Item({
  className,
  itemKind = "pointer",
  selected = false,
  tone = "default",
  ...props
}: MenuItemProps) {
  return (
    <MenuItem
      {...props}
      className={mergeClassName(
        (state) =>
          sx(
            menu.item,
            transition.colors,
            itemKind === "pointer" ? menu.itemPointer : menu.itemDefault,
            state.highlighted && menu.itemHighlighted,
            selected && menu.itemChecked,
            tone === "danger" && menu.itemDanger,
            state.disabled && menu.itemDisabled,
          ),
        className,
      )}
    />
  );
}

export type MenuGroupProps = React.ComponentProps<typeof MenuGroup>;

function Group({ className, ...props }: MenuGroupProps) {
  return (
    <MenuGroup
      {...props}
      className={mergeClassName(() => sx(menu.group), className)}
    />
  );
}

export type MenuGroupLabelProps = React.ComponentProps<typeof MenuGroupLabel>;

function GroupLabel({ className, ...props }: MenuGroupLabelProps) {
  return (
    <MenuGroupLabel
      {...props}
      className={mergeClassName(() => sx(menu.groupLabel), className)}
    />
  );
}

export type MenuSeparatorProps = React.ComponentProps<typeof MenuSeparator>;

function Separator({ className, ...props }: MenuSeparatorProps) {
  return (
    <MenuSeparator
      {...props}
      className={mergeClassName(() => sx(menu.separator), className)}
    />
  );
}

export type MenuSubmenuRootProps = React.ComponentProps<
  typeof MenuSubmenuRootPart
>;

function SubmenuRoot(props: MenuSubmenuRootProps) {
  return <MenuSubmenuRootPart {...props} />;
}

export type MenuSubmenuTriggerProps = React.ComponentProps<
  typeof MenuSubmenuTriggerPart
> & {
  itemKind?: "default" | "pointer";
};

function SubmenuTrigger({
  className,
  itemKind = "pointer",
  ...props
}: MenuSubmenuTriggerProps) {
  return (
    <MenuSubmenuTriggerPart
      {...props}
      className={mergeClassName(
        (state) =>
          sx(
            menu.item,
            transition.colors,
            itemKind === "pointer" ? menu.itemPointer : menu.itemDefault,
            state.highlighted && menu.itemHighlighted,
            state.disabled && menu.itemDisabled,
          ),
        className,
      )}
    />
  );
}

export type MenuCheckboxItemProps = React.ComponentProps<
  typeof MenuCheckboxItemPart
> & {
  /**
   * Pointer behavior: `"pointer"` (default — used by trigger menus) or
   * `"default"` (used by context menus, which open on right-click).
   */
  itemKind?: "default" | "pointer";
  tone?: "danger" | "default";
};

function CheckboxItem({
  className,
  itemKind = "pointer",
  tone = "default",
  ...props
}: MenuCheckboxItemProps) {
  return (
    <MenuCheckboxItemPart
      {...props}
      className={mergeClassName(
        (state) =>
          sx(
            menu.item,
            menu.itemCheckable,
            transition.colors,
            itemKind === "pointer" ? menu.itemPointer : menu.itemDefault,
            state.highlighted && menu.itemHighlighted,
            state.checked && menu.itemChecked,
            tone === "danger" && menu.itemDanger,
            state.disabled && menu.itemDisabled,
          ),
        className,
      )}
    />
  );
}

export type MenuCheckboxItemIndicatorProps = React.ComponentProps<
  typeof MenuCheckboxItemIndicatorPart
>;

function CheckboxItemIndicator({
  children,
  className,
  keepMounted = true,
  ...props
}: MenuCheckboxItemIndicatorProps) {
  return (
    <MenuCheckboxItemIndicatorPart
      {...props}
      className={mergeClassName(
        (state) =>
          sx(menu.itemIndicator, !state.checked && menu.itemIconHidden),
        className,
      )}
      keepMounted={keepMounted}
    >
      {children ?? <Check aria-hidden size={14} />}
    </MenuCheckboxItemIndicatorPart>
  );
}

export type MenuRadioGroupProps = React.ComponentProps<
  typeof MenuRadioGroupPart
>;

function RadioGroup(props: MenuRadioGroupProps) {
  return <MenuRadioGroupPart {...props} />;
}

export type MenuRadioItemProps = React.ComponentProps<
  typeof MenuRadioItemPart
> & {
  /**
   * Pointer behavior: `"pointer"` (default — used by trigger menus) or
   * `"default"` (used by context menus, which open on right-click).
   */
  itemKind?: "default" | "pointer";
  tone?: "danger" | "default";
};

function RadioItem({
  className,
  itemKind = "pointer",
  tone = "default",
  ...props
}: MenuRadioItemProps) {
  return (
    <MenuRadioItemPart
      {...props}
      className={mergeClassName(
        (state) =>
          sx(
            menu.item,
            menu.itemCheckable,
            transition.colors,
            itemKind === "pointer" ? menu.itemPointer : menu.itemDefault,
            state.highlighted && menu.itemHighlighted,
            state.checked && menu.itemChecked,
            tone === "danger" && menu.itemDanger,
            state.disabled && menu.itemDisabled,
          ),
        className,
      )}
    />
  );
}

export type MenuRadioItemIndicatorProps = React.ComponentProps<
  typeof MenuRadioItemIndicatorPart
>;

function RadioItemIndicator({
  children,
  className,
  keepMounted = true,
  ...props
}: MenuRadioItemIndicatorProps) {
  return (
    <MenuRadioItemIndicatorPart
      {...props}
      className={mergeClassName(
        (state) =>
          sx(menu.itemIndicator, !state.checked && menu.itemIconHidden),
        className,
      )}
      keepMounted={keepMounted}
    >
      {children ?? <span aria-hidden className={sx(styles.radioDot)} />}
    </MenuRadioItemIndicatorPart>
  );
}

/**
 * Compositional Menu namespace built on the Base UI `headless/menu` parts with
 * Atelier styling. Surfaces `render` passthrough on `Trigger`/`Item` and real
 * Base UI submenus via `Menu.SubmenuRoot` / `Menu.SubmenuTrigger`, plus
 * checkable items via `Menu.CheckboxItem` and `Menu.RadioGroup` / `Menu.RadioItem`,
 * and the trailing accelerator hint via `Menu.Shortcut`.
 *
 * The array-prop components (`DropdownMenu`, `ContextMenu`, `Menubar`) are
 * implemented on these same parts.
 */
export const Menu = {
  Root,
  Trigger: MenuTriggerPart,
  Portal,
  Positioner,
  Popup,
  Arrow,
  Item,
  Group,
  GroupLabel,
  Separator,
  SubmenuRoot,
  SubmenuTrigger,
  CheckboxItem,
  CheckboxItemIndicator,
  RadioGroup,
  RadioItem,
  RadioItemIndicator,
  Shortcut: MenuShortcut,
} as const;
