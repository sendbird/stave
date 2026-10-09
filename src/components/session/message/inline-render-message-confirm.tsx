import * as stylex from "@stylexjs/stylex";
import { i18n, useTranslation } from "@/i18n";
import { Button } from "@/components/ads/components/Button";
import { Dialog } from "@/components/ads/components/Dialog";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";

/**
 * Asks the reader before an inline page sends a message as them. The text is
 * shown exactly as the page wrote it; nothing is sent unless they choose
 * Send. Closing the dialog any other way declines.
 */
export function InlineRenderMessageConfirmDialog(props: {
  request: { title: string; text: string } | null;
  onConfirm: () => void;
  onDecline: () => void;
}) {
  useTranslation();
  const { request } = props;
  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) props.onDecline();
      }}
      width="md"
      title={i18n.t("session:inlineRender.messageConfirmTitle")}
      description={i18n.t("session:inlineRender.messageConfirmDescription", {
        title: request?.title ?? "",
      })}
      footer={
        <>
          <Button size="sm" variant="quiet" onClick={props.onDecline}>
            {i18n.t("session:inlineRender.messageConfirmCancel")}
          </Button>
          <Button size="sm" variant="primary" onClick={props.onConfirm}>
            {i18n.t("session:inlineRender.messageConfirmSend")}
          </Button>
        </>
      }
    >
      <pre
        className={sx(styles.text)}
        aria-label={i18n.t("session:inlineRender.messageConfirmTextLabel")}
      >
        {request?.text ?? ""}
      </pre>
    </Dialog>
  );
}

const styles = stylex.create({
  text: {
    backgroundColor: vars["--ads-color-surface-tint"],
    borderColor: vars["--ads-color-border-subtle"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text"],
    fontFamily: vars["--ads-font-sans"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    margin: 0,
    maxBlockSize: "16rem",
    overflow: "auto",
    overflowWrap: "anywhere",
    padding: vars["--ads-space-12"],
    whiteSpace: "pre-wrap",
  },
});
