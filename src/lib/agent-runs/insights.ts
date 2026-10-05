import { i18n } from "@/i18n/runtime";
/**
 * Results: how ended agent runs and legacy runs went, from the events
 * each one recorded. A run is an agent run with an implicit one-stage workflow
 * (`agent-run.ts`), so both kinds read the same way and differ only by name.
 *
 * Only outcome, time, cost, why a run did not finish and how much it needed
 * you are kept. Activity counts (lines, messages, streaks) drive no decision.
 */
import type { AgentRunEvent, AgentRunState, AgentRunStopReason } from "./domain";
import type { AgentRunUsage } from "./usage";

/** What an ended run came to. A cancelled run is `stopped`; one Stave stopped is `failed`. */
export type RunOutcome = "ready" | "rework" | "failed" | "stopped";

export const RUN_OUTCOMES: readonly RunOutcome[] = ["ready", "rework", "failed", "stopped"];

/** Why a run that did not finish ended, in one cause. */
export type RunEndReason = AgentRunStopReason | "stuck-stage" | "turn-failed" | "stopped-by-you";

export const RUN_END_REASON_LABELS: Record<RunEndReason, string> = {
  get "stuck-stage"() { return i18n.t("agentRuns:insights.stuckStage"); },
  get "turn-cap-reached"() { return i18n.t("agentRuns:insights.turnCapReached"); },
  get expired() { return i18n.t("agentRuns:insights.expired"); },
  get "task-unavailable"() { return i18n.t("agentRuns:insights.taskUnavailable"); },
  get "turn-failed"() { return i18n.t("agentRuns:insights.turnFailed"); },
  get "stopped-by-you"() { return i18n.t("agentRuns:insights.stoppedByYou"); },
};

/** What a run's events say about it. */
export interface RunEventCounts {
  userReplies: number;
  changesRequested: number;
  nudges: number;
  stuckStages: number;
  turnFailures: number;
}

export function countRunEvents(events: readonly Pick<AgentRunEvent, "kind">[]): RunEventCounts {
  const count = (...kinds: AgentRunEvent["kind"][]) => events.filter((event) => kinds.includes(event.kind)).length;
  return {
    userReplies: count("user-turn"),
    changesRequested: count("changes-requested"),
    nudges: count("nudge"),
    stuckStages: count("stage-stuck"),
    turnFailures: count("turn-failed", "turn-interrupted"),
  };
}

/** One ended run, as the results read it. */
export interface ResultSample {
  agentRunId: string;
  workspaceId: string;
  leadTaskId: string;
  /** The agent's name for a run; the workflow's for an agent run. */
  name: string;
  kind: "agent" | "workflow";
  providerId: string;
  state: AgentRunState;
  stopReason: AgentRunStopReason | null;
  startedAt: string;
  endedAt: string;
  counts: RunEventCounts;
  usage: AgentRunUsage | null;
}

export interface ResultRun {
  agentRunId: string;
  workspaceId: string;
  leadTaskId: string;
  name: string;
  kind: "agent" | "workflow";
  providerId: string;
  outcome: RunOutcome;
  /** Set when the run did not finish. */
  reason: RunEndReason | null;
  endedAt: string;
  durationMs: number;
  /** Replies, requested changes and reminders. */
  corrections: number;
  costUsd: number | null;
}

export interface ResultsSummary {
  ended: number;
  ready: number;
  rework: number;
  failed: number;
  stopped: number;
  /** Share of ended runs that came out ready, 0 to 1; null with no runs. */
  readyRate: number | null;
  /** Median time from start to end of the ready runs. */
  medianReadyMs: number | null;
  /** Reported spend divided by the ready runs among those that reported one. */
  costPerReady: number | null;
  /** Ended runs whose provider reported no cost (Codex reports tokens only). */
  unreportedCost: number;
  correctionsPerRun: number | null;
  /** Why runs did not finish, most first. */
  reasons: Array<{ reason: RunEndReason; count: number }>;
}

export interface ResultsAgentRow {
  key: string;
  name: string;
  kind: "agent" | "workflow";
  runs: number;
  readyRate: number;
  medianCostUsd: number | null;
  correctionsPerRun: number;
  /** The last ten outcomes, oldest first. */
  last: RunOutcome[];
}

