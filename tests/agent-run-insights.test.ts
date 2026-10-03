import { expect, test } from "bun:test";
import {
  aggregateAgentRunInsights,
  classifyRun,
  countRunEvents,
  formatReadyRate,
  type ResultSample,
  type RunEventCounts,
} from "../src/lib/agent-runs/insights";

const NO_COUNTS: RunEventCounts = { userReplies: 0, changesRequested: 0, nudges: 0, stuckStages: 0, turnFailures: 0 };
let serial = 0;

function sample(
  patch: Partial<Omit<ResultSample, "counts">> & { counts?: Partial<RunEventCounts>; cost?: number | null; minutes?: number } = {},
): ResultSample {
  serial += 1;
  const { counts, cost, minutes, ...rest } = patch;
  const endedAt = new Date(Date.UTC(2026, 8, 1, 12, serial)).toISOString();
  return {
    agentRunId: `m${serial}`,
    workspaceId: "ws",
    leadTaskId: `t${serial}`,
    name: "Reviewer",
    kind: "agent",
    providerId: "claude-code",
    state: "completed",
    stopReason: null,
    startedAt: new Date(Date.parse(endedAt) - (minutes ?? 10) * 60_000).toISOString(),
    endedAt,
    counts: { ...NO_COUNTS, ...counts },
    usage:
      cost === undefined || cost === null
        ? null
        : { turns: 2, measuredTurns: 2, inputTokens: 1, outputTokens: 1, costUsd: cost },
    ...rest,
  };
}

test("a run is ready, rework, failed or stopped", () => {
  expect(classifyRun(sample())).toBe("ready");
  // Replies are corrections but do not undo a result; requested changes do.
  expect(classifyRun(sample({ counts: { userReplies: 3 } }))).toBe("ready");
  expect(classifyRun(sample({ counts: { changesRequested: 1 } }))).toBe("rework");
  expect(classifyRun(sample({ state: "stopped", stopReason: "expired" }))).toBe("failed");
  expect(classifyRun(sample({ state: "cancelled" }))).toBe("stopped");
});

test("event counts read replies, requested changes, reminders, stuck stages and failed turns", () => {
  const kinds = ["user-turn", "user-turn", "changes-requested", "nudge", "stage-stuck", "turn-failed", "turn-interrupted", "report"] as const;
  expect(countRunEvents(kinds.map((kind) => ({ kind })))).toEqual({
    userReplies: 2,
    changesRequested: 1,
    nudges: 1,
    stuckStages: 1,
    turnFailures: 2,
  });
});

test("the summary splits outcomes and prices a ready result", () => {
  const insights = aggregateAgentRunInsights(
    [
      sample({ cost: 1, minutes: 10 }),
      sample({ cost: 3, minutes: 30 }),
      sample({ counts: { changesRequested: 1, userReplies: 1 }, cost: 2 }),
      sample({ state: "stopped", stopReason: "turn-cap-reached", cost: 4 }),
      sample({ state: "cancelled" }),
    ],
    30,
  );
  expect(insights.summary).toMatchObject({
    ended: 5,
    ready: 2,
    rework: 1,
    failed: 1,
    stopped: 1,
    readyRate: 0.4,
    medianReadyMs: 20 * 60_000,
    // 1 + 3 + 2 + 4 spent over the 2 ready runs that reported cost.
    costPerReady: 5,
    unreportedCost: 1,
    // 0, 0, 2 (reply + change), 0, 0
    correctionsPerRun: 0.4,
  });
  expect(formatReadyRate(insights.summary.readyRate)).toBe("40%");
  expect(formatReadyRate(null)).toBe("—");
});

test("runs that did not finish are counted by one cause each, most first", () => {
  const insights = aggregateAgentRunInsights(
    [
      sample({ state: "stopped", stopReason: "turn-cap-reached" }),
      sample({ state: "stopped", stopReason: "turn-cap-reached" }),
      sample({ state: "cancelled", counts: { stuckStages: 1 } }),
      sample({ state: "cancelled", counts: { turnFailures: 1 } }),
      sample({ state: "cancelled" }),
      sample(),
    ],
    30,
  );
  expect(insights.summary.reasons).toEqual([
    { reason: "turn-cap-reached", count: 2 },
    // Ties read alphabetically.
    { reason: "stopped-by-you", count: 1 },
    { reason: "stuck-stage", count: 1 },
    { reason: "turn-failed", count: 1 },
  ]);
});

test("agents and workflows get a row each, with the last ten outcomes oldest first", () => {
  const reviewer = Array.from({ length: 12 }, (_, index) => sample({ state: index === 0 ? "cancelled" : "completed", cost: 1 }));
  const workflow = sample({ name: "Ship it", kind: "workflow", cost: 5, counts: { nudges: 2 } });
  const insights = aggregateAgentRunInsights([...reviewer, workflow], 7);
  expect(insights.days).toBe(7);
  const [first, second] = insights.agents;
  expect(first).toMatchObject({ name: "Reviewer", kind: "agent", runs: 12, medianCostUsd: 1 });
  expect(first!.last).toHaveLength(10);
  // The first (cancelled) run is the oldest and fell out of the last ten.
  expect(first!.last.every((outcome) => outcome === "ready")).toBe(true);
  expect(first!.readyRate).toBeCloseTo(11 / 12);
  expect(second).toMatchObject({ name: "Ship it", kind: "workflow", runs: 1, correctionsPerRun: 2, medianCostUsd: 5 });
  // Newest first.
  expect(insights.runs[0]!.name).toBe("Ship it");
});

test("no ended runs gives empty figures", () => {
  const insights = aggregateAgentRunInsights([], 30);
  expect(insights.summary).toMatchObject({ ended: 0, readyRate: null, costPerReady: null, medianReadyMs: null, correctionsPerRun: null, reasons: [] });
  expect(insights.agents).toEqual([]);
});
