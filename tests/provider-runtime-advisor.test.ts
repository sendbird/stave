import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { AdvisorRunnerDependencies } from "../electron/providers/advisor-runtime";
import type { BridgeEvent, StreamTurnArgs } from "../electron/providers/types";
import type { CodexModelCatalogEntry } from "../src/lib/providers/provider.types";
import { DEFAULT_ADVISOR_CONSULT_LIMIT } from "../src/lib/providers/advisor";

const actualClaudeRuntime =
  await import("../electron/providers/claude-sdk-runtime");
const actualCodexRuntime =
  await import("../electron/providers/codex-app-server-runtime");

type UsageEvent = Extract<BridgeEvent, { type: "usage" }>;
type CodexRunnerArgs = Parameters<AdvisorRunnerDependencies["runCodex"]>[0];
type RunnerResult = Awaited<ReturnType<AdvisorRunnerDependencies["runCodex"]>>;

function defaultRunnerResult(): RunnerResult {
  return {
    ok: true,
    text: "Check cancellation and usage accounting.",
    usage: { type: "usage", inputTokens: 10, outputTokens: 4 },
  };
}

let codexRunnerResult: RunnerResult = defaultRunnerResult();
let codexRunnerCallCount = 0;
let lastCodexRunnerArgs: CodexRunnerArgs | null = null;
/**
 * When set, the codex runner only settles after its abort signal fires — the
 * shape of a slow advisor the user skips. The held result simulates the
 * abandoned runner finishing anyway, whose usage must still be harvested.
 */
let holdCodexRunnerUntilCancelled = false;
let heldRunnerResult: RunnerResult = defaultRunnerResult();
let codexRunnerHeld = false;
let primaryTurn: StreamTurnArgs | null = null;
let primaryEmitsEvents = true;
/** Runs while the fake adapter's stream is still pending, i.e. mid-turn. */
let duringPrimaryTurn: ((args: StreamTurnArgs) => Promise<void>) | null = null;

function catalogEntry(model: string): CodexModelCatalogEntry {
  return {
    id: model,
    model,
    displayName: model,
    description: "",
    hidden: false,
    isDefault: false,
    supportsPersonality: false,
    defaultReasoningEffort: "xhigh",
    supportedReasoningEfforts: ["low", "medium", "high", "xhigh"],
    inputModalities: ["text"],
    additionalSpeedTiers: [],
    upgrade: null,
    upgradeInfo: null,
  } as unknown as CodexModelCatalogEntry;
}

/**
 * Scoped through `setDefaultAdvisorConsultRunnersForTest` rather than
 * `mock.module("../electron/providers/advisor-runtime", ...)`: module mocks are
 * process-global in bun and would poison the suites that need the real
 * `runAdvisorCall`.
 */
const fakeRunners: AdvisorRunnerDependencies = {
  runClaude: async () => {
    throw new Error("The Claude advisor runner must not be called.");
  },
  runCodex: async (args) => {
    codexRunnerCallCount += 1;
    lastCodexRunnerArgs = args;
    if (holdCodexRunnerUntilCancelled) {
      codexRunnerHeld = true;
      return await new Promise<RunnerResult>((resolve) => {
        args.signal?.addEventListener("abort", () => resolve(heldRunnerResult), {
          once: true,
        });
      });
    }
    return codexRunnerResult;
  },
  getCodexModelCatalog: async () => ({
    ok: true,
    detail: "",
    models: [catalogEntry("gpt-5.6-terra")],
  }),
};

