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
export const WorkspaceCleanupPreviewArgsSchema = z.object({ repositoryPath: Id.optional(), includeArchived: z.boolean().optional() }).strict();
export type WorkspaceCleanupPreviewArgs = z.infer<typeof WorkspaceCleanupPreviewArgsSchema>;
export const WorkspaceCleanupListArgsSchema = z.object({ scanDisk: z.boolean().optional() }).strict();
export const WorkspaceCleanupTrashArgsSchema = z.object({ workspaceId: Id, repositoryPath: Id }).strict();
export const WorkspaceCleanupTrashResultSchema = z.object({ ok: z.boolean(), reason: z.string().nullable() }).strict();
export type WorkspaceCleanupTrashArgs = z.infer<typeof WorkspaceCleanupTrashArgsSchema>;
export const WorkspaceCleanupActArgsSchema = z.object({
  action: z.enum(["archive", "delete", "restore", "deleteBranch", "removeWorktree"]),
  /** Refuse if a concurrent Restore made the workspace active before execution. */
  archivedOnly: z.boolean().optional(),
  /** For confirmed manual archives: keep local-only commits on the retained branch. */
  preserveLocalWork: z.boolean().optional(),
  /** Archive the history without modifying the existing checkout. */
  keepWorktree: z.boolean().optional(),
  saveChanges: z.boolean().optional(),
  workspaceId: Id, repositoryPath: Id, deleteBranch: z.boolean().optional(), forceDeleteBranch: z.boolean().optional(),
}).strict();
export type WorkspaceCleanupActArgs = z.infer<typeof WorkspaceCleanupActArgsSchema>;
/** One folder's measured disk use. `partial` means the count stopped early or skipped unreadable folders, so it is a lower bound. */
export const WorkspaceDiskMeasurementSchema = z.object({
  bytes: z.number().nonnegative().nullable(), partial: z.boolean(),
  status: z.enum(["measured", "timeout", "unavailable"]), measuredAt: z.string(),
}).strict();
export type WorkspaceDiskMeasurement = z.infer<typeof WorkspaceDiskMeasurementSchema>;
const WorkspaceCleanupPreviewSchema = z.object({
  disk: WorkspaceDiskMeasurementSchema.nullable(),
  branchMerge: z.enum(["merged", "unmerged", "unknown"]),
  pullRequest: z.enum(["merged", "open", "closed", "none", "unknown"]),
  dirty: z.boolean().nullable(),
}).strict();
export type WorkspaceCleanupPreview = z.infer<typeof WorkspaceCleanupPreviewSchema>;
export const WorkspaceCleanupRowSchema = z.object({
  id: Id, repositoryPath: Id, repositoryName: z.string(), name: z.string(), path: z.string(), branch: z.string(),
  savedChanges: z.boolean().optional(), canSaveChanges: z.boolean().optional(), keptWorktree: z.boolean().optional(), leftoverFiles: z.boolean().optional(),
  archived: z.boolean(), branchOnly: z.boolean(), readOnly: z.boolean(), archivedAt: z.string().nullable(),
  lastActive: z.string().nullable(), blockers: z.array(z.string()), reasons: z.array(z.string()),
  preview: WorkspaceCleanupPreviewSchema.optional(),
  bytes: z.number().nonnegative().nullable(), branchDeletable: z.boolean(),
  /**
   * Set when Stave created this workspace for a delegated child. `kept` lists
   * why automatic cleanup left it (`delegated-workspace-cleanup.ts`); empty
   * when only the row's blockers stand in the way.
   */
  subagent: z.object({ parentWorkspaceId: Id, parentName: z.string(), kept: z.array(z.string()) }).strict().optional(),
}).strict();
export type WorkspaceCleanupRow = z.infer<typeof WorkspaceCleanupRowSchema>;
export const WorkspaceCleanupResultSchema = z.object({
  ok: z.boolean(), workspaceId: Id, action: WorkspaceCleanupActArgsSchema.shape.action,
  workspaceName: z.string().optional(), sensitiveFilesSkipped: z.number().int().positive().optional(), reason: z.string().nullable(), readOnly: z.boolean().optional(),
}).strict();
export type WorkspaceCleanupResult = z.infer<typeof WorkspaceCleanupResultSchema>;
export const WorkspaceCleanupRecentSchema = WorkspaceCleanupResultSchema.extend({ at: z.string(), repositoryPath: Id, automatic: z.boolean() }).strict();
export const WorkspaceCleanupStateSchema = z.object({
  automaticFailureAt: z.record(z.string(), z.number()).optional(),
  /** Workspaces the user restored since their last archive; the delegated-child sweep leaves them alone. */
  userRestoredAt: z.record(z.string(), z.number()).optional(),
  policy: WorkspaceCleanupPolicySchema.strip().extend({ merged: CleanupRuleSchema.strip(), inactive: CleanupRuleSchema.strip(), archived: CleanupRuleSchema.strip(), maximum: CleanupRuleSchema.strip() }), recent: z.array(WorkspaceCleanupRecentSchema.strip()).max(200), lastRun: z.number(),
}).strip();
/**
 * A worktree a Claude Code sub-agent left at `<project>/.claude/worktrees/agent-<id>`.
 * Empty `blockers` means it can be removed now; removal keeps its branch.
 */
