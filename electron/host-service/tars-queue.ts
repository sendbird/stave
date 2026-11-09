import { assertTarsSource } from "../main/tars-scope";
import type { PersistenceRepositoryRegistryEntry } from "../persistence/types";
import { isTarsStorageBusy, TarsStorageBusyError, type TarsConversationStore } from "../persistence/tars-conversation-store";
import type { TarsStore } from "../persistence/tars-store";
import { TarsReprioritizeInputSchema, type TarsActResult, type TarsQueueMove } from "../../src/lib/tars/conversation";
import { tarsSnapshotForWindow, type TarsResponsibility } from "../../src/lib/tars/types";
import { planTarsQueueMove, tarsQueueOf } from "../../src/lib/tars/queue-order";
import { TARS_CONTROL_STALE, TarsControlRejection, tarsControlRejection } from "./tars-control";

/**
 * The one admission for changing a responsibility's priority, by words (a
 * `reprioritize` decision) or by a click or drag: it is the user's Tars
 * responsibility at the revision they saw, it is still queued, and its
 * registered source still resolves. Started work keeps its place: the
 * runtime already chose it.
 */
export function admitTarsReprioritize(row: TarsResponsibility | null, request: { expectedRevision: number },
  registry: readonly PersistenceRepositoryRegistryEntry[]): TarsResponsibility {
  if (!row) throw new TarsControlRejection("notOwned", "The responsibility is not owned by the personal representative.");
  if (row.revision !== request.expectedRevision) throw new TarsControlRejection("stale", TARS_CONTROL_STALE);
  if (row.state !== "queued") throw new TarsControlRejection("notQueued", "Only queued responsibilities can be reprioritized.");
  try { assertTarsSource(row, [...registry]); }
  catch (error) { throw new TarsControlRejection("outOfScope", error instanceof Error ? error.message : "The registered scope could not be verified."); }
  return row;
}

const MOVE_REFUSAL = {
  notQueued: ["notQueued", "Only queued responsibilities can be reprioritized."],
  queueEdge: ["queueEdge", "This responsibility is already at that end of the queue."],
  stale: ["stale", "The queue changed. Refresh before moving this work."],
  noRoom: ["unknown", "The queue has no room for this order within priorities 0 to 100."],
} as const;

/**
 * Moves queued work and returns its new priority. Run inside the
 * transaction that also settles the request's record: the moved row and any
 * row a renumber touches commit together or not at all.
 */
export function applyTarsQueueMove(store: Pick<TarsStore, "get" | "patch" | "snapshot">, request: { responsibilityId: string; expectedRevision: number; move: TarsQueueMove },
  registry: readonly PersistenceRepositoryRegistryEntry[], now: string): number {
  const row = admitTarsReprioritize(store.get(request.responsibilityId), request, registry);
  const rows = store.snapshot().responsibilities;
  const plan = planTarsQueueMove(tarsQueueOf(rows), row.id, request.move);
  if (!plan.ok) { const [reason, message] = MOVE_REFUSAL[plan.reason]; throw new TarsControlRejection(reason, message); }
  const revisions = new Map(rows.map((entry) => [entry.id, entry.revision]));
  for (const change of plan.changes) store.patch(change.id, change.id === row.id ? row.revision : revisions.get(change.id)!, { priority: change.priority }, now);
  return plan.changes[0]!.priority;
}

interface TarsReprioritizePorts {
  conversations: TarsConversationStore;
  responsibilities: TarsStore;
  /** Must read the current persisted registry on every call, including inside the transaction. */
  readRegistry: () => PersistenceRepositoryRegistryEntry[];
  /** A move changes which queued work starts next. */
  requestTick: () => void;
  now?: () => string;
}

/**
 * A queue move from the tray: records intent by request ID, then admits and
 * applies the move with its record in one transaction, so a retry with the
 * same request ID applies at most once and a refusal keeps its reason.
 */
export async function reprioritizeTars(rawInput: unknown, ports: TarsReprioritizePorts): Promise<TarsActResult> {
  const input = TarsReprioritizeInputSchema.parse(rawInput);
  const now = ports.now ?? (() => new Date().toISOString());
  try {
    let record = ports.conversations.recordMove(input, now());
    if (record.status === "pending") {
      try {
        record = ports.conversations.applyMove(input.requestId, () =>
          applyTarsQueueMove(ports.responsibilities, input, ports.readRegistry(), now()), now());
        ports.requestTick();
      } catch (error) {
        // A lock wait changed nothing: the pending record stays retryable.
        if (isTarsStorageBusy(error)) throw error;
        const { reason, error: message } = tarsControlRejection(error);
        record = ports.conversations.rejectAction(input.requestId, reason, message, now());
      }
    }
    return { record, snapshot: tarsSnapshotForWindow(ports.responsibilities.snapshot()) };
  } catch (error) {
    throw isTarsStorageBusy(error) ? new TarsStorageBusyError() : error;
  }
}
