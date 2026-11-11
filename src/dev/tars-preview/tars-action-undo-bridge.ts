import { canUndoTarsAction, isTarsDeliveryAction } from "@/lib/tars/action-undo";
import type { TarsBridgeApi, TarsSnapshot } from "@/lib/tars/types";
import type { TarsConversation } from "@/lib/tars/conversation";

/** In-memory preview only; production admission and transactions live in the host. */
export function previewTarsActionUndo(ports: { conversation: Pick<TarsConversation, "records">; getSnapshot(): TarsSnapshot; setSnapshot(next: TarsSnapshot): void; changed(): void; deliveryOutcome?: "pending" | "started" }): NonNullable<TarsBridgeApi["undoAction"]> {
  return async (input) => {
    const record = ports.conversation.records.find((row) => row.requestId === input.requestId) ?? null;
    if (record?.undo?.undoneAt) return { record: structuredClone(record), refusal: null };
    if (!record || !canUndoTarsAction(record)) return { record, refusal: "unsupported" };
    if (record.revision !== input.expectedRevision) return { record, refusal: "stale" };
    if (isTarsDeliveryAction(record)) {
      const at = new Date().toISOString();
      record.delivery!.withdrawRequestedAt = at;
      record.delivery!.status = ports.deliveryOutcome === "started" ? "delivered" : ports.deliveryOutcome === "pending" ? record.delivery!.status : "withdrawn";
      if (!ports.deliveryOutcome) record.undo = { kind: "delivery", undoneAt: at };
      record.revision++; record.updatedAt = at; ports.changed();
      return { record: structuredClone(record), refusal: ports.deliveryOutcome ?? null };
    }
    const snapshot = ports.getSnapshot(), undo = record.undo!;
    if (undo.kind === "queue") {
      const queue = snapshot.responsibilities.filter((row) => row.state === "queued");
      if (queue.length !== undo.queue.length || queue.some((row) => !undo.queue.some((saved) => saved.id === row.id && saved.revision === row.revision))) return { record, refusal: "stale" };
    } else if (undo.kind === "unstarted") {
      const row = snapshot.responsibilities.find((row) => row.id === record.action.responsibilityId);
      if (row?.revision !== undo.afterRevision) return { record, refusal: "stale" };
    }
    ports.setSnapshot({ ...snapshot, responsibilities: snapshot.responsibilities.map((row) => {
      const prior = undo.kind === "queue" ? undo.priorities.find((prior) => prior.id === row.id) : undefined;
      return prior ? { ...row, priority: prior.before, revision: row.revision + 1 }
        : undo.kind === "unstarted" && row.id === record.action.responsibilityId
          ? { ...row, state: "queued", detail: undo.detail, detailCode: undo.detailCode, detailParams: undo.detailParams, revision: row.revision + 1 } : row;
    }) });
    record.undo!.undoneAt = new Date().toISOString(); record.revision++;
    ports.changed();
    return { record: structuredClone(record), refusal: null };
  };
}