export interface AgentRunInsights {
  /** Runs that ended within this many days. */
  days: number;
  summary: ResultsSummary;
  /** Newest first. */
  runs: ResultRun[];
  /** Per agent or workflow, most runs first. */
  agents: ResultsAgentRow[];
}

const LAST_CELLS = 10;

export function classifyRun(sample: Pick<ResultSample, "state" | "counts">): RunOutcome {
  if (sample.state === "completed") return sample.counts.changesRequested > 0 ? "rework" : "ready";
  return sample.state === "stopped" ? "failed" : "stopped";
}

function endReason(sample: ResultSample, outcome: RunOutcome): RunEndReason | null {
  if (outcome === "ready" || outcome === "rework") return null;
  if (sample.stopReason) return sample.stopReason;
  if (sample.counts.stuckStages > 0) return "stuck-stage";
  if (sample.counts.turnFailures > 0) return "turn-failed";
  return "stopped-by-you";
}

function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

const mean = (values: readonly number[]) => values.reduce((total, value) => total + value, 0) / values.length;
const tenth = (value: number) => Math.round(value * 10) / 10;

function toRun(sample: ResultSample): ResultRun {
  const outcome = classifyRun(sample);
  const { counts } = sample;
  return {
    agentRunId: sample.agentRunId,
    workspaceId: sample.workspaceId,
    leadTaskId: sample.leadTaskId,
    name: sample.name,
    kind: sample.kind,
    providerId: sample.providerId,
    outcome,
    reason: endReason(sample, outcome),
    endedAt: sample.endedAt,
    durationMs: Math.max(0, Date.parse(sample.endedAt) - Date.parse(sample.startedAt)),
    corrections: counts.userReplies + counts.changesRequested + counts.nudges,
    costUsd: sample.usage?.costUsd ?? null,
  };
}

function summarize(runs: readonly ResultRun[]): ResultsSummary {
  const countOf = (outcome: RunOutcome) => runs.filter((run) => run.outcome === outcome).length;
  const ready = runs.filter((run) => run.outcome === "ready");
  const costed = runs.filter((run) => run.costUsd !== null);
  const costedReady = costed.filter((run) => run.outcome === "ready").length;
  const reasons = new Map<RunEndReason, number>();
  for (const run of runs) if (run.reason) reasons.set(run.reason, (reasons.get(run.reason) ?? 0) + 1);
  return {
    ended: runs.length,
    ready: ready.length,
    rework: countOf("rework"),
    failed: countOf("failed"),
    stopped: countOf("stopped"),
    readyRate: runs.length ? ready.length / runs.length : null,
    medianReadyMs: median(ready.map((run) => run.durationMs)),
    costPerReady: costedReady ? costed.reduce((total, run) => total + run.costUsd!, 0) / costedReady : null,
    unreportedCost: runs.length - costed.length,
    correctionsPerRun: runs.length ? tenth(mean(runs.map((run) => run.corrections))) : null,
    reasons: [...reasons].map(([reason, count]) => ({ reason, count })).sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason)),
  };
}

function agentRows(runs: readonly ResultRun[]): ResultsAgentRow[] {
  const groups = new Map<string, ResultRun[]>();
  for (const run of runs) groups.set(`${run.kind}:${run.name}`, [...(groups.get(`${run.kind}:${run.name}`) ?? []), run]);
  return [...groups]
    .map(([key, group]) => {
      const oldestFirst = [...group].sort((left, right) => Date.parse(left.endedAt) - Date.parse(right.endedAt));
      return {
        key,
        name: group[0]!.name,
        kind: group[0]!.kind,
        runs: group.length,
        readyRate: group.filter((run) => run.outcome === "ready").length / group.length,
        medianCostUsd: median(group.flatMap((run) => (run.costUsd === null ? [] : [run.costUsd]))),
        correctionsPerRun: tenth(mean(group.map((run) => run.corrections))),
        last: oldestFirst.slice(-LAST_CELLS).map((run) => run.outcome),
      };
    })
    .sort((left, right) => right.runs - left.runs || left.name.localeCompare(right.name));
}

export function aggregateAgentRunInsights(samples: readonly ResultSample[], days: number): AgentRunInsights {
  const runs = samples.map(toRun).sort((left, right) => Date.parse(right.endedAt) - Date.parse(left.endedAt));
  return { days, summary: summarize(runs), runs, agents: agentRows(runs) };
}

/** "83%" of runs ready. */
export function formatReadyRate(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}
