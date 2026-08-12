import { describe, expect, test } from "bun:test";
import {
  buildAdvisorOutcomeEvent,
  buildAdvisorStartedEvent,
  createAdvisorUsageMerger,
  formatAdvisorSystemTrace,
  mergeAdvisorUsage,
  runAdvisorCall,
  type AdvisorRunnerDependencies,
} from "../electron/providers/advisor-runtime";
import type { BridgeEvent } from "../electron/providers/types";
import type { AdvisorTarget } from "@/lib/providers/provider.types";

type UsageEvent = Extract<BridgeEvent, { type: "usage" }>;

const CWD = "/tmp/advisor-runtime-test";
const PROMPT = "Review the plan for the provider-neutral Advisor.";

function createUnusedRunner(message: string) {
  return async () => {
    throw new Error(message);
  };
}

function callArgs(target: AdvisorTarget) {
  return {
    target,
    prompt: PROMPT,
    cwd: CWD,
    registerAbort: () => {},
  };
}

describe("runAdvisorCall", () => {
  test("routes a Claude target only to the Claude runner", async () => {
    let selectedModel = "";
    const runners = {
      runClaude: async (args) => {
        selectedModel = args.model;
        return { ok: true, text: "Check cancellation and usage accounting." };
      },
      runCodex: createUnusedRunner("Codex runner must not be called."),
    } satisfies AdvisorRunnerDependencies;

    const result = await runAdvisorCall({
      ...callArgs({ providerId: "claude-code", model: "claude-fable-5" }),
      runners,
    });

    expect(result.status).toBe("completed");
    expect(selectedModel).toBe("claude-fable-5");
  });

  test("routes a Codex target with isolated read-only runtime options", async () => {
    let received:
      Parameters<AdvisorRunnerDependencies["runCodex"]>[0] | undefined;
    const runners = {
      runClaude: createUnusedRunner("Claude runner must not be called."),
      runCodex: async (args) => {
        received = args;
        return { ok: true, text: "Keep the primary provider unchanged." };
      },
    } satisfies AdvisorRunnerDependencies;

    const result = await runAdvisorCall({
      ...callArgs({ providerId: "codex", model: "gpt-5.6-sol" }),
      runners,
    });

    expect(result.status).toBe("completed");
    expect(received).toMatchObject({
      model: "gpt-5.6-sol",
      isolated: true,
      runtimeOptions: {
        model: "gpt-5.6-sol",
        codexReasoningEffort: "xhigh",
      },
    });
  });

  test("returns aborted when the user cancels the call", async () => {
    let abort = () => {};
    const runners = {
      runClaude: createUnusedRunner("Claude runner must not be called."),
      runCodex: async () =>
        new Promise<{
          ok: boolean;
          aborted: boolean;
          detail: string;
        }>(() => {}),
    } satisfies AdvisorRunnerDependencies;

    const pending = runAdvisorCall({
      ...callArgs({ providerId: "codex", model: "gpt-5.6-terra" }),
      registerAbort: (registeredAbort) => {
        abort = registeredAbort;
      },
      runners,
    });
    await Promise.resolve();
    abort();

    expect((await pending).status).toBe("aborted");
  });

  test("a consult-scoped skip reports the user-facing cancellation detail", async () => {
    let skip = () => {};
    const runners = {
      runClaude: createUnusedRunner("Claude runner must not be called."),
      runCodex: async () =>
        new Promise<{
          ok: boolean;
          aborted: boolean;
          detail: string;
        }>(() => {}),
    } satisfies AdvisorRunnerDependencies;

    const pending = runAdvisorCall({
      ...callArgs({ providerId: "codex", model: "gpt-5.6-terra" }),
      registerSkip: (registeredSkip) => {
        skip = registeredSkip;
      },
      runners,
    });
    await Promise.resolve();
    skip();

    expect(await pending).toMatchObject({
      status: "skipped",
      skipKind: "user",
      detail: "you cancelled this Advisor consult",
      shouldTrace: true,
    });
  });

  test("turns an internal timeout into a recoverable failure", async () => {
    const runners = {
      runClaude: createUnusedRunner("Claude runner must not be called."),
      runCodex: async () =>
        new Promise<{
          ok: boolean;
          aborted: boolean;
          detail: string;
        }>(() => {}),
    } satisfies AdvisorRunnerDependencies;

    const result = await runAdvisorCall({
      ...callArgs({ providerId: "codex", model: "gpt-5.6-terra" }),
      runners,
      timeoutMs: 5,
    });

    expect(result).toMatchObject({
      status: "failed",
      failureKind: "timeout",
      shouldTrace: true,
    });
  });

  test("preserves Claude progress metadata in timeout diagnostics", async () => {
    const runners = {
      runClaude: async (args) => {
        args.onProgress?.({
          stage: "waiting_for_result",
          lastMessageType: "assistant",
        });
        return new Promise<{
          ok: boolean;
          aborted: boolean;
          detail: string;
        }>(() => {});
      },
      runCodex: createUnusedRunner("Codex runner must not be called."),
    } satisfies AdvisorRunnerDependencies;

    const result = await runAdvisorCall({
      ...callArgs({ providerId: "claude-code", model: "claude-opus-5" }),
      runners,
      timeoutMs: 5,
    });

    expect(result).toMatchObject({
      status: "failed",
      failureKind: "timeout",
      detail: expect.stringContaining("last SDK event: assistant"),
    });
  });

  test("validates dynamic Codex targets before starting the Advisor", async () => {
    let codexCallCount = 0;
    const runners = {
      runClaude: createUnusedRunner("Claude runner must not be called."),
      runCodex: async () => {
        codexCallCount += 1;
        return { ok: true, text: "Use the dynamic model." };
      },
      getCodexModelCatalog: async () => ({
        ok: true,
        detail: "Loaded model catalog.",
        models: [
          {
            model: "o4-mini-preview",
            hidden: false,
          },
        ],
      }),
    } as AdvisorRunnerDependencies;

    const result = await runAdvisorCall({
      ...callArgs({ providerId: "codex", model: "o4-mini-preview" }),
      runners,
    });

    expect(result.status).toBe("completed");
    expect(codexCallCount).toBe(1);
  });

  test("skips a dynamic Codex target missing from the live catalog", async () => {
    const runners = {
      runClaude: createUnusedRunner("Claude runner must not be called."),
      runCodex: createUnusedRunner("Codex runner must not be called."),
      getCodexModelCatalog: async () => ({
        ok: true,
        detail: "Loaded model catalog.",
        models: [],
      }),
    } satisfies AdvisorRunnerDependencies;

    const result = await runAdvisorCall({
      ...callArgs({ providerId: "codex", model: "o4-mini-missing" }),
      runners,
    });

    expect(result).toMatchObject({
      status: "skipped",
      skipKind: "ineligible",
      shouldTrace: true,
    });
  });
});

