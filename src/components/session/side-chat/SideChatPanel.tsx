import { i18n, useTranslation } from "@/i18n";
import { ArrowUp, Check, Copy, Eraser, MessageCircleQuestion, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Banner } from "@/components/ads/components/Banner";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { MessageResponse } from "@/components/ai-elements/message";
import { MESSAGE_BODY_LINE_HEIGHT } from "@/components/ai-elements/message-styles";
import { MessageTextScaleContext, scaleMessageFontSize } from "@/components/ai-elements/message-text-scale";
import { Loader, Textarea } from "@/components/ui";
import { copyTextToClipboard } from "@/lib/clipboard";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import { SIDE_CHAT_QUESTION_MAX_CHARS } from "@/lib/side-chat/side-chat";
import {
  copySideAnswerToComposer,
  latestSideExchange,
  useSideChatStore,
  type SideChatExchange,
} from "@/store/side-chat-store";
import { useAppStore } from "@/store/app.store";
import { useTaskReviewModeStore, type TaskSurfaceMode } from "@/store/task-review-mode-store";
import { sideChatStyles as styles } from "./side-chat-panel.styles";

/** Starter questions the empty panel offers, asked as-is on click. */
const SUGGESTION_KEYS = ["suggestNow", "suggestWhy", "suggestLeft"] as const;

/**
 * The side question panel, over the task's conversation or its Review: ask
 * the task's provider about the task without interrupting its turn or leaving
 * what you are reading. The task's recent side questions stay here, in
 * memory, as a short thread; only "Copy to composer" puts an answer, quoted,
 * in the draft.
 *
 * Both hosts stay mounted (the conversation sits hidden under Review), so each
 * renders the panel only while its mode shows.
 */
export function SideChatPanel(props: { taskId: string; host: TaskSurfaceMode }) {
  const open = useSideChatStore((state) => Boolean(props.taskId) && state.openTaskId === props.taskId);
  const mode = useTaskReviewModeStore((state) => state.byTask[props.taskId]?.mode ?? "conversation");
  return open && mode === props.host ? <SideChatCard taskId={props.taskId} host={props.host} /> : null;
}

function SideChatCard(props: { taskId: string; host: TaskSurfaceMode }) {
  useTranslation();
  const { taskId } = props;
  const thread = useSideChatStore((state) => state.threadByTask[taskId]);
  const draft = useSideChatStore((state) => state.draftByTask[taskId] ?? "");
  const focusNonce = useSideChatStore((state) => state.focusNonce);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const hintId = useId();
  const latest = latestSideExchange(thread);
  const asking = latest?.status === "asking";
  useEffect(() => {
    fieldRef.current?.focus();
  }, [focusNonce]);
  // Keep the newest question and its answer in view as they arrive.
  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [thread?.length, latest?.status]);

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
      className={sx(styles.card, props.host === "conversation" ? styles.conversationCard : styles.reviewCard)}
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
        {thread?.length ? (
          <AdsButton
            variant="quiet"
            size="sm"
            iconOnly
            aria-label={i18n.t("session:sideChat.clear")}
            title={i18n.t("session:sideChat.clear")}
            data-testid="side-chat-clear"
            onClick={() => useSideChatStore.getState().clearThread(taskId)}
          >
            <Eraser aria-hidden />
          </AdsButton>
        ) : null}
        <AdsButton
          variant="quiet"
          size="sm"
          iconOnly
          aria-label={i18n.t("session:sideChat.close")}
          title={i18n.t("session:sideChat.close")}
          onClick={close}
        >
          <X aria-hidden />
        </AdsButton>
      </header>
      <div ref={bodyRef} className={sx(styles.body)} aria-live="polite">
        {thread?.length ? (
          <ol className={sx(styles.thread)}>
            {thread.map((exchange) => (
              <li key={exchange.id} className={sx(styles.exchange)}>
                <SideChatExchangeView taskId={taskId} exchange={exchange} />
              </li>
            ))}
          </ol>
        ) : (
          <SideChatEmpty taskId={taskId} />
        )}
      </div>
      <div className={sx(styles.footer)}>
        <div className={sx(styles.composer)}>
          <Textarea
            ref={fieldRef}
            value={draft}
            rows={1}
            maxLength={SIDE_CHAT_QUESTION_MAX_CHARS}
            aria-label={i18n.t("session:sideChat.fieldLabel")}
            aria-describedby={hintId}
            placeholder={
              thread?.length ? i18n.t("session:sideChat.placeholderFollowUp") : i18n.t("session:sideChat.placeholder")
            }
            onChange={(event) => useSideChatStore.getState().setDraft(taskId, event.target.value)}
            onKeyDown={onFieldKeyDown}
            xstyle={styles.field}
          />
          <AdsButton
            variant="primary"
            size="md"
            iconOnly
            aria-label={i18n.t("session:sideChat.ask")}
            title={i18n.t("session:sideChat.ask")}
            disabled={asking || !draft.trim()}
            onClick={ask}
          >
            <ArrowUp aria-hidden />
          </AdsButton>
        </div>
        <p id={hintId} className={sx(styles.hint)}>
          {i18n.t("session:sideChat.keyHint")}
        </p>
      </div>
    </section>
  );
}

