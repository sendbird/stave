import {
  CancelTarsMessageInputSchema, GetTarsConversationInputSchema, TarsMessageInputSchema, TarsAnswerInputSchema,
  TarsConversationSchema, TarsConversationSettingsSchema, TARS_CONFIRMED_OPERATIONS, tarsConfirmationRequestId, isTarsAnswerRetryable,
  type TarsMessage, type ApplyTarsDecisionInput, type TarsActInput, type TarsActResult, type TarsAnswerResult, type TarsDecisionAnswer,
} from "../../src/lib/tars/conversation";
import {
  isTarsReservedMessageRequestId, parseTarsDecisionId, projectTarsDecisions, tarsAnswerActRequestId,
  tarsAnswerMessageRequestId, tarsAskDecisionId, tarsUnverifiedDecisionId, type TarsDecisionView,
} from "../../src/lib/tars/decisions";
import { admitTarsFollowUps, claimTarsMessage, releaseTarsFollowUpStart, supersedeStaleTarsFollowUp, tarsAutomaticStartDeferral } from "./tars-follow-up";
import type { TarsStore } from "../persistence/tars-store";
import { SaveTarsComposerDraftInputSchema } from "../../src/lib/tars/composer-draft";
import { isTarsStorageBusy, type TarsConversationStore } from "../persistence/tars-conversation-store";
import type { createSecondaryRunCoordinator } from "./runs/secondary-run-coordinator";
import { processTarsMessage, tarsMessageRunIdentity, type TarsPlannerContext } from "./tars-planner";
import { isTarsAgentCatalogPending, TarsAgentCatalogPendingError } from "../../src/lib/tars/agents";
import { TarsClearInputSchema, TarsUndoClearInputSchema, TarsViewSettingsSchema, parseTarsClearProposalRequestId } from "../../src/lib/tars/clearing";
import { filterTarsConversationView, tarsClearKeeps } from "../../src/lib/tars/clear-view";

type Coordinator = ReturnType<typeof createSecondaryRunCoordinator>;
interface ConversationPorts {
  conversations: TarsConversationStore;
  coordinator: Coordinator;
  responsibilities: Pick<TarsStore, "listActivity" | "snapshot" | "get" | "events" | "view">;
  context: (message: TarsMessage) => Promise<TarsPlannerContext>;
  applyDecision: (input: ApplyTarsDecisionInput) => Promise<unknown>;
  /**
   * The host's admitted control path (`tars.act`). A decision answer that
   * controls work goes through it, exactly like a click. Absent, answers that
   * control work are refused as not waiting.
   */
  act?: (input: TarsActInput) => Promise<TarsActResult>;
  /**
   * False until the renderer synced the saved agents. A message that allows
   * saved agents waits for them instead of reasoning with an incomplete list.
   */
  agentCatalogReady?: () => boolean;
  /**
   * Hands main's synced catalog to the host again. Called before each retry of
   * a decision the host could not judge, so a failed forward converges without
   * a restart. Never called while main itself lacks the catalog.
   */
  resyncAgentCatalog?: () => Promise<void>;
  now?: () => string;
  onError?: (error: unknown) => void;
  /** Delays before each consecutive retry of a failed drain; tests shorten them. */
  retryDelaysMs?: readonly number[];
}

const RETRY_DELAYS_MS = [1_000, 5_000, 30_000];
/** How far back answers, invalidation and re-asks look; older decisions are no longer shown. */
const DECISION_WINDOW = 200;

/** A control delivery failed with an unknown outcome; its receipt stays pending for a retry. */
class TarsControlOutcomeUnknownError extends Error {
  constructor() { super("A saved control's outcome is not known yet. It stays pending and will be retried."); this.name = "TarsControlOutcomeUnknownError"; }
}

