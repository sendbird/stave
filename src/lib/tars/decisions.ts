import {
  TARS_IRREVERSIBLE_OPERATIONS, isTarsAnswerRetryable, isTarsHoldableAction, tarsConfirmationRequestId, withoutIrreversibleRecommendation,
} from "./conversation";
import type {
  TarsActionReceipt, TarsActionRecord, TarsControlAction, TarsDecisionAction, TarsDecisionAnswer, TarsMessage, TarsMessageDelivery, TarsMessageOrigin,
} from "./conversation";
import type { TarsNeverRuleMatch } from "./autonomy";
import type { TarsActivity, TarsDecisionKind, TarsPendingRequest, TarsResponsibility } from "./types";

/**
 * One decision shape for three sources: a control the model proposed that
 * waits for Confirm (`confirm`), Stave's own choice for a completion it could
 * not verify (`unverifiedCompletion`) and a question the model asked (`ask`).
 * The conversation card, the short-answer binding, the host's answer path and
 * the re-ask scan all read this one projection of saved state.
 */

export function tarsAskDecisionId(messageId: string, actionIndex: number) {
  return `ask:${messageId}:${actionIndex}`;
}
export function tarsUnverifiedDecisionId(responsibilityId: string, revision: number) {
  return `unverified:${responsibilityId}:${revision}`;
}
/** A confirmation keeps its proposal's request id, so Fleet, the tray and the card join one record. */
export function tarsAnswerActRequestId(decisionId: string) {
  return decisionId.startsWith("confirm:") ? decisionId : `answer:${decisionId}`;
}
/** The message a reply option sends; one per decision. */
export function tarsAnswerMessageRequestId(decisionId: string) {
  return `answer:${decisionId}`;
}
/** The automatic follow-up for an invalidated decision; one per decision. */
export function tarsReaskRequestId(decisionId: string) {
  return `reask:${decisionId}`;
}
/** Message request ids only the host mints; a typed message may not claim them. */
export function isTarsReservedMessageRequestId(requestId: string) {
  return /^(?:answer|reask|followup):/.test(requestId);
}

export type TarsParsedDecisionId =
  | { kind: "confirm" | "ask"; messageId: string; actionIndex: number }
  | { kind: "unverifiedCompletion"; responsibilityId: string; revision: number };

export function parseTarsDecisionId(id: string): TarsParsedDecisionId | null {
  const message = /^(confirm|ask):([A-Za-z0-9._-]+):([0-7])$/.exec(id);
  if (message) return { kind: message[1] as "confirm" | "ask", messageId: message[2]!, actionIndex: Number(message[3]) };
  const unverified = /^unverified:([A-Za-z0-9._-]+):([1-9][0-9]{0,8})$/.exec(id);
  return unverified ? { kind: "unverifiedCompletion", responsibilityId: unverified[1]!, revision: Number(unverified[2]) } : null;
}

type ControlRequest = Pick<TarsControlAction, "responsibilityId" | "expectedRevision" | "operation" | "input">;

/**
 * What a task operation's card shows before the user confirms it: the
 * request it answers (tool and summary, as the task last showed them) or the
 * exact words it sends. Null for controls without input. A request the host
 * cut to fit is `truncated`, with the task that shows it whole (`source`),
 * so the card never presents part of a command as the whole of it.
 */
export function describeTarsControlInput(control: ControlRequest, row: Pick<TarsResponsibility, "pendingRequests"> | undefined):
  | { key: "request"; value: string; truncated: boolean; source: Pick<TarsPendingRequest, "taskId" | "workspaceId"> | null }
  | { key: "answers" | "words"; value: string } | null {
  const input = control.input;
  if (!input) return null;
  if (input.text !== undefined) return { key: "words", value: input.text };
  const request = row?.pendingRequests?.find((entry) => entry.ref === input.requestRef);
  if (input.answers) {
    const questionOf = (key: string) => request?.questions?.find((question) => question.key === key)?.question || key;
    return { key: "answers", value: Object.entries(input.answers).map(([key, answer]) => `${questionOf(key)} → ${answer}`).join("\n") };
  }
  return { key: "request", value: request ? [request.toolName, request.summary].filter(Boolean).join(": ") : input.requestRef ?? "",
    truncated: request?.truncated === true, source: request ? { taskId: request.taskId, workspaceId: request.workspaceId } : null };
}

