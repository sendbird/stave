import type { StyleXValue } from "../ads/utils/stylex";
import { overlayLayout } from "./overlay-layout.styles";
import { sx } from "../ads/utils/stylex";
import { cx } from "../ads/utils/stylex";
import { mergeClassName } from "../ads/components/merge-class-name";
import { popoverStyles } from "../ads/components/Popover";
import * as React from "react";
import { mergeProps } from "@base-ui/react/merge-props";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { useRender } from "@base-ui/react/use-render";

import {
  UI_LAYER_CLASS,
  type UiLayerName,
} from "@/lib/ui-layers";

type PopoverContextValue = {
  anchorElement: Element | null;
  setAnchorElement: (element: Element | null) => void;
};

const PopoverContext = React.createContext<PopoverContextValue | null>(null);

type PopoverProps = Omit<PopoverPrimitive.Root.Props, "children"> & {
  children?: React.ReactNode;
};

function Popover({ children, ...props }: PopoverProps) {
  const [anchorElement, setAnchorElement] = React.useState<Element | null>(
    null,
  );
  const contextValue = React.useMemo(
    () => ({ anchorElement, setAnchorElement }),
    [anchorElement],
  );

  return (
    <PopoverContext.Provider value={contextValue}>
      <PopoverPrimitive.Root data-slot="popover" {...props}>
        {children}
      </PopoverPrimitive.Root>
    </PopoverContext.Provider>
  );
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverAnchor({ render, ...props }: useRender.ComponentProps<"div">) {
  const context = React.useContext(PopoverContext);

  if (!context) {
    throw new Error("PopoverAnchor must be used within Popover.");
  }

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        ref: context.setAnchorElement,
      },
      props,
    ),
    render,
    state: {
      slot: "popover-anchor",
    },
  });
}

function PopoverContent({
  className,
  align = "center",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  collisionBoundary,
  collisionPadding,
  sticky,
  positionMethod,
  collisionAvoidance,
  keepMounted,
  layer = "popover",
  xstyle,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<PopoverPrimitive.Portal.Props, "keepMounted"> & {
    /**
     * Stacking band for the positioner. `popover` keeps the popup above the
     * dialog band, which is what an anchored menu inside a dialog needs. A
     * popover that instead *hosts* dialog triggers has to drop below the
     * dialog band, or the dialog it opens (portalled inside this popover's
     * portal node) paints underneath it.
     */
    layer?: UiLayerName;
    xstyle?: StyleXValue;
  } & Pick<
    PopoverPrimitive.Positioner.Props,
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
  const context = React.useContext(PopoverContext);

  return (
    // `keepMounted` leaves the popup in the DOM (the positioner carries the
    // `hidden` attribute instead) so content that is expensive to rebuild --
    // a live terminal renderer, for one -- survives a close.
    <PopoverPrimitive.Portal keepMounted={keepMounted}>
      <PopoverPrimitive.Positioner
        data-ui-popup-positioner=""
        anchor={context?.anchorElement ?? undefined}
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        collisionBoundary={collisionBoundary}
        collisionPadding={collisionPadding}
        sticky={sticky}
        positionMethod={positionMethod}
        collisionAvoidance={collisionAvoidance}
        className={cx(sx(overlayLayout.positioner), UI_LAYER_CLASS[layer])}
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={mergeClassName(
            () =>
              cx(
                "atelier-motion-dropdown",
                sx(popoverStyles.surface, overlayLayout.popover, xstyle),
              ) ?? "",
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cx(sx(overlayLayout.popoverHeader), className)}
      {...props}
    />
  );
}

function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={mergeClassName(() => sx(popoverStyles.title), className)}
      {...props}
    />
  );
}

function PopoverDescription({
  className,
  ...props
}: PopoverPrimitive.Description.Props) {
  return (
    <PopoverPrimitive.Description
      data-slot="popover-description"
      className={mergeClassName(() => sx(overlayLayout.muted), className)}
      {...props}
    />
  );
}

export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
};
