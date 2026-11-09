import { Menu as BaseMenu } from "@base-ui/react/menu";
import type * as React from "react";

export const MenuRoot = BaseMenu.Root;
export const MenuTrigger = BaseMenu.Trigger;
export const MenuPortal = BaseMenu.Portal;
export const MenuPositioner = BaseMenu.Positioner;
export const MenuPopup = BaseMenu.Popup;
export const MenuItem = BaseMenu.Item;
export const MenuGroup = BaseMenu.Group;
export const MenuGroupLabel = BaseMenu.GroupLabel;
export const MenuSeparator = BaseMenu.Separator;
export const MenuArrow = BaseMenu.Arrow;

export type MenuRootProps = React.ComponentProps<typeof MenuRoot>;
export type MenuItemProps = React.ComponentProps<typeof MenuItem>;