/** The work actions the host can hold as a proposal: new work, or a priority change. */
export type TarsWorkProposalAction = Extract<TarsDecisionAction, { kind: "delegate" | "reprioritize" }>;

/** Whether a receipt is a work proposal the host held (or had held) for the user's confirmation. */
export function isTarsWorkProposal<R extends Pick<TarsActionReceipt, "action">>(receipt: R): receipt is R & { action: TarsWorkProposalAction } {
  return receipt.action.kind === "delegate" || receipt.action.kind === "reprioritize";
}

/**
 * One option. `label` null names a Stave option by its control. `verify` only
 * puts a request for new verification work in the composer; it never acts.
 */
export type TarsDecisionOption =
  | { kind: "control"; control: ControlRequest; label: string | null; rationale: string | null }
  /** A held work proposal (a delegation or a priority change): Confirm applies the saved action through the host. */
  | { kind: "proposal"; action: TarsWorkProposalAction; label: null; rationale: null }
  | { kind: "reply"; label: string; rationale: string }
  | { kind: "verify"; responsibilityId: string };

/**
 * `waiting`: the user can answer. `answered`: an answer (or, for a proposed
 * control, a confirmation from Fleet or the tray) settled it. `invalid`: a
 * target moved past its revision or ended. `retired`: it stopped waiting for
 * a reason that needs nothing from anyone (a newer proposal, the conversation
 * moving on, a sibling answered, or the work settled elsewhere).
 */
export type TarsDecisionState = "waiting" | "answered" | "invalid" | "retired";
export type TarsDecisionWhy = "targetMoved" | "targetEnded" | "superseded" | "movedOn" | "settled";

export interface TarsDecisionView {
  id: string;
  kind: TarsDecisionKind;
  messageId: string | null;
  actionIndex: number | null;
  /** An ask's question as the model wrote it; null for Stave's own decisions. */
  question: string | null;
  targets: Array<{ responsibilityId: string; expectedRevision: number }>;
  options: TarsDecisionOption[];
  recommended: number | null;
  state: TarsDecisionState;
  why: TarsDecisionWhy | null;
  /** False while target-bound liveness is unknown (no snapshot read yet): nothing is offered on a guess. */
  checked: boolean;
  /** The answer that settled it; a retryable refusal is `failure` instead and leaves it open. */
  answer: TarsDecisionAnswer | null;
  /** The last attempt the host refused for a reason that leaves the decision open. */
  failure: TarsDecisionAnswer | null;
  /** It belongs to the newest message and nothing was said after it: only then may a short answer bind to it. */
  latest: boolean;
  /** A confirmation made outside the card (Fleet, the tray): its record. */
  record: TarsActionRecord | null;
  /** Words it sent to a busy task: where their delivery stands (`TarsMessageDelivery`); null otherwise. */
  delivery: TarsMessageDelivery | null;
  /** The same saved record owns delivery withdrawal from every history surface. */
  deliveryRecord?: TarsActionRecord | null;
  since: string;
  /** Invalid, asked by Tars and still the newest message: Tars asks once more by itself. */
  reask: boolean;
  /** Tars already asked again for this decision. */
  reasked: boolean;
  /** The user's "never do" rules the host matched when it held this action; absent when none did. */
  matchedRules?: readonly TarsNeverRuleMatch[];
}

export interface TarsDecisionSources {
  /** Conversation order, oldest first. */
  /** Saved messages or a window's views of them; attachments are never read. */
  messages: readonly Omit<TarsMessage, "attachments">[];
  receipts: readonly TarsActionReceipt[];
  records: readonly TarsActionRecord[];
  answers: readonly TarsDecisionAnswer[];
  activity: readonly TarsActivity[];
  /** Null before a snapshot was read. */
  responsibilities: readonly TarsResponsibility[] | null;
}

const ENDED = new Set<TarsResponsibility["state"]>(["completed", "cancelled"]);

function isUnverified(row: Pick<TarsResponsibility, "state" | "detailCode">) {
  return row.state === "blocked" && row.detailCode === "unverifiedCompletion";
}

