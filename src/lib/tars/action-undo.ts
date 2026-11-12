import { z } from "zod";
import { TarsWorkspaceUndoSchema } from "./workspace-action";
import type { TarsActionRecord } from "./conversation";
import { TarsDetailCodeSchema, TarsDetailParamsSchema, type TarsResponsibility } from "./types";

const Id = z.string().trim().min(1).max(256);
const Revision = z.number().int().min(1);
const Priority = z.number().int().min(0).max(100);

/** Prior values only for effects that never reached a run. Guards describe the saved state after the effect. */
export const TarsActionUndoSchema = z.discriminatedUnion("kind", [
  TarsWorkspaceUndoSchema,
  z.object({ kind: z.literal("delivery"), undoneAt: z.iso.datetime().optional() }).strict(),
  z.object({ kind: z.literal("queue"),
    priorities: z.array(z.object({ id: Id, before: Priority, afterRevision: Revision }).strict()).min(1).max(10_000),
    queue: z.array(z.object({ id: Id, revision: Revision }).strict()).min(1).max(10_000),
    undoneAt: z.iso.datetime().optional(),
  }).strict(),
  z.object({ kind: z.literal("unstarted"), afterRevision: Revision,
    detail: z.string().max(2_000).nullable(), detailCode: TarsDetailCodeSchema.nullable().optional(),
    detailParams: TarsDetailParamsSchema.nullable().optional(), undoneAt: z.iso.datetime().optional(),
  }).strict(),
]);
export type TarsActionUndo = z.infer<typeof TarsActionUndoSchema>;

/** The caller names a saved record, never supplies restoration values. */
export const TarsUndoActionInputSchema = z.object({ requestId: Id, expectedRevision: Revision }).strict();
export type TarsUndoActionInput = z.infer<typeof TarsUndoActionInputSchema>;

export const TarsUndoActionRefusalSchema = z.enum(["unsupported", "stale", "outOfScope", "started", "pending"]);
export type TarsUndoActionRefusal = z.infer<typeof TarsUndoActionRefusalSchema>;

/** Internal refusal; transport/storage failures stay failures so the UI can offer a retry. */
export class TarsUndoActionRefused extends Error {
  constructor(readonly reason: TarsUndoActionRefusal) { super(`Action Undo refused: ${reason}`); }
}

export function isUnstartedTarsWork(row: TarsResponsibility) {
  return !row.agentRunId && !row.taskId && !row.executionWorkspaceId && !row.executionPending;
}

export function captureTarsControlUndo(action: TarsActionRecord["action"], before: TarsResponsibility | null,
  after: TarsResponsibility | null): TarsActionUndo | undefined {
  if (action.kind !== "control" || (action.operation !== "pause" && action.operation !== "takeover") || !before || !after ||
    before.state !== "queued" || !isUnstartedTarsWork(before) || !isUnstartedTarsWork(after) ||
    after.revision !== before.revision + 1 || after.state !== (action.operation === "pause" ? "paused" : "takenOver")) return undefined;
  return { kind: "unstarted", afterRevision: after.revision, detail: before.detail,
    ...(before.detailCode !== undefined ? { detailCode: before.detailCode } : {}),
    ...(before.detailParams !== undefined ? { detailParams: before.detailParams } : {}) };
}

export function captureTarsQueueUndo(before: readonly TarsResponsibility[], after: readonly TarsResponsibility[]): TarsActionUndo {
  const previous = new Map(before.map((row) => [row.id, row]));
  return { kind: "queue", priorities: after.filter((row) => previous.get(row.id)?.revision !== row.revision)
    .map((row) => ({ id: row.id, before: previous.get(row.id)!.priority, afterRevision: row.revision })),
    queue: after.filter((row) => row.state === "queued").map(({ id, revision }) => ({ id, revision })) };
}

/** A saved pending delivery can be withdrawn; this never invents an inverse operation for a run. */
export function isTarsDeliveryAction(record: TarsActionRecord) {
  return record.status === "applied" && record.action.kind === "control" && record.action.operation === "message" && Boolean(record.delivery);
}

/** Old and unsupported effects never acquire an Undo by guessing prior values. */
export function canUndoTarsAction(record: TarsActionRecord): boolean {
  if (isTarsDeliveryAction(record)) return !record.undo?.undoneAt &&
    (record.delivery?.status === "queued" || record.delivery?.status === "delivering");
  if (record.status !== "applied" || !record.undo || record.undo.undoneAt) return false;
  if (record.undo.kind === "delivery") return false;
  if (record.undo.kind === "workspace") return record.action.kind === "workspace";
  return record.undo.kind === "queue" ? record.action.kind === "move"
    : record.action.kind === "control" && (record.action.operation === "pause" || record.action.operation === "takeover");
}
