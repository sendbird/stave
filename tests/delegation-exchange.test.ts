import { describe, expect, test } from "bun:test";
import {
  countDelegationExchanges,
  formatDelegationCounts,
  fromDelegatedTask,
  partitionDelegationExchanges,
  resolveExchangeElapsedMs,
  selectDelegationExchanges,
} from "@/lib/delegation/exchange";
import type { DelegatedTaskSummary } from "@/lib/runs/delegated-task";

const T0 = 1_700_000_000_000;

function child(overrides: Partial<DelegatedTaskSummary> = {}): DelegatedTaskSummary {
  return {
    runId: "run-1",
    stepId: "step-1",
    parentTaskId: "parent",
    delegationKey: "review",
    delegatedTaskId: "child-1",
    delegatedWorkspaceId: "ws-1",
    delegatedTurnId: null,
    providerId: "codex",
    requestedModel: "gpt-5.3-codex",
    requestedEffort: "high",
    lifecycle: "isolated",
    phase: "running",
    reason: null,
    attempt: 0,
    createdAt: new Date(T0 + 10_000).toISOString(),
    updatedAt: new Date(T0 + 10_000).toISOString(),
    completedAt: null,
    ...overrides,
  } as DelegatedTaskSummary;
}

describe("fromDelegatedTask", () => {
  test("carries the requested identity and live controls", () => {
    const exchange = fromDelegatedTask(child());
    expect(exchange.kind).toBe("delegated-task");
    expect(exchange.title).toBe("review");
    expect(exchange.identity).toMatchObject({
      role: "Subagent",
      providerId: "codex",
      model: "gpt-5.3-codex",
      effort: "high",
    });
    expect(exchange.outcome.status).toBe("running");
    expect(exchange.actions.map((action) => action.id)).toEqual([
      "open",
      "follow-up",
      "stop",
      "detach",
    ]);
    expect(exchange.timing.startedAt).toBe(T0 + 10_000);
  });

  test("a finished subagent carries its answer as the result", () => {
    const exchange = fromDelegatedTask(child({ phase: "completed", result: "Two findings.", completedAt: new Date(T0 + 20_000).toISOString() }));
    expect(exchange.outcome).toMatchObject({ status: "returned", result: "Two findings." });
  });

  test("a failed child offers Retry and carries its reason", () => {
    const exchange = fromDelegatedTask(
      child({
        phase: "failed",
        reason: "Tests failed.",
        completedAt: new Date(T0 + 20_000).toISOString(),
      }),
    );
    expect(exchange.outcome.status).toBe("failed");
    expect(exchange.outcome.error).toBe("Tests failed.");
    expect(exchange.actions.map((action) => action.id)).toEqual(["open", "retry"]);
    expect(exchange.timing.endedAt).toBe(T0 + 20_000);
  });
});

describe("selectDelegationExchanges", () => {
  test("lists subagents live first and counts them", () => {
    const exchanges = selectDelegationExchanges({
      delegatedTasks: [
        child(),
        child({ delegationKey: "done", phase: "completed", completedAt: new Date(T0 + 30_000).toISOString(), createdAt: new Date(T0).toISOString() }),
      ],
    });
    expect(exchanges.map((exchange) => exchange.title)).toEqual(["done", "review"]);
    const { live, settled } = partitionDelegationExchanges(exchanges);
    expect(live.map((exchange) => exchange.title)).toEqual(["review"]);
    expect(settled.map((exchange) => exchange.title)).toEqual(["done"]);
    expect(formatDelegationCounts(countDelegationExchanges(exchanges))).toBe("1 running · 1 done");
    expect(resolveExchangeElapsedMs(live[0]!, T0 + 15_000)).toBe(5_000);
  });
});