/** Stave's options for a completion it could not verify, at the revision that waits. */
export function tarsUnverifiedOptions(responsibilityId: string, revision: number): TarsDecisionOption[] {
  return [
    { kind: "control", control: { responsibilityId, expectedRevision: revision, operation: "acceptCompletion" }, label: null, rationale: null },
    { kind: "control", control: { responsibilityId, expectedRevision: revision, operation: "cancel" }, label: null, rationale: null },
    { kind: "verify", responsibilityId },
  ];
}

/** Whether an answer settles its decision; a retryable refusal leaves it open. */
export function isTarsAnswerSettling(answer: Pick<TarsDecisionAnswer, "status" | "reason">) {
  return !isTarsAnswerRetryable(answer);
}

/** The responsibilities a decision's options control: one for a proposal, each control target for an ask. */
export function tarsDecisionTargets(receipt: Pick<TarsActionReceipt, "action">): string[] {
  const { action } = receipt;
  if (action.kind === "control") return [action.responsibilityId];
  if (action.kind !== "ask") return [];
  return [...new Set(action.options.flatMap((option) => option.effect.kind === "control" ? [option.effect.responsibilityId] : []))];
}

/** A decision's id from its receipt, for the kinds that are decisions. */
export function tarsReceiptDecisionId(receipt: Pick<TarsActionReceipt, "action" | "messageId" | "actionIndex">): string | null {
  return receipt.action.kind === "ask" ? tarsAskDecisionId(receipt.messageId, receipt.actionIndex)
    : receipt.action.kind === "control" ? tarsConfirmationRequestId(receipt.messageId, receipt.actionIndex) : null;
}

