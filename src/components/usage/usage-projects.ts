import { addUsageMetrics, emptyUsageMetrics, type UsageMetrics } from "@/lib/providers/usage-statistics";
import type { WorkspaceUsageReport } from "@/lib/providers/workspace-usage";
import type { WorkspaceCleanupRow, WorkspaceDiskUsageReport } from "@/lib/workspace-cleanup-contract";

/** Where a workspace id belongs, from the open projects or the disk report's archived workspaces. */
export interface UsageWorkspaceEntry {
  name: string;
  repositoryPath: string;
  repositoryName: string;
}
export type UsageWorkspaceDirectory = ReadonlyMap<string, UsageWorkspaceEntry>;

/** Projects and workspaces Stave no longer lists share one group, so their usage still adds up. */
export const REMOVED_PROJECT_KEY = "\u0000removed";

export interface UsageProjectWorkspace {
  key: string;
  workspaceId: string | null;
  /** Null when the workspace is no longer known: removed, or turns whose task was deleted (`workspaceId` null). */
  name: string | null;
  metrics: UsageMetrics;
  lastActiveAt: string;
}
export interface UsageProject {
  key: string;
  /** Null for the removed group. */
  name: string | null;
  repositoryPath: string | null;
  metrics: UsageMetrics;
  lastActiveAt: string;
  workspaces: UsageProjectWorkspace[];
  days: Record<string, UsageMetrics>;
}

export type UsageProjectSort = "tokens" | "cost" | "recent";

/** Workspace ids to names and projects; earlier sources win, so the live registry names a workspace before an archive record. */
export function buildUsageWorkspaceDirectory(
  repositories: ReadonlyArray<{ repositoryPath: string; repositoryName: string; workspaces: ReadonlyArray<{ id: string; name: string }> }>,
  archived: ReadonlyArray<{ workspaceId: string; name: string; repositoryPath: string; repositoryName: string }> = [],
): UsageWorkspaceDirectory {
  const directory = new Map<string, UsageWorkspaceEntry>();
  for (const repository of repositories) {
    for (const workspace of repository.workspaces) {
      if (!directory.has(workspace.id)) directory.set(workspace.id, { name: workspace.name, repositoryPath: repository.repositoryPath, repositoryName: repository.repositoryName });
    }
  }
  for (const row of archived) {
    if (!directory.has(row.workspaceId)) directory.set(row.workspaceId, { name: row.name, repositoryPath: row.repositoryPath, repositoryName: row.repositoryName });
  }
  return directory;
}

const isMeasured = (metrics: UsageMetrics) => metrics.measuredTurns > 0;
const byName = (left: { name: string | null; key: string }, right: { name: string | null; key: string }) =>
  (left.name ?? "￿").localeCompare(right.name ?? "￿") || left.key.localeCompare(right.key);

/**
 * Orders rows by the chosen column, largest or newest first. Rows that did
 * not measure the column (no tokens or no reported cost) go last instead of
 * reading as zero; names break ties.
 */
export function compareUsageRows(sort: UsageProjectSort) {
  return (left: { name: string | null; key: string; metrics: UsageMetrics; lastActiveAt: string },
    right: { name: string | null; key: string; metrics: UsageMetrics; lastActiveAt: string }) => {
    if (sort === "recent") return right.lastActiveAt.localeCompare(left.lastActiveAt) || byName(left, right);
    if (sort === "cost") {
      const a = left.metrics.costUsd;
      const b = right.metrics.costUsd;
      if (a === null || b === null) return a === b ? byName(left, right) : a === null ? 1 : -1;
      return b - a || byName(left, right);
    }
    const measured = Number(isMeasured(right.metrics)) - Number(isMeasured(left.metrics));
    return measured || right.metrics.tokens - left.metrics.tokens || byName(left, right);
  };
}

/** Workspaces grouped by project, each list ordered by `sort`. */
export function groupUsageByProject(report: WorkspaceUsageReport, directory: UsageWorkspaceDirectory, sort: UsageProjectSort): UsageProject[] {
  const projects = new Map<string, UsageProject>();
  for (const row of report.workspaces) {
    const entry = row.workspaceId === null ? undefined : directory.get(row.workspaceId);
    const key = entry?.repositoryPath ?? REMOVED_PROJECT_KEY;
    let project = projects.get(key);
    if (!project) {
      project = { key, name: entry?.repositoryName ?? null, repositoryPath: entry?.repositoryPath ?? null,
        metrics: emptyUsageMetrics(), lastActiveAt: row.lastActiveAt, workspaces: [], days: {} };
      projects.set(key, project);
    }
    const { workspaceId, lastActiveAt, providerIds: _providers, days, ...metrics } = row;
    addUsageMetrics(project.metrics, metrics);
    if (lastActiveAt > project.lastActiveAt) project.lastActiveAt = lastActiveAt;
    for (const [day, value] of Object.entries(days)) addUsageMetrics(project.days[day] ??= emptyUsageMetrics(), value);
    project.workspaces.push({ key: workspaceId ?? "", workspaceId, name: entry?.name ?? null, metrics, lastActiveAt });
  }
  const compare = compareUsageRows(sort);
  const list = [...projects.values()];
  for (const project of list) project.workspaces.sort(compare);
  // The removed group stays last whatever the order: it is not a project to compare.
  return list.sort((left, right) => Number(left.key === REMOVED_PROJECT_KEY) - Number(right.key === REMOVED_PROJECT_KEY) || compare(left, right));
}

