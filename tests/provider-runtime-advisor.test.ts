import { afterEach, describe, expect, mock, test } from "bun:test";
import type { AdvisorPreflightResult } from "../electron/providers/advisor-runtime";
import type { BridgeEvent, StreamTurnArgs } from "../electron/providers/types";

const actualAdvisorRuntime =
  await import("../electron/providers/advisor-runtime");
const actualClaudeRuntime =
  await import("../electron/providers/claude-sdk-runtime");
const actualCodexRuntime =
  await import("../electron/providers/codex-app-server-runtime");

let advisorResult: AdvisorPreflightResult = {
  status: "completed",
  target: { providerId: "codex", model: "gpt-5.6-terra" },
  advice: "Check cancellation and usage accounting.",
  durationMs: 100,
  usage: { type: "usage", inputTokens: 10, outputTokens: 4 },
  shouldTrace: true,
};
let advisorCallCount = 0;
let advisorAbortCallCount = 0;
let primaryAbortCallCount = 0;
let primaryTurn: StreamTurnArgs | null = null;
let beforePrimaryAbortRegistration: (() => Promise<void>) | null = null;
let primaryEmitsEvents = true;

/**
 * Usage the preflight harvests from an abandoned runner *after* it returned,
 * simulating an advisor that generated and was then skipped or timed out.
 */
let advisorLateUsage: Extract<BridgeEvent, { type: "usage" }> | null = null;

mock.module("../electron/providers/advisor-runtime", () => ({
  ...actualAdvisorRuntime,
  runAdvisorPreflight: async (args: {
    registerAbort: (aborter: () => void) => void;
    reportLateUsage?: (usage: Extract<BridgeEvent, { type: "usage" }>) => void;
  }) => {
    advisorCallCount += 1;
    args.registerAbort(() => {
      advisorAbortCallCount += 1;
    });
    if (advisorLateUsage) {
      const late = advisorLateUsage;
      // Deliberately after the preflight resolves: the turn must not have
      // pinned the usage value when it built its merger.
      queueMicrotask(() => args.reportLateUsage?.(late));
    }
    return advisorResult;
  },
}));

async function streamPrimary(
  args: StreamTurnArgs & {
    onEvent?: (event: BridgeEvent) => void;
    registerAbort?: (aborter: () => void) => void;
  },
) {
  primaryTurn = args;
  await beforePrimaryAbortRegistration?.();
  let aborted = false;
  args.registerAbort?.(() => {
    aborted = true;
    primaryAbortCallCount += 1;
  });
  const events: BridgeEvent[] = aborted
    ? [{ type: "done", stop_reason: "user_abort" }]
    : [
        { type: "usage", inputTokens: 20, outputTokens: 8 },
        { type: "done", stop_reason: "end_turn" },
      ];
  if (primaryEmitsEvents) {
    events.forEach((event) => args.onEvent?.(event));
  }
  return events;
}

mock.module("../electron/providers/claude-sdk-runtime", () => ({
  ...actualClaudeRuntime,
  buildClaudeEnv: () => ({}),
  cleanupClaudeTask: () => {},
  getClaudeCommandCatalog: async () => ({
    ok: true,
    supported: true,
    commands: [],
    detail: "",
  }),
  resolveClaudeExecutablePath: () => "/tmp/claude",
  streamClaudeWithSdk: streamPrimary,
}));

mock.module("../electron/providers/codex-app-server-runtime", () => ({
  ...actualCodexRuntime,
  cleanupCodexAppServerTask: () => {},
  getCodexConnectedToolStatus: async () => ({
    ok: true,
    detail: "",
    tools: [],
  }),
  resolveCodexExecutablePath: () => "/tmp/codex",
  streamCodexWithAppServer: streamPrimary,
}));

mock.module("../electron/providers/connected-tool-status", () => ({
  getProviderConnectedToolStatus: async () => ({
    ok: true,
    detail: "",
    tools: [],
  }),
}));

const { providerRuntime } = await import("../electron/providers/runtime");

