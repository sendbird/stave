import * as stylex from "@stylexjs/stylex";
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
import { surfaceChrome } from "../recipes/surface-chrome";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";
import { Button } from "./Button";
import { mergeClassName } from "./merge-class-name";

export type DialogSize = "sm" | "md" | "lg" | "xl";

export type DialogRootCompoundProps = React.ComponentProps<
  typeof HeadlessDialogRoot
>;

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

export function DialogPortal(props: DialogPortalProps) {
  return <HeadlessDialogPortal {...props} />;
}

export type DialogBackdropProps = React.ComponentProps<
  typeof HeadlessDialogBackdrop
>;

/** Tokenized modal backdrop with the shared enter/exit motion contract. */
export function DialogBackdrop({ className, ...props }: DialogBackdropProps) {
  return (
    <HeadlessDialogBackdrop
      {...props}
      className={(state) =>
        cx(
          sx(styles.backdrop),
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
  /** @default "md" */
  size?: DialogSize;
};

/** Modal surface. Header, Body, and Footer own its three stable grid rows. */
export function DialogPopup({
  className,
  size = "md",
  ...props
}: DialogPopupProps) {
  return (
    <HeadlessDialogPopup
      {...props}
      className={(state) =>
        cx(
          sx(styles.surface, styles.popup, popupSizeStyles[size]),
          "atelier-motion-modal",
          typeof className === "function" ? className(state) : className,
        )
      }
    />
  );
}

export type DialogHeaderProps = React.ComponentProps<"div">;

export function DialogHeader({ className, ...props }: DialogHeaderProps) {
  return <div {...props} className={cx(sx(styles.header), className)} />;
}

export type DialogHeaderContentProps = React.ComponentProps<"div">;

/** Keeps title and supporting copy together opposite the close control. */
export function DialogHeaderContent({
  className,
  ...props
}: DialogHeaderContentProps) {
  return <div {...props} className={cx(sx(styles.titleGroup), className)} />;
}

export type DialogTitleProps = React.ComponentProps<typeof HeadlessDialogTitle>;

export function DialogTitle({ className, ...props }: DialogTitleProps) {
  return (
    <HeadlessDialogTitle
      {...props}
      className={mergeClassName(() => sx(styles.title), className)}
    />
  );
}

export type DialogDescriptionProps = React.ComponentProps<
  typeof HeadlessDialogDescription
>;

export function DialogDescription({
  className,
  ...props
}: DialogDescriptionProps) {
  return (
    <HeadlessDialogDescription
      {...props}
      className={mergeClassName(() => sx(styles.description), className)}
    />
  );
}

export type DialogBodyProps = React.ComponentProps<"div">;

/** The only scroll container, so the header and footer remain reachable. */
export function DialogBody({ className, ...props }: DialogBodyProps) {
  return (
    <div
      {...props}
      className={cx(sx(styles.body, focusRing.gutter), className)}
    />
  );
}

export type DialogFooterProps = React.ComponentProps<"div">;

export function DialogFooter({ className, ...props }: DialogFooterProps) {
  return <div {...props} className={cx(sx(styles.actions), className)} />;
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
};

/** Standard 32px quiet close control shared by Dialog convenience and parts. */
export function DialogCloseButton({
  "aria-label": ariaLabel = "Close",
  children,
  className,
  style,
  ...props
}: DialogCloseButtonProps) {
  return (
    <HeadlessDialogClose
      {...props}
      aria-label={ariaLabel}
      className={mergeClassName(
        () =>
          sx(
            surfaceChrome.quietIconButton,
            controlSquares.sm,
            focusRing.ring,
            styles.closeButton,
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
  description?: React.ReactNode;
  /**
   * Action row content (e.g. `Button`s; wrap dismissing actions in the
   * headless `DialogClose` via its `render` prop). Nothing is rendered when
   * omitted — the previous hardcoded Cancel/Apply pair is gone.
   */
  footer?: React.ReactNode;
  /**
   * Popup width: `sm` (400px) for a confirm-shaped dialog that is one sentence
   * and two buttons, `md` (460px, default) or `lg` (520px) for form-heavy
   * flows, `xl` (1040px) when the dialog carries a table or another surface
   * that has columns to keep legible. `lg` is still a form width — a
   * `DataTable` inside it collapses its elastic column and overlaps its own
   * headers.
   */
  size?: DialogSize;
  title: React.ReactNode;
  /**
   * Trigger content. A `<Button>` element is composed directly (pass one to
   * control variant/size); any other node is wrapped in the default `Button`.
   */
  /** Omit for a controlled dialog opened by a parent action. */
  trigger?: React.ReactNode;
};

function DialogConvenience({
  children,
  closeLabel = "Close",
  description,
  footer,
  size = "md",
  title,
  trigger,
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
        <DialogPopup size={size}>
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

const styles = stylex.create({
  backdrop: {
    backdropFilter: vars.motionBlurOverlay,
    backgroundColor: vars.colorOverlay,
    inset: 0,
    position: "fixed",
    zIndex: vars.zIndexOverlay,
  },
  surface: {
    backgroundColor: vars.colorSurfaceRaised,
    borderColor: vars.colorMediaEdge,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    // elevationModal — a Dialog is a detached global surface that owns the screen,
    // one tier above an anchored popup. It shipped on elevationOverlay, which made a
    // modal read at exactly the same depth as a dropdown (tokens.stylex.ts
    // elevation policy).
    boxShadow: vars.elevationModal,
    color: vars.colorText,
  },
  popup: {
    display: "grid",
    gap: vars.space20,
    // Header / body / actions, with only the middle track allowed to grow —
    // the popup itself used to be the scroll container (`overflowY: auto`
    // here), so a tall body (a form, or any body at 200% zoom) scrolled the
    // header — including the ONLY close button — off the top and the footer's
    // primary action off the bottom. Now the frame is pinned and the body
    // scrolls (see `styles.body`). The third track is `auto`, so it collapses
    // to zero when `footer` is omitted.
    gridTemplateRows: "auto minmax(0, 1fr) auto",
    left: "50%",
    // Clamp against the live viewport, never a fixed ceiling: a tall dialog
    // scrolls inside its own surface instead of running off screen. The gutter
    // is a space step so the modal tier (Dialog/AlertDialog) cannot drift apart.
    maxBlockSize: `calc(100dvh - ${vars.space48})`,
    overflow: "hidden",
    // Modal padding step (design-direction §5): row-hosting popups pad space4,
    // content popovers space16, modal surfaces space20. Same value in
    // AlertDialog so the two confirm surfaces are interchangeable.
    padding: vars.space20,
    position: "fixed",
    top: "50%",
    transform: "translate(-50%, -50%)",
    zIndex: vars.zIndexModal,
  },
  // 400px — the rung below the 460px confirm/form default, and the same
  // measure `PeekPanel` stands on, so the narrowest modal and the narrowest
  // docked surface read as one column width. Below this a two-button footer
  // starts wrapping, which is the floor a confirm dialog cannot cross.
  popupSm: {
    inlineSize: `min(400px, calc(100dvw - ${vars.space32}))`,
  },
  popupMd: {
    inlineSize: `min(460px, calc(100dvw - ${vars.space32}))`,
  },
  popupLg: {
    inlineSize: `min(520px, calc(100dvw - ${vars.space32}))`,
  },
  popupXl: {
    inlineSize: `min(1040px, calc(100dvw - ${vars.space32}))`,
  },
  header: {
    alignItems: "start",
    display: "flex",
    gap: vars.space16,
    justifyContent: "space-between",
  },
  /**
   * The close control is 32px and the title's line box is 24px, so a header
   * aligned to `start` — which it must be, because the title group can carry a
   * description below — left the X sitting 4px lower than the title it belongs
   * to. Pulling it up by half the difference centres it on the title's line in
   * both shapes: with a description and without.
   *
   * Written as the two tokens rather than `-4px` so it follows either of them
   * if they move; the header's height is driven by the title group, so the
   * negative margin cannot shorten it.
   */
  closeButton: {
    marginBlockStart: `calc((${vars.lineHeightLead} - ${vars.controlHeightSm}) / 2)`,
  },
  titleGroup: {
    display: "grid",
    gap: vars.space8,
  },
  title: {
    color: vars.colorText,
    fontSize: vars.fontSizeLead,
    fontWeight: vars.fontWeightSemibold,
    lineHeight: vars.lineHeightLead,
    margin: 0,
    // A heading is short enough for the browser to line-break optimally:
    // `balance` evens the lines instead of leaving a one-word second line.
    // Matches `Typography`'s `heading`.
    textWrap: "balance",
  },
  description: {
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightNormal,
    margin: 0,
    // Paired prose, not a heading: `pretty` only fixes the last line, so a
    // multi-paragraph description keeps its normal ragged edge.
    textWrap: "pretty",
  },
  // `focusRing.gutter` at the call site, not here: the popup pays `space20`, but
  // padding on the popup is padding on the thing that does NOT clip. The body
  // is the scroll container, so a form field or a button flush against its edge
  // — the first control in every scrolling dialog — had its ring erased.
  body: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightNormal,
    // The dialog's only scroll container (the popup is `overflow: hidden`), so
    // the header and the action row stay on screen. `minBlockSize: 0` lets the
    // `minmax(0, 1fr)` track actually shrink below its content size — without
    // it a grid item's automatic minimum is `min-content` and nothing scrolls.
    minBlockSize: 0,
    overflowY: "auto",
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
    justifyContent: "end",
  },
});

const popupSizeStyles = {
  lg: styles.popupLg,
  md: styles.popupMd,
  sm: styles.popupSm,
  xl: styles.popupXl,
} as const;

export { styles as dialogStyles };