export function projectTarsDecisions(sources: TarsDecisionSources): TarsDecisionView[] {
  const rows = sources.responsibilities ? new Map(sources.responsibilities.map((row) => [row.id, row])) : null;
  const settling = new Map(sources.answers.filter(isTarsAnswerSettling).map((answer) => [answer.decisionId, answer]));
  const failures = new Map(sources.answers.filter(isTarsAnswerRetryable).map((answer) => [answer.decisionId, answer]));
  const records = new Map(sources.records.map((record) => [record.requestId, record]));
  const order = new Map(sources.messages.map((message, index) => [message.id, index]));
  const lastMessage = sources.messages.at(-1);
  // Tars's own follow-up about other work is not the conversation moving on: a waiting question stays open.
  const lastSpoken = sources.messages.findLastIndex((message) => message.origin?.kind !== "followUp");
  const reasked = new Set(sources.messages.flatMap((message) => message.origin?.kind === "reask" ? [message.origin.decisionId] : []));
  // At most one automatic follow-up per message, whichever of its decisions caused it.
  const reaskedMessages = new Set([...reasked].flatMap((id) => { const parsed = parseTarsDecisionId(id); return parsed && parsed.kind !== "unverifiedCompletion" ? [parsed.messageId] : []; }));
  const receipts = [...sources.receipts].sort((left, right) =>
    (order.get(left.messageId) ?? -1) - (order.get(right.messageId) ?? -1) || left.actionIndex - right.actionIndex);
  // The newest message that proposed a control speaks for its responsibility (`readLatestTarsControls`).
  const latestControl = new Map<string, string>();
  for (const receipt of receipts) if (receipt.action.kind === "control") latestControl.set(receipt.action.responsibilityId, receipt.messageId);
  // An answered decision retires its message's other decisions on the same work: they were alternatives for it.
  const settledBy = new Map<string, Set<string>>();
  for (const receipt of receipts) {
    const id = tarsReceiptDecisionId(receipt);
    // A refused answer or confirmation changed nothing, so it retires nothing (`readSettledTarsTargets`).
    if (!id || !((settling.get(id)?.status ?? "rejected") !== "rejected" || (records.get(id)?.status ?? "rejected") !== "rejected")) continue;
    for (const target of tarsDecisionTargets(receipt)) {
      const key = `${receipt.messageId}:${target}`;
      settledBy.set(key, new Set([...(settledBy.get(key) ?? []), id]));
    }
  }
  const retiredBySibling = (receipt: TarsActionReceipt, id: string) => tarsDecisionTargets(receipt)
    .some((target) => [...(settledBy.get(`${receipt.messageId}:${target}`) ?? [])].some((other) => other !== id));
  function targetsOf(targets: TarsDecisionView["targets"], options: TarsDecisionView["options"]): "live" | "unknown" | "targetMoved" | "targetEnded" {
    if (!targets.length) return "live";
    if (!rows) return "unknown";
    if (targets.some((target) => { const row = rows.get(target.responsibilityId); return !row || ENDED.has(row.state) && !(row.state === "completed" && options.some((option) => option.kind === "control" && option.control.responsibilityId === target.responsibilityId && option.control.operation === "message")); })) return "targetEnded";
    return targets.some((target) => rows.get(target.responsibilityId)!.revision !== target.expectedRevision) ? "targetMoved" : "live";
  }
  /**
   * Answered first, then a retirement that settles it, then its targets: a
   * moved target reads as invalid even after the conversation moved on (for
   * example past its own automatic follow-up). Only then does a later message
   * retire a question that is otherwise still valid.
   */
  function settle(view: Omit<TarsDecisionView, "state" | "why" | "checked" | "reask" | "reasked" | "failure" | "latest" | "delivery">, retiredBy: TarsDecisionWhy | null,
    origin: TarsMessageOrigin | undefined, movedOn = false): TarsDecisionView {
    const latest = view.messageId !== null ? lastMessage?.id === view.messageId : !lastMessage || lastMessage.createdAt <= view.since;
    // The control an answer applied keeps its record under the answer's request id (the proposal's own id for a confirmation).
    const deliveryRecord = (view.answer?.actRequestId ? records.get(view.answer.actRequestId) : view.record) ?? null;
    const delivery = deliveryRecord?.delivery ?? null;
    const base = { ...view, reasked: reasked.has(view.id), failure: view.answer ? null : failures.get(view.id) ?? null, latest, delivery, deliveryRecord };
    if (view.answer || view.record) return { ...base, state: "answered", why: null, checked: true, reask: false };
    if (retiredBy) return { ...base, state: "retired", why: retiredBy, checked: true, reask: false };
    const targets = targetsOf(view.targets, view.options);
    if ((targets === "live" || targets === "unknown") && movedOn) return { ...base, state: "retired", why: "movedOn", checked: true, reask: false };
    if (targets === "live" || targets === "unknown") return { ...base, state: "waiting", why: null, checked: targets === "live", reask: false };
    // Only Tars's own questions are asked again, once per message, and only while nothing newer was said.
    const reask = view.kind !== "unverifiedCompletion" && view.messageId !== null && latest && origin?.kind !== "reask" && !reaskedMessages.has(view.messageId);
    return { ...base, state: "invalid", why: targets, checked: true, reask };
  }
  const views: TarsDecisionView[] = [];
  for (const receipt of receipts) {
    const { action } = receipt;
    const message = sources.messages[order.get(receipt.messageId) ?? -1];
    if (!message) continue;
    const later = (order.get(receipt.messageId) ?? 0) < lastSpoken;
    if (isTarsWorkProposal(receipt)) {
      // Held by the autonomy level or one of the user's rules; an unheld one was applied or refused and stays a receipt line.
      const id = tarsConfirmationRequestId(receipt.messageId, receipt.actionIndex);
      // The host settles the proposal with its confirmation's outcome, so any answer to it is final.
      const answer = settling.get(id) ?? failures.get(id) ?? null;
      if (receipt.status !== "proposed" && !answer) continue;
      views.push(settle({ id, kind: "confirm", messageId: receipt.messageId, actionIndex: receipt.actionIndex, question: null,
        targets: receipt.action.kind === "reprioritize" ? [{ responsibilityId: receipt.action.responsibilityId, expectedRevision: receipt.action.expectedRevision }] : [],
        // Held because one of the user's rules matched: confirming is then an explicit choice, never Enter or "yes".
        options: [{ kind: "proposal", action: receipt.action, label: null, rationale: null }], recommended: receipt.matchedRules?.length ? null : 0,
        answer, record: null, since: receipt.updatedAt,
        ...(receipt.matchedRules ? { matchedRules: receipt.matchedRules } : {}) }, null, message.origin, later));
    } else if (action.kind === "control" && isTarsHoldableAction(action)) {
      const id = tarsConfirmationRequestId(receipt.messageId, receipt.actionIndex);
      // The host settles a proposal with its confirmation's outcome, so any answer to it is final.
      const answer = settling.get(id) ?? failures.get(id) ?? null;
      const record = records.get(id) ?? null;
      // A proposal refused when it was made stays a receipt line with its reason.
      if (receipt.status !== "proposed" && !answer && !record) continue;
      const control = { responsibilityId: action.responsibilityId, expectedRevision: action.expectedRevision, operation: action.operation,
        ...(action.input ? { input: action.input } : {}) };
      const retiredBy = latestControl.get(action.responsibilityId) !== receipt.messageId ? "superseded"
        : retiredBySibling(receipt, id) ? "settled" : null;
      views.push(settle({ id, kind: "confirm", messageId: receipt.messageId, actionIndex: receipt.actionIndex, question: null,
        targets: [{ responsibilityId: action.responsibilityId, expectedRevision: action.expectedRevision }],
        options: [{ kind: "control", control, label: null, rationale: null }],
        // Confirming a cancel or an acceptance is always an explicit choice.
        recommended: TARS_IRREVERSIBLE_OPERATIONS.has(action.operation) || receipt.matchedRules?.length ? null : 0, answer, record, since: receipt.updatedAt,
        ...(receipt.matchedRules ? { matchedRules: receipt.matchedRules } : {}) },
      retiredBy, message.origin));
    } else if (action.kind === "ask" && receipt.status === "proposed") {
      const id = tarsAskDecisionId(receipt.messageId, receipt.actionIndex);
      const answer = settling.get(id) ?? null;
      const targets = new Map<string, number>();
      for (const option of action.options) if (option.effect.kind === "control" && !targets.has(option.effect.responsibilityId))
        targets.set(option.effect.responsibilityId, option.effect.expectedRevision);
      const retiredBy = !answer && retiredBySibling(receipt, id) ? "settled" : null;
      const safe = withoutIrreversibleRecommendation(action);
      views.push(settle({ id, kind: "ask", messageId: receipt.messageId, actionIndex: receipt.actionIndex, question: action.question,
        targets: [...targets].map(([responsibilityId, expectedRevision]) => ({ responsibilityId, expectedRevision })),
        options: action.options.map((option): TarsDecisionOption => option.effect.kind === "control"
          ? { kind: "control", control: { responsibilityId: option.effect.responsibilityId, expectedRevision: option.effect.expectedRevision,
            operation: option.effect.operation, ...(option.effect.input ? { input: option.effect.input } : {}) }, label: option.label, rationale: option.rationale }
          : { kind: "reply", label: option.label, rationale: option.rationale }),
        recommended: safe.recommended ?? null, answer, record: null, since: receipt.updatedAt }, retiredBy, message.origin, later));
    }
  }
  // Stave's unverified-completion decision: the one waiting now, and those the conversation recorded.
  const unverified = new Map<string, { responsibilityId: string; revision: number; since: string }>();
  for (const event of sources.activity) if (isUnverified(event))
    unverified.set(tarsUnverifiedDecisionId(event.responsibilityId, event.revision), { responsibilityId: event.responsibilityId, revision: event.revision, since: event.createdAt });
  for (const row of sources.responsibilities ?? []) if (isUnverified(row) && !unverified.has(tarsUnverifiedDecisionId(row.id, row.revision)))
    unverified.set(tarsUnverifiedDecisionId(row.id, row.revision), { responsibilityId: row.id, revision: row.revision, since: row.updatedAt });
  for (const [id, entry] of unverified) {
    const answer = settling.get(id) ?? null;
    const row = rows?.get(entry.responsibilityId);
    // It stays Stave's question only while the work still waits at that revision; any other change settled it.
    const current = !rows || (row !== undefined && row.revision === entry.revision && isUnverified(row));
    views.push(settle({ id, kind: "unverifiedCompletion", messageId: null, actionIndex: null, question: null,
      targets: [{ responsibilityId: entry.responsibilityId, expectedRevision: entry.revision }],
      options: tarsUnverifiedOptions(entry.responsibilityId, entry.revision), recommended: null, answer, record: null, since: entry.since },
    current ? null : "settled", undefined));
  }
  return views;
}

