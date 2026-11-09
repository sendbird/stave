import { i18n, useTranslation } from "@/i18n";
import { Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type * as React from "react";

import {
  DialogBackdrop,
  DialogPopup,
  DialogPortal,
  DialogRoot,
  type DialogRootProps,
  DialogTitle,
  DialogTrigger,
} from "../headless/dialog";
import { controlChrome } from "../recipes/control-chrome";
import { focusRing } from "../recipes/focus-ring";
import { overlaySurface } from "../recipes/overlay-surface";
import { transition } from "../recipes/transition";
import { themeProps } from "../theming/theme-props";
import { cx, sx } from "../utils/stylex";
import { Command, type CommandItem, type CommandProps } from "./Command";
import { CommandFooterHint } from "./Command.parts";
import { styles } from "./Command.styles";
import { Kbd } from "./Kbd";

export type CommandDialogWidth = "md" | "lg";

type DialogChangeDetails = Parameters<
  NonNullable<DialogRootProps["onOpenChange"]>
>[1];

export type CommandDialogProps = Omit<CommandProps, "bare" | "items"> & {
  /** Compose the palette body manually when rows need the compound API. */
  children?: React.ReactNode;
  defaultOpen?: boolean;
  /** The array API's root rows. Omit when composing via `children`. */
  items?: CommandItem[];
  /** Replace the default keyboard-hint footer; pass `null` to remove it. */
  footer?: React.ReactNode;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  /** Enable the ⌘K / Ctrl+K toggle shortcut. @default true */
  shortcut?: boolean;
  /** Accessible dialog name. @default "Command menu" */
  title?: React.ReactNode;
  /** Trigger contents; pass `null` for an externally controlled trigger. */
  trigger?: React.ReactNode;
  /** Popup width. @default "md" */
  width?: CommandDialogWidth;
};

/** Centered command palette with focus trapping and optional ⌘K binding. */
export function CommandDialog({
  children,
  defaultOpen = false,
  footer,
  items,
  onOpenChange,
  open: openProp,
  shortcut = true,
  title = i18n.t("ui:commandDialog.commandMenu"),
  trigger = i18n.t("ui:commandDialog.showCommand"),
  width = "md",
  ...commandProps
}: CommandDialogProps) {
  useTranslation();
  const { onItemSelect, ...commandRest } = commandProps;
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  /*
   * Whether the last open or close came from the keyboard — ⌘K, Escape, or a
   * keyboard press on the trigger (a click with `detail === 0`). Those land
   * at once (`data-instant`, `overlay-motion.css`): the palette is summoned
   * dozens of times a day, and a keyboard action repeats too often to replay
   * even a fade. A pointer open keeps the 120ms fade.
   */
  const [instant, setInstant] = useState(false);
  // Host: the input that last acted inside the open palette, so choosing an
  // item closes it the way it was chosen (Enter: at once; click: the fade).
  const lastInput = useRef<"keyboard" | "pointer">("pointer");

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const handleOpenChange = useCallback(
    (next: boolean, details: DialogChangeDetails) => {
      const event = details.event as Event | undefined;
      setInstant(
        details.reason === "escape-key" ||
          (details.reason === "trigger-press" &&
            event instanceof MouseEvent &&
            event.detail === 0),
      );
      setOpen(next);
    },
    [setOpen],
  );

  useEffect(() => {
    if (!shortcut) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setInstant(true);
        setOpen(!open);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen, shortcut]);

  const footerContent = footer === undefined ? <CommandFooterHint /> : footer;

  const triggerTheme = themeProps("command-dialog-trigger");
  const popupTheme = themeProps("command-dialog", { size: width });

  return (
    <DialogRoot onOpenChange={handleOpenChange} open={open}>
      {trigger === null ? null : (
        <DialogTrigger
          {...triggerTheme}
          className={cx(
            sx(
              styles.trigger,
              controlChrome.trigger,
              transition.colors,
              focusRing.ring,
            ),
            triggerTheme.className,
          )}
        >
          <Search aria-hidden size={16} />
          {trigger}
          {shortcut ? (
            <span className={sx(styles.triggerShortcut)}>
              <Kbd size="sm">⌘K</Kbd>
            </span>
          ) : null}
        </DialogTrigger>
      )}
      <DialogPortal>
        {/*
         * The palette is the most-opened overlay in the product and was the
         * only one with no enter/exit motion at all: it composes `DialogPopup`
         * from `headless/dialog` (the raw Base UI part) rather than the styled
         * `Dialog` parts, so it never picked up the two motion classes every
         * other Base UI surface in this system carries. It appeared and
         * disappeared as a hard cut while a `Dialog` two keystrokes away scaled
         * and faded. `-top` supplies the X-only translate the palette's
         * top-anchored position needs, and makes it opacity-only (120ms in,
         * 80ms out) for a pointer open; from the keyboard (`instant`) it lands
         * at once. Curve and Reduce Motion come from the shared modal contract.
         */}
        <DialogBackdrop
          className={cx(sx(overlaySurface.backdrop), "atelier-motion-backdrop")}
          data-instant={instant ? "" : undefined}
        />
        <DialogPopup
          {...popupTheme}
          className={cx(
            sx(
              overlaySurface.modal,
              overlaySurface.modalRounded,
              styles.popup,
              width === "lg" && styles.popupLg,
            ),
            "atelier-motion-modal",
            "atelier-motion-modal-top",
            popupTheme.className,
          )}
          data-instant={instant ? "" : undefined}
          onKeyDownCapture={() => {
            lastInput.current = "keyboard";
          }}
          onPointerDownCapture={() => {
            lastInput.current = "pointer";
          }}
        >
          <DialogTitle className={sx(styles.srOnly)}>{title}</DialogTitle>
          {children ?? (
            <Command
              {...commandRest}
              bare
              items={items ?? []}
              onItemSelect={(item) => {
                onItemSelect?.(item);
                setInstant(lastInput.current === "keyboard");
                setOpen(false);
              }}
            />
          )}
          {footerContent}
        </DialogPopup>
      </DialogPortal>
    </DialogRoot>
  );
}
