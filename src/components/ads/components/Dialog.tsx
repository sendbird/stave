import { X } from "lucide-react";
import * as React from "react";

import {
  DialogBackdrop as HeadlessDialogBackdrop,
  DialogClose as HeadlessDialogClose,
  DialogDescription as HeadlessDialogDescription,
  DialogPopup as HeadlessDialogPopup,
  DialogPortal as HeadlessDialogPortal,
  DialogRoot as HeadlessDialogRoot,
  DialogTitle as HeadlessDialogTitle,
  DialogTrigger as HeadlessDialogTrigger,
  type DialogRootProps,
} from "../headless/dialog";
import { controlIconSizes, controlSquares } from "../recipes/control-metrics";
import { focusRing } from "../recipes/focus-ring";
import {
  type OverlayDensity,
  overlayModalDensity,
  overlaySurface,
  overlayTitleGroupDensity,
} from "../recipes/overlay-surface";
import { surfaceChrome } from "../recipes/surface-chrome";
import {
  PortalProductThemeScope,
  usePortalProductThemeProps,
} from "../theming/ProductThemeProvider";
import {
  themeProps,
  themeSlotProps,
  themeTargetClassName,
} from "../theming/theme-props";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { Button } from "./Button";
import { popupWidthStyles, styles } from "./Dialog.styles";
import { mergeClassName } from "./merge-class-name";

export type DialogWidth = "sm" | "md" | "lg" | "xl";
/** @deprecated Use `DialogWidth`; `size` was a panel-width axis. */
export type DialogSize = DialogWidth;

export type DialogRootCompoundProps = React.ComponentProps<
  typeof HeadlessDialogRoot
>;

const DialogDensityContext = React.createContext<OverlayDensity>("regular");

/** Base UI state root for the composed Dialog API. */
export function DialogRoot(props: DialogRootCompoundProps) {
  return <HeadlessDialogRoot {...props} />;
}

export type DialogTriggerProps = React.ComponentProps<
  typeof HeadlessDialogTrigger
>;

/** Trigger that preserves Base UI focus management and restore behavior. */
export function DialogTrigger(props: DialogTriggerProps) {
  return <HeadlessDialogTrigger {...props} />;
}

export type DialogPortalProps = React.ComponentProps<
  typeof HeadlessDialogPortal
>;

export function DialogPortal({ children, ...props }: DialogPortalProps) {
  return (
    <HeadlessDialogPortal {...props}>
      <PortalProductThemeScope>{children}</PortalProductThemeScope>
    </HeadlessDialogPortal>
  );
}

export type DialogBackdropProps = React.ComponentProps<
  typeof HeadlessDialogBackdrop
> &
  XstyleProp;

/** Tokenized modal backdrop with the shared enter/exit motion contract. */
export function DialogBackdrop({
  className,
  xstyle,
  ...props
}: DialogBackdropProps) {
  // Portalled beside the popup, so it carries the brand for the same reason.
  const portalTheme = usePortalProductThemeProps();
  return (
    <HeadlessDialogBackdrop
      {...props}
      {...portalTheme}
      className={(state) =>
        cx(
          sx(overlaySurface.backdrop, xstyle),
          themeTargetClassName("dialog-backdrop"),
          "atelier-motion-backdrop",
          typeof className === "function" ? className(state) : className,
        )
      }
    />
  );
}

export type DialogPopupProps = Omit<
  React.ComponentProps<typeof HeadlessDialogPopup>,
  "size"
> & {
  /** Internal surface air, independent from popup width. @default "regular" */
  density?: OverlayDensity;
  /** @deprecated Use `width`. @default "md" */
  size?: DialogSize;
  /** Popup width. @default "md" */
  width?: DialogWidth;
} & XstyleProp;

