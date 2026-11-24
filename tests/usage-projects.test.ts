import { describe, expect, test } from "bun:test";
import { emptyUsageMetrics, type UsageMetrics } from "../src/lib/providers/usage-statistics";
import type { WorkspaceUsageReport, WorkspaceUsageRow } from "../src/lib/providers/workspace-usage";
import type { WorkspaceCleanupRow, WorkspaceDiskUsageReport } from "../src/lib/workspace-cleanup-contract";
import { usageDelta } from "../src/components/usage/usage-compare";
import {
  buildUsageWorkspaceDirectory, groupDiskByProject, groupUsageByProject, OTHER_PROJECTS_KEY, reclaimableWorkspaces,
  REMOVED_PROJECT_KEY, usageProjectChart,
} from "../src/components/usage/usage-projects";

const metrics = (tokens: number, costUsd: number | null, turns = 1): UsageMetrics => ({
  ...emptyUsageMetrics(), turns, measuredTurns: tokens > 0 ? turns : 0, tokens, costUsd, costReportedTurns: costUsd === null ? 0 : turns,
});
const row = (workspaceId: string | null, tokens: number, costUsd: number | null, lastActiveAt: string, days: Record<string, number>): WorkspaceUsageRow => ({
  ...metrics(tokens, costUsd), workspaceId, lastActiveAt, providerIds: ["claude-code"],
  days: Object.fromEntries(Object.entries(days).map(([day, value]) => [day, metrics(value, null)])),
});

const directory = buildUsageWorkspaceDirectory([
  { repositoryPath: "/repos/app", repositoryName: "app", workspaces: [{ id: "app-1", name: "feature-a" }, { id: "app-2", name: "feature-b" }] },
  { repositoryPath: "/repos/api", repositoryName: "api", workspaces: [{ id: "api-1", name: "fix" }] },
], [
  { workspaceId: "app-1", name: "stale archive name", repositoryPath: "/repos/app", repositoryName: "app" },
  { workspaceId: "archived-1", name: "old work", repositoryPath: "/repos/api", repositoryName: "api" },
]);

const report: WorkspaceUsageReport = {
  totals: metrics(1_600, 3, 6),
  previousTotals: metrics(800, null, 2),
  days: ["2026-10-01", "2026-10-02"],
  workspaces: [
    row("app-1", 700, 2, "2026-10-01T10:00:00.000Z", { "2026-10-01": 700 }),
    row("api-1", 500, null, "2026-10-02T09:00:00.000Z", { "2026-10-02": 500 }),
    row("app-2", 200, 1, "2026-10-02T11:00:00.000Z", { "2026-10-01": 50, "2026-10-02": 150 }),
    row("archived-1", 100, null, "2026-10-01T08:00:00.000Z", { "2026-10-01": 100 }),
    row("gone", 60, null, "2026-10-02T12:00:00.000Z", { "2026-10-02": 60 }),
    row(null, 40, null, "2026-10-01T01:00:00.000Z", { "2026-10-01": 40 }),
  ],
  generatedAt: "2026-10-03T00:00:00.000Z",
};

