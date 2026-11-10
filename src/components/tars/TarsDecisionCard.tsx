import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Ban, CircleCheck, CirclePause, CirclePlay, CircleStop, FastForward, Hand, MessageCircleQuestion, MessageSquareReply, MessageSquareText, PencilLine, Plus, RotateCcw, ShieldAlert, ShieldCheck, SkipForward, Stamp, Undo2, type LucideIcon } from "lucide-react";
import { i18n, useTranslation } from "@/i18n";
import { Button } from "@/components/ui";
import { Badge } from "@/components/aui/components/Badge";
import { IconTile, iconTileGlyphSizes } from "@/components/aui/components/IconTile";
import { Kbd } from "@/components/aui/components/Kbd";
import { VisuallyHidden } from "@/components/aui/components/VisuallyHidden";
import { agentSurface } from "@/components/aui/recipes/agent-surface";
import { focusRing } from "@/components/aui/recipes/focus-ring";
import { sx } from "@/components/aui/utils/stylex";
import type { TarsAnswerSource, TarsDecisionAnswer } from "@/lib/tars/conversation";
import { tarsControlReasonKey } from "@/lib/tars/control-reasons";
import { describeTarsControlInput, isIrreversibleOption, tarsDecisionKeyChoice, tarsQuestionKeyAction, type TarsDecisionOption, type TarsDecisionView } from "@/lib/tars/decisions";
import type { TarsControlOperation, TarsResponsibility } from "@/lib/tars/types";
import { QuestionOptionRow, questionOptionRowStyles } from "@/components/ai-elements/question-option-row";
import { TARS_RECORD_STATE, TarsActionRecordLine, TarsMessageDeliveryLine } from "./TarsActionRecordLine";
import { TarsRecordDetail, TarsRecordList, TarsRecordRow } from "./TarsRecord";
import { tarsDecisionStyles as styles } from "./tars-decision.styles";

type TitleOf = (responsibilityId: string) => string | undefined;
/** One row of a confirmation's details: label, value and, for a request cut to fit, the note under it. */
type DetailRow = { key: string; label: string; value: string; title?: string; note?: ReactNode };

function titleFor(decision: TarsDecisionView, titleOf?: TitleOf) {
  const id = decision.targets[0]?.responsibilityId ?? "";
  return titleOf?.(id) ?? id;
}

/** What the decision is about: the question, the proposed control, or the work Stave could not verify. */
export function describeTarsDecisionSubject(decision: TarsDecisionView, titleOf?: TitleOf): string {
  if (decision.kind === "ask") return decision.question ?? "";
  const title = titleFor(decision, titleOf);
  if (decision.kind === "unverifiedCompletion") return i18n.t("shell:tars.decision.unverified.question", { title });
  const option = decision.options[0];
  return option?.kind === "control" ? i18n.t(`shell:tars.conversation.control.${option.control.operation}`, { title }) : "";
}

/** A button's words: the model's label for an ask, Confirm for a proposal, Stave's own words otherwise. */
export function describeTarsDecisionOption(decision: TarsDecisionView, option: TarsDecisionOption): string {
  if (option.kind === "verify") return i18n.t("shell:tars.decision.option.verify");
  if (option.kind === "reply" || option.label) return option.label ?? "";
  return decision.kind === "confirm" ? i18n.t("shell:tars.conversation.confirm") : i18n.t(`shell:tars.decision.option.${option.control.operation}`);
}

function optionRationale(option: TarsDecisionOption): string | null {
  if (option.kind === "verify") return i18n.t("shell:tars.decision.option.verifyRationale");
  if (option.kind === "reply" || option.rationale) return option.rationale;
  return option.control.operation === "acceptCompletion" ? i18n.t("shell:tars.decision.option.acceptRationale")
    : option.control.operation === "cancel" ? i18n.t("shell:tars.decision.option.cancelRationale") : null;
}

