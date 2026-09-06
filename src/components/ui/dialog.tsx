import type { StyleXValue } from "../ads/utils/stylex";
import { VisuallyHidden } from "../ads/components/VisuallyHidden";
import { overlayLayout } from "./overlay-layout.styles";
"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

import { UI_LAYER_CLASS } from "@/lib/ui-layers";
import { Dialog as AdsDialog, dialogStyles } from "../ads/components/Dialog";
import { sx } from "../ads/utils/stylex";
import { cx } from "../ads/utils/stylex";
import { mergeClassName } from "../ads/components/merge-class-name";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";

type DialogProps = Omit<DialogPrimitive.Root.Props, "children"> & {
  children?: React.ReactNode;
};

function Dialog({ ...props }: DialogProps) {
  return <AdsDialog.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <AdsDialog.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <AdsDialog.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <AdsDialog.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <AdsDialog.Backdrop
      data-slot="dialog-overlay"
      className={mergeClassName(
        () => cx(UI_LAYER_CLASS.dialog, sx(overlayLayout.positioner)) ?? "",
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  xstyle,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean;
  xstyle?: StyleXValue;
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={mergeClassName(
          () =>
            cx(
              UI_LAYER_CLASS.dialog,
              "t-modal",
              sx(dialogStyles.surface, overlayLayout.dialog, xstyle),
            ) ?? "",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <AdsDialog.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className={sx(overlayLayout.close)}
                size="icon-sm"
              />
            }
          >
            <XIcon />
            <VisuallyHidden>Close</VisuallyHidden>
          </AdsDialog.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cx(sx(overlayLayout.header), className)}
      {...props}
    />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cx(
        sx(overlayLayout.footer),
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <AdsDialog.Close render={<Button variant="outline" />}>
          Close
        </AdsDialog.Close>
      )}
    </div>
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <AdsDialog.Title
      data-slot="dialog-title"
      className={className}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <AdsDialog.Description
      data-slot="dialog-description"
      className={mergeClassName(
        () => sx(overlayLayout.description),
        className,
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