function createConversation(providerId: "claude-code" | "codex" = "codex") {
  const input = "Implement the provider-neutral Advisor.";
  return {
    target: {
      providerId,
      model: providerId === "claude-code" ? "claude-sonnet-5" : "gpt-5.6-terra",
    },
    mode: "chat" as const,
    history: [],
    input: {
      role: "user" as const,
      providerId: "user" as const,
      content: input,
      parts: [{ type: "text" as const, text: input }],
    },
    contextParts: [],
  };
}

async function runBufferedTurn(args?: {
  primaryProviderId?: "claude-code" | "codex";
  advisorTarget?: {
    providerId: "claude-code" | "codex";
    model: string;
  };
}) {
  const primaryProviderId = args?.primaryProviderId ?? "codex";
  let resolveDone = () => {};
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  const started = providerRuntime.startTurnStream(
    {
      turnId: "advisor-runtime-turn",
      providerId: primaryProviderId,
      prompt: "Implement the provider-neutral Advisor.",
      conversation: createConversation(primaryProviderId),
      runtimeOptions: args?.advisorTarget
        ? { advisorTarget: args.advisorTarget }
        : undefined,
    },
    {
      bufferEvents: true,
      onDone: resolveDone,
    },
  );
  await done;
  return providerRuntime.readTurnStream({
    streamId: started.streamId,
    cursor: 0,
  }).events;
}

/**
 * The structured advisor lifecycle is asserted on its own below. Filtering it
 * out keeps the turn-shape assertions about the turn.
 */
function withoutAdvisorActivity(events: BridgeEvent[]) {
  return events.filter((event) => event.type !== "advisor_activity");
}

function advisorActivity(events: BridgeEvent[]) {
  return events.filter(
    (event): event is Extract<BridgeEvent, { type: "advisor_activity" }> =>
      event.type === "advisor_activity",
  );
}

function advisorPhases(events: BridgeEvent[]) {
  return advisorActivity(events).map((event) => event.phase);
}

afterEach(async () => {
  advisorResult = {
    status: "completed",
    target: { providerId: "codex", model: "gpt-5.6-terra" },
    advice: "Check cancellation and usage accounting.",
    durationMs: 100,
    usage: { type: "usage", inputTokens: 10, outputTokens: 4 },
    shouldTrace: true,
  };
  advisorLateUsage = null;
  advisorCallCount = 0;
  advisorAbortCallCount = 0;
  primaryAbortCallCount = 0;
  primaryTurn = null;
  beforePrimaryAbortRegistration = null;
  primaryEmitsEvents = true;
  await providerRuntime.shutdown();
});

