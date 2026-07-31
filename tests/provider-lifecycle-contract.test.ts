import { afterEach, describe, expect, mock, test } from "bun:test";
import type { BridgeEvent, ProviderId } from "../electron/providers/types";

type Scenario =
  | "duplicate-terminal"
  | "missing-terminal"
  | "throw"
  | "wait-for-abort"
  | "wait-for-timeout";

type AdapterArgs = {
  onEvent?: (event: BridgeEvent) => void;
  registerAbort?: (abort: () => void) => void;
  registerApprovalResponder?: (responder: () => { ok: true }) => void;
  registerUserInputResponder?: (responder: () => { ok: true }) => void;
};

const adapterState = {
  scenario: "duplicate-terminal" as Scenario,
  pendingDecisionCount: 0,
};

async function runMockAdapter(args: AdapterArgs) {
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
    return [];
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

mock.module("../electron/providers/connected-tool-status", () => ({
  getProviderConnectedToolStatus: async () => ({
    ok: true,
    providerId: "codex",
    detail: "",
    tools: [],
  }),
}));

const { getProviderRuntimeLifecycleSnapshot, providerRuntime } =
  await import("../electron/providers/runtime");

function runStream(args: { providerId: ProviderId; timeoutMs?: number }) {
  const events: BridgeEvent[] = [];
  let finish: (() => void) | undefined;
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const turnId = `${args.providerId}-${adapterState.scenario}`;
  providerRuntime.startTurnStream(
    {
      providerId: args.providerId,
      prompt: "test lifecycle",
      turnId,
      runtimeOptions: args.timeoutMs
        ? { providerTimeoutMs: args.timeoutMs }
        : undefined,
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
  await providerRuntime.shutdown();
});

for (const providerId of ["claude-code", "codex"] as const) {
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
