import { isActiveAgentRunState } from "@/lib/agent-runs/domain";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import type { FleetTaskRow } from "./task-rows";
export const FLEET_STATUS_GROUPS = ["needsYou", "working", "review", "idle", "ended"] as const;
export type FleetStatusGroup = typeof FLEET_STATUS_GROUPS[number];
export type FleetGrouping = "default" | "repository" | "status";
export function fleetStatusGroup(row: FleetTaskRow, runs: Readonly<Record<string, AgentRunDetail>> = {}): FleetStatusGroup {
  if (row.task.archivedAt) return "ended";
  if (row.rank.lane === "action-required") return "needsYou";
  if (row.activeTurnId || row.rank.lane === "in-progress") return "working";
  if (row.task.unread || row.rank.lane === "in-review") return "review";
  const latest = Object.values(runs).filter((detail) => detail.agentRun.workspaceId === row.workspaceId && detail.agentRun.leadTaskId === row.task.id)
    .sort((left, right) => right.agentRun.createdAt.localeCompare(left.agentRun.createdAt))[0];
  if (latest && !isActiveAgentRunState(latest.agentRun.state)) return "ended";
  return "idle";
}
export function groupFleetTaskRows(rows: readonly FleetTaskRow[], grouping: FleetGrouping, runs: Readonly<Record<string, AgentRunDetail>> = {}) {
  if (grouping === "default") return [{ id: "default", title: null, rows }];
  if (grouping === "status") return FLEET_STATUS_GROUPS.map((id) => ({ id, title: id, rows: rows.filter((row) => fleetStatusGroup(row, runs) === id) })).filter((group) => group.rows.length);
  const groups = new Map<string, { id: string; title: string; rows: FleetTaskRow[] }>();
  for (const row of rows) {
    const group = groups.get(row.repositoryPath) ?? { id: row.repositoryPath, title: row.repositoryName, rows: [] };
    group.rows.push(row); groups.set(row.repositoryPath, group);
  }
  return [...groups.values()];
}
