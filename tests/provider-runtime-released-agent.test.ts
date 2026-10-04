import { afterEach, describe, expect, mock, test } from "bun:test";
import type { BridgeEvent, StreamTurnArgs } from "../electron/providers/types";

const TEST_WORKSPACE_CWD = "/tmp/stave-provider-runtime-released-agent-test";

const actualClaudeRuntime = await import("../electron/providers/claude-sdk-runtime");
const actualCodexRuntime = await import("../electron/providers/codex-app-server-runtime");

let primaryTurns: StreamTurnArgs[] = [];

async function streamPrimary(
  args: StreamTurnArgs & {
    onEvent?: (event: BridgeEvent) => void;
    registerAbort?: (aborter: () => void) => void;
  },
) {
  primaryTurns.push(args);
  args.registerAbort?.(() => {});
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

/** What each ACP turn prepended, after its session id was known. */
let acpPrefixes: Array<string | null> = [];
async function streamAcp(
  args: StreamTurnArgs & {
    onEvent?: (event: BridgeEvent) => void;
    registerAbort?: (aborter: () => void) => void;
    prepareTaskAgentPrompt?: (nativeSessionId: string, resumed: boolean) => string | null;
    acknowledgeTaskAgentPrompt?: () => void;
  },
) {
  primaryTurns.push(args);
  args.registerAbort?.(() => {});
  acpPrefixes.push(args.prepareTaskAgentPrompt?.("acp-session-1", true) ?? null);
  args.acknowledgeTaskAgentPrompt?.();
  const events: BridgeEvent[] = [{ type: "done", stop_reason: "end_turn" }];
  events.forEach((event) => args.onEvent?.(event));
  return events;
}

const actualCursorProfile = await import("../electron/providers/cursor/cursor-acp-profile");
const actualKiroProfile = await import("../electron/providers/kiro/kiro-acp-profile");
mock.module("../electron/providers/cursor/cursor-acp-profile", () => ({
  ...actualCursorProfile,
  streamCursorWithAcp: streamAcp,
}));
mock.module("../electron/providers/kiro/kiro-acp-profile", () => ({
  ...actualKiroProfile,
  streamKiroWithAcp: streamAcp,
}));

mock.module("../electron/providers/connected-tool-status", () => ({
  getProviderConnectedToolStatus: async () => ({ ok: true, detail: "", tools: [] }),
}));

const { providerRuntime, setReleasedTaskAgentResolver } = await import("../electron/providers/runtime");

const NOTICE = "# Agent released\n\nThe Researcher role no longer applies.";

async function runTurn(args: {
  providerId: StreamTurnArgs["providerId"];
  turnId: string;
  taskId: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}) {
  let resolveDone = () => {};
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  providerRuntime.startTurnStream(
    {
      turnId: args.turnId,
      taskId: args.taskId,
      cwd: TEST_WORKSPACE_CWD,
      providerId: args.providerId,
      prompt: "Save the file.",
      ...(args.runtimeOptions ? { runtimeOptions: args.runtimeOptions } : {}),
    },
    { bufferEvents: true, onDone: resolveDone },
  );
  await done;
  return primaryTurns.at(-1)!;
}

afterEach(() => {
  primaryTurns = [];
  acpPrefixes = [];
  setReleasedTaskAgentResolver(null);
  providerRuntime.cleanupTask({ taskId: "released" });
  providerRuntime.cleanupTask({ taskId: "plain" });
});

describe("provider runtime released agent", () => {
  for (const providerId of ["cursor", "kiro"] as const) {
    test(`${providerId}: the notice goes into the prompt once per session`, async () => {
      setReleasedTaskAgentResolver((taskId) => (taskId === "released" ? NOTICE : null));
      await runTurn({ providerId, turnId: `${providerId}-1`, taskId: "released" });
      await runTurn({ providerId, turnId: `${providerId}-2`, taskId: "released" });
      await runTurn({ providerId, turnId: `${providerId}-3`, taskId: "plain" });
      expect(acpPrefixes).toEqual([NOTICE, null, null]);
    });
  }

  for (const providerId of ["claude-code", "codex"] as const) {
    test(`${providerId}: a task whose agent was released carries the notice in the agent channel`, async () => {
      setReleasedTaskAgentResolver((taskId) => (taskId === "released" ? NOTICE : null));

      const released = await runTurn({ providerId, turnId: `${providerId}-released`, taskId: "released" });
      expect(released.runtimeOptions?.agentInstructions).toBe(NOTICE);

      const plain = await runTurn({ providerId, turnId: `${providerId}-plain`, taskId: "plain" });
      expect(plain.runtimeOptions?.agentInstructions).toBeUndefined();
    });
  }
});
