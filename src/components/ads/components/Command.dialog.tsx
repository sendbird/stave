import { Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type * as React from "react";

import {
  DialogBackdrop,
  DialogPopup,
  DialogPortal,
  DialogRoot,
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
/** @deprecated Use `CommandDialogWidth`; `size` was a popup-width axis. */
export type CommandDialogSize = CommandDialogWidth;

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
  /** @deprecated Use `width`. */
  size?: CommandDialogSize;
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
  size,
  title = "Command menu",
  trigger = "Show command",
  width = size ?? "md",
  ...commandProps
}: CommandDialogProps) {
  const { onItemSelect, ...commandRest } = commandProps;
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  useEffect(() => {
    if (!shortcut) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
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
    <DialogRoot onOpenChange={setOpen} open={open}>
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
         * top-anchored position needs; everything else — duration, curve, scale
         * tokens, Reduce Motion — comes from the shared modal contract.
         */}
        <DialogBackdrop
          className={cx(sx(overlaySurface.backdrop), "atelier-motion-backdrop")}
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
        >
          <DialogTitle className={sx(styles.srOnly)}>{title}</DialogTitle>
          {children ?? (
            <Command
              {...commandRest}
              bare
              items={items ?? []}
              onItemSelect={(item) => {
                onItemSelect?.(item);
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
