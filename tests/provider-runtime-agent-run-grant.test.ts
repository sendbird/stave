import { afterEach, describe, expect, mock, test } from "bun:test";
import type { BridgeEvent, StreamTurnArgs } from "../electron/providers/types";
import type { AgentRunStageGrant } from "../electron/providers/agent-run-grants";

const TEST_WORKSPACE_CWD = "/tmp/stave-provider-runtime-agent-run-test";

const actualClaudeRuntime = await import("../electron/providers/claude-sdk-runtime");
const actualCodexRuntime = await import("../electron/providers/codex-app-server-runtime");

let primaryTurns: StreamTurnArgs[] = [];
/** The grant each turn's key resolved to while that turn was running. */
let grantsDuringTurn: Array<AgentRunStageGrant | null> = [];

async function streamPrimary(
  args: StreamTurnArgs & {
    onEvent?: (event: BridgeEvent) => void;
    registerAbort?: (aborter: () => void) => void;
  },
) {
  primaryTurns.push(args);
  args.registerAbort?.(() => {});
  const key = args.staveTurnGrants?.agentRunKey;
  grantsDuringTurn.push(key ? resolveAgentRunGrant(key) : null);
  const events: BridgeEvent[] = [{ type: "done", stop_reason: "end_turn" }];
  events.forEach((event) => args.onEvent?.(event));
  return events;
}

mock.module("../electron/providers/claude-sdk-runtime", () => ({
  ...actualClaudeRuntime,
  buildClaudeEnv: () => ({}),
  cleanupClaudeTask: () => {},
  resolveClaudeExecutablePath: () => "/tmp/claude",
  streamClaudeWithSdk: streamPrimary,
}));

mock.module("../electron/providers/codex-app-server-runtime", () => ({
  ...actualCodexRuntime,
  cleanupCodexAppServerTask: () => {},
  resolveCodexExecutablePath: () => "/tmp/codex",
  streamCodexWithAppServer: streamPrimary,
}));

mock.module("../electron/providers/connected-tool-status", () => ({
  getProviderConnectedToolStatus: async () => ({ ok: true, detail: "", tools: [] }),
}));

const { providerRuntime, setAgentRunUserTurnResolver, setTaskAgentTurnResolver } = await import("../electron/providers/runtime");
const { resolveAgentRunGrant, clearAgentRunGrantsForTest } = await import(
  "../electron/providers/agent-run-grants"
);

const STAGE = { agentRunId: "agent-run-1", stageId: "draft", attempt: 1 };

async function runTurn(args: {
  providerId: StreamTurnArgs["providerId"];
  turnId: string;
  taskId?: string;
  agentRunStage?: StreamTurnArgs["agentRunStage"];
  conversation?: StreamTurnArgs["conversation"];
  executionPolicy?: StreamTurnArgs["executionPolicy"];
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}) {
  let resolveDone = () => {};
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  providerRuntime.startTurnStream(
    {
      turnId: args.turnId,
      taskId: args.taskId ?? "task-1",
      cwd: TEST_WORKSPACE_CWD,
      providerId: args.providerId,
      prompt: "Draft the change.",
      ...(args.conversation ? { conversation: args.conversation } : {}),
      ...(args.agentRunStage ? { agentRunStage: args.agentRunStage } : {}),
      ...(args.executionPolicy ? { executionPolicy: args.executionPolicy } : {}),
      ...(args.runtimeOptions ? { runtimeOptions: args.runtimeOptions } : {}),
    },
    { bufferEvents: true, onDone: resolveDone },
  );
  await done;
  return primaryTurns.at(-1)!;
}

afterEach(() => {
  setAgentRunUserTurnResolver(null);
  setTaskAgentTurnResolver(null);
  primaryTurns = [];
  grantsDuringTurn = [];
  clearAgentRunGrantsForTest();
  providerRuntime.cleanupTask({ taskId: "task-1" });
  providerRuntime.cleanupTask({ taskId: "task-2" });
});

