import type { ResultRun } from "@/lib/agent-runs/insights";

/** Presentation metrics use both completed outcomes and retain missing cost as unknown. */
export function performanceMetrics(runs: readonly ResultRun[]) {
  const completed = runs.filter((run) => run.outcome === "ready" || run.outcome === "rework");
  const durations = completed.map((run) => run.durationMs).sort((a, b) => a - b);
  const middle = Math.floor(durations.length / 2);
  const reported = runs.flatMap((run) => run.costUsd === null ? [] : [run.costUsd]);
  return {
    completed: completed.length,
    completionRate: runs.length ? completed.length / runs.length : null,
    medianCompletionMs: !durations.length ? null : durations.length % 2
      ? durations[middle]!
      : (durations[middle - 1]! + durations[middle]!) / 2,
    reportedSpendUsd: reported.length ? reported.reduce((sum, value) => sum + value, 0) : null,
    reportedCostRuns: reported.length,
  };
}