export interface UsageProjectSeries {
  /** A project key, or `other` for the projects beyond the named ones. */
  key: string;
  name: string | null;
  /** Chart color slot, 1-based; `other` has none. */
  slot: number | null;
}
export interface UsageProjectChartDay {
  day: string;
  tokens: number;
  segments: Array<{ key: string; tokens: number }>;
}

/** The projects a chart names on its own; the rest are stacked together as one "other" segment. */
export const USAGE_PROJECT_CHART_SERIES = 6;
export const OTHER_PROJECTS_KEY = "\u0000other";

/**
 * One bar per day of the period, stacked by project in token order. The
 * removed group is never named on its own, so its tokens count as "other".
 */
export function usageProjectChart(projects: readonly UsageProject[], days: readonly string[], limit = USAGE_PROJECT_CHART_SERIES) {
  const ranked = projects.filter((project) => project.key !== REMOVED_PROJECT_KEY && project.metrics.tokens > 0)
    .sort(compareUsageRows("tokens"));
  const named = ranked.slice(0, limit);
  const namedKeys = new Set(named.map((project) => project.key));
  const others = projects.filter((project) => !namedKeys.has(project.key));
  const series: UsageProjectSeries[] = named.map((project, index) => ({ key: project.key, name: project.name, slot: index + 1 }));
  if (others.some((project) => project.metrics.tokens > 0)) series.push({ key: OTHER_PROJECTS_KEY, name: null, slot: null });
  const bars: UsageProjectChartDay[] = days.map((day) => {
    const segments = named.map((project) => ({ key: project.key, tokens: project.days[day]?.tokens ?? 0 }));
    const other = others.reduce((sum, project) => sum + (project.days[day]?.tokens ?? 0), 0);
    if (other > 0) segments.push({ key: OTHER_PROJECTS_KEY, tokens: other });
    return { day, tokens: segments.reduce((sum, segment) => sum + segment.tokens, 0), segments: segments.filter((segment) => segment.tokens > 0) };
  });
  return { series, bars, max: Math.max(0, ...bars.map((bar) => bar.tokens)) };
}

export interface UsageProjectDisk {
  key: string;
  name: string;
  bytes: number;
  workspaces: number;
  /** Folders whose size is a lower bound or not known yet; the total is then at least `bytes`. */
  incomplete: number;
  /** Folders with a size, whole or partial; with none, `bytes` says nothing. */
  measured: number;
}

/** Disk use per project, largest first. Unmeasured folders add nothing but are counted as incomplete. */
export function groupDiskByProject(report: WorkspaceDiskUsageReport): UsageProjectDisk[] {
  const projects = new Map<string, UsageProjectDisk>();
  for (const row of report.rows) {
    let project = projects.get(row.repositoryPath);
    if (!project) {
      project = { key: row.repositoryPath, name: row.repositoryName, bytes: 0, workspaces: 0, incomplete: 0, measured: 0 };
      projects.set(row.repositoryPath, project);
    }
    project.workspaces++;
    project.bytes += row.measurement?.bytes ?? 0;
    if (!row.measurement || row.measurement.bytes === null || row.measurement.partial) project.incomplete++;
    if (typeof row.measurement?.bytes === "number") project.measured++;
  }
  return [...projects.values()].sort((left, right) => right.bytes - left.bytes || left.name.localeCompare(right.name));
}

export interface UsageReclaimable {
  row: WorkspaceCleanupRow;
  bytes: number | null;
  partial: boolean;
}

/**
 * Workspaces the cleanup checks allow removing now (no blockers) that have a
 * folder on disk, largest first. Sizes come from the disk report; nothing
 * here removes anything.
 */
export function reclaimableWorkspaces(rows: readonly WorkspaceCleanupRow[], disk: WorkspaceDiskUsageReport) {
  const sizes = new Map(disk.rows.map((row) => [row.workspaceId, row.measurement]));
  const items: UsageReclaimable[] = rows.filter((row) => row.blockers.length === 0 && !row.branchOnly && sizes.has(row.id))
    .map((row) => {
      const measurement = sizes.get(row.id);
      return { row, bytes: measurement?.bytes ?? null, partial: Boolean(measurement?.partial) };
    })
    .sort((left, right) => (right.bytes ?? -1) - (left.bytes ?? -1) || left.row.name.localeCompare(right.row.name));
  return { items, bytes: items.reduce((sum, item) => sum + (item.bytes ?? 0), 0), incomplete: items.some((item) => item.bytes === null || item.partial) };
}
