import { i18n } from "@/i18n/runtime";
/**
 * Schedules: the one list over work that runs on its own.
 *
 * Two records sit underneath and stay separate: an automation ("Start a task":
 * repository + agent + prompt + cadence) and a wake-up ("Check back on a task":
 * an existing task + cadence, when its subagents finish, or when its pull
 * request needs fixing). This module only folds them into rows the Schedules
 * surface renders. Pure: no clock, no I/O.
 *
 * Used by `src/components/layout/automation-center/` and `tests/schedule-rows.test.ts`.
 */
import type { AutomationRun, AutomationSpec } from "./automations";
import { formatAutomationSchedule } from "./automation-presentation";
import type { WakeUp, WakeUpSummary } from "./supervision/wake-up-policy";
import type { PullRequestWatchEvent } from "./supervision/pull-request-watch";
import {
  describePullRequestWatchEvents,
  describePullRequestWatchLastSeen,
  describePullRequestWatchTarget,
} from "./supervision/pull-request-watch-view";

export type ScheduleKind = "start" | "check-back";
export type ScheduleState = "on" | "paused" | "stopped" | "manual";
export type ScheduleTone = "neutral" | "accent" | "warning" | "success" | "danger";

export const SCHEDULE_KIND_LABEL: Record<ScheduleKind, string> = {
  get start() { return i18n.t("automation:scheduleRows.startATask"); },
  get "check-back"() { return i18n.t("automation:scheduleRows.checkBackOnATask"); },
};

export const SCHEDULE_STATE_LABEL: Record<ScheduleState, string> = {
  get on() { return i18n.t("automation:scheduleRows.on"); },
  get paused() { return i18n.t("automation:scheduleRows.paused"); },
  get stopped() { return i18n.t("automation:scheduleRows.stopped"); },
  get manual() { return i18n.t("automation:scheduleRows.manual"); },
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
  /** The kind as the row names it; a pull request watch says so instead of "Check back". */
  kindLabel: string;
  /** Automation id or wake-up id. */
  id: string;
  name: string;
  /** One line under the name, when it adds something. */
  detail: string | null;
  agent: string;
  /** When it runs; null for a manual schedule, whose state already says so. */
  cadence: string | null;
  state: ScheduleState;
  lastResult: ScheduleLastResult;
  /** ISO instant of the next run; otherwise `nextNote` says why not, when the state does not. */
  nextRunAt: string | null;
  nextNote: string | null;
  canRunNow: boolean;
  /** "pause" when running on its own, "resume" when paused, null when neither applies. */
  toggle: "pause" | "resume" | null;
}

const RUN_RESULT: Record<AutomationRun["status"], { label: string; tone: ScheduleTone }> = {
  running: { get label() { return i18n.t("automation:scheduleRows.running"); }, tone: "accent" },
  waiting: { get label() { return i18n.t("automation:scheduleRows.waiting"); }, tone: "warning" },
  completed: { get label() { return i18n.t("automation:scheduleRows.done"); }, tone: "success" },
  failed: { get label() { return i18n.t("automation:scheduleRows.failed"); }, tone: "danger" },
  skipped: { get label() { return i18n.t("automation:scheduleRows.skipped"); }, tone: "neutral" },
};

/** "Every 1 hour" reads as "Every hour". */
export function formatScheduleCadence(schedule: Parameters<typeof formatAutomationSchedule>[0]) {
  return formatAutomationSchedule(schedule, undefined, { compact: true });
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
    kindLabel: SCHEDULE_KIND_LABEL.start,
    id: automation.id,
    name: automation.name,
    detail: automation.environment.label,
    agent: automation.runtime.model,
    cadence: automation.enabled ? formatScheduleCadence(automation.schedule) : null,
    state: automation.enabled ? "on" : "manual",
    lastResult: latestRun
      ? { ...(result ?? RUN_RESULT.running), at: latestRun.completedAt ?? latestRun.startedAt }
      : { label: i18n.t("automation:scheduleRows.notRunYet"), tone: "neutral", at: null },
    nextRunAt: automation.enabled ? automation.nextRunAt : null,
    nextNote: null,
    canRunNow: true,
    toggle: automation.enabled ? "pause" : "resume",
  };
}

