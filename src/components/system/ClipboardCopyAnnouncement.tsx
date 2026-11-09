import { useTranslation } from "@/i18n";
import { VisuallyHidden } from "@/components/aui/components/VisuallyHidden";
import type { ClipboardCopyStatus } from "@/hooks/use-clipboard-copy";

/**
 * The polite announcement next to a copy button: "Copied" when the copy
 * landed, the failure when it did not. Nothing shows on screen; the button's
 * check mark and the error toast are the visual side.
 */
export function ClipboardCopyAnnouncement(props: { status: ClipboardCopyStatus }) {
  const { t } = useTranslation(["common"]);
  return (
    <VisuallyHidden role="status" aria-live="polite" aria-atomic="true">
      {props.status === "copied"
        ? t("common:clipboard.copied")
        : props.status === "failed"
          ? t("common:clipboard.copyFailed")
          : ""}
    </VisuallyHidden>
  );
}
