import type { TarsActionReceipt, TarsControlAction } from "../../src/lib/tars/conversation";
import { tarsActionLedger, TarsControlRejection, type TarsControlLedger } from "./tars-control";
import type { TarsDecisionPorts } from "./tars-decisions";

/** Keep the visible action record (including Undo/delivery) and its proposal receipt in the same transaction. */
export function tarsAutoControlLedger(ports: TarsDecisionPorts, messageId: string, index: number,
  revision: number, action: TarsControlAction, now: () => string, stillAutomatic: () => boolean): TarsControlLedger<TarsActionReceipt> {
  const requestId = `auto:${messageId}:${index}`;
  const { kind: _kind, ...request } = action;
  ports.conversations.recordAction({ ...request, requestId, source: "automatic" }, now());
  const ledger = tarsActionLedger(ports.conversations, requestId, now, undefined, ports.responsibilities);
  return {
    key: ledger.key,
    settled: () => {
      const receipt = ports.conversations.getReceipt(messageId, index);
      if (receipt && receipt.status !== "pending") return receipt;
      const record = ledger.settled();
      if (!record) return null;
      // A failed receipt write after a recorded rejection must never turn that rejected request into an effect.
      return record.status === "rejected"
        ? ports.conversations.settleReceipt(messageId, index, revision,
          { status: "rejected", reason: record.reason!, error: record.error! }, now())
        : ports.conversations.applyReceipt(messageId, index, revision, () => ({ responsibilityId: action.responsibilityId }), now());
    },
    admit: () => {
      if (!stillAutomatic()) throw new TarsControlRejection("runRefused", "This action now needs your confirmation.");
    },
    apply: (effect) => ports.conversations.applyReceipt(messageId, index, revision, () => {
      ledger.apply(effect);
      return { responsibilityId: action.responsibilityId };
    }, now()),
    queue: (effect, agentRunId) => ports.conversations.applyReceipt(messageId, index, revision, () => {
      ledger.queue!(effect, agentRunId);
      return { responsibilityId: action.responsibilityId };
    }, now()),
    reject: (outcome) => {
      ledger.reject(outcome);
      return ports.conversations.settleReceipt(messageId, index, revision, { status: "rejected", ...outcome }, now());
    },
  };
}
