/**
 * How a task's check-back schedule reads on the task surfaces: its trigger, where it stands, and
 * why when it paused or stopped. Pure.
 */
import { formatAutomationSchedule } from "@/lib/automations";
import type { WakeUp, WakeUpSummary } from "./wake-up-policy";

function formatIn(ms: number) {
  if (ms <= 60_000) return "in under a minute";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `in ${hours}h`;
  return `in ${Math.round(hours / 24)}d`;
}

export function describeWakeUpTrigger(wakeUp: WakeUp): string {
  if (wakeUp.trigger.kind !== "schedule") return "When subagents finish";
  // "Every 1 hour" reads as "Every hour".
  return formatAutomationSchedule(wakeUp.trigger.schedule).replace(/^Every 1 (\w+)/, "Every $1");
}

export interface WakeUpStatusLine {
  text: string;
  tone: "active" | "waiting" | "attention" | "ended";
}

export function describeWakeUpStatus(summary: WakeUpSummary, now: number): WakeUpStatusLine {
  switch (summary.state) {
    case "scheduled":
      if (summary.triggerKind === "completion") {
        return { text: "Waiting for subagents to finish", tone: "active" };
      }
      return summary.nextRunAt
        ? { text: `Next run ${formatIn(Date.parse(summary.nextRunAt) - now)}`, tone: "active" }
        : { text: "Scheduled", tone: "active" };
    case "paused":
      return { text: `Paused${summary.reason ? ` · ${summary.reason}` : ""}`, tone: "waiting" };
    case "stopped":
      return { text: `Stopped${summary.reason ? ` · ${summary.reason}` : ""}`, tone: "ended" };
  }
}

export function describeWakeUpHistory(summary: WakeUpSummary): string | null {
  if (summary.occurrenceCount === 0 && summary.skippedCount === 0) return null;
  const ran = `Checked ${summary.occurrenceCount} ${summary.occurrenceCount === 1 ? "time" : "times"}`;
  return summary.skippedCount > 0 ? `${ran} · ${summary.skippedCount} skipped` : ran;
}
