import { FileWarning, Power, TerminalSquare } from "lucide-react";
import { useEffect, useRef, type FormEvent } from "react";
import { sx } from "@/components/ads/utils/stylex";
import { Button, Kbd, Loader } from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { quitDialogStyles } from "./quit-confirmation-dialog.styles";

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
        xstyle={quitDialogStyles.surface}
        initialFocus={() => confirmButtonRef.current}
      >
        <form onSubmit={handleSubmit}>
          <div className={sx(quitDialogStyles.headerBand)}>
            <DialogHeader>
              <div className={sx(quitDialogStyles.headerRow)}>
                <div className={sx(quitDialogStyles.headerMark)}>
                  <Power className={sx(quitDialogStyles.headerMarkIcon)} />
                </div>
                <div className={sx(quitDialogStyles.headerCopy)}>
                  <div className={sx(quitDialogStyles.eyebrow)}>
                    <span>Application</span>
                    {shortcutLabel ? (
                      <span className={sx(quitDialogStyles.shortcutChip)}>
                        {shortcutLabel}
                      </span>
                    ) : null}
                  </div>
                  <DialogTitle>Quit Stave?</DialogTitle>
                  <DialogDescription
                    className={sx(quitDialogStyles.description)}
                  >
                    Any running tasks will stop and unsaved editor changes may
                    be lost.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
          </div>

          <div className={sx(quitDialogStyles.body)}>
            <div className={sx(quitDialogStyles.factList)}>
              <div className={sx(quitDialogStyles.factRow)}>
                <TerminalSquare className={sx(quitDialogStyles.factIcon)} />
                <p className={sx(quitDialogStyles.factText)}>
                  Running tasks and CLI sessions will be interrupted
                  immediately.
                </p>
              </div>
              <div className={sx(quitDialogStyles.factRow)}>
                <FileWarning className={sx(quitDialogStyles.factIcon)} />
                <p className={sx(quitDialogStyles.factText)}>
                  Unsaved editor changes in open files may not be recoverable.
                </p>
              </div>
            </div>

            <div className={sx(quitDialogStyles.footer)}>
              <div className={sx(quitDialogStyles.hintRow)}>
                <div className={sx(quitDialogStyles.hint)}>
                  <Kbd>Esc</Kbd>
                  <span>Cancel</span>
                </div>
                <div className={sx(quitDialogStyles.hint)}>
                  <Kbd>Enter</Kbd>
                  <span>Quit</span>
                </div>
              </div>

              <div className={sx(quitDialogStyles.actions)}>
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
                    <Loader aria-hidden size="xs" variant="persist" />
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
