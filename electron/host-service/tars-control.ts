import { captureTarsControlUndo } from "../../src/lib/tars/action-undo";
import { canContinueTarsControl, hasEndedTarsExecution } from "../../src/lib/tars/continuation";
import type { TarsStore } from "../persistence/tars-store";
import {
  parseTarsConfirmationRequestId, TarsActInputSchema, type TarsActInput, type TarsActResult, type TarsActionRecord,
  type TarsControlAction, type TarsControlOperation, type TarsControlReason,
} from "../../src/lib/tars/conversation";
import type { TarsResponsibility, TarsSnapshot } from "../../src/lib/tars/types";
import { isTarsStorageBusy, TarsStorageBusyError, type TarsConversationStore, type TarsProposalRef } from "../persistence/tars-conversation-store";
import {
  TarsOwnershipLostError, TarsRequestUnavailableError, TarsRunEndedError, TarsRunHeldError, TarsRunRefusedError, TarsStageChangedError, TarsTaskBusyError,
} from "./tars-ownership";
import { isTarsPublicationUnfinished } from "../../src/lib/tars/publication";
import { tarsControlInputProblem } from "../../src/lib/tars/types";
import { AGENT_RUN_LIMITS, AgentRunCommandError } from "../../src/lib/agent-runs/domain";

export type TarsControlRequest = Pick<TarsControlAction, "responsibilityId" | "expectedRevision" | "operation" | "input"> & {
  /** Host-only automatic extension fence; never part of a renderer or model payload. */
  autoExtendMaxTurns?: number;
};

/**
 * Where one control request settles: a message receipt or a click record. Both
 * stores share the responsibility store's SQLite connection, so `apply` writes
 * the effect and the settled outcome in one immediate transaction.
 */
export interface TarsControlLedger<R> {
  /** Identity of the request; a concurrent duplicate joins the in-flight attempt. */
  key: string;
  /** The settled outcome, or null while the request is still pending. */
  settled(): R | null;
  /**
   * Request-specific admission, checked with the shared rules at admission and
   * again at dispatch, before the run is controlled. Throws a `TarsControlRejection`.
   */
  admit?(): void;
  apply(effect: () => void): R;
  /**
   * Settles a `message` as accepted with its words queued for `agentRunId`,
   * said once the task's running turn ends (`TarsMessageDelivery`). Absent on
   * ledgers that cannot show a queued delivery: a busy task is then refused.
   */
  queue?(effect: () => void, agentRunId: string): R;
  reject(rejection: TarsControlRejectionOutcome): R;
}

/** A coded refusal: the interface translates `reason`; `error` stays an English diagnostic. */
export interface TarsControlRejectionOutcome { reason: TarsControlReason; error: string }

export class TarsControlRejection extends Error {
  constructor(readonly reason: TarsControlReason, message: string) { super(message); this.name = "TarsControlRejection"; }
}

export const TARS_CONTROL_STALE = "The responsibility changed. Refresh before trying again.";
export const TARS_PROPOSAL_SUPERSEDED = "A newer proposal for this responsibility replaced this one. Confirm the current proposal instead.";
/** Operations that stop or withdraw Tars execution invalidate pending dispatch at once. */
export const TARS_STOPPING_OPERATIONS: ReadonlySet<TarsControlOperation> = new Set(["pause", "cancel", "takeover"]);
/**
 * Operations that give Tars execution authority again, start work or let its
 * run continue; they recheck the registered scope, and an ownership change
 * refuses them instead of settling the responsibility.
 */
export const TARS_GRANTING_OPERATIONS: ReadonlySet<TarsControlOperation> = new Set([
  "resume", "handBack", "startNow", "extend", "retryStage", "skipStage", "signOff",
  // Answering in a task Tars no longer holds would answer for its new owner.
  "approve", "deny", "answer", "message", "requestChanges",
]);

/**
 * Deterministic admission. Admission checks the caller's revision; dispatch
 * rechecks the same ownership rules against the current row, because only this
 * runtime's own preparation and observation may have advanced it meanwhile.
 */