describe("provider runtime run grants", () => {
  test("a delegated stage reply preserves account and CLI transport while replacing caller authority and secrets", async () => {
    setAgentRunUserTurnResolver(() => ({ agentRunStage: STAGE,
      context: { type: "retrieved_context", sourceId: "stage", title: "Reply", content: "Continue the stage." },
      runtimeOptions: { model: "gpt-6-sol", codexFileAccess: "read-only", codexApprovalPolicy: "never", codexReasoningEffort: "high" } }));
    const turn = await runTurn({ providerId: "codex", turnId: "reply-transport", conversation: { mode: "chat", history: [], contextParts: [] },
      runtimeOptions: { codexBinaryPath: "/tmp/custom-codex", codexAccountProfileId: "work", providerTimeoutMs: 10000,
        model: "gpt-6-astra", codexFileAccess: "danger-full-access", trustedTools: ["all"], boundSecretIds: ["secret-id"] } });
    expect(turn.runtimeOptions).toMatchObject({ codexBinaryPath: "/tmp/custom-codex", codexAccountProfileId: "work", providerTimeoutMs: 10000,
      model: "gpt-6-sol", codexFileAccess: "read-only", codexReasoningEffort: "high" });
    expect(turn.runtimeOptions?.boundSecretIds).toBeUndefined(); expect(turn.runtimeOptions?.trustedTools).toBeUndefined();
  });
  test("a tool-less request never becomes a stage reply or an Agent turn, and keeps toolsDisabled", async () => {
    let stageAsked = 0;
    let agentAsked = 0;
    setAgentRunUserTurnResolver(() => { stageAsked += 1; return { agentRunStage: STAGE,
      context: { type: "retrieved_context", sourceId: "stage", title: "Reply", content: "Continue the stage." },
      runtimeOptions: { model: "gpt-6-sol", codexFileAccess: "read-only", codexApprovalPolicy: "never" } }; });
    setTaskAgentTurnResolver(() => { agentAsked += 1; return null; });
    const turn = await runTurn({ providerId: "codex", turnId: "toolless-reply", conversation: { mode: "chat", history: [], contextParts: [] },
      runtimeOptions: { toolsDisabled: true, codexFileAccess: "read-only" } });
    expect(stageAsked).toBe(0);
    expect(agentAsked).toBe(0);
    expect(turn.runtimeOptions?.toolsDisabled).toBe(true);
    expect(turn.agentRunStage).toBeUndefined();
  });

  for (const providerId of ["claude-code", "codex"] as const) {
    test(`${providerId} mints a grant for the stage attempt and revokes it when the turn ends`, async () => {
      const turn = await runTurn({ providerId, turnId: `${providerId}-turn`, agentRunStage: STAGE });
      const key = turn.staveTurnGrants?.agentRunKey;
      expect(key).toBeTruthy();
      expect(JSON.stringify(turn.conversation ?? null)).not.toContain(key!);
      expect(turn.prompt).not.toContain(key!);
      expect(grantsDuringTurn[0]).toEqual({
        ...STAGE,
        turnId: `${providerId}-turn`,
        taskId: "task-1",
      });
      expect(resolveAgentRunGrant(key!)).toBeNull();
    });
  }

  test("Claude mints a fresh key per turn; Codex keeps one channel per task", async () => {
    const claudeOne = await runTurn({ providerId: "claude-code", turnId: "c1", agentRunStage: STAGE });
    const claudeTwo = await runTurn({ providerId: "claude-code", turnId: "c2", agentRunStage: STAGE });
    expect(claudeOne.staveTurnGrants?.agentRunKey).not.toBe(
      claudeTwo.staveTurnGrants?.agentRunKey,
    );

    const codexStage = await runTurn({ providerId: "codex", turnId: "x1", agentRunStage: STAGE });
    const channel = codexStage.staveTurnGrants?.agentRunKey;
    const codexNext = await runTurn({
      providerId: "codex",
      turnId: "x2",
      agentRunStage: { ...STAGE, stageId: "polish" },
    });
    expect(codexNext.staveTurnGrants?.agentRunKey).toBe(channel);
    expect(grantsDuringTurn.at(-1)).toMatchObject({ stageId: "polish", turnId: "x2" });

    // An ordinary turn keeps the channel, so the thread resumes, but the key
    // resolves to nothing.
    const ordinary = await runTurn({ providerId: "codex", turnId: "x3" });
    expect(ordinary.staveTurnGrants?.agentRunKey).toBe(channel);
    expect(grantsDuringTurn.at(-1)).toBeNull();

    const otherTask = await runTurn({ providerId: "codex", turnId: "x4", taskId: "task-2" });
    expect(otherTask.staveTurnGrants?.agentRunKey).toBeUndefined();
  });

  test("no grant for turns without a run stage or for secondary runs", async () => {
    const plain = await runTurn({ providerId: "claude-code", turnId: "p1" });
    expect(plain.staveTurnGrants?.agentRunKey).toBeUndefined();
    const secondary = await runTurn({
      providerId: "claude-code",
      turnId: "s1",
      agentRunStage: STAGE,
      executionPolicy: "secondary-read-only",
    });
    expect(secondary.staveTurnGrants?.agentRunKey).toBeUndefined();
  });
});

