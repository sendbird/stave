import { i18n, useTranslation } from "@/i18n";
import { MessageCircleQuestion, X } from "lucide-react";
import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { Banner } from "@/components/ads/components/Banner";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { MessageResponse } from "@/components/ai-elements/message";
import { Button, Loader, Textarea } from "@/components/ui";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import { SIDE_CHAT_QUESTION_MAX_CHARS } from "@/lib/side-chat/side-chat";
import {
  copySideAnswerToComposer,
  useSideChatStore,
  type SideChatExchange,
} from "@/store/side-chat-store";
import { useTaskReviewModeStore, type TaskSurfaceMode } from "@/store/task-review-mode-store";
import { sideChatStyles as styles } from "./side-chat-panel.styles";

/**
 * The side question panel, over the task's conversation or its Review: ask
 * the task's provider about the task without interrupting its turn or leaving
 * what you are reading. The answer stays here, in memory; only "Copy to
 * composer" puts it, quoted, in the draft.
 *
 * Both hosts stay mounted (the conversation sits hidden under Review), so each
 * renders the panel only while its mode shows.
 */
export function SideChatPanel(props: { taskId: string; host: TaskSurfaceMode }) {
  const open = useSideChatStore((state) => Boolean(props.taskId) && state.openTaskId === props.taskId);
  const mode = useTaskReviewModeStore((state) => state.byTask[props.taskId]?.mode ?? "conversation");
  return open && mode === props.host ? <SideChatCard taskId={props.taskId} /> : null;
}

function SideChatCard(props: { taskId: string }) {
  useTranslation();
  const { taskId } = props;
  const exchange = useSideChatStore((state) => state.exchangeByTask[taskId]);
  const draft = useSideChatStore((state) => state.draftByTask[taskId] ?? "");
  const focusNonce = useSideChatStore((state) => state.focusNonce);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  const asking = exchange?.status === "asking";
  useEffect(() => {
    fieldRef.current?.focus();
  }, [focusNonce]);

  const ask = () => void useSideChatStore.getState().ask(taskId);
  const close = () => useSideChatStore.getState().close();
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // Escape closes the panel; it never reaches the task pane's Escape, which stops the turn.
    if (event.key === "Escape" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };
  const onFieldKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (!asking) ask();
    }
  };

  return (
    <section
      aria-labelledby={titleId}
      className={sx(styles.card)}
      data-testid="side-chat"
      data-task-abort-exempt=""
      onKeyDown={onKeyDown}
    >
      <header className={sx(styles.header)}>
        <MessageCircleQuestion aria-hidden className={sx(styles.headerIcon)} />
        <div className={sx(styles.headerText)}>
          <h2 id={titleId} className={sx(styles.title)}>
            {i18n.t("session:sideChat.title")}
          </h2>
          <p className={sx(styles.note)}>{i18n.t("session:sideChat.note")}</p>
        </div>
        <AdsButton
          variant="quiet"
          size="xs"
          iconOnly
          aria-label={i18n.t("session:sideChat.close")}
          title={i18n.t("session:sideChat.close")}
          onClick={close}
        >
          <X aria-hidden />
        </AdsButton>
      </header>
      <div className={sx(styles.body)} aria-live="polite">
        {exchange ? (
          <SideChatExchangeView taskId={taskId} exchange={exchange} />
        ) : (
          <p className={sx(styles.empty)}>{i18n.t("session:sideChat.empty")}</p>
        )}
      </div>
      <div className={sx(styles.footer)}>
        <Textarea
          ref={fieldRef}
          value={draft}
          rows={1}
          maxLength={SIDE_CHAT_QUESTION_MAX_CHARS}
          aria-label={i18n.t("session:sideChat.fieldLabel")}
          placeholder={i18n.t("session:sideChat.placeholder")}
          onChange={(event) => useSideChatStore.getState().setDraft(taskId, event.target.value)}
          onKeyDown={onFieldKeyDown}
          xstyle={styles.field}
        />
        <Button size="sm" disabled={asking || !draft.trim()} onClick={ask}>
          {i18n.t("session:sideChat.ask")}
        </Button>
      </div>
    </section>
  );
}

function describeFailure(exchange: Extract<SideChatExchange, { status: "failed" }>) {
  if (exchange.reason === "unsupported") {
    return i18n.t("session:sideChat.unsupported", { provider: getProviderLabel({ providerId: exchange.providerId }) });
  }
  if (exchange.reason === "unavailable") {
    return i18n.t("session:sideChat.unavailable");
  }
  return i18n.t("session:sideChat.failed");
}

function SideChatExchangeView(props: { taskId: string; exchange: SideChatExchange }) {
  useTranslation();
  const { exchange, taskId } = props;
  const provider = getProviderLabel({ providerId: exchange.providerId });
  return (
    <>
      <p className={sx(styles.question)}>{exchange.question}</p>
      {exchange.status === "asking" ? (
        <p className={sx(styles.status)} role="status">
          <Loader size="sm" />
          {i18n.t("session:sideChat.asking", { provider })}
        </p>
      ) : null}
      {exchange.status === "answered" ? (
        <>
          <div className={sx(styles.answer)} data-testid="side-chat-answer">
            <MessageResponse>{exchange.answer}</MessageResponse>
          </div>
          <div className={sx(styles.actions)}>
            <Button size="sm" variant="outline" onClick={() => copySideAnswerToComposer(taskId, exchange.answer)}>
              {i18n.t("session:sideChat.copyToComposer")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => useSideChatStore.getState().clearExchange(taskId)}>
              {i18n.t("session:sideChat.newQuestion")}
            </Button>
          </div>
        </>
      ) : null}
      {exchange.status === "failed" ? (
        <Banner
          tone={exchange.reason === "error" ? "danger" : "warning"}
          title={describeFailure(exchange)}
          action={
            exchange.reason === "error" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const store = useSideChatStore.getState();
                  store.setDraft(taskId, exchange.question);
                  void store.ask(taskId);
                }}
              >
                {i18n.t("common:actions.retry")}
              </Button>
            ) : undefined
          }
        >
          {exchange.detail ?? null}
        </Banner>
      ) : null}
    </>
  );
}
