import { afterEach, describe, expect, mock, test } from "bun:test";
import type { BridgeEvent, ProviderId } from "../electron/providers/types";
import type { ProviderRuntimeOptions } from "../src/lib/providers/provider.types";

const TEST_WORKSPACE_CWD = "/tmp/stave-provider-runtime-test";

type Scenario =
  | "duplicate-terminal"
  | "missing-terminal"
  | "throw"
  | "wait-for-abort"
  | "wait-for-timeout";

type AdapterArgs = {
  prompt?: string;
  staveTurnGrants?: { callerKey?: string };
  onEvent?: (event: BridgeEvent) => void;
  registerAbort?: (abort: () => void) => void;
  registerApprovalResponder?: (responder: () => { ok: true }) => void;
  registerUserInputResponder?: (responder: () => { ok: true }) => void;
};

const adapterState = {
  scenario: "duplicate-terminal" as Scenario,
  pendingDecisionCount: 0,
  lastArgs: undefined as AdapterArgs | undefined,
};

async function runMockAdapter(args: AdapterArgs) {
  adapterState.lastArgs = args;
  if (adapterState.scenario === "throw") {
    throw new Error("provider process exited");
  }

  if (
    adapterState.scenario === "wait-for-abort" ||
    adapterState.scenario === "wait-for-timeout"
  ) {
    if (adapterState.scenario === "wait-for-abort") {
      adapterState.pendingDecisionCount = 2;
      args.onEvent?.({
        type: "approval",
        requestId: "approval-1",
        toolName: "Bash",
        description: "Run a command",
      });
      args.onEvent?.({
        type: "user_input",
        requestId: "input-1",
        toolName: "AskUserQuestion",
        questions: [],
      });
      args.registerApprovalResponder?.(() => ({ ok: true }));
      args.registerUserInputResponder?.(() => ({ ok: true }));
    }
    await new Promise<void>((resolve) => {
      args.registerAbort?.(resolve);
    });
    adapterState.pendingDecisionCount = 0;
    const doneEvent = { type: "done", stop_reason: "user_abort" } as const;
    args.onEvent?.(doneEvent);
    return [doneEvent];
  }

  const textEvent = { type: "text", text: "working" } as const;
  args.onEvent?.(textEvent);
  if (adapterState.scenario === "missing-terminal") {
    return [textEvent];
  }

  const doneEvent = { type: "done", stop_reason: "completed" } as const;
  args.onEvent?.(doneEvent);
  args.onEvent?.(doneEvent);
  args.onEvent?.({ type: "text", text: "after terminal" });
  return [textEvent, doneEvent, doneEvent];
}

mock.module("../electron/providers/claude-sdk-runtime", () => ({
  buildClaudeEnv: () => ({}),
  cleanupClaudeMcpOauthFlows: () => {},
  cleanupClaudeTask: () => {},
  getClaudeCommandCatalog: async () => ({
    ok: true,
    supported: true,
    commands: [],
    detail: "",
  }),
  resolveClaudeExecutablePath: () => "/tmp/claude",
  runClaudeReadOnlyPrompt: async () => ({
    ok: false,
    text: "",
    detail: "not used",
  }),
  streamClaudeWithSdk: runMockAdapter,
}));

mock.module("../electron/providers/codex-app-server-runtime", () => ({
  cleanupCodexAppServerTask: () => {},
  disposeAllCodexAppServerClients: () => {},
  getCodexModelCatalog: async () => ({
    ok: true,
    detail: "",
    models: [],
  }),
  resolveCodexExecutablePath: () => "/tmp/codex",
  runCodexReadOnlyPrompt: async () => ({
    ok: false,
    text: "",
    detail: "not used",
  }),
  streamCodexWithAppServer: runMockAdapter,
}));

mock.module("../electron/providers/cursor/cursor-acp-profile", () => ({
  describeCursorAvailability: () => ({
    available: true,
    detail: "available",
    capabilities: {},
  }),
  streamCursorWithAcp: runMockAdapter,
}));

mock.module("../electron/providers/kiro/kiro-acp-profile", () => ({
  describeKiroAvailability: () => ({
    available: true,
    detail: "available",
    capabilities: {},
  }),
  streamKiroWithAcp: runMockAdapter,
}));

