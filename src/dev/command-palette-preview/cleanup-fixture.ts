import { DEFAULT_WORKSPACE_CLEANUP_POLICY, type WorkspaceCleanupApi, type WorkspaceCleanupRow } from "@/lib/workspace-cleanup-contract";

/** Browser fixture exercises the real view; host and Git effects are simulated. */
export function installCleanupFixture() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("cleanupPreview")) return;
  const base: WorkspaceCleanupRow = { id: "cleanup-one", repositoryPath: "/tmp/cleanup-preview", repositoryName: "tools", name: "Finished work", path: "/tmp/cleanup-preview/finished", branch: "feat/finished", archived: false, branchOnly: false, readOnly: false, archivedAt: null, lastActive: "2026-10-01T00:00:00.000Z", blockers: [], reasons: ["prMerged", "inactive:30"], bytes: 48 * 1024 * 1024, branchDeletable: true };
  let rows: WorkspaceCleanupRow[] = [base, { ...base, id: "cleanup-dirty", name: "Uncommitted work", path: "/tmp/cleanup-preview/dirty", blockers: ["changedFiles"] }, { ...base, id: "cleanup-archived", name: "Earlier work", archived: true, archivedAt: "2026-11-01T00:00:00.000Z", bytes: 0 }];
  if (params.has("many")) rows = [...rows, ...Array.from({ length: 150 }, (_, index) => ({ ...base, id: `cleanup-extra-${index}`, name: `Finished ${index}` }))];
  const recent: Awaited<ReturnType<WorkspaceCleanupApi["list"]>>["recent"] = [];
  let policy = DEFAULT_WORKSPACE_CLEANUP_POLICY;
  const api: WorkspaceCleanupApi = {
    onChanged: () => () => {},
    list: async () => structuredClone({ rows, policy, recent }),
    configure: async (next) => { policy = next; return next; },
    runNow: async () => ({ results: [] }),
    act: async (args) => {
      const row = rows.find((item) => item.id === args.workspaceId);
      const result = { ok: Boolean(row && !row.blockers.length), workspaceId: args.workspaceId, action: args.action, reason: row?.blockers[0] ?? null };
      if (row && result.ok) {
        if (args.action === "archive") { row.archived = true; row.archivedAt = new Date().toISOString(); }
        if (args.action === "restore") { row.archived = false; row.archivedAt = null; }
        if (args.action === "delete") rows = rows.filter((item) => item !== row);
      }
      recent.push({ ...result, at: new Date().toISOString(), repositoryPath: args.repositoryPath, automatic: false });
      return result;
    },
  };
  if (window.api) window.api.workspaceCleanup = api;
}
