import { undoTarsRun, type TarsRunUndoPorts } from "./tars-run-undo";
import { canUndoTarsAction, isUnstartedTarsWork, isTarsDeliveryAction, TarsUndoActionInputSchema, TarsUndoActionRefused } from "../../src/lib/tars/action-undo";
import type { TarsUndoActionResult } from "../../src/lib/tars/conversation";
import type { TarsConversationStore } from "../persistence/tars-conversation-store";
import { isTarsStorageBusy, TarsStorageBusyError } from "../persistence/tars-conversation-store";
import type { TarsStore } from "../persistence/tars-store";
import type { PersistenceRepositoryRegistryEntry } from "../persistence/types";
import { assertTarsSource } from "../main/tars-scope";

interface UndoPorts extends TarsRunUndoPorts {
  conversations: TarsConversationStore;
  responsibilities: TarsStore;
  readRegistry(): PersistenceRepositoryRegistryEntry[];
  /** Runs on the responsibility's existing runtime queue; releases a local hold only after restoration succeeds. */
  serialize<T>(responsibilityId: string, restore: () => T): Promise<T>;
  /** Request-local withdrawal uses the runtime queue and its final run-admission fence. */
  withdrawDelivery?: (input: unknown) => Promise<TarsUndoActionResult>;
  now?: () => string;
}

/** Uses only host-saved prior values; never resumes a run or sends a compensating external command. */
export async function undoTarsAction(rawInput: unknown, ports: UndoPorts): Promise<TarsUndoActionResult> {
  const input = TarsUndoActionInputSchema.parse(rawInput);
  const initial = ports.conversations.getAction(input.requestId);
  if (initial?.undo?.kind === "run") return undoTarsRun(input, initial, ports);
  if (initial && isTarsDeliveryAction(initial)) return ports.withdrawDelivery?.(input) ?? { record: initial, refusal: "unsupported" };
  if (!initial || initial.status !== "applied" || !initial.undo) return { record: initial, refusal: "unsupported" };
  return ports.serialize(initial.action.responsibilityId, () => {
    try {
      const record = ports.conversations.undoAction(input, (current) => {
        if (!canUndoTarsAction(current)) throw new TarsUndoActionRefused("unsupported");
        const undo = current.undo!;
        const store = ports.responsibilities;
        const registry = ports.readRegistry();
        const scope = (id: string, revision: number) => {
          const row = store.get(id);
          if (!row || row.revision !== revision) throw new TarsUndoActionRefused("stale");
          try { assertTarsSource(row, registry); }
          catch { throw new TarsUndoActionRefused("outOfScope"); }
          return row;
        };
        const now = ports.now?.() ?? new Date().toISOString();
        if (undo.kind === "queue") {
          // New work, a started neighbor or any intervening edit invalidates the original position.
          const queue = store.snapshot().responsibilities.filter((row) => row.state === "queued");
          const expected = new Map(undo.queue.map((row) => [row.id, row.revision]));
          if (queue.length !== expected.size || queue.some((row) => expected.get(row.id) !== row.revision)) throw new TarsUndoActionRefused("stale");
          for (const prior of undo.priorities) {
            const row = scope(prior.id, prior.afterRevision);
            if (row.state !== "queued") throw new TarsUndoActionRefused("stale");
          }
          for (const prior of undo.priorities) store.patch(prior.id, prior.afterRevision, { priority: prior.before }, now);
        } else if (undo.kind === "unstarted") {
          const row = scope(current.action.responsibilityId, undo.afterRevision);
          const expectedState = current.action.kind === "control" && current.action.operation === "pause" ? "paused" : "takenOver";
          if (row.state !== expectedState || !isUnstartedTarsWork(row)) throw new TarsUndoActionRefused("stale");
          store.patch(row.id, row.revision, { state: "queued", detail: undo.detail, detailCode: undo.detailCode ?? null,
            detailParams: undo.detailParams ?? null }, now);
        }
      }, ports.now?.() ?? new Date().toISOString());
      return { record, refusal: null };
    } catch (error) {
      if (isTarsStorageBusy(error)) throw new TarsStorageBusyError();
      if (!(error instanceof TarsUndoActionRefused)) throw error;
      return { record: ports.conversations.getAction(input.requestId), refusal: error.reason };
    }
  });
}
