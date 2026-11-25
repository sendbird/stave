import { afterEach, describe, expect, test } from "bun:test";
import { applyAppLocale } from "@/i18n";
import {
  boundStepDetail,
  countUnseenSteps,
  foldAgentSteps,
  formatAgentFactLine,
  formatAgentFacts,
  resolveAgentElapsedMs,
  sortAgentSteps,
  type AgentStep,
} from "@/lib/agent-progress";

afterEach(() => {
  applyAppLocale("en");
});

function step(id: string, kind: AgentStep["kind"], status: AgentStep["status"] = "done", startedAt?: number): AgentStep {
  return { id, kind, doing: id, done: id, status, ...(startedAt !== undefined ? { startedAt } : {}) };
}

describe("fact row", () => {
  test("keeps one order and compact units", () => {
    const facts = formatAgentFacts(
      {
        kindLabel: "Explore",
        facts: {
          model: "claude-opus-4-5",
          effort: "high",
          startedAt: 0,
          endedAt: 134_000,
          steps: 18,
          contextTokens: 45_200,
          spend: { totalCostUsd: 0.12 },
        },
      },
      { nowMs: 999_999, live: false },
    );
    expect(facts.map((fact) => fact.key)).toEqual(["kind", "model", "effort", "elapsed", "steps", "context"]);
    expect(facts.find((fact) => fact.key === "elapsed")?.text).toBe("2m 14s");
    expect(facts.find((fact) => fact.key === "steps")?.text).toBe("18 steps");
    expect(facts.find((fact) => fact.key === "context")?.text).toBe("45k context");
  });

  test("spend shows when no context is known, and unknown facts are left out", () => {
    const line = formatAgentFactLine(
      { facts: { steps: 1, spend: { inputTokens: 12_400, outputTokens: 950 } } },
      { nowMs: 0, live: false },
    );
    expect(line).toBe("1 step · 12k in · 950 out");
    expect(formatAgentFactLine({ facts: { steps: 0, spend: { totalCostUsd: 1.5 } } }, { nowMs: 0, live: false })).toBe("$1.50");
  });

  test("elapsed time runs while live and freezes once the agent ended", () => {
    const facts = { startedAt: 1_000, endedAt: 61_000 };
    expect(resolveAgentElapsedMs({ startedAt: 1_000 }, { nowMs: 31_000, live: true })).toBe(30_000);
    expect(resolveAgentElapsedMs(facts, { nowMs: 100_000, live: false })).toBe(60_000);
    expect(resolveAgentElapsedMs(facts, { nowMs: 900_000, live: false })).toBe(60_000);
    // Settled without an end: only a measured duration, never the clock.
    expect(resolveAgentElapsedMs({ startedAt: 1_000 }, { nowMs: 900_000, live: false })).toBeNull();
    expect(resolveAgentElapsedMs({ elapsedMs: 4_000 }, { nowMs: 900_000, live: false })).toBe(4_000);
  });

  test("Korean units and counters", () => {
    applyAppLocale("ko");
    expect(formatAgentFactLine({ facts: { startedAt: 0, endedAt: 65_000, steps: 3 } }, { nowMs: 0, live: false }))
      .toBe("1분 5초 · 단계 3개");
  });
});

describe("step folding", () => {
  test("consecutive tool and thinking steps form one quiet block; text stands alone", () => {
    const blocks = foldAgentSteps([
      step("t1", "tool"),
      step("th", "thinking"),
      step("t2", "tool"),
      step("say", "text"),
      step("t3", "tool"),
      step("child", "subagent"),
    ]);
    expect(blocks.map((block) => block.type === "quiet" ? block.steps.map((s) => s.id) : block.step.id))
      .toEqual([["t1", "th", "t2"], "say", ["t3"], "child"]);
  });

  test("running and failed steps are pinned so a folded block never hides them", () => {
    const [block] = foldAgentSteps([
      step("a", "tool"),
      step("failed", "tool", "error"),
      step("b", "thinking"),
      step("live", "tool", "running"),
    ]);
    expect(block?.type).toBe("quiet");
    if (block?.type !== "quiet") return;
    expect(block.pinned.map((pinned) => pinned.id)).toEqual(["failed", "live"]);
    expect(block.steps).toHaveLength(4);
  });

  test("steps keep their start order and a status change never moves them", () => {
    const before = sortAgentSteps([step("b", "tool", "running", 20), step("a", "tool", "done", 10), step("c", "text")]);
    expect(before.map((s) => s.id)).toEqual(["a", "b", "c"]);
    const after = sortAgentSteps([step("b", "tool", "done", 20), step("a", "tool", "done", 10), step("c", "text")]);
    expect(after.map((s) => s.id)).toEqual(before.map((s) => s.id));
    // Untimed steps stay after the step before them.
    expect(sortAgentSteps([step("x", "tool", "done", 50), step("y", "text"), step("z", "tool", "done", 60)]).map((s) => s.id))
      .toEqual(["x", "y", "z"]);
  });

  test("new steps are counted against the steps seen when the reader left the bottom", () => {
    const seen = new Set(["a", "b"]);
    expect(countUnseenSteps(seen, [step("a", "tool", "done"), step("b", "tool", "done"), step("c", "tool", "running")])).toBe(1);
    expect(countUnseenSteps(null, [step("a", "tool")])).toBe(0);
  });

  test("details are bounded", () => {
    expect(boundStepDetail("x".repeat(20), 10)).toEqual({ text: "x".repeat(10), truncated: true });
    expect(boundStepDetail(undefined)).toEqual({ text: "", truncated: false });
  });
});
