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

const { providerRuntime, setAgentRunUserTurnResolver } = await import("../electron/providers/runtime");
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
    },
    { bufferEvents: true, onDone: resolveDone },
  );
  await done;
  return primaryTurns.at(-1)!;
}

afterEach(() => {
  setAgentRunUserTurnResolver(null);
  primaryTurns = [];
  grantsDuringTurn = [];
  clearAgentRunGrantsForTest();
  providerRuntime.cleanupTask({ taskId: "task-1" });
  providerRuntime.cleanupTask({ taskId: "task-2" });
});

describe("provider runtime run grants", () => {
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
