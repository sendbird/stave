import { describe, expect, test } from "bun:test";
import {
  countDelegationExchanges,
  formatDelegationCounts,
  fromAdvisorSnapshot,
  fromChildTask,
  fromWorkerExchange,
  fromWorkerWorkItem,
  isAdvisorTranscriptDuplicate,
  partitionDelegationExchanges,
  resolveExchangeElapsedMs,
  selectDelegationExchanges,
} from "@/lib/delegation/exchange";
import type { AdvisorExchangeSnapshot } from "@/lib/providers/advisor-activity";
import type { AdvisorConsultLogEntry } from "@/lib/providers/advisor-consult-log";
import type { ProviderTurnWorkItem } from "@/lib/providers/turn-status";
import type { ChildTaskSummary } from "@/lib/runs/child-task";

const T0 = 1_700_000_000_000;

function snapshot(
  overrides: Partial<AdvisorExchangeSnapshot> = {},
): AdvisorExchangeSnapshot {
  return {
    turnId: "turn-1",
    exchangeId: "exchange-1",
    consultIndex: 1,
    consultLimit: 3,
    question: "Is the cancellation path sound?",
    primaryProviderId: "claude-code",
    primaryModel: "claude-opus-5",
    advisorProviderId: "codex",
    advisorModel: "gpt-5.6-sol",
    advisorEffort: "high",
    isolation: "codex-ephemeral-read-only",
    startedAt: T0,
    timeoutMs: 90_000,
    outcome: "completed",
    outcomeAt: T0 + 4_000,
    durationMs: 4_000,
    advice: "Cancel the preflight before the primary aborts.",
    inputTokens: 900,
    outputTokens: 120,
    settledConsults: 1,
    stages: [
      { phase: "started", at: T0 },
      { phase: "completed", at: T0 + 4_000 },
    ],
    ...overrides,
  };
}

function entry(
  key: string,
  overrides: Partial<AdvisorExchangeSnapshot> = {},
): AdvisorConsultLogEntry {
  return { key, snapshot: snapshot(overrides), updatedAt: T0 };
}

function child(overrides: Partial<ChildTaskSummary> = {}): ChildTaskSummary {
  return {
    runId: "run-1",
    stepId: "step-1",
    parentTaskId: "parent",
    delegationKey: "review",
    childTaskId: "child-1",
    childWorkspaceId: "ws-1",
    childTurnId: null,
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
  } as ChildTaskSummary;
}

describe("fromAdvisorSnapshot", () => {
  test("maps a completed consult onto the shared exchange", () => {
    const exchange = fromAdvisorSnapshot(snapshot(), { hasConsultLog: true });
    expect(exchange.kind).toBe("advisor");
    expect(exchange.title).toBe("Advisor consult 1/3");
    expect(exchange.identity).toMatchObject({
      role: "Advisor",
      providerId: "codex",
      model: "gpt-5.6-sol",
      effort: "high",
    });
    expect(exchange.outcome.status).toBe("returned");
    expect(exchange.outcome.result).toBe(
      "Cancel the preflight before the primary aborts.",
    );
    expect(exchange.outcome.checks?.map((check) => check.id)).toEqual([
      "cross_model",
      "isolation",
      "advice",
      "usage",
    ]);
    expect(exchange.outcome.spend).toEqual({ inputTokens: 900, outputTokens: 120 });
    expect(exchange.timing).toMatchObject({
      startedAt: T0,
      endedAt: T0 + 4_000,
      deadlineAt: T0 + 90_000,
    });
    expect(exchange.timing.stages.map((stage) => stage.label)).toEqual([
      "Consulting advisor",
      "Advice returned",
    ]);
    expect(exchange.setup.isolation).toBe("Ephemeral read-only thread");
    expect(exchange.actions.map((action) => action.id)).toEqual(["open-log"]);
  });

  test("a running consult offers Cancel and a failed one carries its error", () => {
    const running = fromAdvisorSnapshot(
      snapshot({ outcome: "pending", outcomeAt: undefined, advice: undefined }),
      { canCancel: true },
    );
    expect(running.outcome.status).toBe("running");
    expect(running.actions.map((action) => action.id)).toEqual(["cancel"]);

    const failed = fromAdvisorSnapshot(
      snapshot({ outcome: "timeout", detail: "No reply after 90 seconds." }),
    );
    expect(failed.outcome.status).toBe("timed_out");
    expect(failed.outcome.error).toBe("No reply after 90 seconds.");
  });

  test("an unsettled consult of a finished turn reads as unresolved", () => {
    const exchange = fromAdvisorSnapshot(snapshot({ outcome: "pending" }), {
      status: "unresolved",
    });
    expect(exchange.outcome.status).toBe("unresolved");
  });
});