async function streamPrimary(
  args: StreamTurnArgs & {
    onEvent?: (event: BridgeEvent) => void;
    registerAbort?: (aborter: () => void) => void;
  },
) {
  primaryTurn = args;
  args.registerAbort?.(() => {});
  // Consults are on-demand: they happen while this stream is pending.
  await duringPrimaryTurn?.(args);
  const events: BridgeEvent[] = [
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
const {
  consultAdvisor,
  clearAdvisorConsultGrantsForTest,
  setDefaultAdvisorConsultRunnersForTest,
} = await import("../electron/providers/advisor-consult");

const BRIEFING_SOURCE_ID = "stave:advisor-consult";
const CONSULT_TOOL_NAME = "stave_consult_advisor";

type Conversation = NonNullable<StreamTurnArgs["conversation"]>;

function createConversation(
  providerId: "claude-code" | "codex" = "codex",
  overrides?: Partial<Conversation>,
): Conversation {
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
    ...overrides,
  };
}

async function runBufferedTurn(args?: {
  primaryProviderId?: "claude-code" | "codex";
  advisorTarget?: {
    providerId: "claude-code" | "codex";
    model: string;
  };
  advisorConsultLimit?: number;
  conversation?: Conversation;
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
      conversation: args?.conversation ?? createConversation(primaryProviderId),
      runtimeOptions: args?.advisorTarget
        ? {
            advisorTarget: args.advisorTarget,
            ...(args.advisorConsultLimit !== undefined
              ? { advisorConsultLimit: args.advisorConsultLimit }
              : {}),
          }
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

function briefingPart(conversation: StreamTurnArgs["conversation"]) {
  return conversation?.contextParts.find(
    (part) =>
      part.type === "retrieved_context" && part.sourceId === BRIEFING_SOURCE_ID,
  );
}

/** The consultKey is minted per turn and only surfaced through the briefing. */
function captureConsultKey(conversation: StreamTurnArgs["conversation"]) {
  const content = briefingPart(conversation)?.content ?? "";
  const match = /consultKey: "([^"]+)"/.exec(content);
  if (!match?.[1]) {
    throw new Error("No consultKey found in the advisor briefing.");
  }
  return match[1];
}

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

async function until(predicate: () => boolean) {
  for (let attempt = 0; attempt < 500 && !predicate(); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  expect(predicate()).toBe(true);
}

beforeEach(() => {
  setDefaultAdvisorConsultRunnersForTest(fakeRunners);
});

afterEach(async () => {
  setDefaultAdvisorConsultRunnersForTest(undefined);
  clearAdvisorConsultGrantsForTest();
  codexRunnerResult = defaultRunnerResult();
  heldRunnerResult = defaultRunnerResult();
  codexRunnerCallCount = 0;
  lastCodexRunnerArgs = null;
  holdCodexRunnerUntilCancelled = false;
  codexRunnerHeld = false;
  primaryTurn = null;
  primaryEmitsEvents = true;
  duringPrimaryTurn = null;
  await providerRuntime.shutdown();
});

describe("provider runtime on-demand Advisor integration", () => {
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
    "briefs $primaryProviderId on the $advisorTarget.providerId Advisor instead of running a preflight",
    async ({ primaryProviderId, advisorTarget }) => {
      const events = await runBufferedTurn({ primaryProviderId, advisorTarget });

      // No preflight: nothing consults the advisor until the primary asks,
      // but the grant itself is announced so an unconsulted turn is still
      // visibly armed rather than indistinguishable from no Advisor at all.
      expect(codexRunnerCallCount).toBe(0);
      expect(advisorPhases(events)).toEqual(["armed"]);
      const armed = advisorActivity(events).at(0);
      expect(armed?.consultLimit).toBe(DEFAULT_ADVISOR_CONSULT_LIMIT);
      expect(armed?.primaryProviderId).toBe(primaryProviderId);
      expect(armed?.advisorProviderId).toBe(advisorTarget.providerId);
      expect(armed?.advisorModel).toBe(advisorTarget.model);
      expect(armed?.durationMs).toBeUndefined();
      expect(primaryTurn?.providerId).toBe(primaryProviderId);

      // The primary is armed through a briefing part instead of injected advice.
      const briefing = briefingPart(primaryTurn?.conversation);
      expect(briefing?.type).toBe("retrieved_context");
      expect(briefing?.sourceId).toBe(BRIEFING_SOURCE_ID);
      expect(briefing?.title).toContain("On-demand Advisor");
      expect(briefing?.content).toContain(CONSULT_TOOL_NAME);
      expect(briefing?.content).toContain(advisorTarget.model);
      expect(captureConsultKey(primaryTurn?.conversation)).toMatch(
        /^[0-9a-f-]{36}$/,
      );

      // The adapter must never see the advisor wiring options.
      expect(primaryTurn?.runtimeOptions).not.toHaveProperty("advisorTarget");
      expect(primaryTurn?.runtimeOptions).not.toHaveProperty(
        "advisorConsultLimit",
      );

      // Beyond the grant announcement, an unconsulted turn is just the
      // primary's own events — arming costs nothing until the primary asks.
      expect(
        events.filter((event) => event.type !== "advisor_activity"),
      ).toEqual([
        { type: "usage", inputTokens: 20, outputTokens: 8 },
        { type: "done", stop_reason: "end_turn" },
      ]);
    },
  );

  test("injects no briefing when the Advisor is off", async () => {
    const events = await runBufferedTurn();

    expect(codexRunnerCallCount).toBe(0);
    expect(primaryTurn?.conversation?.contextParts).toEqual([]);
    expect(advisorPhases(events)).toEqual([]);
    expect(events).toEqual([
      { type: "usage", inputTokens: 20, outputTokens: 8 },
      { type: "done", stop_reason: "end_turn" },
    ]);
  });

  test("injects no briefing for a non-chat turn", async () => {
    await runBufferedTurn({
      advisorTarget: { providerId: "codex", model: "gpt-5.6-terra" },
      conversation: createConversation("codex", { mode: "review" }),
    });

    expect(briefingPart(primaryTurn?.conversation)).toBeUndefined();
  });

  test("injects no briefing for an unsupported advisor target", async () => {
    await runBufferedTurn({
      advisorTarget: {
        providerId: "claude-code",
        model: "not-a-real-model",
      },
    });

    expect(briefingPart(primaryTurn?.conversation)).toBeUndefined();
  });

  test("does not stack a second briefing onto a retried conversation", async () => {
    const existingBriefing = {
      type: "retrieved_context" as const,
      sourceId: BRIEFING_SOURCE_ID,
      title: "On-demand Advisor · gpt-5.6-terra",
      content: 'call the tool with consultKey: "stale-key"',
    };
    await runBufferedTurn({
      advisorTarget: { providerId: "codex", model: "gpt-5.6-terra" },
      conversation: createConversation("codex", {
        contextParts: [existingBriefing],
      }),
    });

    // A retried request already carries advisor material; re-arming would
    // stack briefings and hand out a second live key.
    expect(primaryTurn?.conversation?.contextParts).toEqual([existingBriefing]);
  });

  test("answers an in-turn consult and folds its usage into the turn total", async () => {
    let consultOutcome: Awaited<ReturnType<typeof consultAdvisor>> | null =
      null;
    duringPrimaryTurn = async (args) => {
      consultOutcome = await consultAdvisor({
        consultKey: captureConsultKey(args.conversation),
        question: "Is the cancellation path sound?",
      });
    };

    const events = await runBufferedTurn({
      advisorTarget: { providerId: "codex", model: "gpt-5.6-terra" },
    });

    expect(codexRunnerCallCount).toBe(1);
    // The primary frames the question; the advisor never sees the whole turn.
    expect(lastCodexRunnerArgs?.prompt).toContain(
      "Is the cancellation path sound?",
    );
    expect(consultOutcome).toMatchObject({
      ok: true,
      advisorProviderId: "codex",
      advisorModel: "gpt-5.6-terra",
      consultIndex: 1,
      consultLimit: 5,
      remainingConsults: 4,
    });
    // The advice handed back to the primary is wrapped in the low-trust frame.
    const advice = consultOutcome!.ok ? consultOutcome!.advice : "";
    expect(advice).toContain("Check cancellation and usage accounting.");
    expect(advice).toContain("low-trust");

    // The exchange lifecycle is per consult; only the grant is per turn.
    expect(advisorPhases(events)).toEqual(["armed", "started", "completed"]);
    expect(advisorActivity(events)[0]).toMatchObject({
      phase: "armed",
      consultLimit: 5,
      advisorModel: "gpt-5.6-terra",
    });
    expect(advisorActivity(events)[1]).toMatchObject({
      phase: "started",
      primaryProviderId: "codex",
      advisorProviderId: "codex",
      advisorModel: "gpt-5.6-terra",
      advisorEffort: expect.any(String),
      isolation: "codex-ephemeral-read-only",
      exchangeId: expect.any(String),
      consultIndex: 1,
      consultLimit: 5,
      question: "Is the cancellation path sound?",
      timeoutMs: expect.any(Number),
    });
    expect(advisorActivity(events)[2]).toMatchObject({
      phase: "completed",
      inputTokens: 10,
      outputTokens: 4,
      advice: "Check cancellation and usage accounting.",
    });

    // Advisor tokens are billed exactly once, merged into the turn's usage.
    expect(withoutAdvisorActivity(events)).toEqual([
      {
        type: "system",
        content: expect.stringContaining(
          "Advisor consult 1/5 completed with Codex · gpt-5.6-terra",
        ),
      },
      { type: "usage", inputTokens: 30, outputTokens: 12 },
      { type: "done", stop_reason: "end_turn" },
    ]);
  });

  test("keeps the primary turn and bills usage when a consult fails", async () => {
    codexRunnerResult = {
      ok: false,
      detail: "Codex authentication is required.",
      usage: { type: "usage", inputTokens: 900, outputTokens: 120 },
    };

    let consultOutcome: Awaited<ReturnType<typeof consultAdvisor>> | null =
      null;
    duringPrimaryTurn = async (args) => {
      consultOutcome = await consultAdvisor({
        consultKey: captureConsultKey(args.conversation),
        question: "Second opinion?",
      });
    };

    const events = await runBufferedTurn({
      advisorTarget: { providerId: "codex", model: "gpt-5.6-terra" },
    });

    // A failed consult is a graceful fallback: the primary keeps its turn,
    // and whatever the advisor spent before failing is still billed.
    expect(consultOutcome).toMatchObject({ ok: false, code: "advisor-failed" });
    expect(advisorPhases(events)).toEqual(["armed", "started", "failed"]);
    expect(events.filter((event) => event.type === "usage")).toEqual([
      { type: "usage", inputTokens: 920, outputTokens: 128 },
    ]);
    expect(events.at(-1)).toEqual({ type: "done", stop_reason: "end_turn" });
  });

  test("enforces the normalized per-turn consult budget", async () => {
    const outcomes: Awaited<ReturnType<typeof consultAdvisor>>[] = [];
    duringPrimaryTurn = async (args) => {
      const consultKey = captureConsultKey(args.conversation);
      outcomes.push(await consultAdvisor({ consultKey, question: "One?" }));
      outcomes.push(await consultAdvisor({ consultKey, question: "Two?" }));
    };

    // 0 normalizes up to the minimum of 1 rather than disarming the Advisor.
    await runBufferedTurn({
      advisorTarget: { providerId: "codex", model: "gpt-5.6-terra" },
      advisorConsultLimit: 0,
    });

    expect(briefingPart(primaryTurn?.conversation)?.content).toContain(
      "at most 1 time",
    );
    expect(outcomes[0]).toMatchObject({ ok: true, consultLimit: 1 });
    expect(outcomes[1]).toMatchObject({
      ok: false,
      code: "consult-limit-exhausted",
      remainingConsults: 0,
    });
    expect(codexRunnerCallCount).toBe(1);
  });

  test("skipAdvisor cancels only an in-flight consult and keeps the turn", async () => {
    // Nothing running yet: skipping must not claim success.
    expect(
      providerRuntime.skipAdvisor({ turnId: "advisor-runtime-turn" }),
    ).toMatchObject({ ok: false });

    holdCodexRunnerUntilCancelled = true;
    // The abandoned runner finishes after the skip; its spend is still real.
    heldRunnerResult = {
      ok: true,
      text: "Too late to matter.",
      usage: { type: "usage", inputTokens: 900, outputTokens: 120 },
    };
    let consultOutcome: Awaited<ReturnType<typeof consultAdvisor>> | null =
      null;
    let inFlightOutcome: Awaited<ReturnType<typeof consultAdvisor>> | null =
      null;
    duringPrimaryTurn = async (args) => {
      const consultKey = captureConsultKey(args.conversation);
      const pending = consultAdvisor({ consultKey, question: "Slow one?" });
      await until(() => codexRunnerHeld);
      // One consult at a time per grant.
      inFlightOutcome = await consultAdvisor({
        consultKey,
        question: "Parallel?",
      });
      expect(
        providerRuntime.skipAdvisor({ turnId: "advisor-runtime-turn" }),
      ).toMatchObject({ ok: true });
      consultOutcome = await pending;
    };

    const events = await runBufferedTurn({
      advisorTarget: { providerId: "codex", model: "gpt-5.6-terra" },
    });

    expect(inFlightOutcome).toMatchObject({
      ok: false,
      code: "consult-in-flight",
    });
    expect(consultOutcome).toMatchObject({
      ok: false,
      code: "consult-cancelled",
    });
    expect(advisorPhases(events)).toEqual(["armed", "started", "skipped"]);
    // The late usage harvested from the abandoned runner reaches the total.
    expect(events.filter((event) => event.type === "usage")).toEqual([
      { type: "usage", inputTokens: 920, outputTokens: 128 },
    ]);
    expect(events.at(-1)).toEqual({ type: "done", stop_reason: "end_turn" });

    // After the turn there is no consult left to skip.
    expect(
      providerRuntime.skipAdvisor({ turnId: "advisor-runtime-turn" }),
    ).toMatchObject({ ok: false });
  });

  test("revokes the consult grant when the turn ends", async () => {
    await runBufferedTurn({
      advisorTarget: { providerId: "codex", model: "gpt-5.6-terra" },
    });
    const consultKey = captureConsultKey(primaryTurn?.conversation);

    // The key was live during the turn but must die with it: a stale
    // transcript or fabricated call can never bill an advisor afterwards.
    expect(
      await consultAdvisor({ consultKey, question: "Too late?" }),
    ).toMatchObject({ ok: false, code: "unknown-consult-key" });
    expect(
      await consultAdvisor({ consultKey: "never-minted", question: "Hm?" }),
    ).toMatchObject({ ok: false, code: "unknown-consult-key" });
  });

  test("merges consult usage into primary events returned without streaming callbacks", async () => {
    primaryEmitsEvents = false;
    duringPrimaryTurn = async (args) => {
      await consultAdvisor({
        consultKey: captureConsultKey(args.conversation),
        question: "Merged anyway?",
      });
    };

    const events = await runBufferedTurn({
      advisorTarget: { providerId: "codex", model: "gpt-5.6-terra" },
    });

    expect(withoutAdvisorActivity(events)).toEqual([
      {
        type: "system",
        content: expect.stringContaining(
          "Advisor consult 1/5 completed with Codex · gpt-5.6-terra",
        ),
      },
      { type: "usage", inputTokens: 30, outputTokens: 12 },
      { type: "done", stop_reason: "end_turn" },
    ]);
  });
});
