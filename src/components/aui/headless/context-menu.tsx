import { ContextMenu as BaseContextMenu } from "@base-ui/react/context-menu";
import type * as React from "react";

export const ContextMenuRoot = BaseContextMenu.Root;
export const ContextMenuTrigger = BaseContextMenu.Trigger;
export const ContextMenuPortal = BaseContextMenu.Portal;
export const ContextMenuPositioner = BaseContextMenu.Positioner;
export const ContextMenuPopup = BaseContextMenu.Popup;
export const ContextMenuGroup = BaseContextMenu.Group;
export const ContextMenuGroupLabel = BaseContextMenu.GroupLabel;
export const ContextMenuItem = BaseContextMenu.Item;
export const ContextMenuSeparator = BaseContextMenu.Separator;
export const ContextMenuSubmenuRoot = BaseContextMenu.SubmenuRoot;
export const ContextMenuSubmenuTrigger = BaseContextMenu.SubmenuTrigger;

export type ContextMenuRootProps = React.ComponentProps<typeof ContextMenuRoot>;
