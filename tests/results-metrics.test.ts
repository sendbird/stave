import { expect, test } from "bun:test";
import { performanceMetrics } from "../src/components/results/results-metrics";
import type { ResultRun, RunOutcome } from "../src/lib/agent-runs/insights";

function run(outcome: RunOutcome, durationMs: number, costUsd: number | null): ResultRun {
  return { agentRunId: outcome, workspaceId: "ws", leadTaskId: "task", name: "Agent", kind: "agent", providerId: "codex", outcome, reason: null, endedAt: "2026-10-01T00:00:00Z", durationMs, corrections: 0, costUsd };
}

test("completion includes requested-change completions; duration excludes failed and cancelled runs", () => {
  expect(performanceMetrics([run("ready", 10, 1), run("rework", 30, 2), run("failed", 1000, 3), run("stopped", 0, null)])).toEqual({
    completed: 2, completionRate: 0.5, medianCompletionMs: 20, reportedSpendUsd: 6, reportedCostRuns: 3,
  });
});

test("unreported cost is unknown rather than free; a reported zero remains a real observation", () => {
  expect(performanceMetrics([run("ready", 1, null)]).reportedSpendUsd).toBeNull();
  const metrics = performanceMetrics([run("ready", 1, 0), run("rework", 3, null), run("ready", 2, null)]);
  expect(metrics.reportedSpendUsd).toBe(0);
  expect(metrics.reportedCostRuns).toBe(1);
  expect(metrics.medianCompletionMs).toBe(2);
  expect(metrics.completionRate).toBe(1);
});

test("empty samples and samples without completions do not invent times or completion rates", () => {
  expect(performanceMetrics([])).toEqual({ completed: 0, completionRate: null, medianCompletionMs: null, reportedSpendUsd: null, reportedCostRuns: 0 });
  expect(performanceMetrics([run("failed", 10, 2)]).medianCompletionMs).toBeNull();
});
