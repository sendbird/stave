import { addUsageMetrics, emptyUsageMetrics, usageBucketKey } from "@/lib/providers/usage-statistics";
import type { WorkspaceUsageArgs, WorkspaceUsageReport, WorkspaceUsageRow } from "@/lib/providers/workspace-usage";
import { subAgentWorktreeDiskId, type SubAgentWorktreeRow, type WorkspaceCleanupRow, type WorkspaceDiskUsageReport } from "@/lib/workspace-cleanup-contract";
import type { UsageProjectsSources } from "@/components/usage/UsageProjects";
import { USAGE_PREVIEW_NOW, usagePreviewTurns } from "./fixtures";

/** Deterministic projects for the Projects tab preview, never installed as product data. */
const REPOSITORIES = [
  { repositoryPath: "/tmp/preview/web-dashboard", repositoryName: "web-dashboard", workspaces: [
    { id: "ws-dashboard-filters", name: "feat/usage-filters" }, { id: "ws-dashboard-chart", name: "fix/chart-overflow" },
    { id: "ws-dashboard-i18n", name: "chore/한국어-문구-정리" }] },
  { repositoryPath: "/tmp/preview/api-server", repositoryName: "api-server", workspaces: [
    { id: "ws-api-pagination", name: "feat/cursor-pagination" }, { id: "ws-api-auth", name: "fix/token-refresh" }] },
  { repositoryPath: "/tmp/preview/design-system", repositoryName: "design-system", workspaces: [{ id: "ws-ds-tokens", name: "feat/chart-tokens" }] },
  { repositoryPath: "/tmp/preview/mobile-app", repositoryName: "mobile-app", workspaces: [{ id: "ws-mobile-push", name: "feat/push-settings" }] },
];
const WORKSPACE_IDS = [...REPOSITORIES.flatMap((repository) => repository.workspaces.map((workspace) => workspace.id)), "ws-removed", null];

export function usagePreviewProjectReport(args: WorkspaceUsageArgs, empty = false): WorkspaceUsageReport {
  // One workspace runs only Codex, which reports no cost, so its row shows a dash.
  const all = empty ? [] : usagePreviewTurns().map((turn, index) => {
    const workspaceId = WORKSPACE_IDS[(index * 7) % WORKSPACE_IDS.length] ?? null;
    return workspaceId === "ws-api-auth" ? { ...turn, workspaceId, providerId: "codex" as const, costUsd: null, costReportedTurns: 0 } : { ...turn, workspaceId };
  });
  const inScope = (turn: (typeof all)[number], from: string, to: string) => turn.createdAt >= from && turn.createdAt < to
    && (!args.providerId || turn.providerId === args.providerId) && (!args.accountProfileId || turn.accountProfileId === args.accountProfileId)
    && (args.modelId === undefined || turn.modelId === args.modelId);
  const totals = emptyUsageMetrics();
  const previousTotals = args.previous ? emptyUsageMetrics() : null;
  const rows = new Map<string | null, WorkspaceUsageRow>();
  for (const turn of all) {
    if (previousTotals && args.previous && inScope(turn, args.previous.from, args.previous.to)) addUsageMetrics(previousTotals, turn);
    if (!inScope(turn, args.from, args.to)) continue;
    addUsageMetrics(totals, turn);
    const row = rows.get(turn.workspaceId) ?? { workspaceId: turn.workspaceId, lastActiveAt: turn.createdAt, providerIds: [], days: {}, ...emptyUsageMetrics() };
    addUsageMetrics(row, turn);
    if (turn.createdAt > row.lastActiveAt) row.lastActiveAt = turn.createdAt;
    if (!row.providerIds.includes(turn.providerId)) row.providerIds.push(turn.providerId);
    addUsageMetrics(row.days[usageBucketKey(turn.createdAt, args.timeZone, "day")] ??= emptyUsageMetrics(), turn);
    rows.set(turn.workspaceId, row);
  }
  const days = new Set<string>();
  for (let at = Date.parse(args.from); at < Date.parse(args.to); at += 30 * 60_000) days.add(usageBucketKey(new Date(at).toISOString(), args.timeZone, "day"));
  return { totals, previousTotals, days: [...days], workspaces: [...rows.values()].sort((left, right) => right.tokens - left.tokens),
    generatedAt: new Date(USAGE_PREVIEW_NOW).toISOString() };
}