function SideChatEmpty(props: { taskId: string }) {
  useTranslation();
  return (
    <div className={sx(styles.empty)}>
      <p className={sx(styles.emptyText)}>{i18n.t("session:sideChat.empty")}</p>
      <div className={sx(styles.suggestions)}>
        {SUGGESTION_KEYS.map((key) => {
          const question = i18n.t(`session:sideChat.${key}`);
          return (
            <AdsButton
              key={key}
              variant="outline"
              size="sm"
              xstyle={styles.suggestion}
              data-testid="side-chat-suggestion"
              onClick={() => void useSideChatStore.getState().ask(props.taskId, question)}
            >
              {question}
            </AdsButton>
          );
        })}
      </div>
    </div>
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
  // The panel's body size, like other answers quoted in a panel; a smaller user setting wins.
  const answerFontSize = scaleMessageFontSize("panel", useAppStore((state) => state.settings.messageFontSize));
  return (
    <>
      <p className={sx(styles.question)} data-testid="side-chat-question">
        {exchange.question}
      </p>
      {exchange.status === "asking" ? (
        <p className={sx(styles.status)} role="status">
          <Loader size="sm" />
          {i18n.t("session:sideChat.asking", { provider })}
        </p>
      ) : null}
      {exchange.status === "answered" ? (
        <div className={sx(styles.reply)}>
          <div
            className={sx(styles.answer)}
            style={{ fontSize: `${answerFontSize}px`, lineHeight: MESSAGE_BODY_LINE_HEIGHT }}
            data-testid="side-chat-answer"
          >
            <MessageTextScaleContext.Provider value="panel">
              <MessageResponse>{exchange.answer}</MessageResponse>
            </MessageTextScaleContext.Provider>
          </div>
          <div className={sx(styles.actions)}>
            <CopyAnswerButton answer={exchange.answer} />
            <AdsButton variant="quiet" size="sm" onClick={() => copySideAnswerToComposer(taskId, exchange.answer)}>
              {i18n.t("session:sideChat.copyToComposer")}
            </AdsButton>
            <span className={sx(styles.byline)}>{provider}</span>
          </div>
        </div>
      ) : null}
      {exchange.status === "failed" ? (
        <Banner
          tone={exchange.reason === "error" ? "danger" : "warning"}
          title={describeFailure(exchange)}
          action={
            exchange.reason === "error" ? (
              <AdsButton
                size="sm"
                variant="outline"
                onClick={() => void useSideChatStore.getState().retry(taskId, exchange.id)}
              >
                {i18n.t("common:actions.retry")}
              </AdsButton>
            ) : undefined
          }
        >
          {exchange.detail ?? null}
        </Banner>
      ) : null}
    </>
  );
}

/** Copies the answer as Markdown, and says so for a moment. */
function CopyAnswerButton(props: { answer: string }) {
  useTranslation();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1_500);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const label = copied ? i18n.t("session:sideChat.copied") : i18n.t("session:sideChat.copyAnswer");
  return (
    <AdsButton
      variant="quiet"
      size="sm"
      iconOnly
      aria-label={label}
      title={label}
      onClick={() => {
        void copyTextToClipboard(props.answer).then(
          () => setCopied(true),
          () => setCopied(false),
        );
      }}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
    </AdsButton>
  );
}