export function admitTarsControl(row: TarsResponsibility | null, request: TarsControlRequest,
  stage: "admission" | "dispatch" = "admission"): TarsResponsibility {
  const refuse = (reason: TarsControlReason, message: string): never => { throw new TarsControlRejection(reason, message); };
  if (!row) return refuse("notOwned", "The responsibility is not owned by the personal representative.");
  if (canContinueTarsControl(row, request.expectedRevision, request.operation))
    request = { ...request, expectedRevision: row.revision };
  if (stage === "admission" && row.revision !== request.expectedRevision) refuse("stale", TARS_CONTROL_STALE);
  if ((row.state === "completed" && !["message", "requestChanges", "retryStage"].includes(request.operation)) || row.state === "cancelled") refuse("ended", "This responsibility has already ended.");
  if (isTarsPublicationUnfinished(row.publication)) refuse("runRefused", "Publication is in progress. Wait for its recorded outcome.");
  const userOwned = row.state === "takenOver";
  if (row.state === "resultReady" && !["acceptCompletion", "cancel", "message", "requestChanges", "retryStage"].includes(request.operation))
    refuse("runEnded", "The execution ended. Continue this work through the follow-up flow, or confirm its requested endpoint.");
  if (row.state === "blocked" && hasEndedTarsExecution(row) &&
      !["acceptCompletion", "cancel", "message", "requestChanges", "retryStage"].includes(request.operation))
    refuse("runEnded", "Its run already ended. Accept it as done, cancel it, or ask Tars for new verification work.");
  switch (request.operation) {
    case "pause":
      if (userOwned) refuse("takenOver", "You took over this work. Hand it back or cancel it.");
      if (row.state === "paused") refuse("alreadyPaused", "This responsibility is already paused.");
      return row;
    case "resume":
      // Human takeover always wins: only an explicit hand-back returns the work.
      if (userOwned) refuse("takenOver", "You took over this work. Tars continues it only after you hand it back.");
      // Waiting work resumes only from a run pause (a usage limit, an expired wait); the run checks that at dispatch.
      if (row.state !== "paused" && row.state !== "blocked" && !(row.state === "waiting" && row.agentRunId))
        refuse("notResumable", "Only paused or blocked work can resume.");
      return row;
    case "approve": case "deny": case "answer": case "message": case "requestChanges": {
      // Answering in the task for the user: never for work the user holds or paused, and only what the user saw.
      if (userOwned) refuse("takenOver", "You took over this work. Answer in its task, or hand it back first.");
      if (row.state === "paused") refuse("resumeFirst", "This work is paused. Resume it before answering in its task.");
      if (!row.agentRunId) refuse("runRefused", "This work has no run yet.");
      if (!row.taskId || !row.executionWorkspaceId) refuse("ownershipLost", "The execution location is unavailable; no replacement workspace will be created.");
      if (row.revision !== request.expectedRevision) refuse("stale", TARS_CONTROL_STALE);
      const problem = tarsControlInputProblem(request.operation, request.input);
      if (problem) refuse("unknown", problem);
      // The run keeps at most this much sign-off feedback; refused rather than cut.
      if (request.operation === "requestChanges" && request.input!.text!.length > AGENT_RUN_LIMITS.maxFeedbackChars)
        refuse("unknown", `Requested changes hold at most ${AGENT_RUN_LIMITS.maxFeedbackChars} characters.`);
      if (request.operation === "message" || request.operation === "requestChanges") return row;
      const kind = request.operation === "answer" ? "question" : "approval";
      const pending = row.pendingRequests?.find((entry) => entry.ref === request.input!.requestRef && entry.kind === kind);
      if (!pending) refuse("requestUnavailable", "That request is not waiting in the work's task.");
      if (request.operation === "answer") {
        const keys = new Set((pending!.questions ?? []).map((question) => question.key));
        if (!Object.keys(request.input!.answers!).every((key) => keys.has(key))) refuse("requestUnavailable", "The answers do not match the waiting questions.");
      }
      return row;
    }
    case "extend": case "retryStage": case "skipStage": case "signOff":
      // The same commands the user gives the run in its task, on Tars's own run only.
      if (userOwned) refuse("takenOver", "You took over this work. Continue it in its task, or hand it back first.");
      // A command would move a run the user paused through Tars, and the paused row would no longer be observed.
      if (row.state === "paused") refuse("resumeFirst", "This work is paused. Resume it before asking its run to do this.");
      if (!row.agentRunId) refuse("runRefused", "This work has no run yet.");
      // Bound to the exact revision the user saw: any saved change since (a new stage attempt included) makes it stale.
      if (row.revision !== request.expectedRevision) refuse("stale", TARS_CONTROL_STALE);
      return row;
    case "takeover":
      if (userOwned) refuse("alreadyTakenOver", "You already took over this work.");
      return row;
    case "handBack":
      if (!userOwned) refuse("notTakenOver", "Only work you took over can be handed back.");
      return row;
    case "acceptCompletion":
      if (row.executionPending) refuse("runRefused", "The continuation outcome must be reconciled before accepting completion.");
      // Only completion Stave could not verify waits for this decision.
      if (row.completionGoal === "pullRequest" || row.completionGoal === "merge")
        refuse("notAcceptable", "Accepting a result cannot establish an unobserved pull request or merge.");
      if (row.state !== "resultReady" && (row.state !== "blocked" || row.detailCode !== "unverifiedCompletion"))
        refuse("notAcceptable", "Only work whose completion Stave could not verify can be accepted as done.");
      return row;
    case "startNow":
      // Only work still waiting its turn: started work already holds its run.
      if (row.state !== "queued") refuse("notStartable", "Only queued work can start now.");
      return row;
    case "cancel":
      return row;
  }
}

