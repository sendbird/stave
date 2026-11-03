import type { WorkState } from "@/components/ads/components/state-vocabulary";
import type { CompareRunVariantStatus } from "@/lib/compare-runs";
import type { TaskExecutionSummary } from "@/lib/fleet/task-execution-summary";

/**
 * Each candidate status as the shared work state `StateMark` draws. Preparing
 * a candidate's worktree is work under way; a kept candidate is ready, a
 * discarded one skipped, a cancelled one stopped.
 */
export const COMPARE_VARIANT_WORK_STATE: Readonly<Record<CompareRunVariantStatus, WorkState>> = {
  pending: "queued",
  creating: "working",
  running: "working",
  completed: "ready",
  failed: "failed",
  cancelled: "stopped",
  kept: "ready",
  discarded: "skipped",
};

/** What a candidate cost, as its provider reports it: dollars, else tokens, else nothing. */
export type CompareVariantSpend =
  | { kind: "usd"; amount: number }
  | { kind: "tokens"; count: number };

export interface CompareVariantProgress {
  /** How long the candidate's turn ran, or has run so far. */
  elapsed: { milliseconds: number; running: boolean; startedAt: number | null } | null;
  spend: CompareVariantSpend | null;
  /** What a running candidate is doing now (`Run command · bun test`). */
  current: string | null;
}

/**
 * A candidate's time, spend and current step, read from its task's execution
 * summary. Nothing is estimated: a value the provider did not report is left
 * out, and a cost of zero dollars stays a cost only when it was reported.
 */
export function describeCompareVariantProgress(args: {
  summary: TaskExecutionSummary;
  /** When the live turn started; the time ticks from it while it runs. */
  activityStartedAt?: number | null;
}): CompareVariantProgress {
  const { summary } = args;
  const elapsedValue = summary.elapsed.value;
  const elapsed = elapsedValue
    ? {
        milliseconds: elapsedValue.milliseconds,
        running: elapsedValue.running,
        startedAt: elapsedValue.running ? (args.activityStartedAt ?? null) : null,
      }
    : null;
  const usage = summary.usage.value;
  const tokens = usage ? usage.promptTokens + usage.outputTokens : 0;
  const spend: CompareVariantSpend | null =
    usage?.totalCostUsd != null && Number.isFinite(usage.totalCostUsd)
      ? { kind: "usd", amount: usage.totalCostUsd }
      : tokens > 0
        ? { kind: "tokens", count: tokens }
        : null;
  const latest = summary.latestActivity.value;
  const current = elapsed?.running && latest
    ? [latest.label, latest.detail].filter((part): part is string => Boolean(part?.trim())).join(" · ")
    : null;
  return { elapsed, spend, current: current || null };
}