describe("projects view model", () => {
  test("names workspaces from open projects first, then archives", () => {
    expect(directory.get("app-1")?.name).toBe("feature-a");
    expect(directory.get("archived-1")).toEqual({ name: "old work", repositoryPath: "/repos/api", repositoryName: "api" });
  });

  test("groups workspaces by project and keeps removed workspaces and deleted tasks together, last", () => {
    const projects = groupUsageByProject(report, directory, "tokens");
    expect(projects.map((project) => project.name)).toEqual(["app", "api", null]);
    const [app, api, removed] = projects;
    expect(app).toMatchObject({ metrics: { tokens: 900, costUsd: 3 }, lastActiveAt: "2026-10-02T11:00:00.000Z" });
    expect(app!.workspaces.map((workspace) => workspace.name)).toEqual(["feature-a", "feature-b"]);
    expect(app!.days["2026-10-01"]?.tokens).toBe(750);
    // A project whose workspaces reported no cost has no cost, not a zero.
    expect(api!.metrics.costUsd).toBeNull();
    expect(api!.workspaces.map((workspace) => workspace.name)).toEqual(["fix", "old work"]);
    expect(removed!.key).toBe(REMOVED_PROJECT_KEY);
    expect(removed!.workspaces.map((workspace) => [workspace.workspaceId, workspace.name])).toEqual([["gone", null], [null, null]]);
  });

  test("sorts by cost with unreported cost last, and by most recent activity", () => {
    const byCost = groupUsageByProject(report, directory, "cost");
    expect(byCost.map((project) => project.name)).toEqual(["app", "api", null]);
    expect(byCost[0]!.workspaces.map((workspace) => workspace.workspaceId)).toEqual(["app-1", "app-2"]);
    expect(byCost[1]!.workspaces.map((workspace) => workspace.workspaceId)).toEqual(["api-1", "archived-1"]);
    const byRecent = groupUsageByProject(report, directory, "recent");
    expect(byRecent.map((project) => project.name)).toEqual(["app", "api", null]);
    expect(byRecent[0]!.workspaces.map((workspace) => workspace.workspaceId)).toEqual(["app-2", "app-1"]);
    expect(byRecent[2]!.workspaces.map((workspace) => workspace.workspaceId)).toEqual(["gone", null]);
  });

  test("tokens sort puts workspaces that reported no tokens after measured ones", () => {
    const unmeasured: WorkspaceUsageReport = { ...report, workspaces: [row("app-1", 0, null, "2026-10-02T00:00:00.000Z", {}), row("app-2", 5, null, "2026-10-01T00:00:00.000Z", {})] };
    expect(groupUsageByProject(unmeasured, directory, "tokens")[0]!.workspaces.map((workspace) => workspace.workspaceId)).toEqual(["app-2", "app-1"]);
  });

  test("compares totals with the earlier period only where both measured", () => {
    expect(usageDelta({ current: report.totals, previous: report.previousTotals!, measurement: "tokens", read: (value) => value.tokens }))
      .toEqual({ kind: "up", previous: 800, ratio: 1 });
    expect(usageDelta({ current: report.totals, previous: report.previousTotals!, measurement: "cost", read: (value) => value.costUsd ?? 0 }))
      .toEqual({ kind: "not-compared", reason: "earlier-not-reported" });
  });

  test("stacks each day by the largest projects and groups the rest, including removed work, as other", () => {
    const projects = groupUsageByProject(report, directory, "recent");
    const chart = usageProjectChart(projects, report.days, 1);
    expect(chart.series).toEqual([{ key: "/repos/app", name: "app", slot: 1 }, { key: OTHER_PROJECTS_KEY, name: null, slot: null }]);
    expect(chart.bars).toEqual([
      { day: "2026-10-01", tokens: 890, segments: [{ key: "/repos/app", tokens: 750 }, { key: OTHER_PROJECTS_KEY, tokens: 140 }] },
      { day: "2026-10-02", tokens: 710, segments: [{ key: "/repos/app", tokens: 150 }, { key: OTHER_PROJECTS_KEY, tokens: 560 }] },
    ]);
    expect(chart.max).toBe(890);
    const wide = usageProjectChart(projects, ["2026-09-30", ...report.days]);
    expect(wide.series.map((series) => series.slot)).toEqual([1, 2, null]);
    expect(wide.bars[0]).toEqual({ day: "2026-09-30", tokens: 0, segments: [] });
  });
});

describe("disk and free space view model", () => {
  const measured = (bytes: number | null, partial = false) => ({ bytes, partial, status: bytes === null ? "timeout" as const : "measured" as const, measuredAt: "2026-10-03T00:00:00.000Z" });
  const disk: WorkspaceDiskUsageReport = {
    measuring: false,
    rows: [
      { workspaceId: "app-1", name: "feature-a", repositoryPath: "/repos/app", repositoryName: "app", archived: false, measurement: measured(300) },
      { workspaceId: "app-2", name: "feature-b", repositoryPath: "/repos/app", repositoryName: "app", archived: false, measurement: measured(null) },
      { workspaceId: "archived-1", name: "old work", repositoryPath: "/repos/api", repositoryName: "api", archived: true, measurement: measured(900, true) },
      { workspaceId: "api-1", name: "fix", repositoryPath: "/repos/api", repositoryName: "api", archived: false, measurement: null },
    ],
  };
  const cleanupRow = (id: string, blockers: string[], extra: Partial<WorkspaceCleanupRow> = {}): WorkspaceCleanupRow => ({
    id, repositoryPath: "/repos/app", repositoryName: "app", name: id, path: `/w/${id}`, branch: id, archived: false, branchOnly: false,
    readOnly: false, archivedAt: null, lastActive: null, blockers, reasons: [], bytes: null, branchDeletable: false, ...extra,
  });

  test("sums disk per project, largest first, and counts folders whose size is unknown or a lower bound", () => {
    expect(groupDiskByProject(disk)).toEqual([
      { key: "/repos/api", name: "api", bytes: 900, workspaces: 2, incomplete: 2, measured: 1 },
      { key: "/repos/app", name: "app", bytes: 300, workspaces: 2, incomplete: 1, measured: 1 },
    ]);
  });

  test("offers only unblocked workspaces with a folder, biggest first, without measuring or removing anything", () => {
    const rows = [
      cleanupRow("app-1", []),
      cleanupRow("app-2", ["changedFiles"]),
      cleanupRow("archived-1", [], { archived: true }),
      cleanupRow("api-1", []),
      cleanupRow("branch:old", [], { branchOnly: true }),
      cleanupRow("no-folder", []),
    ];
    const result = reclaimableWorkspaces(rows, disk);
    expect(result.items.map((item) => [item.row.id, item.bytes, item.partial])).toEqual([["archived-1", 900, true], ["app-1", 300, false], ["api-1", null, false]]);
    expect(result.bytes).toBe(1200);
    expect(result.incomplete).toBe(true);
    expect(reclaimableWorkspaces([cleanupRow("app-1", [])], disk)).toMatchObject({ bytes: 300, incomplete: false });
    expect(reclaimableWorkspaces([cleanupRow("app-2", ["runningTurn"])], disk).items).toEqual([]);
  });
});