/** Modal surface. Header, Body, and Footer own its three stable grid rows. */
export function DialogPopup({
  className,
  density = "regular",
  size,
  width = size ?? "md",
  xstyle,
  ...props
}: DialogPopupProps) {
  const theme = themeProps("dialog-popup", { density, size: width });
  // The popup leaves its provider's DOM subtree through the portal, so it
  // carries the brand with it. `@scope` is a fact about the DOM tree and a
  // portal is exactly where the DOM tree and the React tree disagree — without
  // this, opening a dialog inside a branded region drops to ADS's own paint.
  const portalTheme = usePortalProductThemeProps();
  return (
    <DialogDensityContext.Provider value={density}>
      <HeadlessDialogPopup
        {...props}
        {...portalTheme}
        {...theme}
        className={(state) =>
          cx(
            sx(
              overlaySurface.modal,
              overlaySurface.modalRounded,
              styles.popup,
              overlayModalDensity[density],
              popupWidthStyles[width],
              xstyle,
            ),
            theme.className,
            "atelier-motion-modal",
            typeof className === "function" ? className(state) : className,
          )
        }
      />
    </DialogDensityContext.Provider>
  );
}

export type DialogHeaderProps = React.ComponentProps<"div"> & XstyleProp;

export function DialogHeader({
  className,
  xstyle,
  ...props
}: DialogHeaderProps) {
  return (
    <div
      {...props}
      {...themeSlotProps("dialog-popup", "header")}
      className={cx(sx(styles.header, xstyle), className)}
    />
  );
}

export type DialogHeaderContentProps = React.ComponentProps<"div"> & XstyleProp;

/** Keeps title and supporting copy together opposite the close control. */
export function DialogHeaderContent({
  className,
  xstyle,
  ...props
}: DialogHeaderContentProps) {
  const density = React.useContext(DialogDensityContext);
  return (
    <div
      {...props}
      {...themeSlotProps("dialog-popup", "header-content")}
      className={cx(
        sx(styles.titleGroup, overlayTitleGroupDensity[density], xstyle),
        className,
      )}
    />
  );
}

export type DialogTitleProps = React.ComponentProps<
  typeof HeadlessDialogTitle
> &
  XstyleProp;

export function DialogTitle({ className, xstyle, ...props }: DialogTitleProps) {
  return (
    <HeadlessDialogTitle
      {...props}
      {...themeSlotProps("dialog-popup", "title")}
      className={mergeClassName(() => sx(styles.title, xstyle), className)}
    />
  );
}

export type DialogDescriptionProps = React.ComponentProps<
  typeof HeadlessDialogDescription
> &
  XstyleProp;

export function DialogDescription({
  className,
  xstyle,
  ...props
}: DialogDescriptionProps) {
  return (
    <HeadlessDialogDescription
      {...props}
      {...themeSlotProps("dialog-popup", "description")}
      className={mergeClassName(
        () => sx(styles.description, xstyle),
        className,
      )}
    />
  );
}

export type DialogBodyProps = React.ComponentProps<"div"> & XstyleProp;

/** The only scroll container, so the header and footer remain reachable. */
export function DialogBody({ className, xstyle, ...props }: DialogBodyProps) {
  return (
    <div
      {...props}
      {...themeSlotProps("dialog-popup", "body")}
      className={cx(sx(styles.body, focusRing.gutter, xstyle), className)}
    />
  );
}

export type DialogFooterProps = React.ComponentProps<"div"> & XstyleProp;

export function DialogFooter({
  className,
  xstyle,
  ...props
}: DialogFooterProps) {
  return (
    <div
      {...props}
      {...themeSlotProps("dialog-popup", "footer")}
      className={cx(sx(styles.actions, xstyle), className)}
    />
  );
}

export type DialogCloseProps = React.ComponentProps<typeof HeadlessDialogClose>;

/** Unstyled dismiss part for composing footer buttons and custom controls. */
export function DialogClose(props: DialogCloseProps) {
  return <HeadlessDialogClose {...props} />;
}

export type DialogCloseButtonProps = Omit<
  DialogCloseProps,
  "children" | "style"
> & {
  children?: React.ReactNode;
  style?: React.CSSProperties;
} & XstyleProp;