/** The chosen option in the record line: a proposal names its control, other options their label. */
function answeredOption(decision: TarsDecisionView, titleOf?: TitleOf, answer = decision.answer!): string {
  if (decision.kind === "confirm") return describeTarsDecisionSubject(decision, titleOf);
  const option = decision.options[answer.optionIndex];
  return answer.label ?? (option ? describeTarsDecisionOption(decision, option) : "");
}

/**
 * The card's keys, scoped to the card: the handler sits on the card element,
 * so only a key pressed while the card or one of its options has focus
 * reaches it. The composer is outside the card and keeps every key.
 */
export function handleTarsDecisionKey(event: Pick<KeyboardEvent<HTMLElement>, "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "target" | "preventDefault"> & { nativeEvent?: { isComposing?: boolean } },
  decision: TarsDecisionView, onChoose: (optionIndex: number) => void) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.nativeEvent?.isComposing) return;
  const target = event.target as { closest?: (selector: string) => { getAttribute(name: string): string | null } | null } | null;
  const focused = target?.closest?.("[data-tars-decision-option]")?.getAttribute("data-tars-decision-option");
  const index = tarsDecisionKeyChoice(event.key, decision, focused == null ? null : Number(focused));
  if (index === null) return;
  // Also stops a focused option's own Enter activation, so the answer is recorded once, as a key.
  event.preventDefault();
  onChoose(index);
}

/**
 * Esc on a waiting card, with no modifier and outside an IME composition. It
 * never answers: it leaves the decision waiting and moves focus elsewhere.
 */
export function isTarsDecisionDismissKey(event: Pick<KeyboardEvent<HTMLElement>, "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "defaultPrevented"> & { nativeEvent?: { isComposing?: boolean } }) {
  return event.key === "Escape" && !event.defaultPrevented && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.nativeEvent?.isComposing;
}

const OPERATION_ICON: Record<TarsControlOperation, LucideIcon> = {
  pause: CirclePause, resume: CirclePlay, cancel: CircleStop, takeover: Hand, handBack: Undo2, acceptCompletion: CircleCheck, startNow: FastForward,
  extend: Plus, retryStage: RotateCcw, skipStage: SkipForward, signOff: Stamp,
  approve: ShieldCheck, deny: Ban, answer: MessageSquareReply, message: MessageSquareText, requestChanges: PencilLine,
};

/** What a confirmation card shows about its target: where it runs and which revision it was asked for. Unknown rows are left out. */
export function describeTarsDecisionTarget(decision: TarsDecisionView, context: TarsDecisionCardContext) {
  const target = decision.targets[0];
  const row = target ? context.rowOf?.(target.responsibilityId) : undefined;
  const repository = row?.repositoryPath ? row.repositoryPath.split(/[\\/]/).filter(Boolean).at(-1) ?? row.repositoryPath : null;
  const workspaceId = row ? row.executionWorkspaceId ?? row.workspaceId : null;
  return {
    repository, repositoryPath: row?.repositoryPath ?? null,
    workspace: workspaceId ? context.workspaceNameOf?.(workspaceId) ?? null : null,
    revision: target ? target.expectedRevision : null,
  };
}

/** What a decision card can show about its target, and where Esc leaves it. */
export interface TarsDecisionCardContext {
  rowOf?: (responsibilityId: string) => TarsResponsibility | undefined;
  workspaceNameOf?: (workspaceId: string) => string | undefined;
  /** "Not now" and Esc: the decision keeps waiting and focus goes here. Absent: no dismiss, Esc reaches what is around the card. */
  onDismiss?: () => void;
  /** Opens the task a request waits in, where a request cut to fit shows whole. Absent: the card only says it was cut. */
  onOpenTask?: (target: { responsibilityId: string; taskId: string; workspaceId: string }) => void;
}

export interface TarsDecisionCardProps extends TarsDecisionCardContext {
  decision: TarsDecisionView;
  titleOf?: TitleOf;
  busy?: boolean;
  /** Absent: the card shows its state without buttons. */
  onAnswer?: (decision: TarsDecisionView, optionIndex: number, source: Extract<TarsAnswerSource, "click" | "key">) => void;
  /** A translated refusal or failure of the last answer. */
  error?: string | null;
}

