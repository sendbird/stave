import { TarsUndoActionInputSchema, TarsUndoActionRefused } from "../../src/lib/tars/action-undo";
import type { TarsMessageDelivery, TarsUndoActionResult } from "../../src/lib/tars/conversation";
import type { TarsContinuation, TarsResponsibility, TarsResponsibilityPatch } from "../../src/lib/tars/types";
import type { TarsRuntimePorts } from "./tars-runtime";
import { TarsRequestUnavailableError } from "./tars-ownership";

/** Adoption records execution identity without resuming work held by the user. */
export function tarsContinuationRunPatch(row: TarsResponsibility, continuation: TarsContinuation, runId: string): TarsResponsibilityPatch {
  return { agentRunId: runId, previousRunIds: [...new Set([...(row.previousRunIds ?? []), continuation.previousRunId])],
    state: row.state === "paused" || row.state === "takenOver" || row.state === "cancelled" ? row.state : "running", executionPending: false,
    reverifyAfter: continuation.requestedAt, detail: null, activeStage: undefined, pendingRequests: undefined,
    stageAsksUser: undefined, stageWait: undefined };
}

/** The existing Undo path withdraws recorded words, never the work's old or current run. */
export function createTarsWithdrawal(deps: {
  ports: TarsRuntimePorts;
  enqueue: <T>(key: string, work: () => Promise<T> | T) => Promise<T>;
  patch: (row: TarsResponsibility, patch: TarsResponsibilityPatch) => TarsResponsibility;
  reachedTask: (requestId: string, delivery: TarsMessageDelivery) => boolean | null;
  now: () => string;
  requestTick: () => void;
}) {
  // Withdraws admission synchronously while a start awaits host preflight; its final guard reads this set.
  const pending = new Map<string, number>();
  const requested = (id: string) => pending.has(id);
  return {
    requested,
    assertAdmitted(id: string) {
      if (requested(id) || deps.ports.messages?.getAction(id)?.delivery?.withdrawRequestedAt)
        throw new TarsRequestUnavailableError("This request is being withdrawn.");
    },
    async withdraw(raw: unknown, serialized = false): Promise<TarsUndoActionResult> {
      const input = TarsUndoActionInputSchema.parse(raw);
      const queue = deps.ports.messages;
      const initial = queue?.getAction(input.requestId);
      if (!initial?.delivery || initial.action.kind !== "control" || initial.action.operation !== "message")
        return { record: initial ?? null, refusal: "unsupported" };
      const id = initial.action.responsibilityId;
      if (initial.delivery.status !== "withdrawn" && !initial.delivery.withdrawRequestedAt && initial.revision !== input.expectedRevision)
        return { record: initial, refusal: "stale" };
      pending.set(input.requestId, (pending.get(input.requestId) ?? 0) + 1);
      try {
        // Mark before joining the work queue, so a concurrent start's final guard cannot pass.
        const initialRow = deps.ports.store.get(id);
        if (!initialRow) return { record: initial, refusal: "outOfScope" };
        try { await deps.ports.validateScope({ ...initialRow, workspaceId: initialRow.executionWorkspaceId ?? initialRow.workspaceId }); }
        catch { return { record: initial, refusal: "outOfScope" }; }
        if (["queued", "delivering"].includes(initial.delivery.status))
          queue!.requestDeliveryWithdrawal(input.requestId, input.expectedRevision, deps.now());
        const reconcile = async (): Promise<TarsUndoActionResult> => {
          let record = queue!.getAction(input.requestId)!;
          const result = (refusal: TarsUndoActionResult["refusal"]): TarsUndoActionResult => ({ record, refusal });
          if (record.delivery!.status === "withdrawn") return result(null);
          if (record.delivery!.status === "delivered") return result("started");
          if (!record.delivery?.withdrawRequestedAt) return result("stale");
          if (!["queued", "delivering"].includes(record.delivery!.status)) return result("unsupported");
          const row = deps.ports.store.get(id);
          if (!row) return result("outOfScope");
          try { await deps.ports.validateScope({ ...row, workspaceId: row.executionWorkspaceId ?? row.workspaceId }); }
          catch { return result("outOfScope"); }
          const continuation = row.continuation?.requestId === input.requestId ? row.continuation : null;
          if (continuation) {
            if (!deps.ports.reconcileContinuation) return result("pending");
            let runId: string | null;
            try { runId = await deps.ports.reconcileContinuation(row, continuation); }
            catch { return result("pending"); }
            if (runId) {
              // This exact scope already owns a run. Keep it and preserve any user-held state.
              deps.patch(row, tarsContinuationRunPatch(row, continuation, runId));
              record = queue!.transitionDelivery(input.requestId, [record.delivery!.status], { status: "delivered", agentRunId: runId }, deps.now())!;
              return result("started");
            }
            if (row.agentRunId !== continuation.previousRunId) return result("pending");
          } else if (record.delivery!.status === "delivering") {
            const reached = deps.reachedTask(input.requestId, record.delivery!);
            if (reached === null) return result("pending");
            if (reached) {
              record = queue!.transitionDelivery(input.requestId, ["delivering"], { status: "delivered" }, deps.now())!;
              return result("started");
            }
          }
          record = queue!.withdrawDelivery(input.requestId, record.revision, () => {
            if (continuation && row.executionPending) deps.patch(row, { executionPending: false });
          }, deps.now());
          deps.requestTick();
          return result(null);
        };
        return await (serialized ? reconcile() : deps.enqueue(id, reconcile));
      } catch (error) {
        if (error instanceof TarsUndoActionRefused)
          return { record: queue?.getAction(input.requestId) ?? null, refusal: error.reason };
        throw error;
      } finally {
        const count = pending.get(input.requestId)! - 1;
        if (count) pending.set(input.requestId, count); else pending.delete(input.requestId);
      }
    },
  };
}
