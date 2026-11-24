/**
 * Workspace cleanup tools for agents: the same archive the cleanup center and
 * Tars's "Clean up finished work" run, through the host's cleanup runtime, so
 * an agent cannot skip a check the user's own click goes through. Archive is
 * reversible: Stave keeps the workspace's tasks and history under Archived and
 * the user restores it from the cleanup center. Nothing here deletes a
 * workspace permanently or forces a branch deletion. Worktrees Claude Code
 * sub-agents left are listed read-only; only the user removes them, through
 * the cleanup dialog's confirmation.
 *
 * Used by: `electron/main/stave-mcp-server.ts`.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  WorkspaceCleanupListResultSchema,
  WorkspaceCleanupResultSchema,
  type SubAgentWorktreeRow,
  type WorkspaceCleanupActArgs,
  type WorkspaceCleanupRow,
} from "../../src/lib/workspace-cleanup-contract";
import { normalizeComparablePath } from "../../src/lib/source-control-worktrees";

export const WORKSPACE_CLEANUP_TOOL_NAMES = ["stave_list_workspace_cleanup", "stave_archive_workspace"] as const;

export interface WorkspaceCleanupToolHandlers {
  list(): Promise<unknown>;
  act(args: WorkspaceCleanupActArgs): Promise<unknown>;
}

/** One row as the agent reads it: what it is, what blocks archiving it, and why it may be done. */
export function projectWorkspaceCleanupRow(row: WorkspaceCleanupRow) {
  return {
    workspaceId: row.id, repositoryPath: row.repositoryPath, name: row.name, branch: row.branch, path: row.path,
    archived: row.archived, lastActive: row.lastActive,
    /** Empty means the workspace can be archived now. */
    blockers: row.blockers,
    /** Signs that the work is finished, such as `branchMerged`, `prMerged` or `responsibilityEnded`. */
    reasons: row.reasons,
    /** With `deleteBranch`, archive also deletes the local branch only when this is true. */
    branchDeletable: row.branchDeletable,
  };
}

export function selectWorkspaceCleanupRows(rows: readonly WorkspaceCleanupRow[], filter: { repositoryPath?: string; includeArchived?: boolean }) {
  const repository = filter.repositoryPath ? normalizeComparablePath(filter.repositoryPath) : null;
  // A branch without a workspace has nothing to archive.
  return rows.filter((row) => !row.branchOnly && (filter.includeArchived || !row.archived) &&
    (!repository || normalizeComparablePath(row.repositoryPath) === repository)).map(projectWorkspaceCleanupRow);
}

/** Sub-agent worktrees as the agent reads them: no removal action exists for agents. */
export function selectSubAgentWorktrees(rows: readonly SubAgentWorktreeRow[], filter: { repositoryPath?: string }) {
  const repository = filter.repositoryPath ? normalizeComparablePath(filter.repositoryPath) : null;
  return rows.filter((row) => !repository || normalizeComparablePath(row.repositoryPath) === repository).map((row) => ({
    repositoryPath: row.repositoryPath, path: row.path, branch: row.branch, lastModified: row.lastModified,
    /** Empty means the user can remove it in the cleanup dialog now. */
    blockers: row.blockers,
  }));
}

function toStructuredResult<T>(value: T) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }], structuredContent: value };
}

export function registerWorkspaceCleanupTools(server: McpServer, handlers: WorkspaceCleanupToolHandlers) {
  server.registerTool(
    "stave_list_workspace_cleanup",
    {
      description:
        "List the workspaces of registered projects with what blocks archiving each one and why it may be finished. Read only. A workspace with no blockers can be archived with `stave_archive_workspace`. `subAgentWorktrees` lists worktrees Claude Code sub-agents left under `.claude/worktrees` with their blockers; no tool removes them, so ask the user to remove them in Clean up workspaces, which keeps their branches.",
      inputSchema: {
        repositoryPath: z.string().min(1).optional().describe("Only this project's workspaces. Omit for every registered project."),
        includeArchived: z.boolean().optional().describe("Also list workspaces that are already archived."),
      },
    },
    async ({ repositoryPath, includeArchived }) => {
      const result = WorkspaceCleanupListResultSchema.parse(await handlers.list());
      return toStructuredResult({ workspaces: selectWorkspaceCleanupRows(result.rows, { repositoryPath, includeArchived }),
        subAgentWorktrees: selectSubAgentWorktrees(result.subAgentWorktrees ?? [], { repositoryPath }) });
    },
  );

  server.registerTool(
    "stave_archive_workspace",
    {
      description:
        "Archive one workspace the way the cleanup center does: Stave removes its worktree and keeps its tasks and history under Archived, where the user can restore it. Stave refuses while the workspace has uncommitted changes or unpushed commits, a running turn, run or script, an open terminal, something waiting on the user, unfinished Tars work or a draft pull request still open, or is the default or selected workspace; the refusal names each blocker. Nothing is deleted permanently. Archive only work that is finished and that the user asked you to clean up.",
      inputSchema: {
        repositoryPath: z.string().min(1).describe("The workspace's project root path, as `stave_list_workspace_cleanup` reports it."),
        workspaceId: z.string().min(1).describe("The workspace id to archive."),
        deleteBranch: z.boolean().optional().describe("Also delete its local branch. Stave deletes it only when it is merged or pushed and never forces the deletion."),
      },
    },
    async ({ repositoryPath, workspaceId, deleteBranch }) => {
      const result = WorkspaceCleanupResultSchema.parse(await handlers.act({ action: "archive", repositoryPath, workspaceId, ...(deleteBranch ? { deleteBranch: true } : {}) }));
      return toStructuredResult({
        archived: result.ok, workspaceId: result.workspaceId, workspaceName: result.workspaceName ?? null,
        // Comma-separated blocker or failure codes when it was refused.
        reason: result.reason,
      });
    },
  );
}
