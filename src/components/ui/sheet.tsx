import { sheetLayout } from "./sheet-layout.styles";
import { overlayLayout } from "./overlay-layout.styles";
import { VisuallyHidden } from "../ads/components/VisuallyHidden";
import * as React from "react";
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";

import { UI_LAYER_CLASS } from "@/lib/ui-layers";
import { drawerStyles } from "../ads/components/Drawer";
import { sx, type StyleXValue } from "../ads/utils/stylex";
import { cx } from "../ads/utils/stylex";
import { mergeClassName } from "../ads/components/merge-class-name";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";

function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={mergeClassName(
        () =>
          cx(
            UI_LAYER_CLASS.dialog,
            "t-overlay",
            sx(sheetLayout.overlay),
          ) ?? "",
        className,
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  xstyle,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: "top" | "right" | "bottom" | "left";
  showCloseButton?: boolean;
  xstyle?: StyleXValue;
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={mergeClassName(
          () =>
            cx(
              UI_LAYER_CLASS.dialog,
              sx(
                drawerStyles.surface,
                sheetLayout.surface,
                sheetLayout[side],
                xstyle,
              ),
            ) ?? "",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            render={
              <Button
                variant="ghost"
                xstyle={overlayLayout.close}
                size="icon-sm"
              />
            }
          >
            <XIcon />
            <VisuallyHidden>Close</VisuallyHidden>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  );
}

function SheetHeader({
  className,
  xstyle,
  ...props
}: React.ComponentProps<"div"> & { xstyle?: StyleXValue }) {
  return (
    <div
      data-slot="sheet-header"
      className={cx(sx(sheetLayout.header, xstyle), className)}
      {...props}
    />
  );
}

function SheetFooter({
  className,
  xstyle,
  ...props
}: React.ComponentProps<"div"> & { xstyle?: StyleXValue }) {
  return (
    <div
      data-slot="sheet-footer"
      className={cx(sx(sheetLayout.footer, xstyle), className)}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={mergeClassName(() => sx(drawerStyles.title), className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={mergeClassName(() => sx(drawerStyles.description), className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
