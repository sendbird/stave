import { useId, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Ban, CircleCheck, CirclePause, CirclePlay, CircleStop, FastForward, Hand, MessageSquareReply, MessageSquareText, PencilLine, Plus, RotateCcw, ShieldAlert, ShieldCheck, SkipForward, Stamp, Undo2, type LucideIcon } from "lucide-react";
import { i18n, useTranslation } from "@/i18n";
import { Button } from "@/components/ui";
import { Badge } from "@/components/aui/components/Badge";
import { IconTile, iconTileGlyphSizes } from "@/components/aui/components/IconTile";
import { Kbd } from "@/components/aui/components/Kbd";
import { VisuallyHidden } from "@/components/aui/components/VisuallyHidden";
import { agentSurface } from "@/components/aui/recipes/agent-surface";
import { focusRing } from "@/components/aui/recipes/focus-ring";
import { sx } from "@/components/aui/utils/stylex";
import type { TarsAnswerSource } from "@/lib/tars/conversation";
import { tarsControlReasonKey } from "@/lib/tars/control-reasons";
import { describeTarsControlInput, isIrreversibleOption, tarsDecisionKeyChoice, type TarsDecisionOption, type TarsDecisionView } from "@/lib/tars/decisions";
import type { TarsControlOperation, TarsResponsibility } from "@/lib/tars/types";
import { TarsActionRecordLine } from "./TarsActionRecordLine";
import { tarsStyles } from "./tars.styles";
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

/**
 * One decision in the conversation. Waiting, it offers its options with their
 * key hints (1–4, Enter for the recommended one) and answers by click or key;
 * answered, invalid or retired, it folds to its one-line record.
 */
