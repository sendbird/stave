import { Drawer as BaseDrawer } from "@base-ui/react/drawer";
import type * as React from "react";

export const DrawerRoot = BaseDrawer.Root;
export const DrawerTrigger = BaseDrawer.Trigger;
export const DrawerPortal = BaseDrawer.Portal;
export const DrawerBackdrop = BaseDrawer.Backdrop;
export const DrawerViewport = BaseDrawer.Viewport;
export const DrawerPopup = BaseDrawer.Popup;
export const DrawerContent = BaseDrawer.Content;
export const DrawerTitle = BaseDrawer.Title;
export const DrawerDescription = BaseDrawer.Description;
export const DrawerClose = BaseDrawer.Close;

export type DrawerRootProps = React.ComponentProps<typeof DrawerRoot>;
export type DrawerTriggerProps = React.ComponentProps<typeof DrawerTrigger>;