describe("provider runtime Advisor integration", () => {
  test.each([
    {
      primaryProviderId: "claude-code" as const,
      advisorTarget: {
        providerId: "claude-code" as const,
        model: "claude-fable-5",
      },
    },
    {
      primaryProviderId: "claude-code" as const,
      advisorTarget: {
        providerId: "codex" as const,
        model: "gpt-5.6-terra",
      },
    },
    {
      primaryProviderId: "codex" as const,
      advisorTarget: {
        providerId: "claude-code" as const,
        model: "claude-fable-5",
      },
    },
    {
      primaryProviderId: "codex" as const,
      advisorTarget: {
        providerId: "codex" as const,
        model: "gpt-5.6-terra",
      },
    },
  ])(
    "runs $primaryProviderId with $advisorTarget.providerId Advisor through the same preflight wrapper",
    async ({ primaryProviderId, advisorTarget }) => {
      advisorResult = {
        status: "completed",
        target: advisorTarget,
        advice: "Check the shared wrapper.",
        durationMs: 100,
        shouldTrace: true,
      };

      await runBufferedTurn({ primaryProviderId, advisorTarget });

      expect(advisorCallCount).toBe(1);
      expect(primaryTurn?.providerId).toBe(primaryProviderId);
      expect(primaryTurn?.conversation?.contextParts).toContainEqual({
        type: "retrieved_context",
        sourceId: "stave:advisor",
        title: expect.stringContaining("Advisor"),
        content: expect.stringContaining("Check the shared wrapper."),
      });
    },
  );

  test.each([
    {
      primaryProviderId: "claude-code" as const,
      advisorTarget: {
        providerId: "codex" as const,
        model: "gpt-5.6-terra",
      },
      isolation: "codex-ephemeral-read-only",
    },
    {
      primaryProviderId: "codex" as const,
      advisorTarget: {
        providerId: "claude-code" as const,
        model: "claude-fable-5",
      },
      isolation: "claude-tools-disabled",
    },
  ])(
    "reports the $advisorTarget.providerId advisor identity and isolation to $primaryProviderId",
    async ({ primaryProviderId, advisorTarget, isolation }) => {
      advisorResult = {
        status: "completed",
        target: advisorTarget,
        advice: "Cross-model advice.",
        durationMs: 120,
        shouldTrace: true,
      };

      const events = await runBufferedTurn({
        primaryProviderId,
        advisorTarget,
      });

      // The renderer must never infer isolation from the provider id; it is
      // reported by the code path that actually applied it.
      expect(advisorActivity(events)[0]).toMatchObject({
        phase: "started",
        primaryProviderId,
        advisorProviderId: advisorTarget.providerId,
        advisorModel: advisorTarget.model,
        isolation,
        timeoutMs: 10 * 60_000,
      });
      expect(advisorPhases(events)).toEqual([
        "started",
        "completed",
        "applied",
        "primary_started",
      ]);
    },
  );

  test("reports injection separately from advice generation", async () => {
    const events = await runBufferedTurn({
      advisorTarget: { providerId: "codex", model: "gpt-5.6-terra" },
    });

    const applied = advisorActivity(events).find(
      (event) => event.phase === "applied",
    );
    const injectedPart =
      primaryTurn?.conversation?.contextParts[applied?.injectedPartIndex ?? -1];

    // `applied` must point at the part that really landed in the prompt —
    // that pointer is the only proof the advice was not silently dropped.
    expect(applied?.injectedPartIndex).toBe(0);
    expect(injectedPart).toMatchObject({ sourceId: "stave:advisor" });
    expect(applied?.injectedChars).toBe(injectedPart?.content.length);
  });

  test("keeps the primary turn and reports a timeout phase", async () => {
    advisorResult = {
      status: "failed",
      target: { providerId: "codex", model: "gpt-5.6-terra" },
      detail: "the Advisor did not respond within 90 seconds.",
      failureKind: "timeout",
      durationMs: 90_000,
      shouldTrace: true,
    };

    const events = await runBufferedTurn({
      advisorTarget: { providerId: "codex", model: "gpt-5.6-terra" },
    });

    // A timeout is a graceful fallback: the user's work still runs.
    expect(advisorPhases(events)).toEqual(["started", "timeout", "primary_started"]);
    expect(primaryTurn).not.toBeNull();
    expect(primaryTurn?.conversation?.contextParts).toEqual([]);
  });

  test("reports a user skip while keeping the primary turn", async () => {
    advisorResult = {
      status: "skipped",
      target: { providerId: "codex", model: "gpt-5.6-terra" },
      detail: "you skipped the Advisor for this turn",
      skipKind: "user",
      durationMs: 1_200,
      usage: { type: "usage", inputTokens: 5, outputTokens: 2 },
      shouldTrace: true,
    };

    const events = await runBufferedTurn({
      advisorTarget: { providerId: "codex", model: "gpt-5.6-terra" },
    });

    expect(advisorPhases(events)).toEqual(["started", "skipped", "primary_started"]);
    expect(primaryTurn).not.toBeNull();
    // Tokens spent before the skip landed still belong to the turn total.
    expect(withoutAdvisorActivity(events)).toContainEqual({
      type: "usage",
      inputTokens: 25,
      outputTokens: 10,
    });
  });

  test("reports advisor usage even when the primary turn never emits usage", async () => {
    advisorResult = {
      status: "failed",
      target: { providerId: "codex", model: "gpt-5.6-terra" },
      detail: "Codex authentication is required.",
      failureKind: "error",
      durationMs: 300,
      usage: { type: "usage", inputTokens: 7, outputTokens: 3 },
      shouldTrace: true,
    };
    advisorResult = { ...advisorResult };

    const events = await runBufferedTurn({
      advisorTarget: { providerId: "codex", model: "gpt-5.6-terra" },
    });

    // Advisor tokens are billed regardless of the outcome, so they must be
    // reported exactly once rather than merged into every usage event.
    const usageEvents = events.filter((event) => event.type === "usage");
    expect(usageEvents).toEqual([
      { type: "usage", inputTokens: 27, outputTokens: 11 },
    ]);
  });

  test("injects advice, clears nesting state, and merges usage", async () => {
    const events = await runBufferedTurn({
      advisorTarget: {
        providerId: "codex",
        model: "gpt-5.6-terra",
      },
    });

    expect(advisorCallCount).toBe(1);
    expect(primaryTurn?.runtimeOptions).not.toHaveProperty("advisorTarget");
    expect(primaryTurn?.conversation?.contextParts).toContainEqual({
      type: "retrieved_context",
      sourceId: "stave:advisor",
      title: "Codex Advisor · gpt-5.6-terra",
      content: expect.stringContaining("Check cancellation and usage accounting."),
    });
    expect(withoutAdvisorActivity(events)).toEqual([
      {
        type: "system",
        content: expect.stringContaining(
          "Advisor completed with Codex · gpt-5.6-terra",
        ),
      },
      { type: "usage", inputTokens: 30, outputTokens: 12 },
      { type: "done", stop_reason: "end_turn" },
    ]);
  });

  test("continues the primary turn after a recoverable failure", async () => {
    advisorResult = {
      status: "failed",
      target: { providerId: "claude-code", model: "claude-fable-5" },
      detail: "Claude authentication is required.",
      failureKind: "error",
      durationMs: 250,
      shouldTrace: true,
    };

    const events = await runBufferedTurn({
      advisorTarget: {
        providerId: "claude-code",
        model: "claude-fable-5",
      },
    });

    expect(primaryTurn).not.toBeNull();
    expect(primaryTurn?.conversation?.contextParts).toEqual([]);
    expect(withoutAdvisorActivity(events)[0]).toMatchObject({
      type: "system",
      content: expect.stringContaining("The primary turn continued."),
    });
    expect(events.at(-1)).toEqual({
      type: "done",
      stop_reason: "end_turn",
    });
  });

  test("forwards primary events returned without streaming callbacks", async () => {
    primaryEmitsEvents = false;

    const events = await runBufferedTurn({
      advisorTarget: {
        providerId: "codex",
        model: "gpt-5.6-terra",
      },
    });

    expect(withoutAdvisorActivity(events)).toEqual([
      {
        type: "system",
        content: expect.stringContaining(
          "Advisor completed with Codex · gpt-5.6-terra",
        ),
      },
      { type: "usage", inputTokens: 30, outputTokens: 12 },
      { type: "done", stop_reason: "end_turn" },
    ]);
  });

  test("does not start the primary provider after a user abort", async () => {
    advisorResult = {
      status: "aborted",
      target: { providerId: "codex", model: "gpt-5.6-terra" },
      durationMs: 50,
      usage: { type: "usage", inputTokens: 3, outputTokens: 1 },
      shouldTrace: false,
    };

    const events = await runBufferedTurn({
      advisorTarget: {
        providerId: "codex",
        model: "gpt-5.6-terra",
      },
    });

    expect(primaryTurn).toBeNull();
    expect(withoutAdvisorActivity(events)).toEqual([
      { type: "usage", inputTokens: 3, outputTokens: 1 },
      { type: "done", stop_reason: "user_abort" },
    ]);
    // A user abort is the one outcome that stops the primary turn, so the
    // terminal phase has to say so — otherwise the turn ends unexplained.
    expect(advisorPhases(events)).toEqual(["started", "aborted"]);
  });

  test("carries an abort across the Advisor-to-primary handoff", async () => {
    let markPrimarySetupStarted = () => {};
    const primarySetupStarted = new Promise<void>((resolve) => {
      markPrimarySetupStarted = resolve;
    });
    let releasePrimarySetup = () => {};
    const primarySetupReleased = new Promise<void>((resolve) => {
      releasePrimarySetup = resolve;
    });
    beforePrimaryAbortRegistration = async () => {
      markPrimarySetupStarted();
      await primarySetupReleased;
    };

    const pendingEvents = runBufferedTurn({
      advisorTarget: {
        providerId: "codex",
        model: "gpt-5.6-terra",
      },
    });
    await primarySetupStarted;

    expect(
      providerRuntime.abortTurn({ turnId: "advisor-runtime-turn" }),
    ).toMatchObject({ ok: true });
    releasePrimarySetup();

    expect(withoutAdvisorActivity(await pendingEvents)).toEqual([
      {
        type: "system",
        content: expect.stringContaining(
          "Advisor completed with Codex · gpt-5.6-terra",
        ),
      },
      { type: "usage", inputTokens: 10, outputTokens: 4 },
      { type: "done", stop_reason: "user_abort" },
    ]);
    expect(advisorAbortCallCount).toBe(1);
    expect(primaryAbortCallCount).toBe(1);
  });

  test("does not run preflight when Advisor is off", async () => {
    const events = await runBufferedTurn();

    expect(advisorCallCount).toBe(0);
    expect(primaryTurn).not.toBeNull();
    expect(events).toEqual([
      { type: "usage", inputTokens: 20, outputTokens: 8 },
      { type: "done", stop_reason: "end_turn" },
    ]);
    // No advisor configured means no advisor surface at all — the overlay must
    // not appear for turns that never consulted anyone.
    expect(advisorPhases(events)).toEqual([]);
  });

  test("skipAdvisor only reports success while the preflight is running", async () => {
    expect(
      providerRuntime.skipAdvisor({ turnId: "advisor-runtime-turn" }),
    ).toMatchObject({ ok: false });

    await runBufferedTurn({
      advisorTarget: { providerId: "codex", model: "gpt-5.6-terra" },
    });

    // After the preflight resolves there is nothing to skip; answering "ok"
    // would tell the user their running turn had lost its advice.
    expect(
      providerRuntime.skipAdvisor({ turnId: "advisor-runtime-turn" }),
    ).toMatchObject({ ok: false });
  });
});

