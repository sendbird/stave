import { i18n } from "@/i18n";
import { formatDateTime, formatList, formatTimeAgo } from "@/i18n/format";
import { formatAutomationSchedule } from "@/lib/automation-presentation";
import {
  TarsScheduleReasonSchema, type TarsScheduleRecord, type TarsScheduleRule, type TarsScheduleView, type TarsScheduleWorkspace,
} from "./schedules";

/**
 * How the Tars view words a schedule. Times are shown in this computer's
 * zone, which is the zone the Schedules service runs a repeating rule in; the
 * zone's name is said beside them, so "09:00" is never read as another place's.
 */

/** One instant in local time: "Wed, Nov 11, 9:00 AM"; the year only when it is not this one. */
export function formatTarsScheduleTime(at: string, now: Date = new Date()): string {
  const sameYear = new Date(at).getFullYear() === now.getFullYear();
  return formatDateTime(at, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", ...(sameYear ? {} : { year: "numeric" }) });
}

/** "Every weekday at 09:00", or "Once, Wed, Nov 11, 3:00 PM". */
export function describeTarsScheduleRule(rule: TarsScheduleRule, now?: Date): string {
  return rule.kind === "once" ? i18n.t("shell:tars.schedule.rule.once", { when: formatTarsScheduleTime(rule.runAt, now) })
    : formatAutomationSchedule(rule.schedule, undefined, { compact: true });
}

/** The next runs with their zone: "Wed, Nov 11, 9:00 AM and Thu, Nov 12, 9:00 AM (Asia/Seoul)". */
export function describeTarsScheduleNextRuns(runs: readonly string[], timezone: string, now?: Date): string {
  if (!runs.length) return i18n.t("shell:tars.schedule.nextNone");
  return i18n.t("shell:tars.schedule.nextRuns", { times: formatList(runs.map((run) => formatTarsScheduleTime(run, now))), timezone });
}

/** Where runs start: the workspace (and its branch) in its repository. */
export function describeTarsScheduleWorkspace(workspace: TarsScheduleWorkspace | null): string {
  if (!workspace) return i18n.t("shell:tars.schedule.whereMissing");
  return workspace.branch
    ? i18n.t("shell:tars.schedule.whereBranch", { workspace: workspace.name, branch: workspace.branch, repository: workspace.repositoryName })
    : i18n.t("shell:tars.schedule.where", { workspace: workspace.name, repository: workspace.repositoryName });
}

/** Translation key for a refused schedule change; an unrecognized code reads as the generic reason. */
export function tarsScheduleReasonKey(reason: unknown) {
  const parsed = TarsScheduleReasonSchema.safeParse(reason);
  return `shell:tars.schedule.reason.${parsed.success ? parsed.data : "unknown"}` as const;
}

/** What a settled confirmation did, in its record's words. */
export function tarsScheduleOutcomeKey(record: Pick<TarsScheduleRecord, "status" | "operation" | "summary">) {
  if (record.status === "pending") return "shell:tars.schedule.outcome.pending" as const;
  if (record.status === "rejected") return "shell:tars.schedule.outcome.rejected" as const;
  if (record.operation === "create" && !record.summary?.enabled) return "shell:tars.schedule.outcome.createPaused" as const;
  return `shell:tars.schedule.outcome.${record.operation}` as const;
}

/** A listed schedule's next line: its next run, or why it has none. */
export function describeTarsScheduleNext(schedule: Pick<TarsScheduleView, "enabled" | "nextRuns" | "rule" | "lastRun">, now?: Date): string {
  if (schedule.nextRuns[0]) return i18n.t("shell:tars.schedule.section.next", { when: formatTarsScheduleTime(schedule.nextRuns[0], now) });
  // A one-time schedule that ran turned itself off: it is finished, not paused.
  if (schedule.rule.kind === "once" && schedule.lastRun?.trigger === "scheduled") return i18n.t("shell:tars.schedule.section.finished");
  return schedule.enabled ? i18n.t("shell:tars.schedule.nextNone") : i18n.t("shell:tars.schedule.section.paused");
}

/** A listed schedule's last outcome: "Last run: finished 2 hours ago", or that it has not run. */
export function describeTarsScheduleLastRun(lastRun: TarsScheduleView["lastRun"], now: Date = new Date()): string {
  if (!lastRun) return i18n.t("shell:tars.schedule.section.notRunYet");
  return i18n.t(`shell:tars.schedule.section.last.${lastRun.status}`, { when: formatTimeAgo(lastRun.at, now) });
}