export function TarsDecisionCard({ decision, titleOf, busy = false, onAnswer, error, rowOf, workspaceNameOf, onDismiss, onOpenTask }: TarsDecisionCardProps) {
  const { t } = useTranslation(["shell"]);
  const questionId = useId();
  const subtitleId = useId();
  const hintId = useId();
  const cardRef = useRef<HTMLElement>(null);
  const lineRef = useRef<HTMLParagraphElement>(null);
  const hadFocus = useRef(false);
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
      return <div {...common}><TarsActionRecordLine record={decision.record} title={titleFor(decision, titleOf)} />{errorLine}</div>;
    }
    const answer = decision.answer;
    const sentence = decision.state === "answered" && answer
      ? t(`shell:tars.decision.record.${answer.status}`, { option: answeredOption(decision, titleOf), source: t(`shell:tars.decision.source.${answer.source}`) })
      : decision.state === "invalid"
        ? t(`shell:tars.decision.invalid.${decision.why === "targetEnded" ? "targetEnded" : "targetMoved"}`)
        : decision.why === "superseded" ? t("shell:tars.tray.proposalSuperseded")
          : t(`shell:tars.decision.retired.${decision.why === "movedOn" ? "movedOn" : "settled"}`);
    const followUp = decision.state !== "invalid" ? null
      : decision.reasked ? t("shell:tars.decision.reask.done") : decision.reask ? t("shell:tars.decision.reask.pending") : null;
    return <div {...common}>
      <p ref={lineRef} tabIndex={-1} className={sx(styles.record, focusRing.ring)}>
        <span aria-hidden="true" className={sx(tarsStyles.glyph)}>↳</span>
        <span>{sentence}</span>
        {decision.kind === "confirm" && answer ? null : <span className={sx(styles.recordSubject)}>{subject}</span>}
        {followUp ? <span>{followUp}</span> : null}
        {answer?.status === "rejected" ? <span className={sx(styles.error)} data-tars-reason={answer.reason ?? undefined}>{t(tarsControlReasonKey(answer.reason))}</span> : null}
      </p>
      {errorLine}
    </div>;
  }
  const answerable = Boolean(onAnswer) && decision.checked && !busy;
  const choose = (index: number, source: "click" | "key") => {
    if (!answerable) return;
    hadFocus.current = Boolean(cardRef.current?.contains(document.activeElement));
    onAnswer!(decision, index, source);
  };
  const hint = decision.options.length === 1
    ? t(decision.recommended === null ? "shell:tars.decision.keysHint.singleExplicit" : "shell:tars.decision.keysHint.single")
    : decision.recommended !== null ? t("shell:tars.decision.keysHint.withRecommended", { count: decision.options.length })
      : t("shell:tars.decision.keysHint.plain", { count: decision.options.length });
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (onDismiss && isTarsDecisionDismissKey(event)) {
      // Also keeps the view's own Esc (closing the side view) from acting on the same press.
      event.preventDefault();
      onDismiss();
      return;
    }
    handleTarsDecisionKey(event, decision, (index) => choose(index, "key"));
  };
  const optionItem = (option: TarsDecisionOption, index: number, withRationale: boolean) => {
    const recommended = decision.recommended === index;
    const rationale = withRationale ? optionRationale(option) : null;
    const rationaleId = `${questionId}-option-${index}`;
    return <li key={index} className={sx(styles.option)}>
      <Button type="button" size="xs" variant={recommended ? "default" : "outline"} xstyle={styles.optionButton}
        disabled={!answerable} data-tars-decision-option={index} aria-keyshortcuts={recommended ? `${index + 1} Enter` : `${index + 1}`}
        aria-describedby={rationale ? rationaleId : undefined} onClick={() => choose(index, "click")}>
        <span className={sx(styles.optionLabel)}>{describeTarsDecisionOption(decision, option)}</span>
        <span className={sx(styles.keys)} aria-hidden="true"><Kbd size="sm">{index + 1}</Kbd>{recommended ? <Kbd size="sm">{t("shell:tars.decision.enterKey")}</Kbd> : null}</span>
      </Button>
      {rationale || (withRationale && recommended) ? <p id={rationaleId} className={sx(styles.rationale)}>
        {recommended ? t("shell:tars.decision.recommended", { rationale: rationale ?? "" }) : rationale}</p> : null}
    </li>;
  };
  const failureLine = decision.failure ? <p className={sx(styles.record)} data-tars-decision-attempt="rejected">
    <span aria-hidden="true" className={sx(tarsStyles.glyph)}>↳</span>
    <span>{t("shell:tars.decision.record.rejected", { option: answeredOption(decision, titleOf, decision.failure), source: t(`shell:tars.decision.source.${decision.failure.source}`) })}</span>
    <span className={sx(styles.error)} data-tars-reason={decision.failure.reason ?? undefined}>{t(tarsControlReasonKey(decision.failure.reason))}</span>
  </p> : null;
  const dismissButton = onDismiss ? <Button type="button" size="2xs" variant="ghost" aria-keyshortcuts="Escape" title={t("shell:tars.decision.card.notNowHint")}
    data-tars-decision-dismiss="" onClick={onDismiss}>{t("shell:tars.decision.card.notNow")}
    <span className={sx(styles.keys)} aria-hidden="true"><Kbd size="sm">{t("shell:tars.decision.card.escKey")}</Kbd></span></Button> : null;
  const status = t(decision.kind === "confirm" ? "shell:tars.conversation.receipts.proposed" : "shell:tars.decision.waiting");
  if (decision.kind === "ask") {
    return <section ref={cardRef} {...common} role="group" tabIndex={0} aria-labelledby={questionId} aria-describedby={hintId}
      className={sx(styles.card, focusRing.ring)} onKeyDown={onKeyDown}>
      <div className={sx(styles.header)}>
        <p id={questionId} className={sx(styles.question)}>{subject}</p>
        <Badge size="md" tone="warning" xstyle={styles.status}>{status}</Badge>
      </div>
      <ul className={sx(styles.options)}>{decision.options.map((option, index) => optionItem(option, index, true))}</ul>
      {failureLine}
      {/* The key choices are on the buttons' keycaps; the sentence stays the card's accessible description. */}
      <VisuallyHidden id={hintId}>{hint}</VisuallyHidden>
      {dismissButton ? <div className={sx(styles.footer)}><div className={sx(styles.footerActions)}>{dismissButton}</div></div> : null}
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
  const candidates: Array<DetailRow | null> = [
    target.repository ? { key: "repository", label: t("shell:tars.decision.card.rows.repository"), value: target.repository, title: target.repositoryPath ?? undefined } : null,
    target.workspace ? { key: "workspace", label: t("shell:tars.decision.card.rows.workspace"), value: target.workspace } : null,
    target.revision !== null ? { key: "revision", label: t("shell:tars.decision.card.rows.revision"), value: t("shell:tars.decision.card.revision", { revision: target.revision }) } : null,
    payload ? { key: payload.key, label: t(`shell:tars.decision.card.rows.${payload.key}`), value: payload.value, note: truncation ?? undefined } : null,
    { key: "effect", label: t("shell:tars.decision.card.rows.effect"), value: effect },
  ];
  const rows = candidates.filter((row): row is DetailRow => row !== null);
  return <section ref={cardRef} {...common} role="group" tabIndex={0} aria-labelledby={`${questionId} ${subtitleId}`} aria-describedby={hintId}
    className={sx(styles.card, focusRing.ring)} onKeyDown={onKeyDown} data-tars-decision-risk={irreversible ? "irreversible" : undefined}>
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
    {decision.kind === "unverifiedCompletion" ? <ul className={sx(styles.options)}>{decision.options.map((value, index) => optionItem(value, index, true))}</ul> : null}
    {failureLine}
    <div className={sx(styles.footer)}>
      <VisuallyHidden id={hintId}>{hint}</VisuallyHidden>
      <div className={sx(styles.footerActions)}>
        {dismissButton}
        {decision.kind === "confirm" ? <ul className={sx(styles.footerOptions)}>{decision.options.map((value, index) => optionItem(value, index, false))}</ul> : null}
      </div>
    </div>
    {errorLine}
  </section>;
}