/** Standard 32px quiet close control shared by Dialog convenience and parts. */
export function DialogCloseButton({
  "aria-label": ariaLabel = "Close",
  children,
  className,
  style,
  xstyle,
  ...props
}: DialogCloseButtonProps) {
  return (
    <HeadlessDialogClose
      {...props}
      {...themeSlotProps("dialog-popup", "close")}
      aria-label={ariaLabel}
      className={mergeClassName(
        () =>
          sx(
            surfaceChrome.quietIconButton,
            controlSquares.sm,
            focusRing.ring,
            styles.closeButton,
            xstyle,
          ),
        className,
      )}
      data-ads-control-icon-button="true"
      style={
        {
          ...style,
          "--ads-control-icon-size": controlIconSizes.md,
        } as React.CSSProperties
      }
    >
      {children ?? <X aria-hidden />}
    </HeadlessDialogClose>
  );
}

export type DialogProps = Omit<DialogRootProps, "children"> & {
  children?: React.ReactNode;
  /**
   * Accessible name of the header close button. There is no i18n catalogue in
   * this package, so a baked-in `aria-label` is unreachable for a consumer that
   * needs different wording. Defaults to `"Close"` — the same default as
   * `PeekPanel`, so one action does not carry two names across sibling
   * surfaces.
   */
  closeLabel?: string;
  /** Internal surface air, independent from popup width. @default "regular" */
  density?: OverlayDensity;
  description?: React.ReactNode;
  /**
   * Action row content (e.g. `Button`s; wrap dismissing actions in the
   * headless `DialogClose` via its `render` prop). Nothing is rendered when
   * omitted — the previous hardcoded Cancel/Apply pair is gone.
   */
  footer?: React.ReactNode;
  /** @deprecated Use `width`. */
  size?: DialogSize;
  title: React.ReactNode;
  /**
   * Trigger content. A `<Button>` element is composed directly (pass one to
   * control variant/size); any other node is wrapped in the default `Button`.
   */
  /** Omit for a controlled dialog opened by a parent action. */
  trigger?: React.ReactNode;
  /**
   * Popup width: `sm` (400px) for a confirm-shaped dialog that is one sentence
   * and two buttons, `md` (460px, default) or `lg` (520px) for form-heavy
   * flows, `xl` (1040px) when the dialog carries a table or another surface
   * that has columns to keep legible.
   * @default "md"
   */
  width?: DialogWidth;
} & XstyleProp;

function DialogConvenience({
  children,
  closeLabel = "Close",
  density = "regular",
  description,
  footer,
  size,
  title,
  trigger,
  width = size ?? "md",
  xstyle,
  ...props
}: DialogProps) {
  const triggerElement =
    trigger === undefined ? null : React.isValidElement(trigger) &&
      trigger.type === Button ? (
      (trigger as React.ReactElement)
    ) : (
      <Button>{trigger}</Button>
    );

  return (
    <DialogRoot {...props}>
      {triggerElement ? <DialogTrigger render={triggerElement} /> : null}
      <DialogPortal>
        <DialogBackdrop />
        <DialogPopup density={density} width={width} xstyle={xstyle}>
          <DialogHeader>
            <DialogHeaderContent>
              <DialogTitle>{title}</DialogTitle>
              {description ? (
                <DialogDescription>{description}</DialogDescription>
              ) : null}
            </DialogHeaderContent>
            <DialogCloseButton aria-label={closeLabel} />
          </DialogHeader>
          <DialogBody>{children}</DialogBody>
          {footer ? <DialogFooter>{footer}</DialogFooter> : null}
        </DialogPopup>
      </DialogPortal>
    </DialogRoot>
  );
}

/**
 * The concise title/body/footer API remains callable, while the namespace
 * exposes styled Base UI parts for compound forms and custom modal workflows.
 */
export const Dialog = Object.assign(DialogConvenience, {
  Backdrop: DialogBackdrop,
  Body: DialogBody,
  Close: DialogClose,
  CloseButton: DialogCloseButton,
  Description: DialogDescription,
  Footer: DialogFooter,
  Header: DialogHeader,
  HeaderContent: DialogHeaderContent,
  Popup: DialogPopup,
  Portal: DialogPortal,
  Root: DialogRoot,
  Title: DialogTitle,
  Trigger: DialogTrigger,
});

// Host modification: the compound adapters in `../../ui` and the product's own
// dialog panels compose Dialog's canonical geometry keys, so the style object
// stays exported. Upstream keeps them in `Dialog.styles`; re-exported here so
// the import path a host consumer already uses does not move.
export { styles as dialogStyles } from "./Dialog.styles";
