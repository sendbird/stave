import {
  useEffect,
  useId,
  useRef,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { dialogStyles } from "@/components/ads/components/Dialog";
import { cx, sx } from "@/components/ads/utils/stylex";
import { Button, Loader } from "@/components/ui";
import { UI_LAYER_CLASS } from "@/lib/ui-layers";
import { confirmDialogStyles } from "./confirm-dialog.styles";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  /** Optional extra controls rendered between the description and the buttons. */
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog(args: ConfirmDialogProps) {
  const {
    open,
    title,
    description,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    loading = false,
    children,
    onConfirm,
    onCancel,
  } = args;
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open || loading) {
      return;
    }
    confirmButtonRef.current?.focus();
  }, [loading, open]);

  if (!open) {
    return null;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) {
      return;
    }
    onConfirm();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Escape" && !loading) {
      event.preventDefault();
      onCancel();
    }
  }

  const dialog = (
    <div
      className={cx(UI_LAYER_CLASS.dialog, sx(confirmDialogStyles.backdrop))}
      onMouseDown={loading ? undefined : onCancel}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={sx(dialogStyles.surface, confirmDialogStyles.panel)}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
          <h3 id={titleId} className={sx(confirmDialogStyles.title)}>
            {title}
          </h3>
          {description ? (
            <p
              id={descriptionId}
              className={sx(confirmDialogStyles.description)}
            >
              {description}
            </p>
          ) : null}
          {children ? (
            <div className={sx(confirmDialogStyles.extra)}>{children}</div>
          ) : null}
          <div className={sx(confirmDialogStyles.actions)}>
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={loading}
            >
              {cancelLabel}
            </Button>
            <Button
              ref={confirmButtonRef}
              type="submit"
              variant="destructive"
              disabled={loading}
            >
              {loading ? (
                <Loader aria-hidden size="xs" variant="persist" />
              ) : null}
              {confirmLabel}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );

  // Confirmations can be opened from nested chrome such as the top bar.
  // Portal to the document root so those local stacking contexts never sit
  // below session chrome like the prompt input.
  if (typeof document === "undefined" || !document.body) {
    return dialog;
  }

  return createPortal(dialog, document.body);
}