describe("advisor usage harvested after the preflight returned", () => {
  test("folds a timed-out advisor's tokens into the turn total", async () => {
    // The advisor generated for the full 90s and then timed out. Reporting it
    // as zero made the most expensive outcome the feature has look free, and
    // made the exchange monitor's own usage check say none was reported.
    advisorResult = {
      status: "failed",
      target: { providerId: "codex", model: "gpt-5.6-terra" },
      detail: "timed out after 90 seconds.",
      failureKind: "timeout",
      durationMs: 90_000,
      shouldTrace: true,
    };
    advisorLateUsage = { type: "usage", inputTokens: 900, outputTokens: 120 };

    const events = await runBufferedTurn({
      advisorTarget: { providerId: "codex", model: "gpt-5.6-terra" },
    });

    // Primary emits 20/8; the abandoned advisor runner reported 900/120 after
    // the preflight had already returned without usage.
    expect(events.filter((event) => event.type === "usage")).toEqual([
      { type: "usage", inputTokens: 920, outputTokens: 128 },
    ]);
  });

  test("still reports exactly one usage event when nothing lands late", async () => {
    advisorResult = {
      status: "failed",
      target: { providerId: "codex", model: "gpt-5.6-terra" },
      detail: "timed out after 90 seconds.",
      failureKind: "timeout",
      durationMs: 90_000,
      shouldTrace: true,
    };

    const events = await runBufferedTurn({
      advisorTarget: { providerId: "codex", model: "gpt-5.6-terra" },
    });

    expect(events.filter((event) => event.type === "usage")).toEqual([
      { type: "usage", inputTokens: 20, outputTokens: 8 },
    ]);
  });
});
