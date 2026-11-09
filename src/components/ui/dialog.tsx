import { i18n, useTranslation } from "@/i18n";
import type { StyleXValue } from "../aui/utils/stylex";
import { VisuallyHidden } from "../aui/components/VisuallyHidden";
import { overlayLayout } from "./overlay-layout.styles";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

import { UI_LAYER_CLASS } from "@/lib/ui-layers";
import { Dialog as AuiDialog } from "../aui/components/Dialog";
import { overlaySurface } from "../aui/recipes/overlay-surface";
import { sx } from "../aui/utils/stylex";
import { cx } from "../aui/utils/stylex";
import { mergeClassName } from "../aui/components/merge-class-name";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";

type DialogProps = Omit<DialogPrimitive.Root.Props, "children"> & {
  children?: React.ReactNode;
};

function Dialog({ ...props }: DialogProps) {
  useTranslation();
  return <AuiDialog.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  useTranslation();
  return <AuiDialog.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  useTranslation();
  return <AuiDialog.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  useTranslation();
  return <AuiDialog.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  useTranslation();
  return (
    <AuiDialog.Backdrop
      data-slot="dialog-overlay"
      className={mergeClassName(() => UI_LAYER_CLASS.dialog, className)}
      xstyle={overlayLayout.positioner}
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
  useTranslation();
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
              sx(
                overlaySurface.modal,
                overlaySurface.modalRounded,
                overlayLayout.dialog,
                xstyle,
              ),
            ) ?? "",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <AuiDialog.Close
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
            <VisuallyHidden>{i18n.t("ui:dialog.close")}</VisuallyHidden>
          </AuiDialog.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  useTranslation();
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
  useTranslation();
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
        <AuiDialog.Close render={<Button variant="outline" />}>
          {i18n.t("ui:dialog.close")}</AuiDialog.Close>
      )}
    </div>
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  useTranslation();
  return (
    <AuiDialog.Title
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
  useTranslation();
  return (
    <AuiDialog.Description
      data-slot="dialog-description"
      className={className}
      xstyle={overlayLayout.description}
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
