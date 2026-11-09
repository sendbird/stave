import { overlayLayout } from "./overlay-layout.styles";
import { ContextMenu as AuiMenu } from "../aui/components/ContextMenu";
import { menu } from "../aui/recipes/menu";
import { sx, cx } from "../aui/utils/stylex";
import * as React from "react";
import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";

import { UI_LAYER_CLASS, UI_LAYER_VALUE } from "@/lib/ui-layers";
import { ChevronRightIcon, CheckIcon } from "lucide-react";

function ContextMenu({ ...props }: ContextMenuPrimitive.Root.Props) {
  return <AuiMenu.Root data-slot="context-menu" {...props} />;
}

function ContextMenuPortal({ ...props }: ContextMenuPrimitive.Portal.Props) {
  return (
    <AuiMenu.Portal data-slot="context-menu-portal" {...props} />
  );
}

function ContextMenuTrigger({
  className,
  ...props
}: ContextMenuPrimitive.Trigger.Props) {
  return (
    <AuiMenu.Trigger
      data-slot="context-menu-trigger"
      className={className}
      {...props}
    />
  );
}

function ContextMenuContent({
  className,
  align = "start",
  alignOffset = 4,
  side = "right",
  sideOffset = 0,
  collisionBoundary,
  collisionPadding,
  sticky,
  positionMethod,
  collisionAvoidance,
  ...props
}: ContextMenuPrimitive.Popup.Props &
  Pick<
    ContextMenuPrimitive.Positioner.Props,
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
    <AuiMenu.Portal>
      <AuiMenu.Positioner
        data-ui-popup-positioner=""
        className={UI_LAYER_CLASS.popover}
        // Same reason as the dropdown shim: AUI's `menu.positioner` pins
        // `zIndex: zIndexDropdown` (60) and string-joins the caller's layer
        // class, so the declared band has to be stated inline to survive.
        style={{ zIndex: UI_LAYER_VALUE.popover }}
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
        <AuiMenu.Popup
          data-slot="context-menu-content"
          className={className}
          {...props}
        />
      </AuiMenu.Positioner>
    </AuiMenu.Portal>
  );
}

function ContextMenuGroup({ ...props }: ContextMenuPrimitive.Group.Props) {
  return (
    <AuiMenu.Group data-slot="context-menu-group" {...props} />
  );
}

function ContextMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<"div"> & {
  inset?: boolean;
}) {
  return (
    <div
      data-slot="context-menu-label"
      data-inset={inset}
      className={cx(sx(menu.groupLabel), className)}
      {...props}
    />
  );
}

function ContextMenuItem({
  className,
  inset,
  variant = "default",
  onClick,
  onSelect,
  ...props
}: Omit<
  ContextMenuPrimitive.Item.Props,
  "nativeButton" | "onSelect" | "render"
> & {
  inset?: boolean;
  variant?: "default" | "destructive";
  onSelect?: ContextMenuPrimitive.Item.Props["onClick"];
}) {
  return (
    <AuiMenu.Item
      data-slot="context-menu-item"
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
    />
  );
}

function ContextMenuSub({ ...props }: ContextMenuPrimitive.SubmenuRoot.Props) {
  return (
    <AuiMenu.SubmenuRoot data-slot="context-menu-sub" {...props} />
  );
}

function ContextMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: ContextMenuPrimitive.SubmenuTrigger.Props & {
  inset?: boolean;
}) {
  return (
    <AuiMenu.SubmenuTrigger
      data-slot="context-menu-sub-trigger"
      data-inset={inset}
      className={className}
      {...props}
    >
      {children}
      <ChevronRightIcon className={sx(overlayLayout.submenuArrow)} />
    </AuiMenu.SubmenuTrigger>
  );
}

function ContextMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuContent>) {
  return (
    <ContextMenuContent
      data-slot="context-menu-sub-content"
      className={className}
      side="right"
      {...props}
    />
  );
}

function ContextMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}: ContextMenuPrimitive.CheckboxItem.Props & {
  inset?: boolean;
}) {
  return (
    <AuiMenu.CheckboxItem
      data-slot="context-menu-checkbox-item"
      data-inset={inset}
      className={className}
      checked={checked}
      {...props}
    >
      <span className={sx(overlayLayout.menuIndicator)}>
        <AuiMenu.CheckboxItemIndicator>
          <CheckIcon />
        </AuiMenu.CheckboxItemIndicator>
      </span>
      {children}
    </AuiMenu.CheckboxItem>
  );
}

function ContextMenuRadioGroup({
  ...props
}: ContextMenuPrimitive.RadioGroup.Props) {
  return (
    <AuiMenu.RadioGroup
      data-slot="context-menu-radio-group"
      {...props}
    />
  );
}

function ContextMenuRadioItem({
  className,
  children,
  inset,
  ...props
}: ContextMenuPrimitive.RadioItem.Props & {
  inset?: boolean;
}) {
  return (
    <AuiMenu.RadioItem
      data-slot="context-menu-radio-item"
      data-inset={inset}
      className={className}
      {...props}
    >
      <span className={sx(overlayLayout.menuIndicator)}>
        <AuiMenu.RadioItemIndicator>
          <CheckIcon />
        </AuiMenu.RadioItemIndicator>
      </span>
      {children}
    </AuiMenu.RadioItem>
  );
}

function ContextMenuSeparator({
  className,
  ...props
}: ContextMenuPrimitive.Separator.Props) {
  return (
    <AuiMenu.Separator
      data-slot="context-menu-separator"
      className={className}
      {...props}
    />
  );
}

function ContextMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <AuiMenu.Shortcut
      data-slot="context-menu-shortcut"
      className={className}
      {...props}
    />
  );
}

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuGroup,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuRadioGroup,
};