export const SubAgentWorktreeRowSchema = z.object({
  repositoryPath: Id, repositoryName: z.string(), path: Id, name: z.string(),
  /** Null while HEAD is detached. */
  branch: z.string().nullable(), head: z.string().nullable(),
  /** Newest change seen in the folder's top level or its Git index; null when unreadable. */
  lastModified: z.string().nullable(),
  preview: WorkspaceCleanupPreviewSchema.optional(),
  blockers: z.array(z.string()), bytes: z.number().nonnegative().nullable(),
}).strict();
export type SubAgentWorktreeRow = z.infer<typeof SubAgentWorktreeRowSchema>;
export const SubAgentWorktreeRemoveArgsSchema = z.object({ repositoryPath: Id, path: Id }).strict();
export type SubAgentWorktreeRemoveArgs = z.infer<typeof SubAgentWorktreeRemoveArgsSchema>;
export const SubAgentWorktreeRemoveResultSchema = z.object({ ok: z.boolean(), path: Id, reason: z.string().nullable() }).strict();
export type SubAgentWorktreeRemoveResult = z.infer<typeof SubAgentWorktreeRemoveResultSchema>;
/** Worktree folders of sub-agents Activity sees unfinished; main adds them to host requests, never the renderer. */
export const RunningAgentWorktreesSchema = z.array(z.string().min(1).max(4096)).max(1000);
/** The disk report's id for a sub-agent worktree folder. */
export const subAgentWorktreeDiskId = (path: string) => `subAgentWorktree:${path}`;
export const WorkspaceCleanupListResultSchema = z.object({
  rows: z.array(WorkspaceCleanupRowSchema), policy: WorkspaceCleanupPolicySchema,
  recent: z.array(WorkspaceCleanupRecentSchema),
  subAgentWorktrees: z.array(SubAgentWorktreeRowSchema).optional(),
}).strict();
/** `refresh` measures again even when a measurement is younger than five minutes. */
export const WorkspaceDiskUsageArgsSchema = z.object({ refresh: z.boolean().optional() }).strict();
export const WorkspaceDiskUsageRowSchema = z.object({
  workspaceId: Id, name: z.string(), repositoryPath: Id, repositoryName: z.string(), archived: z.boolean(),
  /** A worktree a sub-agent left; `workspaceId` is then `subAgentWorktreeDiskId(path)`. */
  subAgentWorktree: z.literal(true).optional(),
  /** Null until the first measurement of this folder finishes. */
  measurement: WorkspaceDiskMeasurementSchema.nullable(),
}).strict();
export type WorkspaceDiskUsageRow = z.infer<typeof WorkspaceDiskUsageRowSchema>;
export const WorkspaceDiskUsageReportSchema = z.object({
  rows: z.array(WorkspaceDiskUsageRowSchema),
  /** True while folders are still being measured; read again to see them fill in. */
  measuring: z.boolean(),
}).strict();
export type WorkspaceDiskUsageReport = z.infer<typeof WorkspaceDiskUsageReportSchema>;
export const WorkspaceCleanupRunResultSchema =z.object({ results: z.array(WorkspaceCleanupResultSchema) }).strict();
export const WorkspaceCleanupChangedSchema = z.object({ workspaceId: Id, repositoryPath: Id, stage: z.enum(["preparing", "prepared", "preparationFailed"]).optional(), command: z.string().optional() }).strict();
export interface WorkspaceCleanupApi {
  onChanged(listener: (event: z.infer<typeof WorkspaceCleanupChangedSchema>) => void): () => void;
  list(args?: z.infer<typeof WorkspaceCleanupListArgsSchema>): Promise<z.infer<typeof WorkspaceCleanupListResultSchema>>;
  listArchived(): Promise<WorkspaceCleanupRow[]>;
  trashLeftover?(args: WorkspaceCleanupTrashArgs): Promise<z.infer<typeof WorkspaceCleanupTrashResultSchema>>;
  act(args: WorkspaceCleanupActArgs): Promise<WorkspaceCleanupResult>;
  /** Removes one listed sub-agent worktree after checking it again; never forced, the branch is kept. */
  removeSubAgentWorktree?(args: SubAgentWorktreeRemoveArgs): Promise<SubAgentWorktreeRemoveResult>;
  configure(policy: WorkspaceCleanupPolicy): Promise<WorkspaceCleanupPolicy>;
  runNow(): Promise<z.infer<typeof WorkspaceCleanupRunResultSchema>>;
  /** Disk used by each workspace folder and sub-agent worktree (not the project's own checkout), measured in the background. */
  diskUsage?(args?: z.infer<typeof WorkspaceDiskUsageArgsSchema>): Promise<WorkspaceDiskUsageReport>;
}