/** A resident, single-consumer queue. Reads never create work; only stored user messages do. */
export function createTarsConversationService(ports: ConversationPorts) {
  const now = ports.now ?? (() => new Date().toISOString());
  let started = false;
  let stopped = false;
  let requested = false;
  let draining: Promise<void> | null = null;
  let activeMessageId: string | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let windowTimer: ReturnType<typeof setTimeout> | null = null;
  let failedDrains = 0;

  async function abort(messageId: string) {
    const identity = tarsMessageRunIdentity(messageId);
    const aggregate = await ports.coordinator.get(identity);
    if (aggregate?.step.executionId) await ports.coordinator.cancel({ ...identity,
      expectedExecutionId: aggregate.step.executionId, idempotencyKey: `${identity.runId}:cancel` });
  }

  async function apply(message: TarsMessage) {
    try {
      await ports.applyDecision({ messageId: message.id, expectedRevision: message.revision });
      if (stopped) return;
      const settled = ports.conversations.listReceipts(message.id).filter((receipt) => receipt.status !== "pending");
      if (settled.length !== message.decision!.actions.length) throw new Error("The saved decision did not settle.");
    } catch (error) {
      if (stopped) return;
      // A lock failure left every unsettled intent pending and changed nothing.
      // Leave the proposal queued for a retry instead of rejecting it. The same
      // holds while the host has not received the saved agents yet.
      if (isTarsStorageBusy(error)) throw error;
      if (isTarsAgentCatalogPending(error)) {
        // Main knows the catalog but the host does not: hand it over again before the retry.
        // An unsynced main never sends its empty copy, so the host stays fail-closed.
        if (ports.agentCatalogReady?.() === true && !stopped) await ports.resyncAgentCatalog?.().catch(() => undefined);
        throw error;
      }
      // An applied receipt always wins, including a lost host acknowledgement.
      // Settling remaining local intents also fences a delayed host application.
      const controlsPending = ports.conversations.rejectUnsettledActions(message.id, message.revision,
        "This saved action could not be admitted. Check the registered target workspace and host status, then send a new explicit message.", now());
      // A control's outcome is unknown here: the host may already have controlled
      // the run. Leave it pending; a later idempotent host retry settles both together.
      if (controlsPending) throw new TarsControlOutcomeUnknownError();
    }
  }

  /** The saved state every decision is projected from, read by exact identity where the window could miss it. */
  function decisions(sources = readDecisionMessages()) {
    const { messages, receipts } = sources;
    const snapshot = ports.responsibilities.snapshot();
    const activity = ports.responsibilities.listActivity(DECISION_WINDOW);
    const ids = [
      ...receipts.flatMap((receipt) => receipt.action.kind === "ask" ? [tarsAskDecisionId(receipt.messageId, receipt.actionIndex)]
        : receipt.action.kind === "control" ? [tarsConfirmationRequestId(receipt.messageId, receipt.actionIndex)] : []),
      ...activity.map((event) => tarsUnverifiedDecisionId(event.responsibilityId, event.revision)),
      ...snapshot.responsibilities.map((row) => tarsUnverifiedDecisionId(row.id, row.revision)),
    ];
    const answers = ports.conversations.getAnswers(ids);
    const records = ports.conversations.getActions(receipts.flatMap((receipt) =>
      receipt.action.kind === "control" && TARS_CONFIRMED_OPERATIONS.has(receipt.action.operation)
        ? [tarsConfirmationRequestId(receipt.messageId, receipt.actionIndex)] : []));
    return projectTarsDecisions({ messages, receipts, records, answers, activity, responsibilities: snapshot.responsibilities });
  }

  /** Decisions read words, receipts and origins: never attachment content. */
  function readDecisionMessages() {
    const messages = ports.conversations.listViews(DECISION_WINDOW);
    return { messages, receipts: messages.flatMap((message) => ports.conversations.listReceipts(message.id)) };
  }

  /** What a conversation clear keeps in view, from every saved decision rather than the cleared view. */
  function clearKeeps() {
    const sources = readDecisionMessages();
    return { keeps: tarsClearKeeps({ decisions: decisions(sources), receipts: sources.receipts }), messages: sources.messages };
  }

  /** When the active conversation clear happened; the view and Tars's recent history start after it. */
  function clearedAt() {
    return ports.responsibilities.view.activeConversationClear()?.createdAt ?? null;
  }

  /**
   * Applies an answer's effect once. A control takes the host's click path
   * under the answer's own request id and first source, so a retry joins the
   * first attempt; a reply becomes the user's answer to Tars. A delivery whose
   * outcome is unknown leaves the answer pending for the next retry.
   */
  async function settleAnswer(answer: TarsDecisionAnswer): Promise<TarsDecisionAnswer> {
    if (answer.status !== "pending") return answer;
    const { effect } = answer;
    if (effect.kind === "control") {
      if (!ports.act || !answer.actRequestId) throw new Error("The host control path is unavailable.");
      const { record } = await ports.act({ requestId: answer.actRequestId, responsibilityId: effect.responsibilityId,
        expectedRevision: effect.expectedRevision, operation: effect.operation, ...(effect.input ? { input: effect.input } : {}), source: answer.source });
      if (record.status === "pending") return answer;
      return ports.conversations.settleAnswer(answer.decisionId, record.status === "applied" ? { status: "applied" }
        : { status: "rejected", reason: record.reason, error: record.error ?? "The control was not applied." }, now());
    }
    const parsed = parseTarsDecisionId(answer.decisionId);
    const receipt = parsed && parsed.kind === "ask" ? ports.conversations.getReceipt(parsed.messageId, parsed.actionIndex) : null;
    if (receipt?.action.kind !== "ask") throw new Error("The question for this answer was not found.");
    const option = receipt.action.options[answer.optionIndex];
    if (!option) throw new Error("The chosen option was not found.");
    const message = ports.conversations.create({ requestId: tarsAnswerMessageRequestId(answer.decisionId), text: option.label }, now(), 32,
      { kind: "answer", decisionId: answer.decisionId, optionIndex: answer.optionIndex, source: answer.source,
        question: receipt.action.question, rationale: option.rationale });
    requestWork();
    return ports.conversations.settleAnswer(answer.decisionId, { status: "applied", messageId: message.id }, now());
  }

  /** A decision Tars may still ask about again by itself: invalid, from the newest message, not asked again yet. */
  function reaskable(view: TarsDecisionView | undefined): view is TarsDecisionView {
    return Boolean(view?.reask && !view.reasked && (view.why === "targetMoved" || view.why === "targetEnded"));
  }

  /**
   * An invalidated Tars decision is an inbox event like any other change, so
   * its one re-ask draws from the same budget and window as other automatic
   * follow-ups. At most one per message: once one is asked the projection no
   * longer offers the others (`admitTarsFollowUps` reads it again for each).
   */
  function noteInvalidatedDecisions() {
    const rows = new Map(ports.responsibilities.snapshot().responsibilities.map((row) => [row.id, row]));
    for (const view of decisions().filter(reaskable)) {
      const row = view.targets.map((target) => rows.get(target.responsibilityId)).find(Boolean);
      if (row) ports.responsibilities.events.record({ responsibilityId: row.id, kind: "decisionInvalidated", episode: view.id,
        observedRevision: row.revision, observedState: row.state, attempt: null }, now());
    }
  }

  /** Starts the follow-ups pending events need; past the window cap, looks again when it opens. No event, no model call. */
  function admitFollowUps() {
    const { nextWindowAt } = admitTarsFollowUps({ events: ports.responsibilities.events, conversations: ports.conversations,
      responsibilities: ports.responsibilities, now,
      reaskable: () => new Map(decisions().filter(reaskable).map((view) => [view.id, view])) });
    wakeAt(nextWindowAt);
  }

  /** One timer for the follow-up window: drain again once it opens. */
  function wakeAt(at: string | null) {
    if (windowTimer) clearTimeout(windowTimer);
    windowTimer = null;
    if (!at || stopped) return;
    windowTimer = setTimeout(() => { windowTimer = null; requestWork(); }, Math.max(0, Date.parse(at) - Date.parse(now())) + 1_000);
    windowTimer.unref?.();
  }

  /**
   * The oldest queued message that may start now: the user's always, an
   * automatic one only while the window has room for another planner start.
   * Automatic ones that must wait stay queued and wake the queue when it opens.
   */
  function nextStartable(): TarsMessage | undefined {
    const queued = ports.conversations.listQueued(32);
    let deferredUntil: string | null = null;
    for (const message of queued) {
      const deferral = tarsAutomaticStartDeferral(ports.responsibilities.events, message, now());
      if (!deferral) return message;
      deferredUntil ??= deferral;
    }
    if (deferredUntil) wakeAt(deferredUntil);
    return undefined;
  }

  /**
   * Retries answers whose delivery was lost, each on its own: one that still
   * fails is reported and retried later, and never holds up queued messages.
   */
  async function retryPendingAnswers(): Promise<boolean> {
    let failed = false;
    for (const answer of ports.conversations.listPendingAnswers(8)) {
      try { await settleAnswer(answer); }
      catch (error) { failed = true; ports.onError?.(error); }
    }
    return failed;
  }

  async function drain() {
    const answersFailed = await retryPendingAnswers();
    while (!stopped) {
      const proposal = ports.conversations.listPendingActions(1)[0];
      if (proposal) { await apply(proposal); continue; }
      noteInvalidatedDecisions();
      let message = nextStartable();
      // The user's own messages go first; Tars then follows up on what still needs judgment.
      if (!message) { admitFollowUps(); message = nextStartable(); }
      if (!message) {
        // The rest of the queue went on; the unsettled answer is retried like an unknown control outcome.
        if (answersFailed && !stopped) throw new TarsControlOutcomeUnknownError();
        return;
      }
      // Never claim (or bill) a message before its allowed saved agents are known.
      if (message.allowedAgentIds?.length && ports.agentCatalogReady?.() === false) throw new TarsAgentCatalogPendingError();
      activeMessageId = message.id;
      try {
        await processTarsMessage(message.id, { ...ports, isStopped: () => stopped, historyAfter: clearedAt,
          supersedeStale: (id) => supersedeStaleTarsFollowUp({ events: ports.responsibilities.events, conversations: ports.conversations,
            responsibilities: ports.responsibilities, now }, id),
          claim: (id, revision, at) => claimTarsMessage({ events: ports.responsibilities.events, conversations: ports.conversations, responsibilities: ports.responsibilities }, id, revision, at),
          releaseStart: (id) => releaseTarsFollowUpStart({ events: ports.responsibilities.events, conversations: ports.conversations }, id) });
      } finally { activeMessageId = null; }
    }
  }

  // A failed drain (such as a lock wait that outlasted busy_timeout) leaves its
  // work saved. Retry a bounded number of times instead of waiting for the next
  // send or restart; a later successful drain resets the count.
  function scheduleRetry(error: unknown) {
    const delays = ports.retryDelaysMs ?? RETRY_DELAYS_MS;
    // An unresolved control delivery holds the queue in order, so keep retrying it
    // at the capped delay until the host answers. It never starts a model call.
    const waits = error instanceof TarsControlOutcomeUnknownError || isTarsAgentCatalogPending(error);
    const delay = delays[failedDrains] ?? (waits ? delays.at(-1) : undefined);
    if (stopped || retryTimer || delay === undefined) return;
    failedDrains++;
    retryTimer = setTimeout(() => { retryTimer = null; requestWork(); }, delay);
  }

  function requestWork() {
    if (!started || stopped) return;
    requested = true;
    if (draining) return;
    draining = Promise.resolve().then(async () => {
      while (requested && !stopped) { requested = false; await drain(); }
      failedDrains = 0;
    }).catch((error) => { ports.onError?.(error); scheduleRetry(error); }).finally(() => {
      draining = null;
      if (requested && !stopped) requestWork();
    });
  }

  return {
    start() {
      if (started || stopped) return;
      // Exactly once per main-process instance, before admitting a fresh model call.
      ports.conversations.recover(now());
      // Retention: processed events older than the window go; pending ones stay. A busy lock only delays it.
      try { ports.responsibilities.events.prune(now()); } catch (error) { ports.onError?.(error); }
      started = true;
      requestWork();
    },
    sendMessage(rawInput: unknown) {
      if (!started || stopped) throw new Error("The representative conversation service is unavailable.");
      const input = TarsMessageInputSchema.parse(rawInput);
      if (isTarsReservedMessageRequestId(input.requestId)) throw new Error("This request ID is reserved for answers and follow-ups.");
      const message = ports.conversations.create(input, now(), 32);
      requestWork();
      return message;
    },
    configureConversation(rawInput: unknown) {
      if (!started || stopped) throw new Error("The representative conversation service is unavailable.");
      return ports.conversations.configure(TarsConversationSettingsSchema.parse(rawInput));
    },
    getConversation(rawInput: unknown = {}) {
      const { limit, activityLimit } = GetTarsConversationInputSchema.parse(rawInput);
      // A window reads this on every change: attachment summaries only, the content stays for the planner.
      const messages = ports.conversations.listViews(limit);
      const view = ports.responsibilities.view;
      const active = view.activeConversationClear();
      const conversation = { settings: ports.conversations.getSettings(),
        activity: ports.responsibilities.listActivity(activityLimit), messages,
        receipts: messages.flatMap((message) => ports.conversations.listReceipts(message.id)),
        records: ports.conversations.listActions(limit), answers: ports.conversations.listAnswers(limit),
        events: ports.responsibilities.events.listRecent(activityLimit), publications: ports.conversations.listPublishes(limit),
        clears: view.listClears(active?.createdAt ?? null, limit),
        view: { retentionDays: view.getSettings().retentionDays, clearedAt: active?.createdAt ?? null, clearRequestId: active?.requestId ?? null } };
      // A cleared conversation hides what came before, never what still needs the user.
      return TarsConversationSchema.parse(active ? filterTarsConversationView(conversation, { clearedAt: active.createdAt, keeps: clearKeeps().keeps }) : conversation);
    },
    /**
     * Applies one clear from a button or a confirmed Tars proposal
     * (`clear:<message>:<index>`, settled with it). Hides, never deletes; the
     * same request id returns the saved record.
     */
    clear(rawInput: unknown) {
      if (!started || stopped) throw new Error("The representative conversation service is unavailable.");
      const input = TarsClearInputSchema.parse(rawInput);
      const proposal = parseTarsClearProposalRequestId(input.requestId);
      const at = now();
      const previous = clearedAt();
      return ports.responsibilities.view.clear(input, { responsibilities: ports.responsibilities.snapshot().responsibilities, now: at,
        hiddenMessages: () => {
          const { keeps, messages } = clearKeeps();
          const kept = messages.filter((message) => keeps.messageIds.has(message.id) && message.createdAt <= at && (!previous || message.createdAt > previous)
            && message.state !== "queued" && message.state !== "reasoning").length;
          return ports.conversations.countSettledBetween(previous, at) - kept;
        },
        ...(proposal ? { proposal: { ...proposal, settle: () => { ports.conversations.settleClearProposal(proposal, input.scopes, at); } } } : {}) });
    },
    undoClear(rawInput: unknown) {
      if (!started || stopped) throw new Error("The representative conversation service is unavailable.");
      return ports.responsibilities.view.undo(TarsUndoClearInputSchema.parse(rawInput).requestId, now());
    },
    configureView(rawInput: unknown) {
      if (!started || stopped) throw new Error("The representative conversation service is unavailable.");
      return ports.responsibilities.view.configure(TarsViewSettingsSchema.parse(rawInput));
    },
    /** The composer draft is the user's words, not reasoning work: it stays readable and writable while the service is stopped. */
    getDraft() {
      return ports.conversations.getDraft();
    },
    saveDraft(rawInput: unknown) {
      ports.conversations.saveDraft(SaveTarsComposerDraftInputSchema.parse(rawInput).draft);
    },
    /**
     * Answers one option of a waiting decision. The option is read from saved
     * state, never from the caller. The first answer wins: the same option
     * again joins it, a different one is refused with `alreadyAnswered`.
     */
    async answerDecision(rawInput: unknown): Promise<TarsAnswerResult> {
      if (!started || stopped) throw new Error("The representative conversation service is unavailable.");
      const input = TarsAnswerInputSchema.parse(rawInput);
      const existing = ports.conversations.getAnswer(input.decisionId);
      // A refusal that leaves the decision open lets the user retry or choose another option.
      if (existing && !isTarsAnswerRetryable(existing)) return existing.optionIndex === input.optionIndex
        ? { answer: await settleAnswer(existing), refusal: null } : { answer: existing, refusal: "alreadyAnswered" };
      const view = decisions().find((candidate) => candidate.id === input.decisionId);
      if (view?.state === "answered") return { answer: view.answer, refusal: "alreadyAnswered" };
      if (!view || view.state !== "waiting" || !view.checked) return { answer: null, refusal: "notWaiting" };
      const option = view.options[input.optionIndex];
      if (!option || option.kind === "verify" || (option.kind === "control" && !ports.act)) return { answer: null, refusal: "invalidOption" };
      const recorded = ports.conversations.recordAnswer({ decisionId: view.id, optionIndex: input.optionIndex, source: input.source,
        effect: option.kind === "control" ? { kind: "control", ...option.control } : { kind: "reply" },
        label: option.label, actRequestId: option.kind === "control" ? tarsAnswerActRequestId(view.id) : null }, now());
      if (recorded.refusal) return recorded;
      return { answer: await settleAnswer(recorded.answer), refusal: null };
    },
    async cancelMessage(rawInput: unknown) {
      const input = CancelTarsMessageInputSchema.parse(rawInput);
      const message = ports.conversations.cancel(input.messageId, input.expectedRevision, now());
      // CAS is durable before provider cancellation can yield or fail.
      await abort(message.id);
      return message;
    },
    async stop() {
      stopped = true;
      requested = false;
      if (retryTimer) clearTimeout(retryTimer);
      if (windowTimer) clearTimeout(windowTimer);
      retryTimer = null; windowTimer = null;
      const id = activeMessageId;
      if (!id) return;
      const current = ports.conversations.get(id);
      if (current?.state === "queued" || current?.state === "reasoning")
        ports.conversations.cancel(id, current.revision, now());
      await abort(id);
    },
    /** Retry waiting work now, for example once the saved agent catalog arrives. */
    wake() { requestWork(); },
    /** Tests and orderly owners can await local scheduling without polling timers. */
    async whenIdle() { while (draining) await draining; },
  };
}