/** The decisions the user can answer now. */
export function selectAnswerableTarsDecisions(views: readonly TarsDecisionView[]) {
  return views.filter((view) => view.state === "waiting" && view.checked);
}

/** Short answers that bind to a decision's recommended option. Anything longer goes to Tars as a message. */
const AFFIRMATIVE = new Set(["응", "어", "네", "넵", "예", "그래", "좋아", "yes", "y", "yeah", "yep", "ok", "okay", "sure"]);

/**
 * Binds a short answer in words to a decision, deterministically: only while
 * exactly one answerable decision belongs to the newest message with nothing
 * said after it; "1"–"4" pick that option, an affirmative picks its
 * recommended option. An affirmative never applies an irreversible effect,
 * and with nothing recommended it is not bound. Otherwise null, and the text
 * goes to Tars as an ordinary message.
 */
export function bindTarsShortAnswer(text: string, answerable: readonly TarsDecisionView[]): { decision: TarsDecisionView; optionIndex: number } | null {
  const current = answerable.filter((view) => view.latest);
  if (current.length !== 1) return null;
  const decision = current[0]!;
  const word = text.trim().toLocaleLowerCase().replace(/[.!~。！?？]+$/u, "").trim();
  if (/^[1-4]$/.test(word)) {
    const optionIndex = Number(word) - 1;
    return optionIndex < decision.options.length ? { decision, optionIndex } : null;
  }
  if (!AFFIRMATIVE.has(word) || decision.recommended === null) return null;
  const option = decision.options[decision.recommended];
  if (!option || isIrreversibleOption(option)) return null;
  return { decision, optionIndex: decision.recommended };
}