/** Classify any failure into a stable reason plus a bounded English diagnostic. */
export function tarsControlRejection(error: unknown): TarsControlRejectionOutcome {
  const reason: TarsControlReason = error instanceof TarsControlRejection ? error.reason
    : error instanceof TarsOwnershipLostError ? "ownershipLost"
      : error instanceof TarsRunEndedError ? "runEnded" : error instanceof TarsRunHeldError ? "runHeld"
        : error instanceof TarsStageChangedError ? "stale"
          : error instanceof TarsRequestUnavailableError ? "requestUnavailable" : error instanceof TarsTaskBusyError ? "taskBusy"
          : error instanceof TarsRunRefusedError || error instanceof AgentRunCommandError ? "runRefused" : "unknown";
  const message = (error instanceof Error ? error.message : "The control could not be applied.").slice(0, 2_000).trim() ||
    "The control could not be applied.";
  return { reason, error: message };
}

export function tarsActionLedger(conversations: TarsConversationStore, requestId: string,
  now: () => string, proposal?: TarsProposalRef, responsibilities?: Pick<TarsStore, "get">): TarsControlLedger<TarsActionRecord> {
  return {
    key: `click:${requestId}`,
    settled: () => {
      const record = conversations.getAction(requestId);
      if (!record) throw new Error("The action record was not found.");
      return record.status === "pending" ? null : record;
    },
    // Only the responsibility's current proposal (the one the snapshot shows) may be confirmed.
    ...(proposal ? { admit: () => {
      if (!conversations.isCurrentProposal(proposal)) throw new TarsControlRejection("stale", TARS_PROPOSAL_SUPERSEDED);
    } } : {}),
    apply: (effect) => conversations.applyAction(requestId, () => {
      const record = conversations.getAction(requestId)!;
      if (record.action.kind !== "control") throw new Error("The record is not a control.");
      const before = responsibilities?.get(record.action.responsibilityId) ?? null;
      effect();
      return captureTarsControlUndo(record.action, before, responsibilities?.get(record.action.responsibilityId) ?? null);
    }, now(), proposal),
    queue: (effect, agentRunId) => conversations.applyAction(requestId, effect, now(), proposal, { agentRunId }),
    reject: ({ reason, error }) => conversations.rejectAction(requestId, reason, error, now(), proposal),
  };
}

/**
 * A confirming click names its proposal by request ID and must repeat it exactly:
 * it may only apply what the user was shown. Its outcome settles that proposal.
 * A task operation's input comes from the proposal the card showed; a click
 * that names one must name the same.
 */
function confirmedProposal(conversations: TarsConversationStore, input: TarsActInput): { ref: TarsProposalRef; input: TarsActInput["input"] } | undefined {
  const ref = parseTarsConfirmationRequestId(input.requestId);
  if (!ref) return undefined;
  const receipt = conversations.getReceipt(ref.messageId, ref.actionIndex);
  const action = receipt?.action;
  if (action?.kind !== "control" || action.responsibilityId !== input.responsibilityId ||
      action.expectedRevision !== input.expectedRevision || action.operation !== input.operation ||
      (input.input !== undefined && JSON.stringify(input.input) !== JSON.stringify(action.input)))
    throw new Error("This confirmation does not match its proposal.");
  if (receipt!.status !== "proposed" && !conversations.getAction(input.requestId))
    throw new Error("This proposal is not awaiting confirmation.");
  return { ref, input: action.input };
}

interface TarsActPorts {
  responsibilities?: TarsStore;
  conversations: TarsConversationStore;
  runtime: {
    act<R>(request: TarsControlRequest, ledger: TarsControlLedger<R>): Promise<R>;
    get(): Promise<TarsSnapshot>;
  };
  now?: () => string;
}

/** Click entry point: records intent by request ID, then uses the same admission as a proposed control. */
export async function actTars(rawInput: unknown, ports: TarsActPorts): Promise<TarsActResult> {
  const input = TarsActInputSchema.parse(rawInput);
  const now = ports.now ?? (() => new Date().toISOString());
  try {
    const confirmation = confirmedProposal(ports.conversations, input);
    const request: TarsActInput = confirmation?.input ? { ...input, input: confirmation.input } : input;
    ports.conversations.recordAction(request, now());
    const record = await ports.runtime.act(request, tarsActionLedger(ports.conversations, input.requestId, now, confirmation?.ref, ports.responsibilities));
    return { record, snapshot: await ports.runtime.get() };
  } catch (error) {
    // The fixed message lets callers retry the same request ID after a lock wait.
    throw isTarsStorageBusy(error) ? new TarsStorageBusyError() : error;
  }
}
