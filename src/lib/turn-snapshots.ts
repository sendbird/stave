import { z } from "zod";
export const TurnSnapshotOwnerSchema = z.object({ workspaceId: z.string().min(1).max(200), taskId: z.string().min(1).max(200) }).strict();
export const TurnSnapshotRestoreSchema = TurnSnapshotOwnerSchema.extend({ turnId: z.string().min(1).max(200) }).strict();
export const TurnSnapshotSchema = z.object({ turnId: z.string(), snapshotId: z.string(), createdAt: z.string() }).strict();
export const TurnSnapshotListSchema = z.object({ snapshots: z.array(TurnSnapshotSchema), canUndo: z.boolean() }).strict();
export const TurnSnapshotResultSchema = z.object({ ok: z.boolean(), reason: z.enum(["runningTask", "sharedWorktree", "otherTaskChanges", "missingSnapshot", "unavailable"]).optional(), detail: z.string().optional() }).strict();
export type TurnSnapshotOwner = z.infer<typeof TurnSnapshotOwnerSchema>;
export type TurnSnapshotRestore = z.infer<typeof TurnSnapshotRestoreSchema>;
export type TurnSnapshotResult = z.infer<typeof TurnSnapshotResultSchema>;
export interface TurnSnapshotsApi {
  list(args: TurnSnapshotOwner): Promise<z.infer<typeof TurnSnapshotListSchema>>;
  restore(args: TurnSnapshotRestore): Promise<TurnSnapshotResult>;
  undo(args: TurnSnapshotOwner): Promise<TurnSnapshotResult>;
}