mock.module("../electron/providers/connected-tool-status", () => ({
  getProviderConnectedToolStatus: async () => ({
    ok: true,
    providerId: "codex",
    detail: "",
    tools: [],
  }),
}));

mock.module("../electron/providers/provider-model-catalog", () => ({
  getProviderModelCatalog: async ({
    providerId,
  }: {
    providerId: ProviderId;
  }) => ({
    providerId,
    ok: true,
    detail: "fixture catalog",
    models: [
      {
        model: "auto",
        displayName: "Auto",
        description: "",
        hidden: false,
        isDefault: true,
        defaultEffort: null,
        supportedEfforts: [],
      },
      {
        model: `${providerId}-fixture-model`,
        displayName: `${providerId} fixture model`,
        description: "",
        hidden: false,
        isDefault: false,
        defaultEffort: null,
        supportedEfforts: [],
      },
    ],
  }),
}));

const { getProviderRuntimeLifecycleSnapshot, providerRuntime } =
  await import("../electron/providers/runtime");

function runStream(args: {
  providerId: ProviderId;
  timeoutMs?: number;
  runtimeOptions?: ProviderRuntimeOptions;
  taskId?: string;
  agentRunStage?: { agentRunId: string; stageId: string; attempt: number };
}) {
  const events: BridgeEvent[] = [];
  let finish: (() => void) | undefined;
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const turnId = `${args.providerId}-${adapterState.scenario}`;
  providerRuntime.startTurnStream(
    {
      cwd: TEST_WORKSPACE_CWD,
      providerId: args.providerId,
      prompt: "test lifecycle",
      turnId,
      ...(args.taskId ? { taskId: args.taskId } : {}),
      ...(args.agentRunStage ? { agentRunStage: args.agentRunStage } : {}),
      runtimeOptions: {
        ...args.runtimeOptions,
        ...(args.timeoutMs ? { providerTimeoutMs: args.timeoutMs } : {}),
      },
    },
    {
      onEvent: (event) => events.push(event),
      onDone: () => finish?.(),
    },
  );
  return { done, events, turnId };
}

afterEach(async () => {
  adapterState.pendingDecisionCount = 0;
  adapterState.lastArgs = undefined;
  await providerRuntime.shutdown();
});

for (const providerId of ["claude-code", "codex", "cursor", "kiro"] as const) {
  describe(`${providerId} lifecycle contract`, () => {
    test("deduplicates terminal events", async () => {
      adapterState.scenario = "duplicate-terminal";
      const turn = runStream({ providerId });
      await turn.done;

      expect(turn.events.filter((event) => event.type === "done")).toHaveLength(
        1,
      );
      expect(turn.events.at(-1)?.type).toBe("done");
    });

    test("synthesizes a terminal event when the adapter omits it", async () => {
      adapterState.scenario = "missing-terminal";
      const turn = runStream({ providerId });
      await turn.done;

      expect(turn.events.at(-1)).toEqual({
        type: "done",
        stop_reason: "completed",
      });
    });

    test("normalizes provider process failure and releases runtime state", async () => {
      adapterState.scenario = "throw";
      const turn = runStream({ providerId });
      await turn.done;

      expect(turn.events.some((event) => event.type === "error")).toBe(true);
      expect(turn.events.filter((event) => event.type === "done")).toHaveLength(
        1,
      );
      expect(turn.events.at(-1)).toEqual({
        type: "done",
        stop_reason: "runtime_failure",
      });
      expect(getProviderRuntimeLifecycleSnapshot()).toMatchObject({
        activeSessionCount: 0,
        activeStreamCount: 0,
        activeTurnPromiseCount: 0,
        lastCompleted: {
          terminalCount: 1,
          pendingDecisionCount: 0,
        },
      });
    });

    test("clears pending decisions on abort", async () => {
      adapterState.scenario = "wait-for-abort";
      const turn = runStream({ providerId });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(adapterState.pendingDecisionCount).toBe(2);

      expect(providerRuntime.abortTurn({ turnId: turn.turnId }).ok).toBe(true);
      await turn.done;

      expect(adapterState.pendingDecisionCount).toBe(0);
      expect(turn.events.at(-1)).toEqual({
        type: "done",
        stop_reason: "user_abort",
      });
    });

    test("terminates timed-out decisions without pending runtime state", async () => {
      adapterState.scenario = "wait-for-timeout";
      const turn = runStream({ providerId, timeoutMs: 10 });
      await turn.done;

      expect(adapterState.pendingDecisionCount).toBe(0);
      expect(turn.events.filter((event) => event.type === "done")).toHaveLength(
        1,
      );
      expect(turn.events.at(-1)).toEqual({
        type: "done",
        stop_reason: "runtime_failure",
      });
      expect(getProviderRuntimeLifecycleSnapshot()).toMatchObject({
        activeSessionCount: 0,
        activeStreamCount: 0,
        activeTurnPromiseCount: 0,
        lastCompleted: {
          terminalCount: 1,
          pendingDecisionCount: 0,
        },
      });
    });
  });
}

