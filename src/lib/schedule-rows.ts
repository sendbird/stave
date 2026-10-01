/**
 * Schedules: the one list over work that runs on its own.
 *
 * Two records sit underneath and stay separate: an automation ("Start a task":
 * repository + agent + prompt + cadence) and a wake-up ("Check back on a task":
 * an existing task + cadence, or when its subagents finish). This module only
 * folds them into rows the Schedules surface renders. Pure: no clock, no I/O.
 *
 * Used by `src/components/layout/automation-center/` and `tests/schedule-rows.test.ts`.
 */
import { formatAutomationSchedule, type AutomationRun, type AutomationSpec } from "./automations";
import type { WakeUp, WakeUpSummary } from "./supervision/wake-up-policy";

export type ScheduleKind = "start" | "check-back";
export type ScheduleState = "on" | "paused" | "stopped" | "manual";
export type ScheduleTone = "neutral" | "accent" | "warning" | "success" | "danger";

export const SCHEDULE_KIND_LABEL: Record<ScheduleKind, string> = {
  start: "Start a task",
  "check-back": "Check back on a task",
};

export const SCHEDULE_STATE_LABEL: Record<ScheduleState, string> = {
  on: "On",
  paused: "Paused",
  stopped: "Stopped",
  manual: "Manual",
};

export interface ScheduleLastResult {
  label: string;
  tone: ScheduleTone;
  /** ISO instant the result is from, when there is one. */
  at: string | null;
}

export interface ScheduleRow {
  key: string;
  kind: ScheduleKind;
  /** Automation id or wake-up id. */
  id: string;
  name: string;
  /** One line under the name, when it adds something. */
  detail: string | null;
  agent: string;
  cadence: string;
  state: ScheduleState;
  lastResult: ScheduleLastResult;
  /** ISO instant of the next run; otherwise `nextNote` says why not. */
  nextRunAt: string | null;
  nextNote: string | null;
  canRunNow: boolean;
  /** "pause" when running on its own, "resume" when paused, null when neither applies. */
  toggle: "pause" | "resume" | null;
}

const RUN_RESULT: Record<AutomationRun["status"], { label: string; tone: ScheduleTone }> = {
  running: { label: "Running", tone: "accent" },
  waiting: { label: "Waiting", tone: "warning" },
  completed: { label: "Done", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  skipped: { label: "Skipped", tone: "neutral" },
};

/** "Every 1 hour" reads as "Every hour". */
export function formatScheduleCadence(schedule: Parameters<typeof formatAutomationSchedule>[0]) {
  return formatAutomationSchedule(schedule).replace(/^Every 1 (\w+)/, "Every $1");
}

function firstLine(text: string, max = 80) {
  const line = text.split("\n").find((candidate) => candidate.trim())?.trim() ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

export function automationScheduleRow(
  automation: AutomationSpec,
  latestRun: AutomationRun | null,
): ScheduleRow {
  const result = latestRun ? RUN_RESULT[latestRun.status] : null;
  return {
    key: `start:${automation.id}`,
    kind: "start",
    id: automation.id,
    name: automation.name,
    detail: automation.environment.label,
    agent: automation.runtime.model,
    cadence: automation.enabled ? formatScheduleCadence(automation.schedule) : "Manual only",
    state: automation.enabled ? "on" : "manual",
    lastResult: latestRun
      ? { ...(result ?? RUN_RESULT.running), at: latestRun.completedAt ?? latestRun.startedAt }
      : { label: "Not run yet", tone: "neutral", at: null },
    nextRunAt: automation.enabled ? automation.nextRunAt : null,
    nextNote: automation.enabled ? null : "Run it yourself",
    canRunNow: true,
    toggle: automation.enabled ? "pause" : "resume",
  };
}

export function wakeUpScheduleRow(
  wakeUp: WakeUp,
  summary: WakeUpSummary | undefined,
  taskTitle: string | null,
): ScheduleRow {
  const state: ScheduleState = wakeUp.state === "scheduled" ? "on" : wakeUp.state;
  const completion = wakeUp.trigger.kind === "completion";
  const checked = wakeUp.occurrenceCount;
  const nextNote =
    wakeUp.state === "paused"
      ? "Paused"
      : wakeUp.state === "stopped"
        ? "Stopped"
        : completion
          ? "Waiting"
          : null;
  return {
    key: `check-back:${wakeUp.id}`,
    kind: "check-back",
    id: wakeUp.id,
    name: taskTitle ? `Check back on ${taskTitle}` : firstLine(wakeUp.prompt, 60),
    detail: taskTitle ? firstLine(wakeUp.prompt) : null,
    agent: wakeUp.fingerprint.model,
    cadence:
      wakeUp.trigger.kind === "schedule"
        ? formatScheduleCadence(wakeUp.trigger.schedule)
        : "When subagents finish",
    state,
    lastResult: wakeUp.lastOccurrenceAt
      ? { label: `Checked ${checked}×`, tone: "success", at: wakeUp.lastOccurrenceAt }
      : { label: "Not yet", tone: "neutral", at: null },
    nextRunAt: wakeUp.state === "scheduled" && !completion ? (summary?.nextRunAt ?? wakeUp.nextRunAt) : null,
    nextNote,
    canRunNow: false,
    toggle: wakeUp.state === "scheduled" ? "pause" : wakeUp.state === "paused" ? "resume" : null,
  };
}

/** Running schedules first by next run, then paused, then stopped. */
export function buildScheduleRows(args: {
  automations: readonly AutomationSpec[];
  runs: readonly AutomationRun[];
  wakeUps: readonly WakeUp[];
  summaries: readonly WakeUpSummary[];
  taskTitleById: ReadonlyMap<string, string>;
}): ScheduleRow[] {
  const latest = new Map<string, AutomationRun>();
  // Runs arrive newest first, so the first hit per automation wins.
  for (const run of args.runs) if (!latest.has(run.automationId)) latest.set(run.automationId, run);
  const summaryById = new Map(args.summaries.map((summary) => [summary.wakeUpId, summary]));
  const rows = [
    ...args.automations.map((automation) =>
      automationScheduleRow(automation, latest.get(automation.id) ?? null),
    ),
    ...args.wakeUps.map((wakeUp) =>
      wakeUpScheduleRow(wakeUp, summaryById.get(wakeUp.id), args.taskTitleById.get(wakeUp.taskId) ?? null),
    ),
  ];
  const rank = (row: ScheduleRow) => (row.state === "on" ? 0 : row.state === "stopped" ? 2 : 1);
  const time = (row: ScheduleRow) => (row.nextRunAt ? Date.parse(row.nextRunAt) : Number.POSITIVE_INFINITY);
  return rows.sort(
    (left, right) =>
      rank(left) - rank(right) || time(left) - time(right) || left.name.localeCompare(right.name),
  );
}
