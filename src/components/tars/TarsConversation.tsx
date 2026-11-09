import { useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { FileDiff } from "lucide-react";
import { useTarsAttachments, attachmentName } from "./use-tars-attachments";
import { useTranslation } from "@/i18n";
import { formatDateTime } from "@/i18n/format";
import { Button } from "@/components/ui";
import { Badge, type BadgeTone } from "@/components/aui/components/Badge";
import { StateMark } from "@/components/aui/components/StateMark";
import type { WorkState } from "@/components/aui/components/state-vocabulary";
import { Toggle } from "@/components/aui/components/Toggle";
import { Tooltip } from "@/components/aui/components/Tooltip";
import { VisuallyHidden } from "@/components/aui/components/VisuallyHidden";
import { composerTray } from "@/components/aui/recipes/composer-tray";
import { sx } from "@/components/aui/utils/stylex";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { TarsWelcome } from "./TarsGuide";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { TranscriptWideScope } from "@/components/ai-elements/transcript-wide";
import { TarsMark } from "./TarsMark";
import { PromptInput } from "@/components/ai-elements/prompt-input";
import { buildModelSelectorValue } from "@/components/ai-elements/model-selector";
import type { TarsActionReceipt, TarsAnswerInput, TarsAnswerResult, TarsAnswerSource, TarsConversationSettings, TarsMessage } from "@/lib/tars/conversation";
import {
  bindTarsShortAnswer, projectTarsDecisions, selectAnswerableTarsDecisions, tarsUnverifiedDecisionId, type TarsDecisionView,
} from "@/lib/tars/decisions";
import { TARS_MESSAGE_MAX_CHARS, type TarsResponsibility } from "@/lib/tars/types";
import type { TarsConversationState } from "./use-tars-conversation";
import { tarsStyles as styles } from "./tars.styles";
import { tarsTrayStyles as trayStyles } from "./tars-tray.styles";
import { tarsControlReasonKey, tarsDelegateReasonKey } from "@/lib/tars/control-reasons";
import { describeTarsMessageFailure } from "@/lib/tars/detail";
import { selectTarsActivityNotices, type TarsFlow } from "@/lib/tars/flow-model";
import type { FleetFocusTarget } from "@/store/fleet-focus-store";
import type { TarsSideViewTarget } from "@/lib/tars/side-view";
import { TarsActivityNoticeLine, TarsFlowBlock } from "./TarsFlowBlock";
import { TarsActionRecordLine } from "./TarsActionRecordLine";
import { TarsDecisionCard, type TarsDecisionCardContext, type TarsDecisionCardProps } from "./TarsDecisionCard";
import { TarsPublishCard } from "./TarsPublishCard";
import { TarsPublishRecordLine } from "./TarsPublishRecordLine";
import type { TarsPublishContext } from "./use-tars-publish";
import { TarsPublishReasonSchema } from "@/lib/tars/publication";
import type { TarsBridgeApi } from "@/lib/tars/types";
import {
  appendTarsDraft, beginTarsDraftSend, flushTarsDraft, hydrateTarsDraft, setTarsDraftText, setTarsDraftWorkingChanges, settleTarsDraftSend, useTarsDraftStore,
} from "@/store/tars-draft-store";

export { TarsActionRecordLine } from "./TarsActionRecordLine";

/** The longest message Tars accepts; over it the composer shows its one error line and does not send. */
const TARS_MESSAGE_LIMIT = TARS_MESSAGE_MAX_CHARS;

/** A receipt's refusal key: a translated code when the host gave one; null keeps its diagnostic. */
function receiptRefusalKey(receipt: TarsActionReceipt) {
  // An automatic follow-up's refusal reads the same for every kind of action.
  if (receipt.action.kind === "publish") { const parsed = TarsPublishReasonSchema.safeParse(receipt.reason); return `shell:tars.publish.reason.${parsed.success ? parsed.data : "unknown"}` as const; }
  if (receipt.reason === "notByFollowUp" || receipt.action.kind === "control" || receipt.action.kind === "ask" || receipt.action.kind === "show") return tarsControlReasonKey(receipt.reason);
  return receipt.action.kind === "delegate" ? tarsDelegateReasonKey(receipt.reason) : null;
}

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

/**
 * A message's state in the work-state vocabulary, so a reply being written
 * reads as running (the one moving mark), a queued one as queued and a failed
 * one as failed, the same way work states read everywhere else in Tars.
 */
const MESSAGE_STATE: Record<Exclude<TarsMessage["state"], "answered">, { state: WorkState; tone: BadgeTone }> = {
  queued: { state: "queued", tone: "neutral" },
  reasoning: { state: "working", tone: "info" },
  failed: { state: "failed", tone: "danger" },
  cancelled: { state: "stopped", tone: "neutral" },
};

function TarsMessageStateTag({ state }: { state: Exclude<TarsMessage["state"], "answered"> }) {
  const { t } = useTranslation(["shell"]);
  const visual = MESSAGE_STATE[state];
  return <Badge tone={visual.tone} data-tars-message-state={state}>
    <StateMark state={visual.state} size="xs" motion={state === "reasoning" ? "moving" : "still"} />{t(`shell:tars.conversation.states.${state}`)}</Badge>;
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
  if (view.record) return <TarsPublishRecordLine record={view.record} row={row} title={title} onRetry={publish.retryFor(view.record) ?? undefined} />;
  const line = (text: string, kind: string) => <p className={sx(styles.actionRecord)} data-tars-publish-proposal={kind}>
    <span aria-hidden="true" className={sx(styles.glyph)}>↳</span><span>{text}</span><span className={sx(styles.recordTitle)}>{title}</span></p>;
  if (view.state === "invalid") return line(t("shell:tars.publish.proposal.invalid"), "invalid");
  if (publish.declined.has(view.requestId)) return line(t("shell:tars.publish.proposal.declined"), "declined");
  if (!row) return null;
  const { preview, state } = publish.previewOf(row.id);
  return <TarsPublishCard id={view.requestId} row={row} preview={preview} previewState={state} busy={publish.busyId === view.requestId}
    error={publish.errors.get(view.requestId)} onDecline={() => publish.onDecline(view.requestId)}
    onPublish={view.checked ? (words, source) => publish.onPublish({ id: view.requestId, responsibilityId: row.id, expectedRevision: view.expectedRevision }, words, source) : undefined} />;
}

export function TarsConversationMessage({ message, receipts, name, busy, onCancel, titleOf, agentNameOf, flows, decisions, onAnswer, answerErrors, context, publish }: {
  message: TarsMessage; receipts: TarsActionReceipt[]; name: string; busy: boolean; onCancel: () => void;
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
  const failure = describeTarsMessageFailure(message);
  const origin = message.origin;
  return <div className={sx(styles.exchange)} data-tars-message={message.id} data-tars-message-origin={origin?.kind}>
    {/* A chosen option is recorded on its card; an automatic follow-up says why it exists. Neither is shown as the user's words. */}
    {origin?.kind === "reask" ? <p className={sx(styles.actionRecord)} data-tars-reask=""><span aria-hidden="true" className={sx(styles.glyph)}>↳</span>
      <span>{t(`shell:tars.decision.reaskLine.${origin.reason}`)}</span></p>
      : origin?.kind === "followUp" ? <p className={sx(styles.actionRecord)} data-tars-follow-up={origin.reason}><span aria-hidden="true" className={sx(styles.glyph)}>↳</span>
        <span>{t(`shell:tars.followUp.line.${origin.reason}`, { title: titleOf?.(origin.responsibilityId) ?? origin.responsibilityId })}</span></p>
      : origin?.kind === "answer" ? null
        // The user's words sit on the trailing side in a bubble no wider than they need; Tars's reply reads full-width under its name.
        : <Message from="user" aria-label={t("shell:tars.conversation.you")} data-tars-user-message=""><div className={sx(styles.userBubble)}>
          <MessageContent><p className={sx(styles.messageText)}>{message.text}</p>
            {message.attachments?.length ? <ul className={sx(styles.receipts)} aria-label={t("shell:tars.conversation.attachments.sent")} data-tars-message-attachments="">{message.attachments.map((part, index) => <li key={index}>{attachmentName(part)}</li>)}</ul> : null}</MessageContent></div></Message>}
    <div className={sx(styles.actions, !origin && styles.metaUser)} data-tars-message-meta=""><time className={sx(styles.text)} dateTime={message.createdAt}>{formatDateTime(message.createdAt)}</time>{message.state !== "answered" ? <TarsMessageStateTag state={message.state} /> : null}
      {message.includeWorkingChanges && !origin ? <Badge data-tars-message-working-changes="">{t("shell:tars.conversation.workingChanges.badge")}</Badge> : null}
      {message.state === "queued" || message.state === "reasoning" ? <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>{t("shell:tars.conversation.cancel")}</Button> : null}
    </div>
    {message.reply !== null ? <Message from="assistant" aria-label={t("shell:tars.conversation.replyFrom", { name })} data-tars-reply=""><MessageContent>
      <p className={sx(styles.author)}><TarsMark className={sx(styles.authorMark)} />{name}</p>
      {/* Code, tables and diffs may claim the transcript's wide measure; prose keeps the reading column. */}
      <TranscriptWideScope enabled><MessageResponse fileLinkContext="none">{message.reply}</MessageResponse></TranscriptWideScope></MessageContent></Message> : null}
    {failure ? <p className={sx(styles.error)}>{failure}</p> : null}
    {message.state === "failed" ? <p className={sx(styles.text)}>{t("shell:tars.conversation.failedHint")}</p> : null}
    {origin?.kind === "followUp" && message.state === "cancelled"
      ? <p className={sx(styles.text)} data-tars-follow-up-superseded="">{t("shell:tars.followUp.superseded")}</p> : null}
    {lines.length ? <ul className={sx(styles.receipts)} aria-label={t("shell:tars.conversation.actions")}>
      {lines.map((receipt) => <li key={receipt.actionIndex} className={sx(styles.section)}>
        <div className={sx(styles.actions)}><Badge tone={receipt.status === "rejected" ? "warning" : "neutral"}>
          {t(`shell:tars.conversation.receipts.${receipt.status}`)}</Badge><span>{receipt.action.kind === "delegate" ? receipt.action.title
          : receipt.action.kind === "control" ? t(`shell:tars.conversation.control.${receipt.action.operation}`, { title: titleOf?.(receipt.action.responsibilityId) ?? receipt.action.responsibilityId })
            : receipt.action.kind === "ask" ? t("shell:tars.conversation.ask", { question: receipt.action.question })
              : receipt.action.kind === "show" ? t(`shell:tars.conversation.show.${receipt.action.view}`, { title: titleOf?.(receipt.action.responsibilityId) ?? receipt.action.responsibilityId })
              : receipt.action.kind === "publish" ? t("shell:tars.conversation.publish", { title: titleOf?.(receipt.action.responsibilityId) ?? receipt.action.responsibilityId })
              : t("shell:tars.conversation.reprioritize", { title: titleOf?.(receipt.action.responsibilityId) ?? receipt.action.responsibilityId, priority: receipt.action.priority })}</span>
          {receipt.action.kind === "delegate" && receipt.action.agentId
            ? <span className={sx(styles.text)} data-tars-delegate-agent={receipt.action.agentId}>{t("shell:tars.conversation.delegateAgent", { name: agentNameOf?.(receipt.action.agentId) ?? receipt.action.agentId })}</span> : null}</div>
        {receipt.error ? <p className={sx(styles.error)} data-tars-reason={receipt.reason ?? undefined}>{(() => { const key = receiptRefusalKey(receipt); return key ? t(key) : receipt.error; })()}</p> : null}
      </li>)}
    </ul> : null}
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
        icon={<FileDiff aria-hidden="true" className={sx(styles.toggleIcon)} />} aria-describedby={hintId} data-tars-working-changes-toggle="">
        {label}
      </Toggle>
    </Tooltip>
    <VisuallyHidden id={hintId}>{hint}</VisuallyHidden>
  </>;
}

export function TarsConversation({ state, name, initialSettings, titleOf, rowOf, workspaceNameOf, agentNameOf, flows, floor, responsibilities, onAnswer, sidePanel, controller, publish, composerStatus, draftBridge }: {
  state: TarsConversationState; name: string; initialSettings: TarsConversationSettings; titleOf?: (responsibilityId: string) => string | undefined;
  rowOf?: TarsDecisionCardProps["rowOf"];
  workspaceNameOf?: TarsDecisionCardProps["workspaceNameOf"];
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
      return !message;
    }).finally(() => setAnswering(false));
  };
  const cardHandler = onAnswer ? answer : undefined;
  // Esc on a waiting card leaves it waiting and hands focus back to the message box.
  const cardContext: TarsDecisionCardContext = { rowOf, workspaceNameOf, onDismiss: focusComposer };
  const insertDraft = (quote: string) => {
    appendTarsDraft(quote);
    focusComposer();
  };
  useImperativeHandle(controller, () => ({
    insert: insertDraft,
    answer, focusComposer,
  }));
  const unverifiedCard = (activity: { responsibilityId: string; revision: number }) =>
    decisions.find((view) => view.id === tarsUnverifiedDecisionId(activity.responsibilityId, activity.revision));
  return <div className={sx(styles.chat, floor && trayStyles.conversationFloor)}>
    <Conversation>
      <ConversationContent scrollScopeKey="personal-representative" autoScrollKey={scrollKey} data-testid="tars-transcript">
        {!state.available ? <p role="status">{t("shell:tars.conversation.unavailable")}</p> : null}
        {state.error ? <div role="alert" className={sx(styles.error)}><p>{state.error}</p><Button variant="secondary" size="xs" onClick={() => void state.refresh()}>{t("shell:tars.retry")}</Button></div> : null}
        {!state.conversation && state.available && !state.error ? <p role="status">{t("shell:tars.conversation.loading")}</p> : null}
        {state.conversation && !timeline.length ? <TarsWelcome name={name} onExample={insertDraft} /> : null}
        {timeline.map((item) => {
          if (item.kind === "message") return <TarsConversationMessage key={item.id} message={item.value} receipts={state.conversation!.receipts.filter((receipt) => receipt.messageId === item.value.id)} name={name} busy={state.busy || answering} onCancel={() => void state.cancel(item.value.id)}
            titleOf={titleOf} agentNameOf={agentNameOf} flows={flows} decisions={decisions} onAnswer={cardHandler} answerErrors={answerErrors} context={cardContext} publish={publish} />;
          if (item.kind === "publish") return <TarsPublishRecordLine key={item.id} record={item.value} row={publish?.rowOf(item.value.responsibilityId)}
            title={titleOf?.(item.value.responsibilityId)} onRetry={publish?.retryFor(item.value) ?? undefined} />;
          if (item.kind === "record") return <TarsActionRecordLine key={item.id} record={item.value} title={titleOf?.(item.value.action.responsibilityId)} />;
          if (item.kind === "event") return <p key={item.id} className={sx(styles.actionRecord)} data-tars-follow-up-exhausted={item.value.responsibilityId}>
            <span aria-hidden="true" className={sx(styles.glyph)}>↳</span><span>{t("shell:tars.followUp.exhausted", { title: titleOf?.(item.value.responsibilityId) ?? item.value.responsibilityId })}</span></p>;
          // Stave's unverified-completion choice is a decision card where its blocked notice would be.
          const card = item.value.activity.detailCode === "unverifiedCompletion" ? unverifiedCard(item.value.activity) : undefined;
          return card ? <TarsDecisionCard key={item.id} decision={card} titleOf={titleOf} {...cardContext} busy={state.busy || answering} onAnswer={cardHandler} error={answerErrors.get(card.id)} />
            : <TarsActivityNoticeLine key={item.id} notice={item.value} />;
        })}
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
        onAttachFilesChange={({ filePaths }) => attached.keep(filePaths)} onOpenFileSelector={() => attached.picker.current?.click()}
        onPasteFiles={({ files }) => attached.add(files)} windowShortcutsEnabled={false}
        onSubmit={async ({ text: submitted }) => {
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
          if (!sending) { state.reportSendFailure(); return; }
          const message = await state.send({ requestId: sending.requestId, text: submitted, ...(sending.attachments.length ? { attachments: [...sending.attachments] } : {}),
            ...(sending.includeWorkingChanges ? { includeWorkingChanges: true } : {}) }, initialSettings);
          settleTarsDraftSend({ ...sending, outcome: !message ? "unsent" : message.state === "failed" ? "failed" : "sent" });
        }} />
      {attached.error ? <p role="alert" className={sx(composerTray.footnote, composerTray.footnoteError)}>{attached.error}</p> : null}
      {tooLong ? <p id={composerErrorId} className={sx(composerTray.footnote, composerTray.footnoteError)} role="alert" data-tars-composer-error="tooLong">{t("shell:tars.conversation.tooLong")}</p> : null}
      </div>
    </div>
  </div>;
}
