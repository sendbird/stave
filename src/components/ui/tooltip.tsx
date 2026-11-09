import { overlayLayout } from "./overlay-layout.styles";
import { sx } from "../aui/utils/stylex";
import { tooltipStyles } from "../aui/components/Tooltip";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";

import { UI_LAYER_CLASS } from "@/lib/ui-layers";
import { cx } from "../aui/utils/stylex";
import { mergeClassName } from "../aui/components/merge-class-name";

function TooltipProvider({
  delay = 0,
  ...props
}: TooltipPrimitive.Provider.Props) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delay={delay}
      {...props}
    />
  );
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 8,
  align = "center",
  alignOffset = 0,
  anchor,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<
    TooltipPrimitive.Positioner.Props,
    "align" | "alignOffset" | "anchor" | "side" | "sideOffset"
  >) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        data-ui-popup-positioner=""
        anchor={anchor}
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className={cx(sx(overlayLayout.positioner), UI_LAYER_CLASS.popover)}
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={mergeClassName(
            () => sx(tooltipStyles.popup),
            className,
          )}
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow className={sx(tooltipStyles.arrow)} />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
