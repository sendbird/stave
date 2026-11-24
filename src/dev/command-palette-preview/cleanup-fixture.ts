import { DEFAULT_WORKSPACE_CLEANUP_POLICY, type SubAgentWorktreeRow, type WorkspaceCleanupApi, type WorkspaceCleanupRow } from "@/lib/workspace-cleanup-contract";

/** Browser fixture exercises the real view; host and Git effects are simulated. */
export function installCleanupFixture() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("cleanupPreview")) return;
  const base: WorkspaceCleanupRow = { id: "cleanup-one", repositoryPath: "/tmp/cleanup-preview", repositoryName: "tools", name: "Finished work", path: "/tmp/cleanup-preview/finished", branch: "feat/finished", archived: false, branchOnly: false, readOnly: false, archivedAt: null, lastActive: "2026-10-01T00:00:00.000Z", blockers: [], reasons: ["prMerged", "inactive:30"], bytes: 48 * 1024 * 1024, branchDeletable: true };
  let rows: WorkspaceCleanupRow[] = [base, { ...base, id: "cleanup-dirty", name: "Uncommitted work", path: "/tmp/cleanup-preview/dirty", blockers: ["changedFiles"] }, { ...base, id: "cleanup-archived", name: "Earlier work", archived: true, archivedAt: "2026-11-01T00:00:00.000Z", bytes: 0 }];
  if (params.has("cleanupSavePreview")) {
    Object.assign(rows.find(row => row.id === "cleanup-dirty")!, { blockers: ["changedFiles", "unpushedCommits"], canSaveChanges: true });
  }
  if (params.has("many")) rows = [...rows, ...Array.from({ length: 150 }, (_, index) => ({ ...base, id: `cleanup-extra-${index}`, name: `Finished ${index}` }))];
  const recent: Awaited<ReturnType<WorkspaceCleanupApi["list"]>>["recent"] = [{ ok: true, action: "removeWorktree", workspaceId: "cleanup-archived", repositoryPath: base.repositoryPath, reason: null, automatic: true, at: "2026-11-01T00:00:00.000Z" }];
  if (params.has("cleanupLeftoverPreview")) {
    Object.assign(rows.find(row => row.id === "cleanup-archived")!, { leftoverFiles: true, blockers: ["worktreeLeftoverFiles"] });
    recent[0]!.reason = "worktreeLeftoverFiles";
  }
  // Worktrees Claude Code sub-agents left; removal is simulated and refuses blocked rows like the host.
  const agent = (id: string, patch: Partial<SubAgentWorktreeRow> = {}): SubAgentWorktreeRow => ({ repositoryPath: base.repositoryPath, repositoryName: base.repositoryName,
    path: `${base.repositoryPath}/.claude/worktrees/agent-${id}`, name: `agent-${id}`, branch: `worktree-agent-${id}`, head: "4f1c2d9", lastModified: "2026-11-20T08:00:00.000Z", blockers: [], bytes: 312 * 1024 * 1024, ...patch });
  let subAgentWorktrees: SubAgentWorktreeRow[] = params.has("cleanupSubAgents")
    ? [agent("a1b2c3"), agent("d4e5f6", { blockers: ["changedFiles", "recentlyModified"], bytes: 96 * 1024 * 1024 }), agent("0789ab", { branch: null, bytes: null })] : [];
  let policy = DEFAULT_WORKSPACE_CLEANUP_POLICY;
  const api: WorkspaceCleanupApi = {
    onChanged: () => () => {},
    listArchived: async () => structuredClone(rows.filter(row => row.archived)),
    list: async () => structuredClone({ rows, policy, recent, subAgentWorktrees }),
    removeSubAgentWorktree: async (args) => {
      const row = subAgentWorktrees.find(item => item.path === args.path && item.repositoryPath === args.repositoryPath);
      if (!row) return { ok: false, path: args.path, reason: "subAgentWorktreeMissing" };
      if (row.blockers.length) return { ok: false, path: args.path, reason: row.blockers.join(",") };
      subAgentWorktrees = subAgentWorktrees.filter(item => item !== row);
      return { ok: true, path: args.path, reason: null };
    },
    configure: async (next) => { policy = next; return next; },
    runNow: async () => ({ results: [] }),
    trashLeftover: async (args) => {
      const row = rows.find(item => item.id === args.workspaceId && item.repositoryPath === args.repositoryPath);
      if (!row?.leftoverFiles) return { ok: false, reason: "leftoverTrashUnavailable" };
      row.leftoverFiles = false;
      row.blockers = [];
      return { ok: true, reason: null };
    },
    act: async (args) => {
      const row = rows.find((item) => item.id === args.workspaceId);
      if (params.has("cleanupRecoveryPreview") && args.action === "archive" && !args.keepWorktree) {
        return { ok: false, workspaceId: args.workspaceId, action: args.action, reason: "gitOperationInProgress" };
      }
      const canKeepLocalCommits = args.action === "archive" && args.preserveLocalWork && !args.deleteBranch;
      const saveAllowed = args.action === "archive" && args.saveChanges && row?.canSaveChanges;
      const blocker = row?.blockers.find(reason => !(reason === "unpushedCommits" && (canKeepLocalCommits || args.action === "restore")) && !(reason === "changedFiles" && (saveAllowed || args.keepWorktree)));
      const result = { ok: Boolean(row && !blocker), workspaceId: args.workspaceId, action: args.action, reason: blocker ?? null };
      if (row && result.ok) {
        if (args.action === "archive") { row.savedChanges = Boolean(saveAllowed); row.keptWorktree = Boolean(args.keepWorktree); row.canSaveChanges = false; row.blockers = row.blockers.filter(reason => reason === "unpushedCommits"); row.archived = true; row.archivedAt = new Date().toISOString(); }
        if (args.action === "restore") { row.savedChanges = false; row.keptWorktree = false; row.archived = false; row.archivedAt = null; }
        if (args.action === "delete") rows = rows.filter((item) => item !== row);
      }
      recent.push({ ...result, at: new Date().toISOString(), repositoryPath: args.repositoryPath, automatic: false });
      return result;
    },
  };
  if (window.api) window.api.workspaceCleanup = api;
}
