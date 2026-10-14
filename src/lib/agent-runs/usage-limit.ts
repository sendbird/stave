import { i18n } from "@/i18n/runtime";
import { formatDateTime } from "@/i18n/format";
import type { AgentRun } from "./domain";

/** A reset reservation uses the same one-minute grace as composer task pauses. */
export const USAGE_LIMIT_RESUME_GRACE_MS = 60_000;

/** How long a due resume waits before reading an unreadable usage window again. */
export const USAGE_LIMIT_UNAVAILABLE_RETRY_MS = 5 * 60_000;

/** When an unreadable usage window is read again. */
export function resolveUsageLimitRetryAt(now: Date): string {
  return new Date(now.getTime() + USAGE_LIMIT_UNAVAILABLE_RETRY_MS).toISOString();
}

export function resolveAgentRunUsageLimitResumeAt(resetsAt: string | null, now: Date): string | null {
  const reset = resetsAt ? Date.parse(resetsAt) : NaN;
  return Number.isFinite(reset)
    ? new Date(Math.max(reset, now.getTime()) + USAGE_LIMIT_RESUME_GRACE_MS).toISOString()
    : null;
}

/**
 * Whether a usage-limit pause resumes on its own: it holds a resume time.
 * Without one the reset time is unknown, the run needs the user, and the
 * user resumes it.
 */
export function awaitsUsageReset(run: Pick<AgentRun, "usageLimit">): boolean {
  return Boolean(run.usageLimit?.resumeAt);
}

export function describeAgentRunUsageLimit(run: Pick<AgentRun, "usageLimit"> & Partial<Pick<AgentRun, "accountPool">>): string {
  if (!awaitsUsageReset(run)) return i18n.t("agentRuns:usageLimit.unknownReset");
  // An unreadable usage window re-reads at the resume time; the reset stays unknown.
  const time = run.usageLimit!.resetsAt ?? run.usageLimit!.resumeAt!;
  // A pooled run waits for the earliest reset in its pool and checks every pool account.
  return i18n.t(run.accountPool ? "agentRuns:usageLimit.waitingUntilPool" : "agentRuns:usageLimit.waitingUntil", { time: formatDateTime(time) });
}
