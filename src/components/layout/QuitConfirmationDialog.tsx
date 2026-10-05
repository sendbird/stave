import { i18n, useTranslation } from "@/i18n";
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
  useTranslation();
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
                    <span>{i18n.t("shell:quitConfirmationDialog.application")}</span>
                    {shortcutLabel ? (
                      <span className={sx(quitDialogStyles.shortcutChip)}>
                        {shortcutLabel}
                      </span>
                    ) : null}
                  </div>
                  <DialogTitle>{i18n.t("shell:quitConfirmationDialog.quitStave")}</DialogTitle>
                  <DialogDescription
                    className={sx(quitDialogStyles.description)}
                  >
                    {i18n.t("shell:quitConfirmationDialog.anyRunningTasksWillStopAndUnsaved")}
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
                  {i18n.t("shell:quitConfirmationDialog.runningTasksAndCLISessionsWillBe")}
                </p>
              </div>
              <div className={sx(quitDialogStyles.factRow)}>
                <FileWarning className={sx(quitDialogStyles.factIcon)} />
                <p className={sx(quitDialogStyles.factText)}>
                  {i18n.t("shell:quitConfirmationDialog.unsavedEditorChangesInOpenFilesMay")}
                </p>
              </div>
            </div>

            <div className={sx(quitDialogStyles.footer)}>
              <div className={sx(quitDialogStyles.hintRow)}>
                <div className={sx(quitDialogStyles.hint)}>
                  <Kbd>Esc</Kbd>
                  <span>{i18n.t("shell:quitConfirmationDialog.cancel")}</span>
                </div>
                <div className={sx(quitDialogStyles.hint)}>
                  <Kbd>Enter</Kbd>
                  <span>{i18n.t("shell:quitConfirmationDialog.quit")}</span>
                </div>
              </div>

              <div className={sx(quitDialogStyles.actions)}>
                <Button
                  type="button"
                  variant="outline"
                  disabled={quitting}
                  onClick={onCancel}
                >
                  {i18n.t("shell:quitConfirmationDialog.cancel")}
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
                  {quitting ? i18n.t("shell:quitConfirmationDialog.quitting") : i18n.t("shell:quitConfirmationDialog.quitStave2")}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
