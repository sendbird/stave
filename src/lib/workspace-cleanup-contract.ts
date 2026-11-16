import { z } from "zod";

const Id = z.string().min(1).max(4096);
export const CleanupRuleSchema = z.object({ enabled: z.boolean(), value: z.number().int().min(1).max(3650) }).strict();
export const WorkspaceCleanupPolicySchema = z.object({
  merged: CleanupRuleSchema,
  inactive: CleanupRuleSchema,
  archived: CleanupRuleSchema,
  maximum: CleanupRuleSchema,
}).strict();
export type WorkspaceCleanupPolicy = z.infer<typeof WorkspaceCleanupPolicySchema>;
export const DEFAULT_WORKSPACE_CLEANUP_POLICY: WorkspaceCleanupPolicy = {
  merged: { enabled: false, value: 1 }, inactive: { enabled: false, value: 30 },
  archived: { enabled: false, value: 30 }, maximum: { enabled: false, value: 10 },
};
export const WorkspaceCleanupListArgsSchema = z.object({ scanDisk: z.boolean().optional() }).strict();
export const WorkspaceCleanupActArgsSchema = z.object({
  action: z.enum(["archive", "delete", "restore", "deleteBranch", "removeWorktree"]),
  /** Refuse if a concurrent Restore made the workspace active before execution. */
  archivedOnly: z.boolean().optional(),
  workspaceId: Id, repositoryPath: Id, deleteBranch: z.boolean().optional(), forceDeleteBranch: z.boolean().optional(),
}).strict();
export type WorkspaceCleanupActArgs = z.infer<typeof WorkspaceCleanupActArgsSchema>;
export const WorkspaceCleanupRowSchema = z.object({
  id: Id, repositoryPath: Id, repositoryName: z.string(), name: z.string(), path: z.string(), branch: z.string(),
  archived: z.boolean(), branchOnly: z.boolean(), readOnly: z.boolean(), archivedAt: z.string().nullable(),
  lastActive: z.string().nullable(), blockers: z.array(z.string()), reasons: z.array(z.string()),
  bytes: z.number().nonnegative().nullable(), branchDeletable: z.boolean(),
}).strict();
export type WorkspaceCleanupRow = z.infer<typeof WorkspaceCleanupRowSchema>;
export const WorkspaceCleanupResultSchema = z.object({
  ok: z.boolean(), workspaceId: Id, action: WorkspaceCleanupActArgsSchema.shape.action,
  workspaceName: z.string().optional(), reason: z.string().nullable(), readOnly: z.boolean().optional(),
}).strict();
export type WorkspaceCleanupResult = z.infer<typeof WorkspaceCleanupResultSchema>;
export const WorkspaceCleanupRecentSchema = WorkspaceCleanupResultSchema.extend({ at: z.string(), repositoryPath: Id, automatic: z.boolean() }).strict();
export const WorkspaceCleanupStateSchema = z.object({
  automaticFailureAt: z.record(z.string(), z.number()).optional(),
  policy: WorkspaceCleanupPolicySchema.strip().extend({ merged: CleanupRuleSchema.strip(), inactive: CleanupRuleSchema.strip(), archived: CleanupRuleSchema.strip(), maximum: CleanupRuleSchema.strip() }), recent: z.array(WorkspaceCleanupRecentSchema.strip()).max(200), lastRun: z.number(),
}).strip();
export const WorkspaceCleanupListResultSchema = z.object({
  rows: z.array(WorkspaceCleanupRowSchema), policy: WorkspaceCleanupPolicySchema,
  recent: z.array(WorkspaceCleanupRecentSchema),
}).strict();
export const WorkspaceCleanupRunResultSchema = z.object({ results: z.array(WorkspaceCleanupResultSchema) }).strict();
export const WorkspaceCleanupChangedSchema = z.object({ workspaceId: Id, repositoryPath: Id, stage: z.enum(["preparing", "prepared", "preparationFailed"]).optional(), command: z.string().optional() }).strict();
export interface WorkspaceCleanupApi {
  onChanged(listener: (event: z.infer<typeof WorkspaceCleanupChangedSchema>) => void): () => void;
  list(args?: z.infer<typeof WorkspaceCleanupListArgsSchema>): Promise<z.infer<typeof WorkspaceCleanupListResultSchema>>;
  listArchived(): Promise<WorkspaceCleanupRow[]>;
  act(args: WorkspaceCleanupActArgs): Promise<WorkspaceCleanupResult>;
  configure(policy: WorkspaceCleanupPolicy): Promise<WorkspaceCleanupPolicy>;
  runNow(): Promise<z.infer<typeof WorkspaceCleanupRunResultSchema>>;
}
