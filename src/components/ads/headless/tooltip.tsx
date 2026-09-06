import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type * as React from "react";

export const TooltipProvider = BaseTooltip.Provider;
export const TooltipRoot = BaseTooltip.Root;
export const TooltipTrigger = BaseTooltip.Trigger;
export const TooltipPortal = BaseTooltip.Portal;
export const TooltipPositioner = BaseTooltip.Positioner;
export const TooltipPopup = BaseTooltip.Popup;
export const TooltipArrow = BaseTooltip.Arrow;

export type TooltipRootProps = React.ComponentProps<typeof TooltipRoot>;
