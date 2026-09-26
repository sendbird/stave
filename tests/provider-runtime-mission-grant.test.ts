import { afterEach, describe, expect, mock, test } from "bun:test";
import type { BridgeEvent, StreamTurnArgs } from "../electron/providers/types";
import type { MissionStageGrant } from "../electron/providers/mission-grants";

const TEST_WORKSPACE_CWD = "/tmp/stave-provider-runtime-mission-test";

const actualClaudeRuntime = await import("../electron/providers/claude-sdk-runtime");
const actualCodexRuntime = await import("../electron/providers/codex-app-server-runtime");

let primaryTurns: StreamTurnArgs[] = [];
/** The grant each turn's key resolved to while that turn was running. */
let grantsDuringTurn: Array<MissionStageGrant | null> = [];

async function streamPrimary(
  args: StreamTurnArgs & {
    onEvent?: (event: BridgeEvent) => void;
    registerAbort?: (aborter: () => void) => void;
  },
) {
  primaryTurns.push(args);
  args.registerAbort?.(() => {});
  const key = args.staveTurnGrants?.missionKey;
  grantsDuringTurn.push(key ? resolveMissionGrant(key) : null);
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

const { providerRuntime } = await import("../electron/providers/runtime");
const { resolveMissionGrant, clearMissionGrantsForTest } = await import(
  "../electron/providers/mission-grants"
);

const STAGE = { missionId: "mission-1", stageId: "draft", attempt: 1 };

async function runTurn(args: {
  providerId: StreamTurnArgs["providerId"];
  turnId: string;
  taskId?: string;
  missionStage?: StreamTurnArgs["missionStage"];
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
      ...(args.missionStage ? { missionStage: args.missionStage } : {}),
      ...(args.executionPolicy ? { executionPolicy: args.executionPolicy } : {}),
    },
    { bufferEvents: true, onDone: resolveDone },
  );
  await done;
  return primaryTurns.at(-1)!;
}

afterEach(() => {
  primaryTurns = [];
  grantsDuringTurn = [];
  clearMissionGrantsForTest();
  providerRuntime.cleanupTask({ taskId: "task-1" });
  providerRuntime.cleanupTask({ taskId: "task-2" });
});

describe("provider runtime mission grants", () => {
  for (const providerId of ["claude-code", "codex"] as const) {
    test(`${providerId} mints a grant for the stage attempt and revokes it when the turn ends`, async () => {
      const turn = await runTurn({ providerId, turnId: `${providerId}-turn`, missionStage: STAGE });
      const key = turn.staveTurnGrants?.missionKey;
      expect(key).toBeTruthy();
      expect(JSON.stringify(turn.conversation ?? null)).not.toContain(key!);
      expect(turn.prompt).not.toContain(key!);
      expect(grantsDuringTurn[0]).toEqual({
        ...STAGE,
        turnId: `${providerId}-turn`,
        taskId: "task-1",
      });
      expect(resolveMissionGrant(key!)).toBeNull();
    });
  }

  test("Claude mints a fresh key per turn; Codex keeps one channel per task", async () => {
    const claudeOne = await runTurn({ providerId: "claude-code", turnId: "c1", missionStage: STAGE });
    const claudeTwo = await runTurn({ providerId: "claude-code", turnId: "c2", missionStage: STAGE });
    expect(claudeOne.staveTurnGrants?.missionKey).not.toBe(
      claudeTwo.staveTurnGrants?.missionKey,
    );

    const codexStage = await runTurn({ providerId: "codex", turnId: "x1", missionStage: STAGE });
    const channel = codexStage.staveTurnGrants?.missionKey;
    const codexNext = await runTurn({
      providerId: "codex",
      turnId: "x2",
      missionStage: { ...STAGE, stageId: "polish" },
    });
    expect(codexNext.staveTurnGrants?.missionKey).toBe(channel);
    expect(grantsDuringTurn.at(-1)).toMatchObject({ stageId: "polish", turnId: "x2" });

    // An ordinary turn keeps the channel, so the thread resumes, but the key
    // resolves to nothing.
    const ordinary = await runTurn({ providerId: "codex", turnId: "x3" });
    expect(ordinary.staveTurnGrants?.missionKey).toBe(channel);
    expect(grantsDuringTurn.at(-1)).toBeNull();

    const otherTask = await runTurn({ providerId: "codex", turnId: "x4", taskId: "task-2" });
    expect(otherTask.staveTurnGrants?.missionKey).toBeUndefined();
  });

  test("no grant for turns without a mission stage or for secondary runs", async () => {
    const plain = await runTurn({ providerId: "claude-code", turnId: "p1" });
    expect(plain.staveTurnGrants?.missionKey).toBeUndefined();
    const secondary = await runTurn({
      providerId: "claude-code",
      turnId: "s1",
      missionStage: STAGE,
      executionPolicy: "secondary-read-only",
    });
    expect(secondary.staveTurnGrants?.missionKey).toBeUndefined();
  });
});
