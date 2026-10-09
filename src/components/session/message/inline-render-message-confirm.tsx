import { i18n, useTranslation } from "@/i18n";
import { PageActionConfirmDialog } from "./page-action-confirm-dialog";

/**
 * Asks the reader before an inline page sends a message as them. Nothing is
 * sent unless they choose Send.
 */
export function InlineRenderMessageConfirmDialog(props: {
  request: { title: string; text: string } | null;
  onConfirm: () => void;
  onDecline: () => void;
}) {
  useTranslation();
  const { request } = props;
  return (
    <PageActionConfirmDialog
      request={
        request
          ? {
              title: i18n.t("session:inlineRender.messageConfirmTitle"),
              description: i18n.t("session:inlineRender.messageConfirmDescription", {
                title: request.title,
              }),
              content: request.text,
              contentLabel: i18n.t("session:inlineRender.messageConfirmTextLabel"),
              cancelLabel: i18n.t("session:inlineRender.messageConfirmCancel"),
              confirmLabel: i18n.t("session:inlineRender.messageConfirmSend"),
            }
          : null
      }
      onConfirm={props.onConfirm}
      onDecline={props.onDecline}
    />
  );
}
