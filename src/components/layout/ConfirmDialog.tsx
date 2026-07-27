import { LoaderCircle } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Card, Button } from "@/components/ui";
import { UI_LAYER_CLASS } from "@/lib/ui-layers";
import { cn } from "@/lib/utils";

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
      className={cn(
        UI_LAYER_CLASS.dialog,
        "fixed inset-0 flex items-center justify-center bg-overlay p-4",
      )}
      onMouseDown={loading ? undefined : onCancel}
    >
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className="w-full max-w-md rounded-lg border-border/80 bg-card p-4 shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
          <h3 id={titleId} className="text-base font-semibold text-foreground">
            {title}
          </h3>
          {description ? (
            <p
              id={descriptionId}
              className="mt-2 text-sm text-muted-foreground"
            >
              {description}
            </p>
          ) : null}
          {children ? <div className="mt-3">{children}</div> : null}
          <div className="mt-4 flex justify-end gap-2">
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
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              {confirmLabel}
            </Button>
          </div>
        </form>
      </Card>
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
