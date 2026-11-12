import { useId, useState } from "react";
import { Link2 } from "lucide-react";
import { useTranslation } from "@/i18n";
import { Button, Input } from "@/components/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tooltip } from "@/components/aui/components/Tooltip";
import { buildTarsDocumentLinkDraft } from "@/lib/tars/intake";
import { openTarsIntake } from "./ask-tars";

/** Attach the link after a user action; drafting does not fetch the document. */
export function TarsDocumentLink({ disabled }: { disabled: boolean }) {
  const { t } = useTranslation(["shell", "common"]);
  const id = useId();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function attach() {
    setBusy(true);
    setError(false);
    try {
      await openTarsIntake(buildTarsDocumentLinkDraft({ url, request: t("shell:tars.intake.documentRequest") }));
      setOpen(false);
      setUrl("");
    } catch { setError(true); }
    finally { setBusy(false); }
  }
  return <>
    <Tooltip content={t("shell:tars.intake.documentLink")}>
      <Button type="button" size="icon-sm" variant="ghost" disabled={disabled}
        aria-label={t("shell:tars.intake.documentLink")} onClick={() => { setError(false); setOpen(true); }}><Link2 /></Button>
    </Tooltip>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("shell:tars.intake.documentLink")}</DialogTitle>
          <DialogDescription>{t("shell:tars.intake.linkHint")}</DialogDescription>
        </DialogHeader>
        <label htmlFor={id}>{t("shell:tars.intake.url")}</label>
        <Input id={id} type="url" value={url} maxLength={2_048} disabled={busy}
          aria-invalid={error} aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => { setUrl(event.target.value); setError(false); }} />
        {error ? <p id={`${id}-error`} role="alert">{t("shell:tars.intake.failed")}</p> : null}
        <DialogFooter><Button type="button" disabled={disabled || busy || !url.trim()} onClick={() => void attach()}>
          {t("shell:tars.intake.ask")}
        </Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