/** A folded record's outcome word: a proposal is confirmed, a question answered. */
function outcomeKey(decision: TarsDecisionView, status: TarsDecisionAnswer["status"]) {
  if (status === "rejected") return "shell:tars.decision.outcome.rejected" as const;
  if (status === "pending") return "shell:tars.decision.outcome.pending" as const;
  return decision.kind === "confirm" ? "shell:tars.decision.outcome.confirmed" as const : "shell:tars.decision.outcome.answered" as const;
}

/**
 * A question card's keys, scoped to the card like `handleTarsDecisionKey`:
 * 1–4 choose that option (and move focus to it), Enter answers the chosen
 * one. Enter on one of the card's buttons stays that button's own press.
 */
export function handleTarsQuestionKey(event: Pick<KeyboardEvent<HTMLElement>, "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "target" | "preventDefault"> & { nativeEvent?: { isComposing?: boolean } },
  decision: TarsDecisionView, selected: number | null, handlers: { select: (index: number) => void; answer: (index: number) => void }) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.nativeEvent?.isComposing) return;
  const target = event.target as { closest?: (selector: string) => unknown } | null;
  if (event.key === "Enter" && target?.closest?.("button, a")) return;
  const action = tarsQuestionKeyAction(event.key, decision, selected);
  if (!action) return;
  event.preventDefault();
  if (action.kind === "select") handlers.select(action.index); else handlers.answer(action.index);
}

/**
 * One decision in the conversation. A confirmation offers its one control
 * with its key hints (1, and Enter when it is recommended); a question (an
 * ask, or Stave's own choice for a completion it could not verify) offers its
 * options as a radio group, each with its label, why on its own line and its
 * number key, and answers the chosen one with Answer or Enter. Answered,
 * invalid or retired, it folds to its record row.
 */