describe("Advisor usage and trace helpers", () => {
  const advisorUsage: UsageEvent = {
    type: "usage",
    inputTokens: 10,
    outputTokens: 4,
    cacheReadTokens: 3,
    totalCostUsd: 0.02,
  };

  test("merges Advisor usage into the primary usage event", () => {
    expect(
      mergeAdvisorUsage(advisorUsage, {
        type: "usage",
        inputTokens: 20,
        outputTokens: 8,
        cacheCreationTokens: 2,
        totalCostUsd: 0.04,
        ttftMs: 250,
      }),
    ).toEqual({
      type: "usage",
      inputTokens: 30,
      outputTokens: 12,
      cacheReadTokens: 3,
      cacheCreationTokens: 2,
      totalCostUsd: 0.06,
      ttftMs: 250,
    });
  });

  test("emits standalone Advisor usage before done when primary has none", () => {
    const mapEvent = createAdvisorUsageMerger(advisorUsage);

    expect(mapEvent({ type: "text", text: "primary" })).toEqual([
      { type: "text", text: "primary" },
    ]);
    expect(mapEvent({ type: "done", stop_reason: "end_turn" })).toEqual([
      advisorUsage,
      { type: "done", stop_reason: "end_turn" },
    ]);
  });

  test("keeps failure traces compact and single-line", () => {
    const trace = formatAdvisorSystemTrace({
      status: "failed",
      target: { providerId: "codex", model: "gpt-5.6-terra" },
      detail: "provider failure\n".repeat(100),
      failureKind: "error",
      durationMs: 1_500,
      shouldTrace: true,
    });

    expect(trace).not.toContain("\n");
    expect(trace.length).toBeLessThan(400);
    expect(trace).toContain("The primary turn continued.");
  });

  test("a trace with a consult descriptor is numbered against the budget", () => {
    const trace = formatAdvisorSystemTrace(
      {
        status: "completed",
        target: { providerId: "codex", model: "gpt-5.6-terra" },
        advice: "advice",
        durationMs: 1_500,
        shouldTrace: true,
      },
      { consultIndex: 2, consultLimit: 5 },
    );

    expect(trace).toStartWith("Advisor consult 2/5 completed with ");
  });

  test("a trace without a descriptor still reads as a consult", () => {
    const trace = formatAdvisorSystemTrace({
      status: "completed",
      target: { providerId: "codex", model: "gpt-5.6-terra" },
      advice: "advice",
      durationMs: 1_500,
      shouldTrace: true,
    });

    expect(trace).toStartWith("Advisor consult completed with ");
  });
});

