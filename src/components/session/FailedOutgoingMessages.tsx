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
          <span className={sx(styles.statusText)} title={send.reason}>
            Not sent — {send.reason}
          </span>
        </span>
        <MessageActions
          className={sx(styles.actions)}
          role="group"
          aria-label="Failed message actions"
        >
          <MessageAction
            label="Retry"
            tooltip="Send this message again with the same attachments"
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
            Retry
          </MessageAction>
          <MessageAction
            label="Dismiss"
            tooltip="Drop this message without sending it"
            data-failed-send-action="dismiss"
            disabled={retryPending}
            onClick={props.onDismiss}
          >
            <X aria-hidden="true" />
            Dismiss
          </MessageAction>
        </MessageActions>
      </div>
    </Message>
  );
}

function ConnectedFailedOutgoingMessage(props: { send: FailedOutgoingSend }) {
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
              toast.error("Couldn't send this message yet", {
                description:
                  "The task is busy or waiting on a reply. Try again once it settles.",
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
