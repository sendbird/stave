import { z } from "zod";
export const TurnSnapshotOwnerSchema = z.object({ workspaceId: z.string().min(1).max(200), taskId: z.string().min(1).max(200) }).strict();
export const TurnSnapshotRestoreSchema = TurnSnapshotOwnerSchema.extend({ turnId: z.string().min(1).max(200) }).strict();
export const TurnSnapshotSchema = z.object({ turnId: z.string(), snapshotId: z.string(), createdAt: z.string() }).strict();
/** Why a turn has no snapshot; the turn itself still ran. */
export const TurnSnapshotSkipReasonSchema = z.enum(["captureFailed", "workspaceUnavailable"]);
export const TurnSnapshotSkipSchema = z.object({ turnId: z.string(), reason: TurnSnapshotSkipReasonSchema }).strict();
export const TurnSnapshotListSchema = z.object({ snapshots: z.array(TurnSnapshotSchema), skipped: z.array(TurnSnapshotSkipSchema), canUndo: z.boolean() }).strict();
export const TurnSnapshotResultSchema = z.object({ ok: z.boolean(), reason: z.enum(["runningTask", "sharedWorktree", "terminalRunning", "otherTaskChanges", "missingSnapshot", "obstructed", "unavailable"]).optional(), detail: z.string().optional() }).strict();
export type TurnSnapshotOwner = z.infer<typeof TurnSnapshotOwnerSchema>;
export type TurnSnapshotRestore = z.infer<typeof TurnSnapshotRestoreSchema>;
export type TurnSnapshotResult = z.infer<typeof TurnSnapshotResultSchema>;
export type TurnSnapshotList = z.infer<typeof TurnSnapshotListSchema>;
export type TurnSnapshotSkipReason = z.infer<typeof TurnSnapshotSkipReasonSchema>;
export interface TurnSnapshotsApi {
  list(args: TurnSnapshotOwner): Promise<TurnSnapshotList>;
  restore(args: TurnSnapshotRestore): Promise<TurnSnapshotResult>;
  undo(args: TurnSnapshotOwner): Promise<TurnSnapshotResult>;
}