/** Whether choosing an option cannot be undone. */
export function isIrreversibleOption(option: TarsDecisionOption) {
  return option.kind === "control" && TARS_IRREVERSIBLE_OPERATIONS.has(option.control.operation);
}

/**
 * The option a key chooses on a focused card: 1–4 pick that option; Enter
 * picks the focused option, else the recommended one. Other keys choose
 * nothing. The card only listens while it or one of its options has focus.
 */
export function tarsDecisionKeyChoice(key: string, decision: Pick<TarsDecisionView, "options" | "recommended">, focusedOption: number | null): number | null {
  if (/^[1-4]$/.test(key)) {
    const index = Number(key) - 1;
    return index < decision.options.length ? index : null;
  }
  // Enter on the card picks only a recommended option, which is never irreversible; on a focused option it is that option's own press.
  if (key === "Enter") return focusedOption ?? decision.recommended;
  return null;
}

/**
 * A question card's keys (an ask, or Stave's own choice for a completion it
 * could not verify): its options are a radio group, so 1–4 choose that option
 * without answering, and Enter answers the chosen one. The recommended option
 * starts chosen, so Enter alone still answers with it; nothing is chosen when
 * there is no recommendation, and Enter then does nothing.
 */
export function tarsQuestionKeyAction(key: string, decision: Pick<TarsDecisionView, "options">, selected: number | null):
  { kind: "select" | "answer"; index: number } | null {
  if (/^[1-4]$/.test(key)) {
    const index = Number(key) - 1;
    return index < decision.options.length ? { kind: "select", index } : null;
  }
  return key === "Enter" && selected !== null && selected < decision.options.length ? { kind: "answer", index: selected } : null;
}

/** Model-facing summary of a decision, for the automatic follow-up's context. */
export function describeTarsDecisionForModel(view: TarsDecisionView): string {
  // i18n-ignore: model-facing context
  if (view.kind === "ask") return `Question: ${view.question ?? ""}\nOptions: ${view.options.map((option, index) =>
    `${index + 1}. ${option.kind === "verify" || option.kind === "proposal" ? option.kind : option.label ?? option.kind}`).join("; ")}`;
  const first = view.options[0];
  // i18n-ignore: model-facing context
  if (first?.kind === "proposal") return first.action.kind === "delegate" ? `Proposed new work "${first.action.title}", waiting for the user's confirmation.`
    : `Proposed priority ${first.action.priority} for responsibility ${first.action.responsibilityId} at revision ${first.action.expectedRevision}.`;
  const control = first?.kind === "control" ? first.control : null;
  // i18n-ignore: model-facing context
  return control ? `Proposed control ${control.operation} for responsibility ${control.responsibilityId} at revision ${control.expectedRevision}.` : "Decision";
}

