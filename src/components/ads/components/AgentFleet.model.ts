import type { ReactNode } from "react";

import type { WorkState } from "./state-vocabulary";

/**
 * The data `AgentFleet` draws, and the pure rules it draws it by. Kept apart
 * from the component so a host can compute the same totals and rollups (and
 * tests can check them) without rendering anything.
 */

/** Where an agent is in its work. Always shown as words, never color alone. */
export type AgentFleetStatus =
  | "queued"
  | "running"
  | "waiting"
  | "done"
  | "failed"
  | "stopped";

/** One step of an agent's work, as its tasks window lists it. */
export interface AgentFleetStep {
  id: string;
  title: string;
  status?: AgentFleetStatus;
  /** The tool the step used, as reported. */
  tool?: string;
  /** How long the step took, when measured. */
  tookMs?: number;
}

/** A tool an agent used, drawn as its icon and named for assistive tech. */
export interface AgentFleetTool {
  /** The tool's identifier as reported, for the host's icon lookup. */
  id: string;
  /** The tool's readable name: the icon's accessible name and tooltip. */
  name: string;
}

export interface AgentFleetAgent {
  id: string;
  name: string;
  model?: string;
  avatar?: ReactNode;
  /** Most recent tools first; the card shows three and counts the rest. */
  tools?: readonly AgentFleetTool[];
  /**
   * One line: what the agent is doing or was asked to do. A subagent card
   * leaves it out when it only repeats the name.
   */
  task?: string;
  status: AgentFleetStatus;
  /** Replaces the status word, e.g. "No updates" for a quiet running turn. */
  statusLabel?: string;
  /** The agent's own reported cost in USD; omitted when unknown, never 0 for unknown. */
  cost?: number;
  /** When the agent started; a running agent's time ticks from here. */
  startedAt?: number;
  /** A measured running time, used when the agent is not running. */
  elapsedMs?: number;
  /** Undefined until known; the open tree reads them. */
  children?: readonly AgentFleetAgent[];
  childrenLoading?: boolean;
  childrenError?: string | null;
  steps?: readonly AgentFleetStep[];
  /** What the agent waits to hear from the user. */
  ask?: string;
  /** Why the agent failed. */
  error?: string;
  /** A shortcut on a waiting or failed subagent's card, e.g. "Answer". */
  resolveLabel?: string;
}

/**
 * Each status as the shared work state `StateMark` draws. `done` borrows the
 * ready glyph and color but says "Done" (the component owns that word).
 */
export const AGENT_FLEET_WORK_STATE: Readonly<Record<AgentFleetStatus, WorkState>> = {
  queued: "queued",
  running: "working",
  waiting: "needs-you",
  done: "ready",
  failed: "failed",
  stopped: "stopped",
};

/** Queued and stopped agents (and their connectors) are drawn quietly. */
export function isAgentFleetStatusMuted(status: AgentFleetStatus) {
  return status === "queued" || status === "stopped";
}

/** A subagent's resolve shortcut only exists while it waits or after it failed. */
export function canResolveAgentFleetAgent(agent: Pick<AgentFleetAgent, "status" | "resolveLabel">) {
  return Boolean(agent.resolveLabel) && (agent.status === "waiting" || agent.status === "failed");
}

/**
 * The agent's own cost plus every known descendant's. Null when no one in the
 * branch reported a cost, so an unknown cost never reads as $0.
 */
export function rollupAgentFleetCost(agent: Pick<AgentFleetAgent, "cost" | "children">): number | null {
  let total: number | null =
    typeof agent.cost === "number" && Number.isFinite(agent.cost) ? agent.cost : null;
  for (const child of agent.children ?? []) {
    const branch = rollupAgentFleetCost(child);
    if (branch !== null) total = (total ?? 0) + branch;
  }
  return total;
}

export interface AgentFleetTotals {
  /** Main agents. */
  agents: number;
  running: number;
  /** Main agents waiting on the user. */
  waiting: number;
  /** Sum of the main cards' costs (each a branch rollup); null when none is known. */
  cost: number | null;
}

/**
 * The top bar's numbers. They count main agents only, so opening a tree does
 * not change them; the cost is what the cards show, summed.
 */
