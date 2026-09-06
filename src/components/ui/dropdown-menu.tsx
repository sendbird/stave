import { overlayLayout } from "./overlay-layout.styles";
import { DropdownMenu as AdsMenu } from "../ads/components/DropdownMenu";
import { menu } from "../ads/recipes/menu";
import { sx, cx } from "../ads/utils/stylex";
import * as React from "react";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";

import { UI_LAYER_CLASS } from "@/lib/ui-layers";
import { ChevronRightIcon, CheckIcon } from "lucide-react";

function DropdownMenu({ ...props }: MenuPrimitive.Root.Props) {
  return <AdsMenu.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuPortal({ ...props }: MenuPrimitive.Portal.Props) {
  return <AdsMenu.Portal data-slot="dropdown-menu-portal" {...props} />;
}

function DropdownMenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
  return <AdsMenu.Trigger variant={props.render ? "unstyled" : "default"} data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuContent({
  align = "start",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  collisionBoundary,
  collisionPadding,
  sticky,
  positionMethod,
  collisionAvoidance,
  className,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<
    MenuPrimitive.Positioner.Props,
    | "align"
    | "alignOffset"
    | "side"
    | "sideOffset"
    | "collisionBoundary"
    | "collisionPadding"
    | "sticky"
    | "positionMethod"
    | "collisionAvoidance"
  >) {
  return (
    <AdsMenu.Portal>
      <AdsMenu.Positioner
        data-ui-popup-positioner=""
        className={UI_LAYER_CLASS.popover}
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        collisionBoundary={collisionBoundary}
        collisionPadding={collisionPadding}
        sticky={sticky}
        positionMethod={positionMethod}
        collisionAvoidance={collisionAvoidance}
      >
        <AdsMenu.Popup
          data-slot="dropdown-menu-content"
          className={className}
          {...props}
        />
      </AdsMenu.Positioner>
    </AdsMenu.Portal>
  );
}

function DropdownMenuGroup({ className, ...props }: MenuPrimitive.Group.Props) {
  return (
    <AdsMenu.Group
      data-slot="dropdown-menu-group"
      className={className}
      {...props}
    />
  );
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<"div"> & {
  inset?: boolean;
}) {
  return (
    <div
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cx(sx(menu.groupLabel), className)}
      {...props}
    />
  );
}

function renderDropdownMenuItemChildren(children: React.ReactNode) {
  return React.Children.map(children, (child) =>
    typeof child === "string" || typeof child === "number" ? (
      <span
        data-slot="dropdown-menu-item-label"
        className={sx(overlayLayout.menuLabel)}
      >
        {child}
      </span>
    ) : (
      child
    ),
  );
}

function DropdownMenuItem({
  className,
  children,
  inset,
  variant = "default",
  onClick,
  onSelect,
  ...props
}: Omit<MenuPrimitive.Item.Props, "nativeButton" | "onSelect" | "render"> & {
  inset?: boolean;
  variant?: "default" | "destructive";
  onSelect?: MenuPrimitive.Item.Props["onClick"];
}) {
  return (
    <AdsMenu.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      tone={variant === "destructive" ? "danger" : "default"}
      className={className}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          onSelect?.(event);
        }
      }}
      {...props}
      render={<button type="button" />}
      nativeButton
    >
      {renderDropdownMenuItemChildren(children)}
    </AdsMenu.Item>
  );
}

function DropdownMenuSub({ ...props }: MenuPrimitive.SubmenuRoot.Props) {
  return <AdsMenu.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />;
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: MenuPrimitive.SubmenuTrigger.Props & {
  inset?: boolean;
}) {
  return (
    <AdsMenu.SubmenuTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={className}
      {...props}
    >
      {renderDropdownMenuItemChildren(children)}
      <ChevronRightIcon className={sx(overlayLayout.submenuArrow)} />
    </AdsMenu.SubmenuTrigger>
  );
}

function DropdownMenuSubContent({
  align = "start",
  alignOffset = -3,
  side = "right",
  sideOffset = 0,
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuContent>) {
  return (
    <DropdownMenuContent
      data-slot="dropdown-menu-sub-content"
      className={className}
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      {...props}
    />
  );
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}: MenuPrimitive.CheckboxItem.Props & {
  inset?: boolean;
}) {
  return (
    <AdsMenu.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      className={className}
      checked={checked}
      {...props}
    >
      <AdsMenu.CheckboxItemIndicator>
          <CheckIcon />
        </AdsMenu.CheckboxItemIndicator>
      {renderDropdownMenuItemChildren(children)}
    </AdsMenu.CheckboxItem>
  );
}

function DropdownMenuRadioGroup({ ...props }: MenuPrimitive.RadioGroup.Props) {
  return (
    <AdsMenu.RadioGroup
      data-slot="dropdown-menu-radio-group"
      {...props}
    />
  );
}

function DropdownMenuRadioItem({
  className,
  children,
  inset,
  ...props
}: MenuPrimitive.RadioItem.Props & {
  inset?: boolean;
}) {
  return (
    <AdsMenu.RadioItem
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      className={className}
      {...props}
    >
      <AdsMenu.RadioItemIndicator>
          <CheckIcon />
        </AdsMenu.RadioItemIndicator>
      {renderDropdownMenuItemChildren(children)}
    </AdsMenu.RadioItem>
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: MenuPrimitive.Separator.Props) {
  return (
    <AdsMenu.Separator
      data-slot="dropdown-menu-separator"
      className={className}
      {...props}
    />
  );
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <AdsMenu.Shortcut
      data-slot="dropdown-menu-shortcut"
      className={className}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
};
