import { describe, expect, test } from "bun:test";
import {
  createAdvisorUsageMerger,
  formatAdvisorSystemTrace,
  mergeAdvisorUsage,
  runAdvisorPreflight,
  type AdvisorRunnerDependencies,
} from "../electron/providers/advisor-runtime";
import type { BridgeEvent, StreamTurnArgs } from "../electron/providers/types";
import type { AdvisorTarget } from "@/lib/providers/provider.types";

type UsageEvent = Extract<BridgeEvent, { type: "usage" }>;

function createTurn(target: AdvisorTarget): StreamTurnArgs {
  const input = "Implement the provider-neutral Advisor.";
  return {
    providerId: "codex",
    prompt: input,
    conversation: {
      target: { providerId: "codex", model: "gpt-5.6-terra" },
      mode: "chat",
      history: [],
      input: {
        role: "user",
        providerId: "user",
        content: input,
        parts: [{ type: "text", text: input }],
      },
      contextParts: [],
    },
    runtimeOptions: { advisorTarget: target },
  };
}

function createUnusedRunner(message: string) {
  return async () => {
    throw new Error(message);
  };
}

describe("runAdvisorPreflight", () => {
  test("routes a Claude target only to the Claude runner", async () => {
    let selectedModel = "";
    const runners = {
      runClaude: async (args) => {
        selectedModel = args.model;
        return { ok: true, text: "Check cancellation and usage accounting." };
      },
      runCodex: createUnusedRunner("Codex runner must not be called."),
    } satisfies AdvisorRunnerDependencies;

    const result = await runAdvisorPreflight({
      turn: createTurn({
        providerId: "claude-code",
        model: "claude-fable-5",
      }),
      registerAbort: () => {},
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

    const result = await runAdvisorPreflight({
      turn: createTurn({
        providerId: "codex",
        model: "gpt-5.6-sol",
      }),
      registerAbort: () => {},
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

  test("returns aborted when the user cancels during preflight", async () => {
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

    const pending = runAdvisorPreflight({
      turn: createTurn({
        providerId: "codex",
        model: "gpt-5.6-terra",
      }),
      registerAbort: (registeredAbort) => {
        abort = registeredAbort;
      },
      runners,
    });
    await Promise.resolve();
    abort();

    expect((await pending).status).toBe("aborted");
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

    const result = await runAdvisorPreflight({
      turn: createTurn({
        providerId: "codex",
        model: "gpt-5.6-terra",
      }),
      registerAbort: () => {},
      runners,
      timeoutMs: 5,
    });

    expect(result).toMatchObject({
      status: "failed",
      shouldTrace: true,
    });
  });

  test("does not call a provider runner for an invalid target", async () => {
    const runners = {
      runClaude: createUnusedRunner("Claude runner must not be called."),
      runCodex: createUnusedRunner("Codex runner must not be called."),
    } satisfies AdvisorRunnerDependencies;

    const result = await runAdvisorPreflight({
      turn: createTurn({
        providerId: "claude-code",
        model: "claude-unknown-advisor",
      }),
      registerAbort: () => {},
      runners,
    });

    expect(result).toMatchObject({
      status: "skipped",
      shouldTrace: true,
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

    const result = await runAdvisorPreflight({
      turn: createTurn({
        providerId: "codex",
        model: "o4-mini-preview",
      }),
      registerAbort: () => {},
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

    const result = await runAdvisorPreflight({
      turn: createTurn({
        providerId: "codex",
        model: "o4-mini-missing",
      }),
      registerAbort: () => {},
      runners,
    });

    expect(result).toMatchObject({
      status: "skipped",
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
      durationMs: 1_500,
      shouldTrace: true,
    });

    expect(trace).not.toContain("\n");
    expect(trace.length).toBeLessThan(400);
    expect(trace).toContain("The primary turn continued.");
  });
});