test("primary chat replies inherit host-owned stage grants but reviews and secondary turns do not", async () => {
  setAgentRunUserTurnResolver(() => ({ agentRunStage: STAGE,
    context: { type: "retrieved_context", sourceId: "stave:agent-run", content: "Current blocker" } }));
  const conversation: NonNullable<StreamTurnArgs["conversation"]> = {
    target: { providerId: "codex" }, mode: "chat", history: [], contextParts: [],
    input: { role: "user", content: "Clarify the question", parts: [] },
  };
  const reply = await runTurn({ providerId: "codex", turnId: "reply", conversation });
  expect(grantsDuringTurn.at(-1)).toMatchObject(STAGE);
  expect(reply.conversation?.contextParts).toContainEqual(expect.objectContaining({ content: "Current blocker" }));
  await runTurn({ providerId: "codex", turnId: "review", conversation: { ...conversation, mode: "review" } });
  expect(grantsDuringTurn.at(-1)).toBeNull();
  await runTurn({ providerId: "codex", turnId: "secondary", conversation, executionPolicy: "secondary-read-only" });
  expect(grantsDuringTurn.at(-1)).toBeNull();
});

test("adaptive primary replies override only route fields and retain caller read-only authority", async () => {
  const { Database } = await import("bun:sqlite");
  const { AgentAssignmentStore } = await import("../electron/persistence/agent-assignment-store");
  const { createAssignRuntime } = await import("../electron/host-service/supervision/assign-runtime");
  const { getBuiltinAgent } = await import("../src/lib/agents/starters");
  const assign = createAssignRuntime({ store: new AgentAssignmentStore(new Database(":memory:")) });
  assign.recordTaskAgent({ requestId: "primary", taskId: "task-1", workspaceId: "ws", repositoryPath: TEST_WORKSPACE_CWD,
    agent: getBuiltinAgent("implementer")!, providerId: "codex", model: "gpt-6-sol", assignment: "Review" });
  setTaskAgentTurnResolver(args => assign.prepareTurn(args));
  setAgentRunUserTurnResolver(() => ({ agentRunStage: STAGE, runtimeOptionsMode: "routing",
    context: { type: "retrieved_context", sourceId: "stage", title: "Reply", content: "Continue" },
    runtimeOptions: { model: "gpt-6-sol", codexAccountProfileId: "frozen-account", codexReasoningEffort: "high" } }));
  const turn = await runTurn({ providerId: "codex", turnId: "root-reply", conversation: { mode: "chat", history: [], contextParts: [] },
    runtimeOptions: { model: "gpt-6-astra", codexAccountProfileId: "new-account", codexFileAccess: "read-only",
      codexApprovalPolicy: "never", codexNetworkAccess: false, codexReasoningSummary: "detailed" } });
  expect(turn.runtimeOptions).toMatchObject({ model: "gpt-6-sol", codexReasoningEffort: "high", codexAccountProfileId: "frozen-account",
    codexFileAccess: "read-only", codexApprovalPolicy: "never", codexNetworkAccess: false, codexReasoningSummary: "detailed" });
});