describe("advisor effort", () => {
  test("an unpinned target runs at the model's provider default", async () => {
    let claudeEffort: string | undefined;
    let codexEffort: string | undefined;
    const runners = {
      runClaude: async (args) => {
        claudeEffort = args.effort;
        return { ok: true, text: "advice" };
      },
      runCodex: async (args) => {
        codexEffort = args.runtimeOptions?.codexReasoningEffort;
        return { ok: true, text: "advice" };
      },
    } satisfies AdvisorRunnerDependencies;

    await runAdvisorCall({
      ...callArgs({ providerId: "claude-code", model: "claude-fable-5" }),
      runners,
    });
    await runAdvisorCall({
      ...callArgs({ providerId: "codex", model: "gpt-5.6-sol" }),
      runners,
    });

    expect(claudeEffort).toBe("xhigh");
    expect(codexEffort).toBe("xhigh");
  });

  test("a pinned tier is what the runner is actually asked for", async () => {
    let codexEffort: string | undefined;
    const runners = {
      runClaude: createUnusedRunner("Claude runner must not be called."),
      runCodex: async (args) => {
        codexEffort = args.runtimeOptions?.codexReasoningEffort;
        return { ok: true, text: "advice" };
      },
    } satisfies AdvisorRunnerDependencies;

    await runAdvisorCall({
      ...callArgs({
        providerId: "codex",
        model: "gpt-5.6-sol",
        effort: "low",
      }),
      runners,
    });

    expect(codexEffort).toBe("low");
  });

  test("a tier above the model's scale is clamped before the call, not rejected by it", async () => {
    let codexEffort: string | undefined;
    const runners = {
      runClaude: createUnusedRunner("Claude runner must not be called."),
      runCodex: async (args) => {
        codexEffort = args.runtimeOptions?.codexReasoningEffort;
        return { ok: true, text: "advice" };
      },
    } satisfies AdvisorRunnerDependencies;

    await runAdvisorCall({
      ...callArgs({
        providerId: "codex",
        model: "gpt-5.6-luna",
        effort: "ultra",
      }),
      runners,
    });

    // Luna caps at "max"; sending "ultra" would make the whole call fail.
    expect(codexEffort).toBe("max");
  });
});

