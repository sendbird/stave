import { afterEach, describe, expect, test } from "bun:test";
import { applyAppLocale } from "@/i18n";
import { describeStageMeta } from "@/components/agent-runs/StageCard";
import { projectAgentRunStages } from "@/lib/agent-runs/agent-run-view";
import { projectStageSpend, type AgentRunRouteObservation } from "@/lib/agent-runs/route-observation";
import type { TurnUsageSample } from "@/lib/agent-runs/usage";
import { AGENT_RUN_NOW, agentRunDetail, agentRunFixture } from "./fixtures/agent-run-fixtures";

afterEach(() => {
  applyAppLocale("en");
});

let decisions = 0;

/** One host route observation: a turn the host started for a stage attempt. */
function observed(stageId: string | null, attempt: number | null, usage: TurnUsageSample | null, turn: "linked" | "start-failed" = "linked"): AgentRunRouteObservation {
  decisions += 1;
  return {
    decisionId: `decision-${decisions}`,
    turnId: turn === "linked" ? `turn-${decisions}` : null,
    stageId,
    attempt,
    selection: null,
    providerChanged: null,
    effectiveModel: null,
    effectiveEffort: null,
    turnOutcome: turn === "linked" ? (usage ? "completed" : "running") : "start-failed",
    attemptStatus: null,
    latestInAttempt: null,
    usage,
    reportedCostUsd: usage?.totalCostUsd ?? null,
  };
}

describe("per-stage spend", () => {
  test("sums every attempt's reported cost and tokens per stage", () => {
    const spend = projectStageSpend([
      observed("understand", 1, { inputTokens: 1_000, outputTokens: 200, totalCostUsd: 0.05 }),
      observed("understand", 2, { inputTokens: 2_000, outputTokens: 300, totalCostUsd: 0.07 }),
      observed("build", 1, { inputTokens: 40_000, outputTokens: 9_000, totalCostUsd: 0.51 }),
    ]);
    expect(spend.get("understand")).toMatchObject({ turns: 2, measuredTurns: 2, inputTokens: 3_000, outputTokens: 500 });
    expect(spend.get("understand")?.costUsd).toBeCloseTo(0.12, 10);
    expect(spend.get("build")?.costUsd).toBe(0.51);
  });

  test("keeps tokens without a cost when the provider reports none", () => {
    // Codex reports tokens only: the stage has tokens and no cost.
    const spend = projectStageSpend([observed("build", 1, { inputTokens: 150_000, outputTokens: 32_000 })]);
    expect(spend.get("build")).toEqual({ turns: 1, measuredTurns: 1, inputTokens: 150_000, outputTokens: 32_000, costUsd: null });
  });

  test("counts a turn still running as unmeasured, and skips starts without a turn or a stage", () => {
    const spend = projectStageSpend([
      observed("verify", 1, null),
      observed("verify", 1, null, "start-failed"),
      observed(null, null, { inputTokens: 5, outputTokens: 5, totalCostUsd: 1 }),
    ]);
    expect(spend.get("verify")).toEqual({ turns: 1, measuredTurns: 0, inputTokens: 0, outputTokens: 0, costUsd: null });
    expect([...spend.keys()]).toEqual(["verify"]);
  });

  test("an older host without routing has no stage spend", () => {
    expect(projectStageSpend(undefined).size).toBe(0);
  });
});

describe("stage rows show what each stage spent", () => {
  function rowsWith(routing: AgentRunRouteObservation[]) {
    const aggregate = agentRunFixture();
    // The first stage's turn has started.
    aggregate.stages = aggregate.stages.map((record, index) => index === 0 ? { ...record, status: "running", startedAt: AGENT_RUN_NOW.toISOString() } : record);
    const detail = { ...agentRunDetail(aggregate), routing };
    return projectAgentRunStages(detail, AGENT_RUN_NOW);
  }

  test("the current stage reads now with its cost", () => {
    const rows = rowsWith([observed("understand", 1, { inputTokens: 10, outputTokens: 5, totalCostUsd: 0.21 })]);
    const current = rows.find((row) => row.current)!;
    expect(current.stage.id).toBe("understand");
    expect(current.spend?.costUsd).toBe(0.21);
    expect(describeStageMeta(current)).toBe("now · $0.21");
  });

  test("a completed stage reads its duration and cost; Codex reads tokens", () => {
    const rows = rowsWith([]);
    const done = { ...rows[0]!, status: "completed" as const, durationMs: 3 * 60_000, spend: { turns: 1, measuredTurns: 1, inputTokens: 10, outputTokens: 5, costUsd: 0.12 } };
    expect(describeStageMeta(done)).toBe("3m · $0.12");
    const codex = { ...done, spend: { turns: 1, measuredTurns: 1, inputTokens: 150_000, outputTokens: 32_000, costUsd: null } };
    expect(describeStageMeta(codex)).toBe("3m · 182k tokens");
    applyAppLocale("ko");
    expect(describeStageMeta(codex)).toContain("182k");
  });

  test("a stage with no reported usage shows no spend, never a made-up one", () => {
    const rows = rowsWith([observed("understand", 1, null)]);
    expect(describeStageMeta(rows.find((row) => row.current)!)).toBe("now");
    expect(rows.filter((row) => !row.current).every((row) => row.spend === null)).toBe(true);
  });
});
