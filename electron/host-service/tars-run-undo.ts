import type { TarsActionRecord, TarsUndoActionResult } from "../../src/lib/tars/conversation";
import { TarsUndoActionRefused, type TarsUndoActionInput } from "../../src/lib/tars/action-undo";
import type { TarsControlLedger, TarsControlRequest } from "./tars-control";
import type { TarsConversationStore } from "../persistence/tars-conversation-store";
import type { TarsStore } from "../persistence/tars-store";
import type { PersistenceRepositoryRegistryEntry } from "../persistence/types";
import { assertTarsSource } from "../main/tars-scope";

export interface TarsRunUndoPorts {
  conversations: TarsConversationStore;
  responsibilities: TarsStore;
  readRegistry(): PersistenceRepositoryRegistryEntry[];
  control?: (request: TarsControlRequest, ledger: TarsControlLedger<TarsUndoActionResult>) => Promise<TarsUndoActionResult>;
  now?: () => string;
}

/** Undo means pause the same run, never rewind work it already performed. The runtime serializes and admits the stop. */
export async function undoTarsRun(input: TarsUndoActionInput, initial: TarsActionRecord, ports: TarsRunUndoPorts): Promise<TarsUndoActionResult> {
  if (!ports.control || initial.undo?.kind !== "run") return { record: initial, refusal: "unsupported" };
  if (initial.undo.undoneAt) return { record: initial, refusal: null };
  const refusal = (reason: "stale" | "outOfScope") => ({ record: ports.conversations.getAction(input.requestId), refusal: reason });
  const check = () => {
    const record = ports.conversations.getAction(input.requestId);
    const row = ports.responsibilities.get(initial.action.responsibilityId);
    if (!record || record.revision !== input.expectedRevision || record.undo?.kind !== "run" || !row
      || row.revision !== record.undo.afterRevision || row.agentRunId !== record.undo.agentRunId
      || (row.state !== "running" && row.state !== "waiting" && row.state !== "queued")) throw new TarsUndoActionRefused("stale");
    try { assertTarsSource(row, ports.readRegistry()); }
    catch { throw new TarsUndoActionRefused("outOfScope"); }
  };
  try {
    check();
    return await ports.control({ responsibilityId: initial.action.responsibilityId,
      expectedRevision: initial.undo.afterRevision, operation: "pause" }, {
      key: `undo:${input.requestId}`,
      settled: () => {
        const record = ports.conversations.getAction(input.requestId);
        return record?.undo?.undoneAt ? { record, refusal: null } : null;
      },
      admit: check,
      apply: (effect) => ({ record: ports.conversations.undoAction(input, () => { check(); effect(); },
        ports.now?.() ?? new Date().toISOString()), refusal: null }),
      reject: ({ reason }) => refusal(reason === "outOfScope" ? "outOfScope" : "stale"),
    });
  } catch (error) {
    if (error instanceof TarsUndoActionRefused) return { record: ports.conversations.getAction(input.requestId), refusal: error.reason };
    throw error;
  }
}
