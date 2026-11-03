import type { WorkState } from "@/components/ads/components/state-vocabulary";
import type { DelegationExchange } from "./exchange";
import { isExchangeStatusLive } from "./format";
import { subagentWorkState } from "./subagent-summary";

/**
 * A child that stopped short and waits on the user: it asks a question or an
 * approval, or it is a delegated task that failed, which only the user can
 * open and retry. An in-turn subagent's failure is reported by the turn that
 * called it, so it stays an ordinary settled row.
 */
export function subagentNeedsUser(exchange: DelegationExchange): boolean {
  const state = subagentWorkState(exchange);
  return state === "needs-you" || (state === "failed" && exchange.kind === "delegated-task");
}

/**
 * The Subagents list order: children that need the user first (an open ask
 * before a failure), then the live ones, both oldest first, then the settled
 * ones newest first. `rows` arrive oldest first.
 */
export function orderSubagentList(rows: readonly DelegationExchange[]): DelegationExchange[] {
  const asking: DelegationExchange[] = [];
  const failed: DelegationExchange[] = [];
  const live: DelegationExchange[] = [];
  const settled: DelegationExchange[] = [];
  for (const row of rows) {
    if (subagentNeedsUser(row)) {
      (subagentWorkState(row) === "needs-you" ? asking : failed).push(row);
    } else if (isExchangeStatusLive(row.outcome.status)) {
      live.push(row);
    } else {
      settled.push(row);
    }
  }
  return [...asking, ...failed, ...live, ...settled.reverse()];
}

export interface SubagentListCounts {
  /** Waiting on the user: an open ask, or a failed delegated task. */
  needsYou: number;
  /** Live and not waiting on the user: running, queued or between turns. */
  running: number;
  done: number;
  /** Failures the calling turn reported (not counted in `needsYou`). */
  failed: number;
  /** Stopped, or ended without saying how. */
  stopped: number;
}

/** What the Subagents tab mark counts: what runs, and what waits on the user. */
export function countSubagentList(rows: readonly DelegationExchange[]): SubagentListCounts {
  const counts: SubagentListCounts = { needsYou: 0, running: 0, done: 0, failed: 0, stopped: 0 };
  for (const row of rows) {
    if (subagentNeedsUser(row)) {
      counts.needsYou += 1;
      continue;
    }
    switch (SUBAGENT_FILTER_OF_STATE[subagentWorkState(row)]) {
      case "running":
        counts.running += 1;
        break;
      case "done":
        counts.done += 1;
        break;
      case "failed":
        counts.failed += 1;
        break;
      case "stopped":
        counts.stopped += 1;
        break;
      case "needs-you":
        // Counted above: a child asking the user always needs the user.
        break;
    }
  }
  return counts;
}

/**
 * The Subagents list filters, one per state a row can be in, so every row
 * sits under exactly one: an open ask is `needs-you` and a failure is
 * `failed` whichever kind of subagent it is.
 */
export const SUBAGENT_FILTERS = ["needs-you", "failed", "running", "done", "stopped"] as const;
export type SubagentFilter = (typeof SUBAGENT_FILTERS)[number];

/** The work state each filter shows its mark in. */
export const SUBAGENT_FILTER_WORK_STATE: Readonly<Record<SubagentFilter, WorkState>> = {
  "needs-you": "needs-you",
  failed: "failed",
  running: "working",
  done: "ready",
  stopped: "stopped",
};

const SUBAGENT_FILTER_OF_STATE: Readonly<Record<WorkState, SubagentFilter>> = {
  "needs-you": "needs-you",
  approval: "needs-you",
  failed: "failed",
  working: "running",
  waiting: "running",
  queued: "running",
  paused: "running",
  halted: "needs-you",
  idle: "running",
  ready: "done",
  stopped: "stopped",
  skipped: "stopped",
  unknown: "stopped",
};

export function subagentFilterOf(exchange: DelegationExchange): SubagentFilter {
  return SUBAGENT_FILTER_OF_STATE[subagentWorkState(exchange)];
}

/** How many rows each filter holds; the filters with none are left out by the caller. */
export function countSubagentFilters(rows: readonly DelegationExchange[]): Record<SubagentFilter, number> {
  const counts: Record<SubagentFilter, number> = { "needs-you": 0, failed: 0, running: 0, done: 0, stopped: 0 };
  for (const row of rows) counts[subagentFilterOf(row)] += 1;
  return counts;
}