test("a task turn names itself to Local MCP only while it runs", async () => {
  const { resolveCallerGrant } = await import("../electron/providers/caller-grants");
  adapterState.scenario = "wait-for-abort";
  const turn = runStream({ providerId: "codex", taskId: "caller-task" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const callerKey = adapterState.lastArgs?.staveTurnGrants?.callerKey;
  expect(callerKey).toBeTruthy();
  expect(adapterState.lastArgs?.prompt).not.toContain(callerKey!);
  expect(resolveCallerGrant(callerKey!)).toMatchObject({ taskId: "caller-task", providerId: "codex" });
  expect(providerRuntime.abortTurn({ turnId: turn.turnId }).ok).toBe(true);
  expect(resolveCallerGrant(callerKey!)).toBeNull();
  await turn.done;
});

test("a task turn's grant carries the accounts it runs on, so a turn it starts keeps them", async () => {
  const { resolveCallerGrant } = await import("../electron/providers/caller-grants");
  const personal = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
  adapterState.scenario = "wait-for-abort";
  const turn = runStream({ providerId: "codex", taskId: "caller-accounts-task", runtimeOptions: { codexAccountProfileId: personal } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const callerKey = adapterState.lastArgs?.staveTurnGrants?.callerKey;
  expect(resolveCallerGrant(callerKey!)?.accounts).toEqual({ claudeAccountProfileId: "system-default", codexAccountProfileId: personal });
  expect(providerRuntime.abortTurn({ turnId: turn.turnId }).ok).toBe(true);
  await turn.done;
});

for (const providerId of ["claude-code", "codex"] as const) test(`${providerId}: an agent run turn's grant names its run, so a delegation can tell its own turns from the user's`, async () => {
  const { resolveCallerGrant } = await import("../electron/providers/caller-grants");
  adapterState.scenario = "wait-for-abort";
  const staged = runStream({ providerId, taskId: `caller-run-task-${providerId}`, agentRunStage: { agentRunId: "run-1", stageId: "work", attempt: 1 } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const stagedKey = adapterState.lastArgs?.staveTurnGrants?.callerKey;
  expect(resolveCallerGrant(stagedKey!)).toMatchObject({ taskId: `caller-run-task-${providerId}`, turnId: staged.turnId, agentRunId: "run-1" });
  expect(providerRuntime.abortTurn({ turnId: staged.turnId }).ok).toBe(true);
  await staged.done;
  const plain = runStream({ providerId, taskId: `caller-plain-task-${providerId}` });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const plainGrant = resolveCallerGrant(adapterState.lastArgs!.staveTurnGrants!.callerKey!);
  expect(plainGrant).toMatchObject({ taskId: `caller-plain-task-${providerId}`, turnId: plain.turnId });
  expect(plainGrant && "agentRunId" in plainGrant).toBe(false);
  expect(providerRuntime.abortTurn({ turnId: plain.turnId }).ok).toBe(true);
  await plain.done;
});

test("in-turn subagents come only from the task's agent; a supplied list is dropped", async () => {
  adapterState.scenario = "duplicate-terminal";
  await runStream({
    providerId: "claude-code",
    runtimeOptions: { nativeSubagents: [{ name: "x", label: "X", description: "d", instructions: "i" }] },
  }).done;
  const options = (adapterState.lastArgs as { runtimeOptions?: Record<string, unknown> } | undefined)?.runtimeOptions;
  expect(options).toBeDefined();
  expect(options).not.toHaveProperty("nativeSubagents");
});