describe("fromWorkerExchange", () => {
  test("adds provider, effort and selection source from the execution metadata", () => {
    const exchange = fromWorkerExchange(
      {
        id: "m1:tool-1",
        toolUseId: "tool-1",
        model: "claude-sonnet-5",
        state: "output-available",
        assignment: "Add the regression test.",
        result: "Done.",
        progress: ["Read the host."],
        at: T0,
        endedAt: T0 + 30_000,
      },
      {
        providerId: "claude-code",
        primaryModel: "claude-opus-5",
        presetId: "verified-patch",
        workerModel: "claude-sonnet-5",
        requestedWorkerModel: "auto",
        resolvedWorkerModel: "claude-sonnet-5",
        workerModelSource: "preset",
        workerModelRationale: "Fast tier for bounded edits.",
        workerEffort: "medium",
      },
    );
    expect(exchange.kind).toBe("worker");
    expect(exchange.identity).toMatchObject({
      role: "Worker",
      providerId: "claude-code",
      model: "claude-sonnet-5",
      effort: "medium",
      source: "preset",
      rationale: "Fast tier for bounded edits.",
    });
    expect(exchange.title).toContain("Worker · ");
    expect(exchange.outcome.status).toBe("returned");
    expect(exchange.outcome.result).toBe("Done.");
    expect(exchange.actions.map((action) => action.id)).toEqual([
      "show-in-conversation",
    ]);
    expect(resolveExchangeElapsedMs(exchange, T0 + 99_000)).toBe(30_000);
  });

  test("a saved-history row infers the provider from the model id", () => {
    const exchange = fromWorkerExchange({
      id: "saved",
      model: "gpt-5.6-terra",
      state: "output-error",
      assignment: "Old assignment",
      result: "Boom",
      progress: [],
    });
    expect(exchange.identity.providerId).toBe("codex");
    expect(exchange.outcome.status).toBe("failed");
    expect(exchange.outcome.error).toBe("Boom");
    expect(exchange.timing.startedAt).toBeNull();
    expect(exchange.actions).toEqual([]);
  });

  test("a live work item becomes a running worker exchange", () => {
    const item: ProviderTurnWorkItem = {
      id: "w1",
      kind: "subagent",
      status: "running",
      title: "Worker",
      detail: "Add the regression test.",
      toolUseId: "tool-9",
      progressMessages: ["Reading."],
      startedAt: T0,
      updatedAt: T0 + 5_000,
      workerExecution: {
        providerId: "codex",
        primaryModel: "gpt-6-astra",
        presetId: "verified-patch",
        workerModel: "gpt-5.6-terra",
        workerEffort: "high",
      },
    };
    const exchange = fromWorkerWorkItem(item);
    expect(exchange.outcome.status).toBe("running");
    expect(exchange.identity.model).toBe("gpt-5.6-terra");
    expect(exchange.identity.effort).toBe("high");
    expect(exchange.ask).toBe("Add the regression test.");
    expect(resolveExchangeElapsedMs(exchange, T0 + 7_000)).toBe(7_000);
  });
});