export function TarsDecisionCard({ decision, titleOf, busy = false, onAnswer, error, rowOf, workspaceNameOf, onDismiss, onOpenTask }: TarsDecisionCardProps) {
  const { t } = useTranslation(["shell"]);
  const questionId = useId();
  const subtitleId = useId();
  const hintId = useId();
  const optionsName = useId();
  const cardRef = useRef<HTMLElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const hadFocus = useRef(false);
  // The option the user chose; until they choose, the recommended one (never an irreversible one) is.
  const [picked, setPicked] = useState<number | null>(null);
  const waiting = decision.state === "waiting";
  // When the focused card folds after an answer, focus stays on its record instead of falling to the page.
  useLayoutEffect(() => {
    if (!waiting && hadFocus.current) { lineRef.current?.focus(); hadFocus.current = false; }
  }, [waiting]);
  const subject = describeTarsDecisionSubject(decision, titleOf);
  const errorLine = error ? <p className={sx(styles.error)} role="alert">{error}</p> : null;
  const common = { "data-tars-decision": decision.id, "data-tars-decision-kind": decision.kind, "data-tars-decision-state": decision.state };
  if (!waiting) {
    if (decision.state === "answered" && !decision.answer && decision.record) {
      return <div {...common}><TarsRecordList><TarsActionRecordLine record={decision.record} title={titleFor(decision, titleOf)} /></TarsRecordList>{errorLine}</div>;
    }
    const answer = decision.state === "answered" ? decision.answer : null;
    const followUp = decision.state !== "invalid" ? null
      : decision.reasked ? t("shell:tars.decision.reask.done") : decision.reask ? t("shell:tars.decision.reask.pending") : null;
    const row = answer
      ? <TarsRecordRow ref={lineRef} focusable state={TARS_RECORD_STATE[answer.status]} lead={answeredOption(decision, titleOf, answer)}
        subject={decision.kind === "confirm" ? undefined : subject} meta={t(`shell:tars.record.source.${answer.source}`)} status={t(outcomeKey(decision, answer.status))}
        detail={<>
          {answer.status === "rejected" ? <TarsRecordDetail data-tars-reason={answer.reason ?? undefined}>{t(tarsControlReasonKey(answer.reason))}</TarsRecordDetail> : null}
          {decision.delivery ? <TarsMessageDeliveryLine delivery={decision.delivery} /> : null}
        </>} />
      // No longer open: what was asked leads, and why it stopped waiting (and whether Tars asks again) is the line under it.
      : <TarsRecordRow ref={lineRef} focusable state="skipped" lead={subject} detail={<TarsRecordDetail>
        {decision.state === "invalid" ? t(`shell:tars.decision.invalid.${decision.why === "targetEnded" ? "targetEnded" : "targetMoved"}`)
          : decision.why === "superseded" ? t("shell:tars.tray.proposalSuperseded") : t(`shell:tars.decision.retired.${decision.why === "movedOn" ? "movedOn" : "settled"}`)}
        {followUp ? <> {followUp}</> : null}
      </TarsRecordDetail>} />;
    return <div {...common}><TarsRecordList>{row}</TarsRecordList>{errorLine}</div>;
  }
  const answerable = Boolean(onAnswer) && decision.checked && !busy;
  const choose = (index: number, source: "click" | "key") => {
    if (!answerable) return;
    hadFocus.current = Boolean(cardRef.current?.contains(document.activeElement));
    onAnswer!(decision, index, source);
  };
  const question = decision.kind !== "confirm";
  const selected = picked ?? decision.recommended;
  const count = decision.options.length;
  const hint = question
    ? t(decision.recommended !== null ? "shell:tars.decision.keysHint.questionWithRecommended" : "shell:tars.decision.keysHint.question", { count })
    : t(decision.recommended === null ? "shell:tars.decision.keysHint.singleExplicit" : "shell:tars.decision.keysHint.single");
  const select = (index: number) => {
    setPicked(index);
    cardRef.current?.querySelector<HTMLInputElement>(`input[name="${CSS.escape(optionsName)}"][value="${index}"]`)?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (onDismiss && isTarsDecisionDismissKey(event)) {
      // Also keeps the view's own Esc (closing the side view) from acting on the same press.
      event.preventDefault();
      onDismiss();
      return;
    }
    if (question) handleTarsQuestionKey(event, decision, selected, { select, answer: (index) => choose(index, "key") });
    else handleTarsDecisionKey(event, decision, (index) => choose(index, "key"));
  };
  // A confirmation's one control: a button with its keys; recommended, it is the filled primary.
  const confirmButton = (option: TarsDecisionOption, index: number) => {
    const recommended = decision.recommended === index;
    return <li key={index} className={sx(styles.option)}>
      <Button type="button" size="xs" variant={recommended ? "default" : "outline"} xstyle={styles.optionButton}
        disabled={!answerable} data-tars-decision-option={index} aria-keyshortcuts={recommended ? `${index + 1} Enter` : `${index + 1}`}
        onClick={() => choose(index, "click")}>
        <span className={sx(styles.optionLabel)}>{describeTarsDecisionOption(decision, option)}</span>
        <span className={sx(styles.keys)} aria-hidden="true"><Kbd size="sm">{index + 1}</Kbd>{recommended ? <Kbd size="sm">{t("shell:tars.decision.enterKey")}</Kbd> : null}</span>
      </Button>
    </li>;
  };
  // A question's options: one radio row each (label, why on its own line, its number key), like every other question in Stave.
  // The card already carries the key hint as its description; the group is named by the question alone.
  const options = question ? <div role="radiogroup" aria-labelledby={questionId}
    className={sx(questionOptionRowStyles.list)} data-tars-decision-options="">
    {decision.options.map((option, index) => <QuestionOptionRow key={index} kind="radio" name={optionsName} divided={index > 0} disabled={!answerable}
      row={{ value: String(index), label: describeTarsDecisionOption(decision, option), description: optionRationale(option), recommended: decision.recommended === index,
        selected: selected === index, shortcut: index < 4 ? index + 1 : null, preview: null }}
      tag={isIrreversibleOption(option) ? <Badge size="sm" tone="danger" variant="outlined">{t("shell:tars.decision.card.risk")}</Badge> : null}
      onChange={() => setPicked(index)} />)}
  </div> : null;
  const failureLine = decision.failure ? <TarsRecordList><TarsRecordRow state="refused" data-tars-decision-attempt="rejected"
    lead={answeredOption(decision, titleOf, decision.failure)} meta={t(`shell:tars.record.source.${decision.failure.source}`)} status={t("shell:tars.decision.outcome.rejected")}
    detail={<TarsRecordDetail data-tars-reason={decision.failure.reason ?? undefined}>{t(tarsControlReasonKey(decision.failure.reason))}</TarsRecordDetail>} /></TarsRecordList> : null;
  const dismissButton = onDismiss ? <Button type="button" size="xs" variant="ghost" aria-keyshortcuts="Escape" title={t("shell:tars.decision.card.notNowHint")}
    data-tars-decision-dismiss="" onClick={onDismiss}>{t("shell:tars.decision.card.notNow")}
    <span className={sx(styles.keys)} aria-hidden="true"><Kbd size="sm">{t("shell:tars.decision.card.escKey")}</Kbd></span></Button> : null;
  // Answer is the primary action, except when the chosen option cannot be undone: then it carries the danger tone and is never the filled primary.
  const chosen = selected === null ? null : decision.options[selected] ?? null;
  const answerButton = question ? <Button type="button" size="xs" variant={chosen && isIrreversibleOption(chosen) ? "destructive" : "default"}
    disabled={!answerable || selected === null} aria-keyshortcuts="Enter" data-tars-decision-submit="" onClick={() => { if (selected !== null) choose(selected, "click"); }}>
    {t("shell:tars.decision.card.answer")}<span className={sx(styles.keys)} aria-hidden="true"><Kbd size="sm">{t("shell:tars.decision.enterKey")}</Kbd></span>
  </Button> : null;
  const footer = <div className={sx(styles.footer)}>
    {/* The key choices are on the keycaps; the sentence stays the card's accessible description. */}
    <VisuallyHidden id={hintId}>{hint}</VisuallyHidden>
    <div className={sx(styles.footerActions)}>
      {dismissButton}
      {question ? answerButton : <ul className={sx(styles.footerOptions)}>{decision.options.map((value, index) => confirmButton(value, index))}</ul>}
    </div>
  </div>;
  const status = t(decision.kind === "confirm" ? "shell:tars.conversation.receipts.proposed" : "shell:tars.decision.waiting");
  if (decision.kind === "ask") {
    const about = decision.targets[0] ? titleFor(decision, titleOf) : null;
    return <section ref={cardRef} {...common} role="group" tabIndex={0} aria-labelledby={questionId} aria-describedby={hintId}
      className={sx(styles.card, focusRing.ring)} onKeyDown={onKeyDown}>
      <div className={sx(styles.confirmHeader)}>
        <IconTile size="sm" tone="warning" xstyle={styles.icon}><MessageCircleQuestion aria-hidden size={iconTileGlyphSizes.sm} /></IconTile>
        <div className={sx(styles.heading)}>
          <p id={questionId} className={sx(styles.title)}>{subject}</p>
          {about ? <p className={sx(styles.subtitle)}>{t("shell:tars.decision.card.about", { title: about })}</p> : null}
        </div>
        <div className={sx(styles.tags)}><Badge size="md" tone="warning">{status}</Badge></div>
      </div>
      {options}
      {failureLine}
      {footer}
      {errorLine}
    </section>;
  }
  // A confirmation: what it does, to which work, where, and whether it can be undone.
  const option = decision.options[0];
  const operation: TarsControlOperation | null = decision.kind === "confirm" && option?.kind === "control" ? option.control.operation : null;
  const Icon = operation ? OPERATION_ICON[operation] : ShieldAlert;
  const irreversible = decision.options.some(isIrreversibleOption);
  const target = describeTarsDecisionTarget(decision, { rowOf, workspaceNameOf });
  const effect = operation ? t(`shell:tars.decision.card.effect.${operation}`) : t("shell:tars.decision.card.unverifiedEffect");
  // A task operation shows exactly what it answers or sends before anyone confirms it.
  const payload = option?.kind === "control" ? describeTarsControlInput(option.control, target ? rowOf?.(option.control.responsibilityId) : undefined) : null;
  // A request cut to fit says so under its text and opens the task that shows it whole: part of a command never reads as all of it.
  const source = payload?.key === "request" && payload.truncated ? payload.source : null;
  const responsibilityId = option?.kind === "control" ? option.control.responsibilityId : null;
  const truncation = payload?.key === "request" && payload.truncated ? <span className={sx(styles.truncation)} data-tars-decision-truncated="">
    <span>{t("shell:tars.decision.card.truncated")}</span>
    {source && responsibilityId && onOpenTask ? <Button type="button" size="2xs" variant="outline" data-tars-decision-open-task=""
      onClick={() => onOpenTask({ responsibilityId, ...source })}>{t("shell:tars.openTask")}</Button> : null}
  </span> : null;
  // The revision the decision is bound to stays an attribute, not a row: it means nothing to people.
  const candidates: Array<DetailRow | null> = [
    target.repository ? { key: "repository", label: t("shell:tars.decision.card.rows.repository"), value: target.repository, title: target.repositoryPath ?? undefined } : null,
    target.workspace ? { key: "workspace", label: t("shell:tars.decision.card.rows.workspace"), value: target.workspace } : null,
    payload ? { key: payload.key, label: t(`shell:tars.decision.card.rows.${payload.key}`), value: payload.value, note: truncation ?? undefined } : null,
    { key: "effect", label: t("shell:tars.decision.card.rows.effect"), value: effect },
  ];
  const rows = candidates.filter((row): row is DetailRow => row !== null);
  return <section ref={cardRef} {...common} role="group" tabIndex={0} aria-labelledby={`${questionId} ${subtitleId}`} aria-describedby={hintId}
    className={sx(styles.card, focusRing.ring)} onKeyDown={onKeyDown} data-tars-decision-risk={irreversible ? "irreversible" : undefined}
    data-tars-decision-revision={target.revision ?? undefined}>
    <div className={sx(styles.confirmHeader)}>
      <IconTile size="sm" tone={irreversible ? "danger" : "warning"} xstyle={styles.icon}><Icon aria-hidden size={iconTileGlyphSizes.sm} /></IconTile>
      <div className={sx(styles.heading)}>
        <p id={questionId} className={sx(styles.title)}>{operation ? t(`shell:tars.decision.card.title.${operation}`) : t("shell:tars.decision.card.unverifiedTitle")}</p>
        <p id={subtitleId} className={sx(styles.subtitle)}>{titleFor(decision, titleOf)}</p>
      </div>
      <div className={sx(styles.tags)}>
        {irreversible ? <Badge size="md" tone="danger" variant="outlined" data-tars-decision-risk-tag="">{t("shell:tars.decision.card.risk")}</Badge> : null}
        <Badge size="md" tone="warning">{status}</Badge>
      </div>
    </div>
    <dl className={sx(agentSurface.well, styles.rows)} aria-label={t("shell:tars.decision.card.details")} data-tars-decision-rows={rows.map((row) => row.key).join(",")}>
      {rows.map((row) => <div key={row.key} className={sx(styles.row)} data-tars-decision-row={row.key}>
        <dt className={sx(styles.rowLabel)}>{row.label}</dt>
        <dd className={sx(styles.rowValue, row.key === "request" && styles.rowValueLines)} title={row.title}>{row.value}{row.note}</dd>
      </div>)}
    </dl>
    {options}
    {failureLine}
    {footer}
    {errorLine}
  </section>;
}
