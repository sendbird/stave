import {
  TurnHistoryPageSchema,
  TurnRecordSchema,
  type ListTaskTurnHistoryArgs,
  type ReadTaskTurnRecordArgs,
  type TurnHistoryPage,
  type TurnRecord,
} from "@/lib/providers/turn-history";

/** A failed read, kept apart from "no turns" so the picker never shows a failure as empty. */
export class TurnHistoryReadError extends Error {}

function getPersistenceApi() {
  return window.api?.persistence;
}

/** A task's turns, newest first. Without a desktop bridge there is no history to read. */
export async function listTaskTurnHistory(args: ListTaskTurnHistoryArgs): Promise<TurnHistoryPage> {
  const persistence = getPersistenceApi();
  if (!persistence?.listTaskTurnHistory) {
    return { turns: [], hasMore: false };
  }
  const response = await persistence.listTaskTurnHistory(args);
  if (!response.ok) {
    throw new TurnHistoryReadError(response.message);
  }
  const parsed = TurnHistoryPageSchema.safeParse(response.page);
  if (!parsed.success) {
    throw new TurnHistoryReadError("Invalid turn history payload.");
  }
  return parsed.data;
}

/** One turn's record, or null when the turn is no longer saved. */
export async function readTaskTurnRecord(args: ReadTaskTurnRecordArgs): Promise<TurnRecord | null> {
  const persistence = getPersistenceApi();
  if (!persistence?.readTaskTurnRecord) {
    return null;
  }
  const response = await persistence.readTaskTurnRecord(args);
  if (!response.ok) {
    throw new TurnHistoryReadError(response.message);
  }
  if (response.record === null) {
    return null;
  }
  const parsed = TurnRecordSchema.safeParse(response.record);
  if (!parsed.success) {
    throw new TurnHistoryReadError("Invalid turn record payload.");
  }
  // The schema checks the envelope and each message's shape; the parts were
  // written by this app and are read as the transcript reads them.
  return response.record;
}
