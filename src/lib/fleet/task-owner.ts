import { i18n } from "@/i18n/runtime";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { findActiveTaskRun, findTarsResponsibility, tarsTaskTarget } from "@/lib/tars/ownership";
import type { TarsResponsibility } from "@/lib/tars/types";

/**
 * Who drives a Fleet task: Tars holds it, an agent run supervises it, or you
 * do. Tars is judged by the same rule as its owner mark (a run you started on
 * a task Tars lost is never Tars's), so the column and the mark agree.
 */
export type FleetTaskOwner = "tars" | "agentRun" | "you";

/** The owner filter's choices: everything, or one owner. */
export type FleetOwnerFilter = "all" | FleetTaskOwner;

export const FLEET_TASK_OWNER_LABEL: Record<FleetTaskOwner, string> = {
  get tars() { return i18n.t("fleet:owner.tars"); },
  get agentRun() { return i18n.t("fleet:owner.agentRun"); },
  get you() { return i18n.t("fleet:owner.you"); },
};

export const FLEET_OWNER_FILTER_OPTIONS: ReadonlyArray<{ value: FleetOwnerFilter; label: string }> = [
  { value: "all", get label() { return i18n.t("fleet:ownerFilter.all"); } },
  { value: "tars", get label() { return i18n.t("fleet:ownerFilter.tars"); } },
  { value: "agentRun", get label() { return i18n.t("fleet:ownerFilter.agentRuns"); } },
  { value: "you", get label() { return i18n.t("fleet:ownerFilter.you"); } },
];

export interface FleetTaskOwnerSources {
  /** Tars's responsibilities as last read. */
  responsibilities: readonly TarsResponsibility[];
  /** Whether Tars ownership is known: a snapshot was read, or there is no Tars to ask. */
  tarsKnown: boolean;
  /** Fleet's mirror of agent runs, and whether it has read them. */
  runs: Readonly<Record<string, AgentRunDetail>>;
  runsLoaded: boolean;
}

/**
 * The task's owner, or null while a source that decides it has not answered:
 * an unread run mirror or Tars snapshot is never guessed as "you".
 */
export function resolveFleetTaskOwner(
  task: { workspaceId: string; taskId: string },
  sources: FleetTaskOwnerSources,
): FleetTaskOwner | null {
  const run = findActiveTaskRun(sources.runs, task.workspaceId, task.taskId) ?? (sources.runsLoaded ? null : undefined);
  if (findTarsResponsibility(sources.responsibilities, tarsTaskTarget(task.taskId, task.workspaceId, run))) return "tars";
  if (!sources.tarsKnown) return null;
  if (run) return "agentRun";
  return run === null ? "you" : null;
}

/** An unknown owner matches only "all", so a narrowed list never claims it. */
export function matchesFleetOwnerFilter(owner: FleetTaskOwner | null | undefined, filter: FleetOwnerFilter) {
  return filter === "all" || owner === filter;
}
