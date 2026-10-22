import type { ProviderSessionCursor } from "@/lib/db/workspaces.db";
import { buildTurnHandoffContextPart } from "@/lib/task-context/handoff-delivery";
import {
  emptyHandoffRecord,
  TaskHandoffRecordSchema,
  type TaskHandoffRecord,
} from "@/lib/task-context/handoff-record";
import type {
  SaveTaskHandoffArgs,
  SaveTaskHandoffResponse,
} from "@/lib/task-context/handoff-record-ipc";
import type { CanonicalRetrievedContextPart } from "@/lib/providers/provider.types";

/** A failed read, kept apart from "no record yet" so the panel never shows a failure as empty. */
export class TaskHandoffReadError extends Error {}

function getPersistenceApi() {
  return window.api?.persistence;
}

/** The task's record; an empty one without a desktop bridge or before the first save. */
export async function readTaskHandoff(args: { workspaceId: string; taskId: string }): Promise<TaskHandoffRecord> {
  const persistence = getPersistenceApi();
  if (!persistence?.readTaskHandoff) {
    return emptyHandoffRecord();
  }
  const response = await persistence.readTaskHandoff(args);
  if (!response.ok) {
    throw new TaskHandoffReadError(response.message);
  }
  const parsed = TaskHandoffRecordSchema.safeParse(response.record);
  if (!parsed.success) {
    throw new TaskHandoffReadError("Invalid handoff record payload.");
  }
  return parsed.data;
}

export async function saveTaskHandoff(args: SaveTaskHandoffArgs): Promise<SaveTaskHandoffResponse> {
  const persistence = getPersistenceApi();
  if (!persistence?.saveTaskHandoff) {
    // i18n-ignore: diagnostic; the panel shows its own translated error
    return { ok: false, message: "Handoff records are saved in the Stave desktop app." };
  }
  return persistence.saveTaskHandoff(args);
}

/**
 * The record as context for the next turn. A record that cannot be read is
 * left out rather than holding the message back; the turn still carries the
 * conversation excerpt, and its session is not counted as having the record.
 */
export async function collectTaskHandoffContextParts(args: {
  workspaceId: string;
  taskId: string;
  turnId?: string;
  /** The turn's provider session; a record it has not received goes as an update. */
  providerSession?: ProviderSessionCursor | null;
}): Promise<CanonicalRetrievedContextPart[]> {
  try {
    const part = buildTurnHandoffContextPart({
      record: await readTaskHandoff({ workspaceId: args.workspaceId, taskId: args.taskId }),
      turnId: args.turnId,
      session: args.providerSession,
    });
    return part ? [part] : [];
  } catch (error) {
    console.warn("[handoff-record] could not read the record for this turn", { taskId: args.taskId, error: String(error) });
    return [];
  }
}
