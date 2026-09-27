/**
 * Mission insights: how missions went, per playbook and per provider, from
 * the metrics each mission's events record — how often the user had to reply,
 * how often an agent was reminded to report or got stuck, how long sign-offs
 * waited, and what the missions cost.
 */
import type { MissionState } from "./domain";
import type { MissionMetrics } from "./report";
import type { MissionUsage } from "./usage";

/** One ended mission, as the insights read it. */
export interface MissionInsightSample {
  playbookName: string;
  providerId: string;
  state: MissionState;
  metrics: MissionMetrics;
  usage: MissionUsage | null;
}

export interface MissionInsightRow {
  playbookName: string;
  providerId: string;
  missions: number;
  completed: number;
  /** Replies the user sent during the missions, per mission. */
  repliesPerMission: number;
  /** Reminders to report, per mission. */
  remindersPerMission: number;
  /** Stages that got stuck, per mission. */
  stuckPerMission: number;
  signOffWaitAverageMs: number | null;
  /** Average reported cost of the missions that reported one. */
  costPerMission: number | null;
}

export interface MissionInsights {
  /** Missions that ended within this many days. */
  days: number;
  /** Per playbook and provider, most missions first. */
  rows: MissionInsightRow[];
  /** Per provider across every playbook. */
  providers: MissionInsightRow[];
}

function aggregate(playbookName: string, providerId: string, samples: readonly MissionInsightSample[]): MissionInsightRow {
  const count = samples.length;
  const sum = (pick: (sample: MissionInsightSample) => number) => samples.reduce((total, sample) => total + pick(sample), 0);
  const waits = samples.flatMap((sample) =>
    sample.metrics.signOffWaitAverageMs === null ? [] : Array(sample.metrics.signOffs).fill(sample.metrics.signOffWaitAverageMs),
  ) as number[];
  const costs = samples.flatMap((sample) => (sample.usage?.costUsd === null || sample.usage?.costUsd === undefined ? [] : [sample.usage.costUsd]));
  const per = (value: number) => (count ? Math.round((value / count) * 10) / 10 : 0);
  return {
    playbookName,
    providerId,
    missions: count,
    completed: samples.filter((sample) => sample.state === "completed").length,
    repliesPerMission: per(sum((sample) => sample.metrics.userReplies)),
    remindersPerMission: per(sum((sample) => sample.metrics.nudges)),
    stuckPerMission: per(sum((sample) => sample.metrics.stuckStages)),
    signOffWaitAverageMs: waits.length ? Math.round(waits.reduce((total, wait) => total + wait, 0) / waits.length) : null,
    costPerMission: costs.length ? costs.reduce((total, cost) => total + cost, 0) / costs.length : null,
  };
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return groups;
}

export function aggregateMissionInsights(samples: readonly MissionInsightSample[], days: number): MissionInsights {
  const rows = [...groupBy(samples, (sample) => `${sample.playbookName}\u0000${sample.providerId}`).values()]
    .map((group) => aggregate(group[0]!.playbookName, group[0]!.providerId, group))
    .sort((left, right) => right.missions - left.missions || left.playbookName.localeCompare(right.playbookName));
  const providers = [...groupBy(samples, (sample) => sample.providerId).values()]
    .map((group) => aggregate("All playbooks", group[0]!.providerId, group))
    .sort((left, right) => right.missions - left.missions);
  return { days, rows, providers };
}

/** "83%" of missions completed. */
export function formatCompletionRate(row: Pick<MissionInsightRow, "missions" | "completed">): string {
  return row.missions ? `${Math.round((row.completed / row.missions) * 100)}%` : "—";
}
