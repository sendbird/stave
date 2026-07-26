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

mock.module("../electron/providers/advisor-runtime", () => ({
  ...actualAdvisorRuntime,
  runAdvisorPreflight: async (args: {
    registerAbort: (aborter: () => void) => void;
  }) => {
    advisorCallCount += 1;
    args.registerAbort(() => {
      advisorAbortCallCount += 1;
    });
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

afterEach(async () => {
  advisorResult = {
    status: "completed",
    target: { providerId: "codex", model: "gpt-5.6-terra" },
    advice: "Check cancellation and usage accounting.",
    durationMs: 100,
    usage: { type: "usage", inputTokens: 10, outputTokens: 4 },
    shouldTrace: true,
  };
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
        content: "Check the shared wrapper.",
      });
    },
  );

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
      content: "Check cancellation and usage accounting.",
    });
    expect(events).toEqual([
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
    expect(events[0]).toMatchObject({
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

    expect(events).toEqual([
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
    expect(events).toEqual([
      { type: "usage", inputTokens: 3, outputTokens: 1 },
      { type: "done", stop_reason: "user_abort" },
    ]);
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

    expect(await pendingEvents).toEqual([
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
  });
});
