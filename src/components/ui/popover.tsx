import * as React from "react";
import { mergeProps } from "@base-ui/react/merge-props";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { useRender } from "@base-ui/react/use-render";

import { UI_ELEVATION_CLASS, UI_LAYER_CLASS } from "@/lib/ui-layers";
import { cn } from "@/lib/utils";

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
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<PopoverPrimitive.Portal.Props, "keepMounted"> &
  Pick<
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
        className={cn("isolate", UI_LAYER_CLASS.popover)}
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            UI_ELEVATION_CLASS.floating,
            "t-dropdown flex w-72 origin-(--transform-origin) flex-col gap-4 rounded-md bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 outline-hidden",
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
      className={cn("flex flex-col gap-1 text-sm", className)}
      {...props}
    />
  );
}

function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn("font-medium", className)}
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
      className={cn("text-muted-foreground", className)}
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
