import { i18n } from "@/i18n/runtime";
import { formatDateTime } from "@/i18n/format";
import type { AgentRun } from "./domain";

/** A reset reservation uses the same one-minute grace as composer task pauses. */
export const USAGE_LIMIT_RESUME_GRACE_MS = 60_000;

export function resolveAgentRunUsageLimitResumeAt(resetsAt: string | null, now: Date): string | null {
  const reset = resetsAt ? Date.parse(resetsAt) : NaN;
  return Number.isFinite(reset)
    ? new Date(Math.max(reset, now.getTime()) + USAGE_LIMIT_RESUME_GRACE_MS).toISOString()
    : null;
}

export function describeAgentRunUsageLimit(run: Pick<AgentRun, "usageLimit">): string {
  return run.usageLimit?.resetsAt
    ? i18n.t("agentRuns:usageLimit.waitingUntil", { time: formatDateTime(run.usageLimit.resetsAt) })
    : i18n.t("agentRuns:usageLimit.waitingUnknown");
}
