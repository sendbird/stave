import type { WorkState } from "@/components/ads/components/state-vocabulary";
import type { DelegationExchange } from "./exchange";
import { isExchangeStatusLive } from "./format";
import { subagentLineState, type SubagentLineState } from "./subagent-summary";

/** Each delegate state as a shared work state, for `StateMark`. */
export const SUBAGENT_LIST_WORK_STATE: Record<SubagentLineState, WorkState> = {
  working: "working",
  queued: "queued",
  done: "ready",
  failed: "failed",
  stopped: "stopped",
  "needs-you": "needs-you",
  waiting: "waiting",
};

/**
 * A child that stopped short and waits on the user: it asks a question or an
 * approval, or it is a delegated task that failed, which only the user can
 * open and retry. An in-turn subagent's failure is reported by the turn that
 * called it, so it stays an ordinary settled row.
 */
export function subagentNeedsUser(exchange: DelegationExchange): boolean {
  const state = subagentLineState(exchange);
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
      (subagentLineState(row) === "needs-you" ? asking : failed).push(row);
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
  stopped: number;
}

export function countSubagentList(rows: readonly DelegationExchange[]): SubagentListCounts {
  const counts: SubagentListCounts = { needsYou: 0, running: 0, done: 0, failed: 0, stopped: 0 };
  for (const row of rows) {
    if (subagentNeedsUser(row)) {
      counts.needsYou += 1;
      continue;
    }
    switch (subagentLineState(row)) {
      case "working":
      case "waiting":
      case "queued":
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
