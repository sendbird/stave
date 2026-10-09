import { i18n } from "@/i18n/runtime";
/**
 * How a task's check-back schedule reads on the task surfaces: its trigger, where it stands, and
 * why when it paused or stopped. Pure.
 */
import { formatAutomationSchedule } from "@/lib/automation-presentation";
import { describePullRequestWatchEvents } from "./pull-request-watch-view";
import type { WakeUp, WakeUpSummary } from "./wake-up-policy";

function formatIn(ms: number) {
  if (ms <= 60_000) return i18n.t("agentRuns:wakeUpView.formatIn");
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return i18n.t("agentRuns:wakeUpView.minutes", { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 48) return i18n.t("agentRuns:wakeUpView.hours", { count: hours });
  return i18n.t("agentRuns:wakeUpView.days", { count: Math.round(hours / 24) });
}

export function describeWakeUpTrigger(wakeUp: WakeUp): string {
  if (wakeUp.trigger.kind === "pull_request") return describePullRequestWatchEvents(wakeUp.trigger.events);
  if (wakeUp.trigger.kind !== "schedule") return i18n.t("agentRuns:wakeUpView.describeWakeUpTrigger");
  // "Every 1 hour" reads as "Every hour".
  return formatAutomationSchedule(wakeUp.trigger.schedule, undefined, { compact: true });
}

export interface WakeUpStatusLine {
  text: string;
  tone: "active" | "waiting" | "attention" | "ended";
}

export function describeWakeUpStatus(summary: WakeUpSummary, now: number): WakeUpStatusLine {
  switch (summary.state) {
    case "scheduled":
      if (summary.triggerKind === "completion") {
        return { text: i18n.t("agentRuns:wakeUpView.text"), tone: "active" };
      }
      if (summary.triggerKind === "pull_request") {
        return { text: i18n.t("agentRuns:wakeUpView.watchingPullRequest"), tone: "active" };
      }
      return summary.nextRunAt
        ? { text: i18n.t("agentRuns:wakeUpView.text2", { value1: formatIn(Date.parse(summary.nextRunAt) - now) }), tone: "active" }
        : { text: i18n.t("agentRuns:wakeUpView.text3"), tone: "active" };
    case "paused":
      return { text: i18n.t("agentRuns:wakeUpView.text4", { value1: summary.reason ? ` · ${summary.reason}` : "" }), tone: "waiting" };
    case "stopped":
      return { text: i18n.t("agentRuns:wakeUpView.text5", { value1: summary.reason ? ` · ${summary.reason}` : "" }), tone: "ended" };
  }
}

export function describeWakeUpHistory(summary: WakeUpSummary): string | null {
  if (summary.occurrenceCount === 0 && summary.skippedCount === 0) return null;
  // A watch's occurrences are the times it woke the task, not checks: it checks every few minutes.
  if (summary.triggerKind === "pull_request") return i18n.t("automation:pullRequestWatch.woke", { count: summary.occurrenceCount });
  const ran = i18n.t("agentRuns:wakeUpView.extraCopy409", { value1: summary.occurrenceCount, count: summary.occurrenceCount });
  return summary.skippedCount > 0 ? i18n.t("agentRuns:wakeUpView.history", { ran, count: summary.skippedCount }) : ran;
}