const MB = 1024 * 1024;
const DISK: Array<[string, string, string, boolean, number | null, boolean]> = [
  ["ws-dashboard-filters", "feat/usage-filters", "web-dashboard", false, 1_840 * MB, false],
  ["ws-dashboard-chart", "fix/chart-overflow", "web-dashboard", false, 612 * MB, false],
  ["ws-dashboard-i18n", "chore/한국어-문구-정리", "web-dashboard", false, 598 * MB, false],
  ["ws-api-pagination", "feat/cursor-pagination", "api-server", false, 2_310 * MB, true],
  ["ws-api-auth", "fix/token-refresh", "api-server", false, 1_190 * MB, false],
  ["ws-api-archived", "feat/old-billing-export", "api-server", true, 905 * MB, false],
  ["ws-ds-tokens", "feat/chart-tokens", "design-system", false, null, false],
  ["ws-mobile-push", "feat/push-settings", "mobile-app", false, 3_420 * MB, false],
];

/** Worktrees sub-agents left: one quiet and clean, one with changes the cleanup checks protect. */
const SUBAGENT_WORKTREES: Array<[string, string, number, string[]]> = [
  ["agent-a5f2c91", "web-dashboard", 2_640 * MB, []],
  ["agent-b81d0e4", "api-server", 120 * MB, ["changedFiles"]],
];
const subAgentPath = (name: string, repositoryName: string) => `/tmp/preview/${repositoryName}/.claude/worktrees/${name}`;

export function usagePreviewDisk(measuring = false): WorkspaceDiskUsageReport {
  const measuredAt = new Date(USAGE_PREVIEW_NOW - 60_000).toISOString();
  return { measuring, rows: [...DISK.map(([workspaceId, name, repositoryName, archived, bytes, partial], index) => ({
    workspaceId, name, repositoryName, archived, repositoryPath: `/tmp/preview/${repositoryName}`,
    measurement: measuring && index > 5 ? null : { bytes, partial, status: bytes === null ? "timeout" as const : "measured" as const, measuredAt },
  })), ...SUBAGENT_WORKTREES.map(([name, repositoryName, bytes]) => ({
    workspaceId: subAgentWorktreeDiskId(subAgentPath(name, repositoryName)), name, repositoryName, archived: false, subAgentWorktree: true as const,
    repositoryPath: `/tmp/preview/${repositoryName}`, measurement: { bytes, partial: false, status: "measured" as const, measuredAt },
  }))] };
}

export function usagePreviewSubAgentWorktrees(): SubAgentWorktreeRow[] {
  return SUBAGENT_WORKTREES.map(([name, repositoryName, bytes, blockers]) => ({ repositoryPath: `/tmp/preview/${repositoryName}`, repositoryName,
    path: subAgentPath(name, repositoryName), name, branch: `worktree-${name}`, head: "9c1e7a2", lastModified: new Date(USAGE_PREVIEW_NOW - 3 * 86_400_000).toISOString(),
    blockers, bytes }));
}

export function usagePreviewCleanupRows(): WorkspaceCleanupRow[] {
  const blocked: Record<string, string[]> = { "ws-dashboard-filters": ["currentWorkspace"], "ws-api-pagination": ["changedFiles"], "ws-ds-tokens": ["runningTurn"] };
  return DISK.map(([id, name, repositoryName, archived]) => ({
    id, name, repositoryName, archived, repositoryPath: `/tmp/preview/${repositoryName}`, path: `/tmp/preview/${repositoryName}/.stave/workspaces/${id}`,
    branch: name, branchOnly: false, readOnly: false, archivedAt: archived ? new Date(USAGE_PREVIEW_NOW - 9 * 86_400_000).toISOString() : null,
    lastActive: null, blockers: blocked[id] ?? [], reasons: [], bytes: null, branchDeletable: false,
  }));
}

/** Sources for the Projects tab: fixture reads, and the dialog request logged instead of opened. */
export function usagePreviewProjectSources(options: { empty?: boolean; measuring?: boolean } = {}): UsageProjectsSources {
  let measuring = Boolean(options.measuring);
  return {
    load: async (args) => usagePreviewProjectReport(args, options.empty),
    diskUsage: async ({ refresh }) => {
      if (refresh) measuring = true;
      const report = usagePreviewDisk(measuring);
      measuring = false;
      return report;
    },
    cleanupList: async () => ({ rows: usagePreviewCleanupRows(), subAgentWorktrees: usagePreviewSubAgentWorktrees() }),
    openCleanup: () => console.info("[usage-preview] workspace cleanup would open"),
    repositories: REPOSITORIES,
  };
}