describe("fromChildTask", () => {
  test("carries the requested identity and live controls", () => {
    const exchange = fromChildTask(child());
    expect(exchange.kind).toBe("child-task");
    expect(exchange.title).toBe("review");
    expect(exchange.identity).toMatchObject({
      role: "Child task",
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

  test("a failed child offers Retry and carries its reason", () => {
    const exchange = fromChildTask(
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
  test("orders every kind chronologically and dedupes the live snapshot", () => {
    const live = snapshot({
      exchangeId: "exchange-2",
      consultIndex: 2,
      outcome: "pending",
      startedAt: T0 + 30_000,
      outcomeAt: undefined,
      advice: undefined,
    });
    const exchanges = selectDelegationExchanges({
      consults: [entry("turn-1::exchange-2", live), entry("turn-1::exchange-1")],
      advisorSnapshot: live,
      activeTurnId: "turn-1",
      workers: [
        {
          id: "m1:tool-1",
          toolUseId: "tool-1",
          model: "claude-sonnet-5",
          state: "input-available",
          assignment: "Implement.",
          result: "",
          progress: [],
          at: T0 + 20_000,
        },
      ],
      childTasks: [child()],
    });
    expect(exchanges.map((exchange) => exchange.kind)).toEqual([
      "advisor",
      "child-task",
      "worker",
      "advisor",
    ]);
    expect(
      exchanges.filter((exchange) => exchange.kind === "advisor"),
    ).toHaveLength(2);

    const { live: liveRows, settled } = partitionDelegationExchanges(exchanges);
    expect(liveRows.map((exchange) => exchange.kind)).toEqual([
      "child-task",
      "worker",
      "advisor",
    ]);
    expect(settled.map((exchange) => exchange.id)).toEqual([
      "advisor:turn-1::exchange-1",
    ]);
    expect(formatDelegationCounts(countDelegationExchanges(exchanges))).toBe(
      "3 running · 1 done",
    );
  });

  test("drops transcript consults the store already holds", () => {
    const consults = [entry("turn-1::exchange-1")];
    const duplicate = {
      id: "m1:t1",
      question: "Is the cancellation path sound?",
      answer: "Cancel the preflight before the primary aborts.",
      state: "output-available",
    };
    const other = {
      id: "m2:t2",
      question: "Something the store never saw?",
      answer: "Yes.",
      state: "output-available",
    };
    expect(isAdvisorTranscriptDuplicate({ row: duplicate, consults })).toBe(true);
    expect(isAdvisorTranscriptDuplicate({ row: other, consults })).toBe(false);
    expect(isAdvisorTranscriptDuplicate({ row: other, consults: [] })).toBe(false);
    // Without any question to match on, the store wins outright.
    expect(
      isAdvisorTranscriptDuplicate({
        row: other,
        consults: [entry("k", { question: undefined })],
      }),
    ).toBe(true);

    const exchanges = selectDelegationExchanges({
      consults,
      activeTurnId: null,
      advisorTranscript: [duplicate, other],
    });
    expect(exchanges.map((exchange) => exchange.ask)).toEqual([
      "Is the cancellation path sound?",
      "Something the store never saw?",
    ]);
    expect(exchanges[1]?.timing.startedAt).toBeNull();
  });

  test("a live worker work item is skipped once its transcript row exists", () => {
    const exchanges = selectDelegationExchanges({
      consults: [],
      activeTurnId: "turn-1",
      workers: [
        {
          id: "m1:tool-1",
          toolUseId: "tool-1",
          model: "claude-sonnet-5",
          state: "input-available",
          assignment: "Implement.",
          result: "",
          progress: [],
        },
      ],
      workerWorkItems: [
        {
          id: "w1",
          kind: "subagent",
          status: "running",
          title: "Worker",
          toolUseId: "tool-1",
          progressMessages: [],
          startedAt: T0,
          updatedAt: T0,
          workerExecution: {
            providerId: "claude-code",
            primaryModel: "claude-opus-5",
            presetId: "verified-patch",
            workerModel: "claude-sonnet-5",
            workerEffort: null,
          },
        },
      ],
    });
    expect(exchanges).toHaveLength(1);
    expect(exchanges[0]?.id).toBe("worker:m1:tool-1");
  });
});
