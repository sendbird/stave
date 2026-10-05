import { i18n, useTranslation } from "@/i18n";
import { FolderOpen } from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { overlaySurface } from "@/components/ads/recipes/overlay-surface";
import { cx, sx } from "@/components/ads/utils/stylex";
import { Button, Input } from "@/components/ui";
import { UI_LAYER_CLASS } from "@/lib/ui-layers";
import { openPathDialogStyles } from "./open-path-dialog.styles";

type OpenPathDialogSubmitResult = { ok: boolean; stderr?: string };

type OpenPathDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit?: (inputPath: string) => Promise<OpenPathDialogSubmitResult>;
  onSubmitPath?: (inputPath: string) => Promise<OpenPathDialogSubmitResult>;
  onBrowse: () => Promise<void>;
};

export function OpenPathDialog(args: OpenPathDialogProps) {
  useTranslation();
  const { open, onOpenChange, onSubmit, onSubmitPath, onBrowse } = args;
  const [inputPath, setInputPath] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitPath = onSubmitPath ?? onSubmit;

  if (!open) {
    return null;
  }

  function reset() {
    setInputPath("");
    setError("");
    setBusy(false);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  async function handleSubmitPath() {
    const trimmed = inputPath.trim();
    if (!trimmed) {
      return;
    }
    if (!submitPath) {
      setError(i18n.t("shell:openPathDialog.openActionIsUnavailable"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await submitPath(trimmed);
      if (result.ok) {
        close();
      } else {
        setError(result.stderr || i18n.t("shell:openPathDialog.failedToOpenPath"));
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleBrowse() {
    setBusy(true);
    setError("");
    try {
      await onBrowse();
      close();
    } catch {
      // User cancelled the native dialog — just stay open.
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) {
      return;
    }
    void handleSubmitPath();
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      close();
    }
  }

  return (
    <div
      className={cx(UI_LAYER_CLASS.dialog, sx(openPathDialogStyles.backdrop))}
      onMouseDown={close}
    >
      <section
        className={sx(
          overlaySurface.modal,
          overlaySurface.modalRounded,
          openPathDialogStyles.panel,
        )}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <form onSubmit={handleSubmit} onKeyDown={handleDialogKeyDown}>
          <h3 className={sx(openPathDialogStyles.title)}>{i18n.t("shell:openPathDialog.openRepository")}</h3>
          <p className={sx(openPathDialogStyles.description)}>
            {i18n.t("shell:openPathDialog.enterAPathOrBrowseForA")}
          </p>
          <div className={sx(openPathDialogStyles.pathRow)}>
            <Input
              autoFocus
              xstyle={openPathDialogStyles.pathInput}
              placeholder="~/projects/my-app"
              value={inputPath}
              onChange={(event) => {
                setInputPath(event.target.value);
                setError("");
              }}
              disabled={busy}
            />
            <Button
              type="button"
              variant="outline"
              xstyle={openPathDialogStyles.browseButton}
              onClick={() => void handleBrowse()}
              disabled={busy}
            >
              <FolderOpen className={sx(openPathDialogStyles.browseIcon)} />
              {i18n.t("shell:openPathDialog.browse")}
            </Button>
          </div>
          {error ? (
            <p className={sx(openPathDialogStyles.error)}>{error}</p>
          ) : null}
          <div className={sx(openPathDialogStyles.actions)}>
            <Button type="button" variant="outline" onClick={close} disabled={busy}>
              {i18n.t("shell:openPathDialog.cancel")}
            </Button>
            <Button type="submit" disabled={busy || !inputPath.trim()}>
              {busy ? i18n.t("shell:openPathDialog.opening") : i18n.t("shell:openPathDialog.open")}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
