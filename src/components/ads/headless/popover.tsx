import { Popover as BasePopover } from "@base-ui/react/popover";
import type * as React from "react";

export const PopoverRoot = BasePopover.Root;
export const PopoverTrigger = BasePopover.Trigger;
export const PopoverPortal = BasePopover.Portal;
export const PopoverPositioner = BasePopover.Positioner;
export const PopoverPopup = BasePopover.Popup;
export const PopoverArrow = BasePopover.Arrow;
export const PopoverTitle = BasePopover.Title;
export const PopoverDescription = BasePopover.Description;
export const PopoverClose = BasePopover.Close;

export type PopoverRootProps = React.ComponentProps<typeof PopoverRoot>;
export type PopoverTriggerProps = React.ComponentProps<typeof PopoverTrigger>;
