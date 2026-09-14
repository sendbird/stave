import { Menu as BaseMenu } from "@base-ui/react/menu";
import { Check } from "lucide-react";
import * as React from "react";

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
import type { OverlayDensity } from "../recipes/overlay-surface";
import { transition } from "../recipes/transition";
import { PortalProductThemeScope } from "../theming/ProductThemeProvider";
import { themeProps, themeSlotProps } from "../theming/theme-props";
import {
  POPUP_SIDE_OFFSET,
  type PopupPlacement,
  resolveAlign,
} from "../utils/placement";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { mergeClassName } from "./Menu.merge-class-name";
import { styles } from "./Menu.styles";
import { MenuShortcut } from "./Menu.shortcut";
import { MenuTriggerPart } from "./Menu.trigger";
import { MenuDensityProvider, useMenuDensity } from "./Menu.density";

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

// ---------------------------------------------------------------------------
// Compound parts (compositional Menu API, shared by DropdownMenu / ContextMenu /
// Menubar). Styled wrappers over the Base UI `headless/menu` parts.
// ---------------------------------------------------------------------------

export type MenuRootCompoundProps = React.ComponentProps<typeof MenuRoot> & {
  /** Row and popup air inherited by every compound part. @default "regular" */
  density?: OverlayDensity;
};

function Root({ density, ...props }: MenuRootCompoundProps) {
  const inheritedDensity = useMenuDensity();
  return (
    <MenuDensityProvider density={density ?? inheritedDensity}>
      <MenuRoot {...props} />
    </MenuDensityProvider>
  );
}

export type MenuPortalProps = React.ComponentProps<typeof MenuPortal>;

function Portal({ children, ...props }: MenuPortalProps) {
  return (
    <MenuPortal {...props}>
      <PortalProductThemeScope>{children}</PortalProductThemeScope>
    </MenuPortal>
  );
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
} & XstyleProp;

function Positioner({
  align,
  className,
  placement,
  side,
  sideOffset = POPUP_SIDE_OFFSET,
  xstyle,
  ...props
}: MenuPositionerProps) {
  const resolved = resolveAlign(placement);
  return (
    <MenuPositioner
      {...props}
      align={align ?? resolved.align}
      className={mergeClassName(() => sx(menu.positioner, xstyle), className)}
      side={side ?? resolved.side}
      sideOffset={sideOffset}
    />
  );
}

export type MenuPopupProps = React.ComponentProps<typeof MenuPopup> & {
  /** Row and popup air. @default "regular" */
  density?: OverlayDensity;
} & XstyleProp;

function Popup({ className, density, xstyle, ...props }: MenuPopupProps) {
  const inheritedDensity = useMenuDensity();
  const resolvedDensity = density ?? inheritedDensity;
  const theme = themeProps("menu-popup", { density: resolvedDensity });
  return (
    <MenuPopup
      {...props}
      {...theme}
      className={mergeClassName(
        () =>
          cx(
            sx(
              menu.popup,
              resolvedDensity === "compact" && menu.popupCompact,
              xstyle,
            ),
            "atelier-motion-dropdown",
            theme.className,
          ),
        className,
      )}
    />
  );
}

export type MenuArrowProps = React.ComponentProps<typeof MenuArrow>;

function Arrow(props: MenuArrowProps) {
  return <MenuArrow {...props} {...themeSlotProps("menu-popup", "arrow")} />;
}

export type MenuItemProps = React.ComponentProps<typeof MenuItem> & {
  density?: OverlayDensity;
  /**
   * Pointer behavior: `"pointer"` (default — used by trigger menus) or
   * `"default"` (used by context menus, which open on right-click).
   */
  itemKind?: "default" | "pointer";
  /** The currently applied choice; takes a `Select` row's fill. See menu.ts. */
  selected?: boolean;
  tone?: "danger" | "default";
} & XstyleProp;

function Item({
  className,
  density,
  itemKind = "pointer",
  selected = false,
  tone = "default",
  xstyle,
  ...props
}: MenuItemProps) {
  const inheritedDensity = useMenuDensity();
  const resolvedDensity = density ?? inheritedDensity;
  const theme = themeProps("menu-item", { density: resolvedDensity, tone });
  return (
    <MenuItem
      {...props}
      {...theme}
      className={mergeClassName(
        (state) =>
          cx(
            sx(
              menu.item,
              resolvedDensity === "compact" && menu.itemCompact,
              transition.colors,
              itemKind === "pointer" ? menu.itemPointer : menu.itemDefault,
              state.highlighted && menu.itemHighlighted,
              selected && menu.itemChecked,
              tone === "danger" && menu.itemDanger,
              state.disabled && menu.itemDisabled,
              xstyle,
            ),
            theme.className,
          ),
        className,
      )}
    />
  );
}

export type MenuGroupProps = React.ComponentProps<typeof MenuGroup> &
  XstyleProp;