test("a reply hands the composer's choice to its run, keeps it from the provider, and names the run's route", async () => {
  const seen: unknown[] = [];
  setAgentRunUserTurnResolver((args) => {
    seen.push(args.composer);
    return { agentRunStage: STAGE, runtimeOptionsMode: "routing", runtimeOptions: { model: "claude-opus-5-5" },
      context: { type: "retrieved_context", sourceId: "stage", title: "Reply", content: "Continue" },
      routeNote: { model: "claude-opus-5-5", cause: "cooldown" } };
  });
  const events: BridgeEvent[] = [];
  let resolveDone = () => {};
  const done = new Promise<void>((resolve) => { resolveDone = resolve; });
  providerRuntime.startTurnStream({ turnId: "routed-reply", taskId: "task-1", cwd: TEST_WORKSPACE_CWD, providerId: "claude-code", prompt: "Go on",
    conversation: { mode: "chat", history: [], contextParts: [] },
    runtimeOptions: { model: "claude-haiku-5-5", claudeEffort: "medium", composerSelection: { model: "auto", effortPinned: false, rationale: "bounded" } } },
  { onEvent: (event) => events.push(event), onDone: resolveDone });
  await done;
  expect(seen).toEqual([{ model: "auto", effortPinned: false, rationale: "bounded", requestedModel: "claude-haiku-5-5", requestedEffort: "medium" }]);
  const turn = primaryTurns.at(-1)!;
  expect(turn.runtimeOptions?.model).toBe("claude-opus-5-5");
  expect(turn.runtimeOptions && "composerSelection" in turn.runtimeOptions).toBe(false);
  expect(events).toContainEqual(expect.objectContaining({ type: "model_resolved", resolvedModel: "claude-opus-5-5", agentRunRoute: { cause: "cooldown" } }));
  // An effort pinned in the composer reaches the run even when Auto put its own effort on the turn.
  let doneAgain = () => {};
  const again = new Promise<void>((resolve) => { doneAgain = resolve; });
  providerRuntime.startTurnStream({ turnId: "effort-pinned-reply", taskId: "task-1", cwd: TEST_WORKSPACE_CWD, providerId: "claude-code", prompt: "Go on",
    conversation: { mode: "chat", history: [], contextParts: [] },
    runtimeOptions: { model: "claude-haiku-5-5", claudeEffort: "low", composerSelection: { model: "auto", effortPinned: true, effort: "high" } } },
  { onDone: doneAgain });
  await again;
  expect(seen.at(-1)).toEqual({ model: "auto", effortPinned: true, requestedModel: "claude-haiku-5-5", requestedEffort: "high" });
});

test("a run's refusal of a reply reaches the user as written", async () => {
  setAgentRunUserTurnResolver(() => {
    const error = new Error("The model pinned in the composer is not available to this run's provider and account.");
    error.name = "AgentRunCommandError";
    throw error;
  });
  const events: BridgeEvent[] = [];
  let resolveDone = () => {};
  const done = new Promise<void>((resolve) => { resolveDone = resolve; });
  providerRuntime.startTurnStream({ turnId: "refused-reply", taskId: "task-1", cwd: TEST_WORKSPACE_CWD, providerId: "codex", prompt: "Go on",
    conversation: { mode: "chat", history: [], contextParts: [] } }, { onEvent: (event) => events.push(event), onDone: resolveDone });
  await done;
  expect(events).toContainEqual(expect.objectContaining({ type: "error", message: expect.stringContaining("pinned in the composer is not available") }));
  setAgentRunUserTurnResolver(() => { throw new Error("internal detail"); });
  const generic: BridgeEvent[] = [];
  let resolveGeneric = () => {};
  const genericDone = new Promise<void>((resolve) => { resolveGeneric = resolve; });
  providerRuntime.startTurnStream({ turnId: "failed-reply", taskId: "task-1", cwd: TEST_WORKSPACE_CWD, providerId: "codex", prompt: "Go on",
    conversation: { mode: "chat", history: [], contextParts: [] } }, { onEvent: (event) => generic.push(event), onDone: resolveGeneric });
  await genericDone;
  expect(generic).toContainEqual(expect.objectContaining({ type: "error", message: expect.stringContaining("could not be applied") }));
});
