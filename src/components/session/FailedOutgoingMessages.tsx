import { i18n, useTranslation } from "@/i18n";
import { useState } from "react";
import { RotateCcw, TriangleAlert, X } from "lucide-react";
import { Loader, toast } from "@/components/ui";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
} from "@/components/ai-elements/message";
import { useAppStore } from "@/store/app.store";
import {
  describeFailedSendAttachments,
  type FailedOutgoingSend,
} from "@/store/failed-send-recovery";
import { sx } from "@/components/ads/utils/stylex";
import { failedOutgoingMessagesStyles as styles } from "./failed-outgoing-messages.styles";

const EMPTY_FAILED_SENDS: FailedOutgoingSend[] = [];

/**
 * One outgoing message that never reached the provider.
 *
 * Retry sends the same text and attachments again; Dismiss drops the payload
 * for good and deliberately does not put it back in the composer, which may
 * already hold something the user typed after the failure.
 */
export function FailedOutgoingMessageBubble(props: {
  send: FailedOutgoingSend;
  retryPending: boolean;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  useTranslation();
  const { send, retryPending } = props;
  const attachmentSummary = describeFailedSendAttachments(send);

  return (
    <Message from="user" data-failed-outgoing-message={send.id}>
      <div className={sx(styles.bubble)}>
        <MessageContent className={sx(styles.content)}>
          {send.text ? <span>{send.text}</span> : null}
          {attachmentSummary ? (
            <span className={sx(styles.attachmentSummary)}>
              {attachmentSummary}
            </span>
          ) : null}
        </MessageContent>
        <span className={sx(styles.statusRow)}>
          <TriangleAlert className={sx(styles.statusIcon)} aria-hidden="true" />
          <span className={sx(styles.statusText)} title={send.reason}>{i18n.t("session:failedOutgoingMessages.sentence44", { value1: send.reason })}</span>
        </span>
        <MessageActions
          className={sx(styles.actions)}
          role="group"
          aria-label={i18n.t("session:failedOutgoingMessages.ariaLabel")}
        >
          <MessageAction
            label={i18n.t("session:failedOutgoingMessages.label")}
            tooltip={i18n.t("session:failedOutgoingMessages.tooltip")}
            data-failed-send-action="retry"
            aria-busy={retryPending}
            disabled={retryPending}
            onClick={props.onRetry}
          >
            {retryPending ? (
              <Loader aria-hidden size="xs" variant="persist" />
            ) : (
              <RotateCcw aria-hidden="true" />
            )}
            {i18n.t("session:failedOutgoingMessages.failedOutgoingMessageBubble2")}</MessageAction>
          <MessageAction
            label={i18n.t("session:failedOutgoingMessages.label2")}
            tooltip={i18n.t("session:failedOutgoingMessages.tooltip2")}
            data-failed-send-action="dismiss"
            disabled={retryPending}
            onClick={props.onDismiss}
          >
            <X aria-hidden="true" />
            {i18n.t("session:failedOutgoingMessages.failedOutgoingMessageBubble3")}</MessageAction>
        </MessageActions>
      </div>
    </Message>
  );
}

function ConnectedFailedOutgoingMessage(props: { send: FailedOutgoingSend }) {
  useTranslation();
  const { send } = props;
  const [retryPending, setRetryPending] = useState(false);
  const retryFailedSend = useAppStore((state) => state.retryFailedSend);
  const dismissFailedSend = useAppStore((state) => state.dismissFailedSend);
  return (
    <FailedOutgoingMessageBubble
      send={send}
      retryPending={retryPending}
      onRetry={() => {
        if (retryPending) {
          return;
        }
        setRetryPending(true);
        void retryFailedSend({ taskId: send.taskId, id: send.id })
          .then((result) => {
            if (result?.status === "blocked") {
              toast.error(i18n.t("session:failedOutgoingMessages.copy"), {
                description:
                  i18n.t("session:failedOutgoingMessages.description"),
              });
            }
          })
          .finally(() => {
            setRetryPending(false);
          });
      }}
      onDismiss={() => {
        dismissFailedSend({ taskId: send.taskId, id: send.id });
      }}
    />
  );
}

export function FailedOutgoingMessages(props: { taskId: string }) {
  useTranslation();
  const sends = useAppStore(
    (state) => state.failedSendsByTask[props.taskId] ?? EMPTY_FAILED_SENDS,
  );
  if (sends.length === 0) {
    return null;
  }
  return (
    <div
      className={sx(styles.list)}
      data-testid="failed-outgoing-messages"
    >
      {sends.map((send) => (
        <ConnectedFailedOutgoingMessage key={send.id} send={send} />
      ))}
    </div>
  );
}