/**
 * A pull request watch: what it wakes on, which pull request it follows, and
 * what its last check saw. It has no next instant — it polls — so the row's
 * "next" slot names the pull request instead.
 */
function pullRequestWatchScheduleRow(
  wakeUp: WakeUp,
  taskTitle: string | null,
  events: readonly PullRequestWatchEvent[],
): ScheduleRow {
  const state: ScheduleState = wakeUp.state === "scheduled" ? "on" : wakeUp.state;
  const watch = wakeUp.pullRequestWatch;
  const seen = describePullRequestWatchLastSeen(watch);
  return {
    key: `check-back:${wakeUp.id}`,
    kind: "check-back",
    kindLabel: i18n.t("automation:pullRequestWatch.kindLabel"),
    id: wakeUp.id,
    name: taskTitle
      ? i18n.t("automation:pullRequestWatch.rowName", { task: taskTitle })
      : i18n.t("automation:pullRequestWatch.kindLabel"),
    detail: describePullRequestWatchTarget(watch),
    agent: wakeUp.fingerprint.model,
    cadence: describePullRequestWatchEvents(events),
    state,
    lastResult:
      wakeUp.occurrenceCount > 0
        ? {
            label: i18n.t("automation:pullRequestWatch.woke", { count: wakeUp.occurrenceCount }),
            tone: "accent",
            at: wakeUp.lastOccurrenceAt,
          }
        : { label: seen.text, tone: seen.tone, at: seen.at },
    nextRunAt: null,
    // The list does not render `detail`; this is where it says what is watched.
    nextNote: describePullRequestWatchTarget(watch),
    canRunNow: false,
    toggle: wakeUp.state === "scheduled" ? "pause" : wakeUp.state === "paused" ? "resume" : null,
  };
}

export function wakeUpScheduleRow(
  wakeUp: WakeUp,
  summary: WakeUpSummary | undefined,
  taskTitle: string | null,
): ScheduleRow {
  if (wakeUp.trigger.kind === "pull_request") {
    return pullRequestWatchScheduleRow(wakeUp, taskTitle, wakeUp.trigger.events);
  }
  const state: ScheduleState = wakeUp.state === "scheduled" ? "on" : wakeUp.state;
  const completion = wakeUp.trigger.kind === "completion";
  const checked = wakeUp.occurrenceCount;
  // Paused and stopped are the row's state; repeating them as the next run says nothing new.
  const nextNote = wakeUp.state === "scheduled" && completion ? i18n.t("automation:additionalCopy.message38") : null;
  return {
    key: `check-back:${wakeUp.id}`,
    kind: "check-back",
    kindLabel: SCHEDULE_KIND_LABEL["check-back"],
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
      ? { label: i18n.t("automation:scheduleRows.checkedValue", { checked: checked }), tone: "success", at: wakeUp.lastOccurrenceAt }
      : { label: i18n.t("automation:scheduleRows.notYet"), tone: "neutral", at: null },
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

/**
 * The row the detail pane shows: the one the user picked while it still
 * exists, otherwise the first row of either kind, so a list of only
 * check-backs opens on one instead of an empty pane.
 */
export function resolveScheduleSelection(rows: readonly ScheduleRow[], pickedKey: string | null): ScheduleRow | null {
  return (pickedKey ? rows.find((row) => row.key === pickedKey) : undefined) ?? rows[0] ?? null;
}

export type ScheduleListState = "loading" | "failed" | "empty" | "rows";

/**
 * What the list area shows. Rows already on screen stay through a reload or a
 * failed refresh. Until both sources have answered, an empty list is
 * "loading", not "no schedules"; when one failed it is "failed", so the error
 * is the message instead of an empty state that hides it.
 */
export function scheduleListState(args: {
  rowCount: number;
  /** Each source has answered at least once, with data or an error. */
  automationsLoaded: boolean;
  checkBacksLoaded: boolean;
  failed: boolean;
}): ScheduleListState {
  if (args.rowCount > 0) return "rows";
  if (!args.automationsLoaded || !args.checkBacksLoaded) return "loading";
  return args.failed ? "failed" : "empty";
}
