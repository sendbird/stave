import {
  parseTarsConfirmationRequestId, TarsActInputSchema, type TarsActInput, type TarsActResult, type TarsActionRecord,
  type TarsControlAction, type TarsControlOperation, type TarsControlReason,
} from "../../src/lib/tars/conversation";
import type { TarsResponsibility, TarsSnapshot } from "../../src/lib/tars/types";
import { isTarsStorageBusy, TarsStorageBusyError, type TarsConversationStore, type TarsProposalRef } from "../persistence/tars-conversation-store";
import { TarsOwnershipLostError, TarsRunEndedError, TarsRunHeldError } from "./tars-ownership";

export type TarsControlRequest = Pick<TarsControlAction, "responsibilityId" | "expectedRevision" | "operation">;

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
/** Operations that give Tars execution authority again; they recheck the registered scope. */
export const TARS_GRANTING_OPERATIONS: ReadonlySet<TarsControlOperation> = new Set(["resume", "handBack"]);

/**
 * Deterministic admission. Admission checks the caller's revision; dispatch
 * rechecks the same ownership rules against the current row, because only this
 * runtime's own preparation and observation may have advanced it meanwhile.
 */
export function admitTarsControl(row: TarsResponsibility | null, request: TarsControlRequest,
  stage: "admission" | "dispatch" = "admission"): TarsResponsibility {
  const refuse = (reason: TarsControlReason, message: string): never => { throw new TarsControlRejection(reason, message); };
  if (!row) return refuse("notOwned", "The responsibility is not owned by the personal representative.");
  if (stage === "admission" && row.revision !== request.expectedRevision) refuse("stale", TARS_CONTROL_STALE);
  if (row.state === "completed" || row.state === "cancelled") refuse("ended", "This responsibility has already ended.");
  const userOwned = row.state === "takenOver";
  // Its run already ended reporting success Stave could not verify: only the user's
  // acceptance or a cancel settles it; new work to verify it is a new request.
  if (row.state === "blocked" && row.detailCode === "unverifiedCompletion" &&
      request.operation !== "acceptCompletion" && request.operation !== "cancel")
    refuse("runEnded", "Its run already ended. Accept it as done, cancel it, or ask Tars for new verification work.");
  switch (request.operation) {
    case "pause":
      if (userOwned) refuse("takenOver", "You took over this work. Hand it back or cancel it.");
      if (row.state === "paused") refuse("alreadyPaused", "This responsibility is already paused.");
      return row;
    case "resume":
      // Human takeover always wins: only an explicit hand-back returns the work.
      if (userOwned) refuse("takenOver", "You took over this work. Tars continues it only after you hand it back.");
      if (row.state !== "paused" && row.state !== "blocked") refuse("notResumable", "Only paused or blocked work can resume.");
      return row;
    case "takeover":
      if (userOwned) refuse("alreadyTakenOver", "You already took over this work.");
      return row;
    case "handBack":
      if (!userOwned) refuse("notTakenOver", "Only work you took over can be handed back.");
      return row;
    case "acceptCompletion":
      // Only completion Stave could not verify waits for this decision.
      if (row.state !== "blocked" || row.detailCode !== "unverifiedCompletion")
        refuse("notAcceptable", "Only work whose completion Stave could not verify can be accepted as done.");
      return row;
    case "cancel":
      return row;
  }
}

/** Classify any failure into a stable reason plus a bounded English diagnostic. */
export function tarsControlRejection(error: unknown): TarsControlRejectionOutcome {
  const reason: TarsControlReason = error instanceof TarsControlRejection ? error.reason
    : error instanceof TarsOwnershipLostError ? "ownershipLost"
      : error instanceof TarsRunEndedError ? "runEnded" : error instanceof TarsRunHeldError ? "runHeld" : "unknown";
  const message = (error instanceof Error ? error.message : "The control could not be applied.").slice(0, 2_000).trim() ||
    "The control could not be applied.";
  return { reason, error: message };
}

export function tarsActionLedger(conversations: TarsConversationStore, requestId: string,
  now: () => string, proposal?: TarsProposalRef): TarsControlLedger<TarsActionRecord> {
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
    apply: (effect) => conversations.applyAction(requestId, effect, now(), proposal),
    reject: ({ reason, error }) => conversations.rejectAction(requestId, reason, error, now(), proposal),
  };
}

/**
 * A confirming click names its proposal by request ID and must repeat it exactly:
 * it may only apply what the user was shown. Its outcome settles that proposal.
 */
function confirmedProposal(conversations: TarsConversationStore, input: TarsActInput): TarsProposalRef | undefined {
  const ref = parseTarsConfirmationRequestId(input.requestId);
  if (!ref) return undefined;
  const receipt = conversations.getReceipt(ref.messageId, ref.actionIndex);
  const action = receipt?.action;
  if (action?.kind !== "control" || action.responsibilityId !== input.responsibilityId ||
      action.expectedRevision !== input.expectedRevision || action.operation !== input.operation)
    throw new Error("This confirmation does not match its proposal.");
  if (receipt!.status !== "proposed" && !conversations.getAction(input.requestId))
    throw new Error("This proposal is not awaiting confirmation.");
  return ref;
}

interface TarsActPorts {
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
    const proposal = confirmedProposal(ports.conversations, input);
    ports.conversations.recordAction(input, now());
    const record = await ports.runtime.act(input, tarsActionLedger(ports.conversations, input.requestId, now, proposal));
    return { record, snapshot: await ports.runtime.get() };
  } catch (error) {
    // The fixed message lets callers retry the same request ID after a lock wait.
    throw isTarsStorageBusy(error) ? new TarsStorageBusyError() : error;
  }
}
