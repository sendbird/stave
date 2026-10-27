import { i18n, useTranslation } from "@/i18n";
import { useState } from "react";
import {
  ConversationScrollButton,
  useConversationScrolledAway,
} from "@/components/ai-elements/conversation";
import { useAppStore } from "@/store/app.store";
import {
  deriveScrollWaitingSummary,
  formatScrollWaitingAriaLabel,
  formatScrollWaitingLabel,
  hasUnseenResponse,
  selectHasPendingApproval,
  selectHasPendingQuestion,
  selectLastAssistantMessageId,
  selectQueuedTurnCount,
  type ScrollResponseSnapshot,
} from "./chat-scroll-waiting";

/**
 * Mounted only while the reader is scrolled up, so the transcript reads below
 * cost nothing at the bottom, and the moment it mounts is the baseline the
 * "new response" signal compares against.
 */
function ScrolledAwayButton(props: { taskId: string }) {
  useTranslation();
  const { taskId } = props;
  const hasPendingApproval = useAppStore((state) =>
    selectHasPendingApproval(state.messagesByTask[taskId]),
  );
  const hasPendingQuestion = useAppStore((state) =>
    selectHasPendingQuestion(state.messagesByTask[taskId]),
  );
  const lastAssistantMessageId = useAppStore((state) =>
    selectLastAssistantMessageId(state.messagesByTask[taskId]),
  );
  const turnActive = useAppStore((state) =>
    Boolean(state.activeTurnIdsByTask[taskId]),
  );
  const queuedCount = useAppStore((state) =>
    selectQueuedTurnCount(state.promptDraftByTask[taskId]),
  );
  const [baseline] = useState<ScrollResponseSnapshot>(() => ({
    lastAssistantMessageId,
    turnActive,
  }));

  const summary = deriveScrollWaitingSummary({
    hasPendingApproval,
    hasPendingQuestion,
    hasUnseenResponse: hasUnseenResponse({
      baseline,
      current: { lastAssistantMessageId, turnActive },
    }),
    queuedCount,
  });
  const label = summary ? formatScrollWaitingLabel(summary) : null;

  return (
    <ConversationScrollButton
      tooltip={i18n.t("session:chatPanel.tooltip")}
      label={label}
      {...(label ? { "aria-label": formatScrollWaitingAriaLabel(label) } : {})}
    />
  );
}

/**
 * The scroll-to-bottom button for a task's transcript. Icon-only normally; it
 * names what waits below (an approval, a question, a new response, queued
 * messages) when there is something.
 */
export function ChatScrollToBottomButton(props: { taskId: string }) {
  const scrolledAway = useConversationScrolledAway();
  if (!scrolledAway) {
    return null;
  }
  // Keyed by task so switching tasks while scrolled up takes a new baseline.
  return <ScrolledAwayButton key={props.taskId} taskId={props.taskId} />;
}