export function summarizeAgentFleet(agents: readonly AgentFleetAgent[]): AgentFleetTotals {
  const totals: AgentFleetTotals = { agents: agents.length, running: 0, waiting: 0, cost: null };
  for (const agent of agents) {
    if (agent.status === "running") totals.running += 1;
    if (agent.status === "waiting") totals.waiting += 1;
    const cost = rollupAgentFleetCost(agent);
    if (cost !== null) totals.cost = (totals.cost ?? 0) + cost;
  }
  return totals;
}

export interface AgentFleetChildCounts {
  total: number;
  running: number;
  waiting: number;
  failed: number;
}

/** Direct children by state, for the main card's numbers line and the tree header. */
export function countAgentFleetChildren(children: readonly AgentFleetAgent[]): AgentFleetChildCounts {
  const counts: AgentFleetChildCounts = { total: children.length, running: 0, waiting: 0, failed: 0 };
  for (const child of children) {
    if (child.status === "running") counts.running += 1;
    else if (child.status === "waiting") counts.waiting += 1;
    else if (child.status === "failed") counts.failed += 1;
  }
  return counts;
}

/** The tools a card shows (three at most) and how many more there are. */
export function splitAgentFleetTools<Tool>(tools: readonly Tool[] | undefined, max = 3) {
  const list = tools ?? [];
  return { shown: list.slice(0, max), more: Math.max(0, list.length - max) };
}

/** Case, spacing and separators aside, so "fix-tests" reads as "Fix tests". */
function comparableText(value: string) {
  return value.toLocaleLowerCase().replace(/[\s\-_·:|/]+/g, " ").trim();
}

/**
 * The task line a card shows, or null when there is none: no task, or one the
 * name already says ("Explore · Explore the search index" over "Explore the
 * search index"), which would only repeat it.
 */
export function describeAgentFleetTask(agent: Pick<AgentFleetAgent, "name" | "task">): string | null {
  const task = agent.task?.trim();
  if (!task) return null;
  const comparable = comparableText(task);
  return comparable && !comparableText(agent.name).includes(comparable) ? task : null;
}

/** Whether the agent has a running time to show: ticking, or measured. */
export function hasAgentFleetTime(agent: Pick<AgentFleetAgent, "status" | "startedAt" | "elapsedMs">) {
  return (
    (agent.status === "running" && agent.startedAt !== undefined) ||
    (agent.elapsedMs !== undefined && Number.isFinite(agent.elapsedMs))
  );
}

/**
 * Whether the card's numbers line (cost, running time, subagents) has
 * anything to say. A card without one takes the shorter of the two fixed
 * card heights instead of carrying an empty line.
 */
export function hasAgentFleetNumbers(
  agent: Pick<AgentFleetAgent, "status" | "startedAt" | "elapsedMs" | "cost" | "children">,
) {
  return (
    rollupAgentFleetCost(agent) !== null ||
    hasAgentFleetTime(agent) ||
    (agent.children?.length ?? 0) > 0
  );
}

/**
 * The two fixed card heights: `compact` holds two lines, `full` three. Only
 * two, so a status change swaps words inside a card and moves the cards
 * below by one known step at most.
 */
export type AgentFleetCardSize = "compact" | "full";

export function sizeAgentFleetCard(
  agent: Pick<
    AgentFleetAgent,
    "name" | "task" | "status" | "startedAt" | "elapsedMs" | "cost" | "children"
  >,
  kind: "main" | "subagent",
): AgentFleetCardSize {
  // A main card always has its name line and its tools-and-task line.
  const lines =
    kind === "main"
      ? 2 + (hasAgentFleetNumbers(agent) ? 1 : 0)
      : 1 + (describeAgentFleetTask(agent) ? 1 : 0) + (hasAgentFleetNumbers(agent) ? 1 : 0);
  return lines > 2 ? "full" : "compact";
}

/**
 * Where roving focus goes from `index` among `count` main cards for a key:
 * ↑/↓ step without wrapping, Home/End jump. Null for any other key.
 */
export function moveAgentFleetFocus(key: string, index: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowDown":
      return Math.min(count - 1, index + 1);
    case "ArrowUp":
      return Math.max(0, index - 1);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/**
 * The open main agent: the controlled value when given, else the uncontrolled
 * one. An id no longer in the list reads as none open.
 */
export function resolveAgentFleetOpen(
  agents: readonly Pick<AgentFleetAgent, "id">[],
  open: string | null,
): string | null {
  return open !== null && agents.some((agent) => agent.id === open) ? open : null;
}
