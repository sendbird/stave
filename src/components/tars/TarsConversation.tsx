import { useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { FileDiff, MessageCircleQuestion, RefreshCw } from "lucide-react";
import { useTarsAttachments, attachmentName } from "./use-tars-attachments";
import { useTranslation } from "@/i18n";
import { Badge } from "@/components/aui/components/Badge";
import { Toggle } from "@/components/aui/components/Toggle";
import { Tooltip } from "@/components/aui/components/Tooltip";
import { VisuallyHidden } from "@/components/aui/components/VisuallyHidden";
import { composerTray } from "@/components/aui/recipes/composer-tray";
import { controlChrome } from "@/components/aui/recipes/control-chrome";
import { sx } from "@/components/aui/utils/stylex";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { TarsWelcome } from "./TarsGuide";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { TranscriptWideScope } from "@/components/ai-elements/transcript-wide";
import { PromptInput } from "@/components/ai-elements/prompt-input";
import { buildModelSelectorValue } from "@/components/ai-elements/model-selector";
import type { TarsActionReceipt, TarsAnswerInput, TarsAnswerResult, TarsAnswerSource, TarsConversationSettings, TarsMessageView } from "@/lib/tars/conversation";
import {
  bindTarsShortAnswer, projectTarsDecisions, selectAnswerableTarsDecisions, tarsUnverifiedDecisionId, type TarsDecisionView,
} from "@/lib/tars/decisions";
import { TARS_MESSAGE_MAX_CHARS, type TarsResponsibility } from "@/lib/tars/types";
import type { TarsConversationState } from "./use-tars-conversation";
import { tarsStyles as styles } from "./tars.styles";
import { tarsTrayStyles as trayStyles } from "./tars-tray.styles";
import { selectTarsActivityNotices, type TarsFlow } from "@/lib/tars/flow-model";
import type { FleetFocusTarget } from "@/store/fleet-focus-store";
import type { TarsSideViewTarget } from "@/lib/tars/side-view";
import { TarsActivityNoticeLine, TarsFlowBlock } from "./TarsFlowBlock";
import { TarsActionRecordLine } from "./TarsActionRecordLine";
import { TarsDecisionCard, type TarsDecisionCardContext, type TarsDecisionCardProps } from "./TarsDecisionCard";
import { TarsPublishCard } from "./TarsPublishCard";
import { TarsPublishRecordLine } from "./TarsPublishRecordLine";
import { TarsRecordList, TarsRecordRow } from "./TarsRecord";
import { TarsReceiptRow } from "./TarsReceiptRow";
import type { TarsPublishContext } from "./use-tars-publish";
import type { TarsBridgeApi } from "@/lib/tars/types";
import {
  appendTarsDraft, beginTarsDraftSend, flushTarsDraft, hydrateTarsDraft, setTarsDraftText, setTarsDraftWorkingChanges, settleTarsDraftSend, useTarsDraftStore,
} from "@/store/tars-draft-store";
import {
  TarsComposerAttachments, TarsConversationError, TarsMessageAttachments, TarsMessageFailure, TarsMessageStatus, TarsMessageTime, useTarsTextScale,
} from "./TarsMessageChrome";
import { tarsMessageStyles as chrome } from "./tars-message.styles";
import { TarsRecordStyleContext, useTarsTranscriptLayout } from "./tars-transcript-layout-context";
import { layoutTarsTranscript, TarsEdgeTime, type TarsTranscriptEntry } from "./TarsTranscriptLayout";
import { tarsTranscriptStyles as transcriptStyles } from "./tars-transcript.styles";

export { TarsActionRecordLine } from "./TarsActionRecordLine";

/** The longest message Tars accepts; over it the composer shows its one error line and does not send. */
const TARS_MESSAGE_LIMIT = TARS_MESSAGE_MAX_CHARS;

/** What the conversation needs to show a delegated responsibility's flow in place. */
export interface TarsFlowContext {
  /** The flow of an applied delegate receipt; null keeps the receipt line. */
  flowFor: (receipt: TarsActionReceipt) => TarsFlow | null;
  onShowInFleet: (target: FleetFocusTarget) => void;
  /** Opens a flow node's part of the side view. */
  onOpenSide?: (target: TarsSideViewTarget) => void;
  /** The work's live line under its folded flow: what Stave observed, and how current it is. */
  liveFor?: (responsibilityId: string) => ReactNode;
}

/** What the view asks of the conversation: put text in the composer, or answer a decision from outside the transcript. */
export interface TarsConversationController {
  /** Adds text to the draft (after what is there) and focuses the composer; nothing is sent. */
  insert: (text: string) => void;
  answer: TarsDecisionAnswerHandler;
  focusComposer: () => void;
}

export type TarsDecisionAnswerHandler = (decision: TarsDecisionView, optionIndex: number, source: TarsAnswerSource) => void;

/** A publish proposal in place of its receipt: the card while it waits, else one line. */
function TarsPublishProposal({ view, publish, titleOf }: { view: TarsPublishContext["proposals"][number]; publish: TarsPublishContext; titleOf?: (id: string) => string | undefined }) {
  const { t } = useTranslation(["shell"]);
  const row = publish.rowOf(view.responsibilityId);
  const title = titleOf?.(view.responsibilityId) ?? view.responsibilityId;
  if (view.record) return <TarsRecordList><TarsPublishRecordLine record={view.record} row={row} title={title} onRetry={publish.retryFor(view.record) ?? undefined} /></TarsRecordList>;
  const line = (text: string, kind: "invalid" | "declined") => <TarsRecordList>
    <TarsRecordRow state={kind === "invalid" ? "skipped" : "stopped"} lead={title} subject={text} data-tars-publish-proposal={kind} /></TarsRecordList>;
  if (view.state === "invalid") return line(t("shell:tars.publish.proposal.invalid"), "invalid");
  if (publish.declined.has(view.requestId)) return line(t("shell:tars.publish.proposal.declined"), "declined");
  if (!row) return null;
  const { preview, state } = publish.previewOf(row.id);
  return <TarsPublishCard id={view.requestId} row={row} preview={preview} previewState={state} busy={publish.busyId === view.requestId}
    error={publish.errors.get(view.requestId)} onDecline={() => publish.onDecline(view.requestId)}
    onPublish={view.checked ? (words, source) => publish.onPublish({ id: view.requestId, responsibilityId: row.id, expectedRevision: view.expectedRevision }, words, source) : undefined} />;
}

export function TarsConversationMessage({ message, receipts, name, busy, onCancel, onResend, titleOf, agentNameOf, flows, decisions, onAnswer, answerErrors, context, publish }: {
  message: TarsMessageView; receipts: TarsActionReceipt[]; name: string; busy: boolean; onCancel: () => void;
  /** Puts a failed message's words back in the message box; absent, its failure offers no action. */
  onResend?: () => void;
  titleOf?: (responsibilityId: string) => string | undefined;
  /** The display name of a delegate action's agent. */
  agentNameOf?: (agentId: string) => string | undefined;
  flows?: TarsFlowContext;
  /** This message's decisions (`projectTarsDecisions`); a receipt with one shows as its card. */
  decisions?: readonly TarsDecisionView[];
  /** Absent: cards show their state without buttons. */
  onAnswer?: TarsDecisionAnswerHandler;
  answerErrors?: ReadonlyMap<string, string>;
  /** What a decision card shows about its target, and where Esc leaves it. */
  context?: TarsDecisionCardContext;
  /** Publish proposals and their cards; absent, a publish proposal stays a receipt line. */
  publish?: TarsPublishContext;
}) {
  const { t } = useTranslation(["shell"]);
  const cards = new Map((decisions ?? []).filter((view) => view.messageId === message.id).map((view) => [view.actionIndex, view]));
  const publishViews = new Map((publish?.proposals ?? []).filter((view) => view.messageId === message.id).map((view) => [view.actionIndex, view]));
  // An applied delegation reads as its flow block, and a decision as its card, so their receipt lines would only repeat them.
  const flowed = receipts.map((receipt) => ({ receipt, flow: flows?.flowFor(receipt) ?? null, card: cards.get(receipt.actionIndex) ?? null }));
  const lines = flowed.filter((entry) => !entry.flow && !entry.card && !publishViews.has(entry.receipt.actionIndex)).map((entry) => entry.receipt);
  const origin = message.origin;
  const userWords = !origin;
  const { timeStyle, daySeparator } = useTarsTranscriptLayout();
  // `edge`: the time beside the bubble, or at the end of a follow-up's line; without day breaks it names its day.
  const edgeTime = timeStyle === "edge" ? <TarsEdgeTime at={message.createdAt} withDay={daySeparator === "none"} /> : null;
  const bubble = message.text ? <div className={sx(chrome.userBubble)} data-tars-user-bubble=""><MessageContent><p className={sx(chrome.messageText)}>{message.text}</p></MessageContent></div> : null;
  return <div className={sx(chrome.exchange)} data-tars-message={message.id} data-tars-message-origin={origin?.kind}>
    {/* Shown on hover or focus, above the message on the side of whoever started the exchange. */}
    {timeStyle === "hover" ? <TarsMessageTime at={message.createdAt} side={userWords ? "end" : "start"} /> : null}
    {/* A chosen option is recorded on its card; an automatic follow-up says why it exists. Neither is shown as the user's words. */}
    {origin?.kind === "reask" ? <TarsRecordList><TarsRecordRow state="info" icon={MessageCircleQuestion} subject={t(`shell:tars.decision.reaskLine.${origin.reason}`)} data-tars-reask=""
      at={message.createdAt} meta={edgeTime} /></TarsRecordList>
      : origin?.kind === "followUp" ? <TarsRecordList><TarsRecordRow state="info" icon={RefreshCw} data-tars-follow-up={origin.reason} at={message.createdAt} meta={edgeTime}
        subject={t(`shell:tars.followUp.line.${origin.reason === "stageAsksUser" && origin.stage === "gate" ? "stageGate" : origin.reason}`, { title: titleOf?.(origin.responsibilityId) ?? origin.responsibilityId })} /></TarsRecordList>
      : origin?.kind === "answer" ? null
        // The user's words sit on the trailing side in a bubble no wider than they need, under what came with them; Tars's reply reads full-width.
        : <Message from="user" aria-label={t("shell:tars.conversation.you")} data-tars-user-message=""><div className={sx(chrome.userColumn)}>
          <TarsMessageAttachments attachments={message.attachments ?? []} workingChanges={Boolean(message.includeWorkingChanges)} />
          {bubble && edgeTime ? <div className={sx(transcriptStyles.bubbleRow)}>{edgeTime}{bubble}</div> : bubble}
        </div></Message>}
    {message.reply !== null ? <Message from="assistant" aria-label={t("shell:tars.conversation.replyFrom", { name })} data-tars-reply=""><MessageContent>
      {/* Code, tables and diffs may claim the transcript's wide measure; prose keeps the reading column. */}
      <TranscriptWideScope enabled><MessageResponse fileLinkContext="none">{message.reply}</MessageResponse></TranscriptWideScope></MessageContent></Message>
      : message.state === "failed" ? <TarsMessageFailure message={message} onResend={userWords && onResend ? onResend : undefined} />
        : message.state !== "answered" ? <TarsMessageStatus state={message.state} busy={busy} onCancel={onCancel} /> : null}
    {origin?.kind === "followUp" && message.state === "cancelled"
      ? <p className={sx(styles.text)} data-tars-follow-up-superseded="">{t("shell:tars.followUp.superseded")}</p> : null}
    {lines.length ? <TarsRecordList aria-label={t("shell:tars.conversation.actions")}>
      {lines.map((receipt) => <TarsReceiptRow key={receipt.actionIndex} receipt={receipt} titleOf={titleOf} agentNameOf={agentNameOf} />)}
    </TarsRecordList> : null}
    {flowed.map(({ receipt, card }) => card
      ? <TarsDecisionCard key={`decision:${receipt.actionIndex}`} decision={card} titleOf={titleOf} {...context} busy={busy} error={answerErrors?.get(card.id)}
        onAnswer={onAnswer ? (view, index, source) => onAnswer(view, index, source) : undefined} /> : null)}
    {publish ? [...publishViews.values()].map((view) => <TarsPublishProposal key={`publish:${view.actionIndex}`} view={view} publish={publish} titleOf={titleOf} />) : null}
    {flowed.map(({ receipt, flow }) => flow
      ? <TarsFlowBlock key={`flow:${receipt.actionIndex}`} flow={flow} agentNameOf={agentNameOf} onShowInFleet={flows?.onShowInFleet} onOpenSide={flows?.onOpenSide}
        live={flows?.liveFor?.(flow.responsibilityId)} /> : null)}
  </div>;
}

/**
 * The composer's one per-message choice, icon-only at every width like the
 * composer's other controls. Its accessible name is the full choice (the
 * Toggle's hidden label), the tooltip leads with that same name, and what it
 * does is the tooltip's second line and the control's description.
 */
function TarsWorkingChangesToggle({ pressed, disabled, onPressedChange }: { pressed: boolean; disabled: boolean; onPressedChange: (pressed: boolean) => void }) {
  const { t } = useTranslation(["shell"]);
  const hintId = useId();
  const label = t("shell:tars.conversation.workingChanges.toggle");
  const hint = t("shell:tars.conversation.workingChanges.hint");
  return <>
    <Tooltip content={<span className={sx(styles.tooltipBody)}><span>{label}</span><span className={sx(styles.tooltipHint)}>{hint}</span></span>}>
      <Toggle size="sm" iconOnly pressed={pressed} disabled={disabled} onPressedChange={(next) => onPressedChange(next)}
        xstyle={pressed ? chrome.toggleQuietPressed : [controlChrome.triggerQuiet, chrome.toggleQuiet]}
        icon={<FileDiff aria-hidden="true" className={sx(styles.toggleIcon)} />} aria-describedby={hintId} data-tars-working-changes-toggle="">
        {label}
      </Toggle>
    </Tooltip>
    <VisuallyHidden id={hintId}>{hint}</VisuallyHidden>
  </>;
}

export function TarsConversation({ state, name, initialSettings, titleOf, rowOf, workspaceNameOf, onOpenTask, agentNameOf, flows, floor, responsibilities, onAnswer, sidePanel, controller, publish, composerStatus, draftBridge }: {
  state: TarsConversationState; name: string; initialSettings: TarsConversationSettings; titleOf?: (responsibilityId: string) => string | undefined;
  rowOf?: TarsDecisionCardProps["rowOf"];
  workspaceNameOf?: TarsDecisionCardProps["workspaceNameOf"];
  onOpenTask?: TarsDecisionCardProps["onOpenTask"];
  agentNameOf?: (agentId: string) => string | undefined;
  flows?: TarsFlowContext;
  /** Keeps the conversation at its minimum width while the tray is pinned beside it. */
  floor?: boolean;
  /** The last snapshot's responsibilities; null before one was read, so no target-bound decision is offered on a guess. */
  responsibilities?: readonly TarsResponsibility[] | null;
  /** Sends one answer through the host; null when it could not be sent. */
  onAnswer?: (input: TarsAnswerInput) => Promise<TarsAnswerResult | null>;
  /** The narrow side view: between the transcript and the composer, so both stay in view. */
  sidePanel?: ReactNode;
  controller?: Ref<TarsConversationController>;
  /** Publish cards: word proposals in place, records of cards the user opened, and the card open now at the end. */
  publish?: TarsPublishContext;
  /** The work running now, in the composer band above the message field; absent while nothing runs. */
  composerStatus?: ReactNode;
  /** Where the draft is saved across restarts; absent, it lasts for this window. */
  draftBridge?: Pick<TarsBridgeApi, "getDraft" | "saveDraft">;
}) {
  const { t } = useTranslation(["shell"]);
  const layout = useTarsTranscriptLayout();
  // The draft outlives this view (see `tars-draft-store`): leaving Tars and coming back, or restarting, shows it again. Its files stay for this window.
  const text = useTarsDraftStore((draft) => draft.text);
  const attached = useTarsAttachments();
  // Per message and off by default: the next send carries it, then it resets.
  const includeWorkingChanges = useTarsDraftStore((draft) => draft.includeWorkingChanges);
  const draftReady = useTarsDraftStore((draft) => draft.ready);
  useEffect(() => {
    void hydrateTarsDraft(draftBridge);
    return () => { void flushTarsDraft(); };
  }, [draftBridge]);
  const [answerErrors, setAnswerErrors] = useState<ReadonlyMap<string, string>>(new Map());
  // The conversation's error came from a send: its notice says the words were not sent and Retry sends them again.
  const [sendFailed, setSendFailed] = useState(false);
  useEffect(() => { if (!state.error) setSendFailed(false); }, [state.error]);
  const textScale = useTarsTextScale();
  const [answering, setAnswering] = useState(false);
  const composerRef = useRef<HTMLDivElement>(null);
  const composerErrorId = useId();
  const settings = state.conversation?.settings ?? initialSettings;
  const decisions = useMemo(() => state.conversation ? projectTarsDecisions({ messages: state.conversation.messages, receipts: state.conversation.receipts,
    records: state.conversation.records, answers: state.conversation.answers ?? [], activity: state.conversation.activity,
    responsibilities: responsibilities ?? null }) : [], [responsibilities, state.conversation]);
  const decisionIds = useMemo(() => new Set(decisions.map((view) => view.id)), [decisions]);
  const timeline = useMemo(() => [
    ...(state.conversation?.messages ?? []).map((value) => ({ kind: "message" as const, id: `message:${value.id}`, at: value.createdAt, value })),
    // Only completion, a block and an unasked end reach the transcript; live progress stays in the tray and flow blocks.
    ...selectTarsActivityNotices(state.conversation?.activity ?? [], state.conversation?.records ?? [])
      .map((value) => ({ kind: "activity" as const, id: `activity:${value.activity.id}`, at: value.activity.createdAt, value })),
    // A decision's own record shows on its card, never twice.
    ...(state.conversation?.records ?? []).filter((value) => !value.requestId.startsWith("answer:") && !decisionIds.has(value.requestId))
      .map((value) => ({ kind: "record" as const, id: `record:${value.requestId}`, at: value.createdAt, value })),
    // A card the user opened leaves its confirmation's outcome where it was confirmed.
    ...(publish?.records ?? []).map((value) => ({ kind: "publish" as const, id: `publish:${value.requestId}`, at: value.createdAt, value })),
    // A change Tars did not follow up because automatic turns reached the turn limit says so once, where it happened.
    ...(state.conversation?.events ?? []).filter((value) => value.status === "exhausted")
      .map((value) => ({ kind: "event" as const, id: `event:${value.key}`, at: value.processedAt ?? value.createdAt, value })),
  ].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)), [decisionIds, publish?.records, state.conversation]);
  const scrollKey = timeline.map((item) => `${item.id}:${item.kind === "activity" ? item.value.activity.revision : item.kind === "event" ? item.value.status : item.value.revision}`).join("|")
    + decisions.map((view) => `${view.id}:${view.state}`).join("|") + (publish?.proposals ?? []).map((view) => `${view.requestId}:${view.state}`).join("|")
    + (publish?.open ? `|open:${publish.open.id}` : "");
  const tooLong = text.length > TARS_MESSAGE_LIMIT;
  const composerDisabled = !state.available || !state.conversation || state.busy || !draftReady || attached.reading;
  const focusComposer = () => composerRef.current?.querySelector<HTMLElement>("[contenteditable='true'], textarea")?.focus();
  const verifyRequest = (responsibilityId: string) => t("shell:tars.decision.verifyRequest", { title: titleOf?.(responsibilityId) ?? responsibilityId });
  /**
   * Click, key and words take this one path; only Stave's "ask for new
   * verification work" stays in the composer, added after the draft so nothing
   * the user wrote is lost. Resolves whether the answer was taken.
   */
  const answer = (decision: TarsDecisionView, optionIndex: number, source: TarsAnswerSource): Promise<boolean> => {
    const option = decision.options[optionIndex];
    if (!option) return Promise.resolve(false);
    if (option.kind === "verify") {
      appendTarsDraft(verifyRequest(option.responsibilityId));
      focusComposer();
      return Promise.resolve(false);
    }
    if (!onAnswer || answering) return Promise.resolve(false);
    setAnswering(true);
    return onAnswer({ decisionId: decision.id, optionIndex, source }).catch(() => null).then((result) => {
      const message = !result ? t("shell:tars.decision.refusal.failed") : result.refusal ? t(`shell:tars.decision.refusal.${result.refusal}`) : null;
      setAnswerErrors((current) => {
        const next = new Map(current);
        if (message) next.set(decision.id, message); else next.delete(decision.id);
        return next;
      });
      // A recorded answer the host refused (its card shows why) was not taken either.
      return !message && result?.answer?.status !== "rejected";
    }).finally(() => setAnswering(false));
  };
  const cardHandler = onAnswer ? answer : undefined;
  // Esc on a waiting card leaves it waiting and hands focus back to the message box.
  const cardContext: TarsDecisionCardContext = { rowOf, workspaceNameOf, onDismiss: focusComposer, onOpenTask };
  const insertDraft = (quote: string) => {
    appendTarsDraft(quote);
    focusComposer();
  };
  useImperativeHandle(controller, () => ({
    insert: insertDraft,
    answer, focusComposer,
  }));
  /** The composer's send, also what Retry runs after a send that failed: the same draft is the same request. */
  const submit = async (submitted: string) => {
    if (composerDisabled || (!submitted.trim() && !attached.parts.length) || submitted.length > TARS_MESSAGE_LIMIT) return;
    // A short answer binds to the one waiting decision; anything else is a message to Tars.
    const bound = onAnswer && !attached.parts.length ? bindTarsShortAnswer(submitted, selectAnswerableTarsDecisions(decisions)) : null;
    if (bound) {
      const option = bound.decision.options[bound.optionIndex];
      // The words were only the answer, so the verification request takes their place.
      if (option?.kind === "verify") { setTarsDraftText(verifyRequest(option.responsibilityId)); focusComposer(); return; }
      // The answer clears the draft only once it was taken, and only if it still holds those words; a refused or failed answer leaves them.
      const words = useTarsDraftStore.getState().text;
      if (await answer(bound.decision, bound.optionIndex, "words") && useTarsDraftStore.getState().text === words) setTarsDraftText("");
      return;
    }
    // An unchanged draft, choice and files retry the same request (a lost acknowledgement cannot send twice); any edit is a new message.
    const sending = await beginTarsDraftSend();
    // The request ID could not be saved with the draft, so nothing was sent: the words stay and the send shows as failed.
    if (!sending) { setSendFailed(true); state.reportSendFailure(); return; }
    const message = await state.send({ requestId: sending.requestId, text: submitted, ...(sending.attachments.length ? { attachments: [...sending.attachments] } : {}),
      ...(sending.includeWorkingChanges ? { includeWorkingChanges: true } : {}) }, initialSettings);
    setSendFailed(!message);
    settleTarsDraftSend({ ...sending, outcome: !message ? "unsent" : message.state === "failed" ? "failed" : "sent" });
  };
  /** A failed message's words (and its working-changes choice) back in the message box, after any draft, to edit and send as a new message. */
  const resend = (message: TarsMessageView) => {
    if (message.text) appendTarsDraft(message.text);
    if (message.includeWorkingChanges) setTarsDraftWorkingChanges(true);
    focusComposer();
  };
  const unverifiedCard = (activity: { responsibilityId: string; revision: number }) =>
    decisions.find((view) => view.id === tarsUnverifiedDecisionId(activity.responsibilityId, activity.revision));
  /** One timeline entry: a message's exchange or a card in the flow, or a record that joins its neighbours' list. */
  const nodeOf = (item: (typeof timeline)[number]): TarsTranscriptEntry["node"] => {
    if (item.kind === "message") return <TarsConversationMessage key={item.id} message={item.value} receipts={state.conversation!.receipts.filter((receipt) => receipt.messageId === item.value.id)} name={name} busy={state.busy || answering} onCancel={() => void state.cancel(item.value.id)}
      onResend={() => resend(item.value)}
      titleOf={titleOf} agentNameOf={agentNameOf} flows={flows} decisions={decisions} onAnswer={cardHandler} answerErrors={answerErrors} context={cardContext} publish={publish} />;
    if (item.kind === "publish") return { record: <TarsPublishRecordLine key={item.id} record={item.value} row={publish?.rowOf(item.value.responsibilityId)}
      title={titleOf?.(item.value.responsibilityId)} onRetry={publish?.retryFor(item.value) ?? undefined} /> };
    if (item.kind === "record") return { record: <TarsActionRecordLine key={item.id} record={item.value} title={titleOf?.(item.value.action.responsibilityId)} /> };
    if (item.kind === "event") return { record: <TarsRecordRow key={item.id} state="halted" data-tars-follow-up-exhausted={item.value.responsibilityId} at={item.at}
      subject={t("shell:tars.followUp.exhausted", { title: titleOf?.(item.value.responsibilityId) ?? item.value.responsibilityId })} /> };
    // Stave's unverified-completion choice is a decision card where its blocked notice would be.
    const card = item.value.activity.detailCode === "unverifiedCompletion" ? unverifiedCard(item.value.activity) : undefined;
    return card ? <TarsDecisionCard key={item.id} decision={card} titleOf={titleOf} {...cardContext} busy={state.busy || answering} onAnswer={cardHandler} error={answerErrors.get(card.id)} />
      : { record: <TarsActivityNoticeLine key={item.id} notice={item.value} /> };
  };
  return <div className={sx(styles.chat, floor && trayStyles.conversationFloor)} style={textScale}>
    <Conversation>
      <ConversationContent scrollScopeKey="personal-representative" autoScrollKey={`${scrollKey}|error:${state.error ?? ""}`} data-testid="tars-transcript">
        {!state.available ? <p role="status">{t("shell:tars.conversation.unavailable")}</p> : null}
        {!state.conversation && state.available && !state.error ? <p role="status">{t("shell:tars.conversation.loading")}</p> : null}
        {state.conversation && !timeline.length ? <TarsWelcome name={name} onExample={insertDraft} /> : null}
        <TarsRecordStyleContext value={layout.recordStyle}>
        {layoutTarsTranscript(timeline.map((item) => ({ id: item.id, at: item.at, node: nodeOf(item) })), layout)}
        {publish?.open ? (() => {
          const open = publish.open;
          const row = publish.rowOf(open.responsibilityId);
          if (!row) return null;
          const { preview, state: previewState } = publish.previewOf(row.id);
          // A card the user opened is theirs to answer now, so it takes focus on its commit message.
          return <TarsPublishCard key={open.id} id={open.id} row={row} preview={preview} previewState={previewState} initial={open.initial} autoFocus
            busy={publish.busyId === open.id} error={publish.errors.get(open.id)} onDecline={() => publish.onDecline(open.id)}
            onPublish={(words, source) => publish.onPublish({ id: open.id, responsibilityId: row.id, expectedRevision: null }, words, source)} />;
        })() : null}
        {/* A request that did not go through says so at the end, beside the message box that still holds the words. */}
        {state.error ? <TarsConversationError error={state.error} send={sendFailed}
          onRetry={() => void (sendFailed ? submit(useTarsDraftStore.getState().text) : state.refresh())} /> : null}
        </TarsRecordStyleContext>
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
    {sidePanel}
    {/* The AUI #809 tray composer: a tinted band around the raised input; its one quiet line appears only for the over-limit error. */}
    <div ref={composerRef} className={sx(styles.composer)} data-tars-composer="">
      <div className={sx(composerTray.tray)}>
      {composerStatus}
      <input ref={attached.picker} type="file" multiple hidden aria-label={t("shell:tars.conversation.attachments.select")} onChange={(event) => { void attached.add(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ""; }} />
      <PromptInput minimal chrome="tray" invalid={tooLong} errorMessageId={composerErrorId} value={text} onValueChange={setTarsDraftText} disabled={composerDisabled}
        sendAccessory={<TarsWorkingChangesToggle pressed={includeWorkingChanges} disabled={composerDisabled} onPressedChange={setTarsDraftWorkingChanges} />}
        selectedModel={buildModelSelectorValue({ providerId: settings.providerId, model: settings.model })} modelOptions={[]} onModelSelect={() => undefined}
        attachedFilePaths={attached.parts.map(attachmentName)} plainText allowPlainTextAttachments
        attachmentsRow={<TarsComposerAttachments parts={attached.parts} nameOf={attachmentName}
          onRemove={composerDisabled ? undefined : (removed) => attached.keep(attached.parts.map(attachmentName).filter((name) => name !== removed))} />}
        onAttachFilesChange={({ filePaths }) => attached.keep(filePaths)} onOpenFileSelector={() => attached.picker.current?.click()}
        onPasteFiles={({ files }) => attached.add(files)} windowShortcutsEnabled={false}
        onSubmit={({ text: submitted }) => submit(submitted)} />
      {attached.error ? <p role="alert" className={sx(composerTray.footnote, composerTray.footnoteError)}>{attached.error}</p> : null}
      {tooLong ? <p id={composerErrorId} className={sx(composerTray.footnote, composerTray.footnoteError)} role="alert" data-tars-composer-error="tooLong">{t("shell:tars.conversation.tooLong")}</p> : null}
      </div>
    </div>
  </div>;
}