describe("advisor lifecycle events report the effort that ran", () => {
  const primary = { primaryProviderId: "claude-code" as const, at: 1_000 };

  test("started and outcome both carry the resolved tier", () => {
    const target = {
      providerId: "codex" as const,
      model: "gpt-5.6-sol",
      effort: "low" as const,
    };
    expect(buildAdvisorStartedEvent({ ...primary, target })).toMatchObject({
      advisorEffort: "low",
      timeoutMs: 2 * 60_000,
    });
    expect(
      buildAdvisorOutcomeEvent({
        primaryProviderId: "claude-code",
        at: 2_000,
        result: {
          status: "completed",
          target,
          advice: "advice",
          durationMs: 1_000,
          shouldTrace: true,
        },
      }),
    ).toMatchObject({ advisorEffort: "low" });
  });

  test("the reported tier is the clamped one, never the pinned one", () => {
    // The overlay claims "the Advisor ran at this tier". Reporting the pin
    // would make it claim a tier the call never used, the same mistake
    // deriving `isolation` from the provider id would be.
    expect(
      buildAdvisorStartedEvent({
        ...primary,
        target: {
          providerId: "codex",
          model: "gpt-5.6-luna",
          effort: "ultra",
        },
      }),
    ).toMatchObject({ advisorEffort: "max" });
  });

  test("an unresolved target reports no tier rather than a guessed one", () => {
    expect(
      buildAdvisorStartedEvent({ ...primary, target: null }),
    ).not.toHaveProperty("advisorEffort");
  });

  test("both lifecycle events carry the consult exchange identity", () => {
    const target = {
      providerId: "codex" as const,
      model: "gpt-5.6-sol",
    };
    const consult = {
      exchangeId: "exchange-1",
      consultIndex: 2,
      consultLimit: 5,
    };
    expect(
      buildAdvisorStartedEvent({
        ...primary,
        target,
        consult,
        question: "Should the cache key include the model?",
      }),
    ).toMatchObject({
      ...consult,
      question: "Should the cache key include the model?",
    });
    expect(
      buildAdvisorOutcomeEvent({
        primaryProviderId: "claude-code",
        at: 2_000,
        consult,
        result: {
          status: "completed",
          target,
          advice: "advice",
          durationMs: 1_000,
          shouldTrace: true,
        },
      }),
    ).toMatchObject(consult);
  });
});

describe("advisor usage that lands after cancellation", () => {
  test("reports tokens the runner already spent when the consult is skipped", async () => {
    // The expensive case: the advisor generated, then a skip or timeout landed.
    // Dropping this usage made the exchange monitor report "no advisor usage"
    // for precisely the consult that cost the most.
    let settleRunner: (result: {
      ok: boolean;
      aborted: boolean;
      detail: string;
      usage: UsageEvent;
    }) => void = () => {};
    const runners = {
      runClaude: createUnusedRunner("Claude runner must not be called."),
      runCodex: async () =>
        new Promise<{
          ok: boolean;
          aborted: boolean;
          detail: string;
          usage: UsageEvent;
        }>((resolve) => {
          settleRunner = resolve;
        }),
    } satisfies AdvisorRunnerDependencies;

    let skip = () => {};
    const lateUsage: UsageEvent[] = [];
    const pending = runAdvisorCall({
      ...callArgs({ providerId: "codex", model: "gpt-5.6-terra" }),
      registerSkip: (registeredSkip) => {
        skip = registeredSkip;
      },
      reportLateUsage: (usage) => {
        lateUsage.push(usage);
      },
      runners,
    });
    await Promise.resolve();
    skip();

    const result = await pending;
    expect(result.status).toBe("skipped");
    // The call must not have waited for the abandoned runner.
    expect(lateUsage).toHaveLength(0);

    settleRunner({
      ok: false,
      aborted: true,
      detail: "skipped",
      usage: { type: "usage", inputTokens: 900, outputTokens: 120 },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(lateUsage).toEqual([
      { type: "usage", inputTokens: 900, outputTokens: 120 },
    ]);
  });

  test("the usage merger reads late usage instead of pinning undefined at construction", () => {
    let harvested: UsageEvent | undefined;
    // Constructed before the advisor reports, exactly as the turn does.
    const map = createAdvisorUsageMerger(() => harvested);

    expect(map({ type: "usage", inputTokens: 10, outputTokens: 5 })).toEqual([
      { type: "usage", inputTokens: 10, outputTokens: 5 },
    ]);

    harvested = { type: "usage", inputTokens: 900, outputTokens: 120 };
    expect(map({ type: "usage", inputTokens: 10, outputTokens: 5 })).toEqual([
      { type: "usage", inputTokens: 910, outputTokens: 125 },
    ]);
    // Still folded exactly once.
    expect(map({ type: "usage", inputTokens: 10, outputTokens: 5 })).toEqual([
      { type: "usage", inputTokens: 10, outputTokens: 5 },
    ]);
    expect(map.flush()).toEqual([]);
  });
});