function Group({ className, xstyle, ...props }: MenuGroupProps) {
  const density = useMenuDensity();
  return (
    <MenuGroup
      {...props}
      {...themeSlotProps("menu-popup", "group")}
      className={mergeClassName(
        () =>
          sx(menu.group, density === "compact" && menu.groupCompact, xstyle),
        className,
      )}
    />
  );
}

export type MenuGroupLabelProps = React.ComponentProps<typeof MenuGroupLabel> &
  XstyleProp;

function GroupLabel({ className, xstyle, ...props }: MenuGroupLabelProps) {
  return (
    <MenuGroupLabel
      {...props}
      {...themeSlotProps("menu-popup", "group-label")}
      className={mergeClassName(() => sx(menu.groupLabel, xstyle), className)}
    />
  );
}

export type MenuSeparatorProps = React.ComponentProps<typeof MenuSeparator> &
  XstyleProp;

function Separator({ className, xstyle, ...props }: MenuSeparatorProps) {
  const density = useMenuDensity();
  return (
    <MenuSeparator
      {...props}
      {...themeSlotProps("menu-popup", "separator")}
      className={mergeClassName(
        () =>
          sx(
            menu.separator,
            density === "compact" && menu.separatorCompact,
            xstyle,
          ),
        className,
      )}
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
} & XstyleProp;

function SubmenuTrigger({
  className,
  itemKind = "pointer",
  xstyle,
  ...props
}: MenuSubmenuTriggerProps) {
  const density = useMenuDensity();
  const theme = themeProps("menu-item", { density });
  return (
    <MenuSubmenuTriggerPart
      {...props}
      {...theme}
      className={mergeClassName(
        (state) =>
          cx(
            sx(
              menu.item,
              density === "compact" && menu.itemCompact,
              transition.colors,
              itemKind === "pointer" ? menu.itemPointer : menu.itemDefault,
              state.highlighted && menu.itemHighlighted,
              state.disabled && menu.itemDisabled,
              xstyle,
            ),
            theme.className,
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
} & XstyleProp;

function CheckboxItem({
  className,
  itemKind = "pointer",
  tone = "default",
  xstyle,
  ...props
}: MenuCheckboxItemProps) {
  const density = useMenuDensity();
  const theme = themeProps("menu-item", { density, tone });
  return (
    <MenuCheckboxItemPart
      {...props}
      {...theme}
      className={mergeClassName(
        (state) =>
          cx(
            sx(
              menu.item,
              density === "compact" && menu.itemCompact,
              menu.itemCheckable,
              transition.colors,
              itemKind === "pointer" ? menu.itemPointer : menu.itemDefault,
              state.highlighted && menu.itemHighlighted,
              state.checked && menu.itemChecked,
              tone === "danger" && menu.itemDanger,
              state.disabled && menu.itemDisabled,
              xstyle,
            ),
            theme.className,
          ),
        className,
      )}
    />
  );
}

export type MenuCheckboxItemIndicatorProps = React.ComponentProps<
  typeof MenuCheckboxItemIndicatorPart
> &
  XstyleProp;

function CheckboxItemIndicator({
  children,
  className,
  keepMounted = true,
  xstyle,
  ...props
}: MenuCheckboxItemIndicatorProps) {
  return (
    <MenuCheckboxItemIndicatorPart
      {...props}
      {...themeSlotProps("menu-item", "indicator")}
      className={mergeClassName(
        (state) =>
          sx(menu.itemIndicator, !state.checked && menu.itemIconHidden, xstyle),
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
} & XstyleProp;

function RadioItem({
  className,
  itemKind = "pointer",
  tone = "default",
  xstyle,
  ...props
}: MenuRadioItemProps) {
  const density = useMenuDensity();
  const theme = themeProps("menu-item", { density, tone });
  return (
    <MenuRadioItemPart
      {...props}
      {...theme}
      className={mergeClassName(
        (state) =>
          cx(
            sx(
              menu.item,
              density === "compact" && menu.itemCompact,
              menu.itemCheckable,
              transition.colors,
              itemKind === "pointer" ? menu.itemPointer : menu.itemDefault,
              state.highlighted && menu.itemHighlighted,
              state.checked && menu.itemChecked,
              tone === "danger" && menu.itemDanger,
              state.disabled && menu.itemDisabled,
              xstyle,
            ),
            theme.className,
          ),
        className,
      )}
    />
  );
}

export type MenuRadioItemIndicatorProps = React.ComponentProps<
  typeof MenuRadioItemIndicatorPart
> &
  XstyleProp;

function RadioItemIndicator({
  children,
  className,
  keepMounted = true,
  xstyle,
  ...props
}: MenuRadioItemIndicatorProps) {
  return (
    <MenuRadioItemIndicatorPart
      {...props}
      {...themeSlotProps("menu-item", "indicator")}
      className={mergeClassName(
        (state) =>
          sx(menu.itemIndicator, !state.checked && menu.itemIconHidden, xstyle),
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
