import { FileWarning, LoaderCircle, Power, TerminalSquare } from "lucide-react";
import { useEffect, useRef, type FormEvent } from "react";
import { Button, Kbd } from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface QuitConfirmationDialogProps {
  open: boolean;
  quitting?: boolean;
  shortcutLabel?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function QuitConfirmationDialog(props: QuitConfirmationDialogProps) {
  const { open, quitting = false, shortcutLabel, onCancel, onConfirm } = props;
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open || quitting) {
      return;
    }
    confirmButtonRef.current?.focus();
  }, [open, quitting]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (quitting) {
      return;
    }
    onConfirm();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !quitting) {
          onCancel();
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-w-[min(30rem,calc(100vw-2rem))] gap-0 overflow-hidden border border-border/70 bg-background/95 p-0 shadow-2xl supports-backdrop-filter:backdrop-blur-xl"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          confirmButtonRef.current?.focus();
        }}
      >
        <form onSubmit={handleSubmit}>
          <div className="border-b border-border/60 bg-linear-to-b from-muted/45 to-transparent px-5 py-5">
            <DialogHeader className="gap-3">
              <div className="flex items-start gap-4">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/10 text-destructive shadow-sm">
                  <Power className="size-5" />
                </div>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    <span>Application</span>
                    {shortcutLabel ? (
                      <span className="rounded-md border border-border/70 bg-background/80 px-2 py-1 text-[10px] font-medium tracking-normal text-foreground">
                        {shortcutLabel}
                      </span>
                    ) : null}
                  </div>
                  <DialogTitle className="text-[1.05rem] font-semibold text-foreground">
                    Quit Stave?
                  </DialogTitle>
                  <DialogDescription className="max-w-[26rem] leading-6">
                    Any running tasks will stop and unsaved editor changes may
                    be lost.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
          </div>

          <div className="space-y-4 px-5 py-4">
            <div className="grid gap-2 rounded-xl border border-border/70 bg-muted/25 p-3">
              <div className="flex items-start gap-2.5">
                <TerminalSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <p className="text-sm text-foreground">
                  Running tasks and CLI sessions will be interrupted
                  immediately.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <FileWarning className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <p className="text-sm text-foreground">
                  Unsaved editor changes in open files may not be recoverable.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <div className="inline-flex items-center gap-1.5">
                  <Kbd>Esc</Kbd>
                  <span>Cancel</span>
                </div>
                <div className="inline-flex items-center gap-1.5">
                  <Kbd>Enter</Kbd>
                  <span>Quit</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={quitting}
                  onClick={onCancel}
                >
                  Cancel
                </Button>
                <Button
                  ref={confirmButtonRef}
                  type="submit"
                  variant="destructive"
                  disabled={quitting}
                >
                  {quitting ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : null}
                  {quitting ? "Quitting..." : "Quit Stave"}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
