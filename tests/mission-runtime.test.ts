import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  createMissionRuntime,
  invokeMissionRuntime,
  type MissionRuntimeDependencies,
  type MissionTurnRow,
} from "../electron/host-service/supervision/mission-runtime";
import type { TaskSupervisionSnapshot } from "../electron/host-service/local-mcp-runtime";
import { MissionStore } from "../electron/persistence/mission-store";
import type { MissionStageGrant } from "../electron/providers/mission-grants";
import type { MissionChangedEvent } from "../src/lib/missions/api";
import { MISSION_CONTEXT_SOURCE_ID } from "../src/lib/missions/briefing";
import {
  currentStageRecord,
  EMPTY_STAGE_FACTS,
  MissionCommandError,
  type MissionStartInput,
  type StageFacts,
} from "../src/lib/missions/domain";
import { classifyStageEvidence } from "../src/lib/missions/evidence";
import type { ActionOutcome } from "../src/lib/missions/policy";
import { PlaybookSchema, type Playbook, type PlaybookStage } from "../src/lib/playbooks/schema";

const START = "2026-09-26T10:00:00.000Z";

function playbook(stages: PlaybookStage[], overrides: Partial<Playbook> = {}): Playbook {
  return PlaybookSchema.parse({
    version: 1,
    id: "playbook_runtime",
    name: "Runtime playbook",
    purpose: "Carry the assignment to a verified change.",
    checkIns: "when-stuck",
    team: "solo",
    stages,
    createdAt: START,
    updatedAt: START,
    ...overrides,
  });
}

const DRAFT: PlaybookStage = {
  id: "draft",
  title: "Draft",
  kind: "ai",
  instruction: "Draft the change.",
  doneWhen: "The change is drafted.",
};
const POLISH: PlaybookStage = {
  id: "polish",
  title: "Polish",
  kind: "ai",
  instruction: "Polish the change.",
  doneWhen: "The change is polished.",
};
const OPEN_PR: PlaybookStage = {
  id: "open-pr",
  title: "Open draft PR",
  kind: "action",
  action: { type: "open-draft-pr" },
};

function startInput(overrides: Partial<MissionStartInput> = {}): MissionStartInput {
  return {
    workspaceId: "ws-1",
    leadTaskId: "task-1",
    playbook: playbook([DRAFT, POLISH]),
    assignment: "Add CSV export to the billing page.",
    consent: { checkIns: "when-stuck", permissionMode: "guided", authorizedEffectStageIds: [] },
    ...overrides,
  };
}

const COMPLETE = {
  summary: "Drafted the export.",
  decisions: [{ decision: "Reuse the table model", reason: "It already has the rows." }],
  evidence: [{ label: "Tests pass", kind: "check" as const, command: "bun test" }],
  artifacts: [],
};

function createHarness(options: {
  store?: MissionStore;
  hangTurnStarts?: boolean;
  performAction?: MissionRuntimeDependencies["performAction"];
} = {}) {
  const store = options.store ?? new MissionStore(new Database(":memory:"));
  let clock = new Date(START);
  let snapshot: TaskSupervisionSnapshot = {
    workspaceId: "ws-1",
    taskId: "task-1",
    repositoryPath: "/tmp/repo",
    exists: true,
    archived: false,
    providerId: "claude-code",
    model: "sonnet",
    activeTurnId: null,
    pendingApprovalCount: 0,
    pendingUserInputCount: 0,
  };
  const turns: MissionTurnRow[] = [];
  const grants = new Map<string, MissionStageGrant>();
  const runCalls: Array<Parameters<MissionRuntimeDependencies["runSupervisedTurn"]>[0]> = [];
  const factCalls: Array<Parameters<MissionRuntimeDependencies["collectStageFacts"]>[0]> = [];
  const notifications: string[] = [];
  const changes: MissionChangedEvent[] = [];
  const closedTurns: string[] = [];
  let reportingAvailable = true;
  let runError: Error | null = null;
  let activeDelegated = 0;
  let facts: StageFacts = EMPTY_STAGE_FACTS;
  let turnCounter = 0;

  const advance = (ms = 1_000) => {
    clock = new Date(clock.getTime() + ms);
  };

  const runtime = createMissionRuntime({
    store,
    getTaskSupervisionSnapshot: async () => snapshot,
    listRecentTurns: () => turns.slice(0, 20),
    runSupervisedTurn: async (args) => {
      runCalls.push(args);
      if (options.hangTurnStarts) return await new Promise<never>(() => {});
      if (runError) throw runError;
      turnCounter += 1;
      const turnId = `turn-${turnCounter}`;
      advance();
      turns.unshift({ id: turnId, createdAt: clock.toISOString(), completedAt: null });
      // What the provider runtime does: a grant for this turn's stage attempt.
      grants.set(`key-${turnId}`, { ...args.missionStage, turnId, taskId: args.taskId });
      return { turnId };
    },
    completeInterruptedTurn: (turnId) => {
      closedTurns.push(turnId);
      return true;
    },
    countActiveDelegatedTasks: () => activeDelegated,
    isReportingAvailable: async () => reportingAvailable,
    resolveMissionGrant: (key) => grants.get(key) ?? null,
    resolveWorkspacePath: async () => "/tmp/repo-ws",
    readHeadSha: async () => "abc1234",
    collectStageFacts: async (args) => {
      factCalls.push(args);
      return facts;
    },
    readWorkspaceState: async () => ({
      branch: "feature/csv",
      branchPushed: true,
      openPullRequest: { url: "https://github.com/acme/app/pull/7", number: 7, isDraft: true },
    }),
    ...(options.performAction ? { performAction: options.performAction } : {}),
    notifyMissionProblem: ({ detail }) => {
      notifications.push(detail);
    },
    emitChanged: (event) => changes.push(event),
    now: () => clock,
    setInterval: (() => 0) as unknown as typeof globalThis.setInterval,
    clearInterval: () => {},
  });

  return {
    store,
    runtime,
    runCalls,
    factCalls,
    notifications,
    changes,
    closedTurns,
    turns,
    advance,
    setSnapshot: (patch: Partial<TaskSupervisionSnapshot>) => {
      snapshot = { ...snapshot, ...patch };
    },
    setReporting: (available: boolean) => {
      reportingAvailable = available;
    },
    setRunError: (error: Error | null) => {
      runError = error;
    },
    setActiveDelegated: (count: number) => {
      activeDelegated = count;
    },
    setFacts: (next: StageFacts) => {
      facts = next;
    },
    /** A turn the user started from the composer. */
    userTurn: (id: string) => {
      advance();
      turns.unshift({ id, createdAt: clock.toISOString(), completedAt: null });
    },
    endTurn: (id: string) => {
      advance();
      const row = turns.find((candidate) => candidate.id === id)!;
      row.completedAt = clock.toISOString();
      grants.delete(`key-${id}`);
    },
    tick: () => runtime.requestTick(),
    aggregate: (missionId: string) => store.getAggregate(missionId)!,
    current: (missionId: string) => currentStageRecord(store.getAggregate(missionId)!),
  };
}

async function startedMission(
  harness: ReturnType<typeof createHarness>,
  input: MissionStartInput = startInput(),
) {
  const detail = await harness.runtime.startMission(input);
  await harness.tick();
  return detail.mission.id;
}

describe("mission runtime: starting", () => {
  test("refuses unsupported runtimes, archived tasks, missing Local MCP and a second mission", async () => {
    const harness = createHarness();
    harness.setSnapshot({ providerId: "cursor" });
    await expect(harness.runtime.startMission(startInput())).rejects.toThrow("Claude and Codex");
    harness.setSnapshot({ providerId: "claude-code", archived: true });
    await expect(harness.runtime.startMission(startInput())).rejects.toThrow("archived");
    harness.setSnapshot({ archived: false });
    harness.setReporting(false);
    await expect(harness.runtime.startMission(startInput())).rejects.toThrow("Local MCP");
    harness.setReporting(true);
    await harness.runtime.startMission(startInput());
    await expect(harness.runtime.startMission(startInput())).rejects.toThrow(
      "already running a mission",
    );
    expect(harness.store.listRecentMissions()).toHaveLength(1);
  });

  test("starts the first stage turn with its prompt, mission context, stage identity and consent", async () => {
    const harness = createHarness();
    const missionId = await startedMission(harness);
    expect(harness.runCalls).toHaveLength(1);
    const call = harness.runCalls[0]!;
    expect(call.missionStage).toEqual({ missionId, stageId: "draft", attempt: 1 });
    expect(call.fingerprint).toEqual({ providerId: "claude-code", model: "sonnet" });
    expect(call.runtimeOptions).toEqual({
      claudePermissionMode: "default",
      claudeAllowDangerouslySkipPermissions: false,
    });
    expect(call.prompt).toContain("Stage 1 of 2: Draft");
    expect(call.prompt).not.toContain(missionId);
    expect(call.retrievedContextParts[0]?.sourceId).toBe(MISSION_CONTEXT_SOURCE_ID);
    expect(call.retrievedContextParts[0]?.content).toContain("This turn starts the stage.");

    const record = harness.current(missionId);
    expect(record).toMatchObject({ status: "running", startHeadSha: "abc1234" });
    expect(harness.aggregate(missionId).mission.turnCount).toBe(1);
    const keys = harness.store
      .listEventsByKind(missionId, ["turn-started", "turn-linked"])
      .map((event) => event.idempotencyKey);
    expect(keys).toEqual([`${missionId}:draft:1:turn:1`, `${missionId}:draft:1:turn:1:linked`]);
    expect(harness.changes.at(-1)).toMatchObject({ missionId, state: "running" });
  });

  test("a mission owns its lead task's automatic turns while it is active", async () => {
    const harness = createHarness();
    const missionId = await startedMission(harness);
    expect(harness.runtime.getActiveMissionForTask("task-1")?.id).toBe(missionId);
    await harness.runtime.cancel({ missionId });
    expect(harness.runtime.getActiveMissionForTask("task-1")).toBeNull();
  });
});

describe("mission runtime: stage reports", () => {
  test("a report through the turn's grant completes the stage only after the turn ends", async () => {
    const harness = createHarness();
    const missionId = await startedMission(harness);
    const receipt = await harness.runtime.reportStage({ missionKey: "key-turn-1", report: COMPLETE });
    expect(receipt).toMatchObject({ recorded: true, stage: "Draft", revision: 1 });

    await harness.tick();
    expect(harness.current(missionId).stageId).toBe("draft");
    expect(harness.runCalls).toHaveLength(1);

    harness.endTurn("turn-1");
    await harness.tick();
    const aggregate = harness.aggregate(missionId);
    expect(aggregate.stages.find((record) => record.stageId === "draft")?.status).toBe("completed");
    expect(harness.runCalls).toHaveLength(2);
    expect(harness.runCalls[1]!.missionStage.stageId).toBe("polish");
    expect(harness.runCalls[1]!.prompt).toContain("**Draft:** Drafted the export.");
  });

  test("an ended turn without a report is nudged once, then the stage is stuck", async () => {
    const harness = createHarness();
    const missionId = await startedMission(harness);
    harness.endTurn("turn-1");
    await harness.tick();
    expect(harness.runCalls).toHaveLength(2);
    expect(harness.runCalls[1]!.prompt).toContain("without reporting the stage \"Draft\"");
    expect(harness.runCalls[1]!.retrievedContextParts[0]?.content).toContain(
      "ended without a stage report",
    );
    expect(harness.current(missionId)).toMatchObject({ status: "running", nudged: true });

    harness.endTurn("turn-2");
    await harness.tick();
    expect(harness.runCalls).toHaveLength(2);
    expect(harness.current(missionId).status).toBe("stuck");
  });

  test("the reporting tools refuse a turn whose grant ended or whose stage moved on", async () => {
    const harness = createHarness();
    const missionId = await startedMission(harness);
    await harness.runtime.reportStage({ missionKey: "key-turn-1", report: COMPLETE });
    harness.endTurn("turn-1");
    await expect(
      harness.runtime.reportStage({ missionKey: "key-turn-1", report: COMPLETE }),
    ).rejects.toThrow("No mission stage is active");
    await expect(harness.runtime.getForGrant({ missionKey: "key-unknown" })).rejects.toBeInstanceOf(
      MissionCommandError,
    );
    await harness.tick();
    expect(harness.current(missionId).stageId).toBe("polish");

    const briefing = await harness.runtime.getForGrant({ missionKey: "key-turn-2" });
    expect(briefing.currentStage).toMatchObject({ title: "Polish", attempt: 1 });
    expect(JSON.stringify(briefing)).not.toContain(missionId);
  });

  test("a blocked report blocks the stage, and a reply in the task resumes it", async () => {
    const harness = createHarness();
    const missionId = await startedMission(harness);
    await harness.runtime.blockStage({
      missionKey: "key-turn-1",
      block: { missing: "Which billing plan gets the export?", kind: "input" },
    });
    harness.endTurn("turn-1");
    await harness.tick();
    expect(harness.current(missionId)).toMatchObject({
      status: "blocked",
      blockReason: "agent-blocked",
    });
    expect(harness.runCalls).toHaveLength(1);

    harness.userTurn("user-turn-1");
    await harness.tick();
    expect(harness.runCalls).toHaveLength(1);
    harness.endTurn("user-turn-1");
    await harness.tick();
    expect(harness.runCalls).toHaveLength(2);
    expect(harness.runCalls[1]!.retrievedContextParts[0]?.content).toContain("The user replied");
    expect(harness.current(missionId).status).toBe("running");
  });

  test("a stage cannot complete while work it delegated is still running", async () => {
    const harness = createHarness();
    const missionId = await startedMission(harness);
    await harness.runtime.reportStage({ missionKey: "key-turn-1", report: COMPLETE });
    harness.setActiveDelegated(1);
    harness.endTurn("turn-1");
    await harness.tick();
    expect(harness.current(missionId).stageId).toBe("draft");
    harness.setActiveDelegated(0);
    await harness.tick();
    expect(harness.current(missionId).stageId).toBe("polish");
  });

  test("facts collected when a turn ends verify the evidence the report cites", async () => {
    const harness = createHarness();
    harness.setFacts({
      ...EMPTY_STAGE_FACTS,
      commands: [{ command: "bun test", exitCode: 0, toolCallId: "call-1" }],
    });
    const missionId = await startedMission(harness);
    await harness.runtime.reportStage({ missionKey: "key-turn-1", report: COMPLETE });
    harness.endTurn("turn-1");
    await harness.tick();
    expect(harness.factCalls[0]).toMatchObject({
      cwd: "/tmp/repo-ws",
      startHeadSha: "abc1234",
    });
    expect([...harness.factCalls[0]!.turnIds]).toEqual(["turn-1"]);
    const draft = harness.aggregate(missionId).stages.find((record) => record.stageId === "draft")!;
    expect(draft.report?.outcome).toBe("complete");
    if (draft.report?.outcome !== "complete") throw new Error("expected a complete report");
    expect(classifyStageEvidence(draft.report, draft.facts)[0]?.source).toBe("stave");
  });
});

describe("mission runtime: the user and the reporting channel", () => {
  test("take over pauses the mission until Resume", async () => {
    const harness = createHarness();
    const missionId = await startedMission(harness);
    harness.endTurn("turn-1");
    await harness.runtime.noteUserTurn({ missionId, intent: "take-over" });
    await harness.tick();
    expect(harness.aggregate(missionId).mission).toMatchObject({
      state: "paused",
      pauseReason: "taken-over",
    });
    expect(harness.runCalls).toHaveLength(1);

    await harness.runtime.resume({ missionId });
    await harness.tick();
    expect(harness.aggregate(missionId).mission.state).toBe("running");
    expect(harness.runCalls).toHaveLength(2);
  });

  test("an unreachable Local MCP blocks the stage instead of spending the nudge", async () => {
    const harness = createHarness();
    const missionId = await startedMission(harness);
    harness.setReporting(false);
    harness.endTurn("turn-1");
    await harness.tick();
    expect(harness.current(missionId)).toMatchObject({
      status: "blocked",
      blockReason: "reporting-unavailable",
      nudged: false,
    });
    expect(harness.runCalls).toHaveLength(1);

    harness.setReporting(true);
    await harness.tick();
    expect(harness.runCalls).toHaveLength(2);
    expect(harness.runCalls[1]!.retrievedContextParts[0]?.content).toContain("reachable again");
  });

  test("a sign-off waits for the user and refuses a card for another attempt", async () => {
    const harness = createHarness();
    const missionId = await startedMission(
      harness,
      startInput({ playbook: playbook([DRAFT, { ...POLISH, signOff: "ask" }]) }),
    );
    await harness.runtime.reportStage({ missionKey: "key-turn-1", report: COMPLETE });
    harness.endTurn("turn-1");
    await harness.tick();
    expect(harness.current(missionId)).toMatchObject({ stageId: "polish", status: "awaiting-sign-off" });
    expect(harness.runCalls).toHaveLength(1);

    const stale = await invokeMissionRuntime(harness.runtime, "sign-off", {
      missionId,
      stageId: "polish",
      attempt: 2,
    });
    expect(stale).toMatchObject({ ok: false, code: "stale-identity" });

    await harness.runtime.signOff({ missionId, stageId: "polish", attempt: 1 });
    await harness.tick();
    expect(harness.runCalls).toHaveLength(2);
    expect(harness.runCalls[1]!.missionStage).toEqual({ missionId, stageId: "polish", attempt: 1 });
  });
});

describe("mission runtime: failures and restarts", () => {
  test("a turn that cannot start marks the stage stuck and tells the user", async () => {
    const harness = createHarness();
    harness.setRunError(new Error("provider unavailable"));
    const missionId = await startedMission(harness);
    expect(harness.current(missionId)).toMatchObject({ status: "stuck" });
    expect(harness.current(missionId).detail).toContain("provider unavailable");
    expect(harness.notifications).toEqual(["A mission turn could not start: provider unavailable"]);
    expect(
      harness.store.listEventsByKind(missionId, ["turn-failed"]).map((event) => event.idempotencyKey),
    ).toEqual([`${missionId}:draft:1:turn:1:failed`]);
    harness.setRunError(null);
    await harness.tick();
    expect(harness.runCalls).toHaveLength(1);
  });

  test("a restart reports a start it interrupted and never replays it", async () => {
    const store = new MissionStore(new Database(":memory:"));
    const crashed = createHarness({ store, hangTurnStarts: true });
    const { mission } = await crashed.runtime.startMission(startInput());
    void crashed.runtime.requestTick();
    await Bun.sleep(5);
    expect(crashed.runCalls).toHaveLength(1);

    const restarted = createHarness({ store });
    restarted.runtime.start();
    await restarted.tick();
    expect(restarted.runCalls).toHaveLength(0);
    expect(restarted.current(mission.id)).toMatchObject({ status: "stuck" });
    expect(restarted.notifications).toHaveLength(1);
    expect(restarted.notifications[0]).toContain("interrupted");

    restarted.runtime.stop();
    const again = createHarness({ store });
    again.runtime.start();
    await again.tick();
    expect(again.notifications).toEqual([]);
    expect(again.runCalls).toHaveLength(0);
  });

  test("a restart closes the mission turn the stopped host left open", async () => {
    const store = new MissionStore(new Database(":memory:"));
    const first = createHarness({ store });
    await startedMission(first);
    const restarted = createHarness({ store });
    restarted.runtime.start();
    await restarted.tick();
    expect(restarted.closedTurns).toEqual(["turn-1"]);
  });

  test("an archived lead task stops the mission, and its report lists what was left behind", async () => {
    const harness = createHarness();
    const missionId = await startedMission(harness);
    harness.setSnapshot({ archived: true });
    await harness.tick();
    const detail = await harness.runtime.get({ missionId });
    expect(detail.mission).toMatchObject({ state: "stopped", stopReason: "task-unavailable" });
    expect(detail.report?.outcome).toBe("stopped");
    expect(detail.report?.leftBehind).toEqual([
      "Branch feature/csv is pushed.",
      "Draft PR #7 is still open: https://github.com/acme/app/pull/7",
    ]);
  });
});

describe("mission runtime: Stave action stages", () => {
  const actionInput = () =>
    startInput({
      playbook: playbook([DRAFT, OPEN_PR]),
      consent: {
        checkIns: "when-stuck",
        permissionMode: "guided",
        authorizedEffectStageIds: ["open-pr"],
      },
    });

  async function reachAction(harness: ReturnType<typeof createHarness>) {
    const missionId = await startedMission(harness, actionInput());
    await harness.runtime.reportStage({ missionKey: "key-turn-1", report: COMPLETE });
    harness.endTurn("turn-1");
    await harness.tick();
    return missionId;
  }

  test("blocks with a sentence while this version cannot run the action", async () => {
    const harness = createHarness();
    const missionId = await reachAction(harness);
    expect(harness.current(missionId)).toMatchObject({
      stageId: "open-pr",
      status: "blocked",
      blockReason: "action-failed",
    });
    expect(harness.current(missionId).detail).toContain("cannot run");
  });

  test("records a successful action as verified evidence and completes the mission", async () => {
    const outcome: ActionOutcome = {
      status: "succeeded",
      result: {
        type: "open-draft-pr",
        prUrl: "https://github.com/acme/app/pull/9",
        prNumber: 9,
        created: true,
      },
    };
    const harness = createHarness({ performAction: async () => outcome });
    const missionId = await reachAction(harness);
    const detail = await harness.runtime.get({ missionId });
    expect(detail.mission.state).toBe("completed");
    expect(detail.report?.links).toContainEqual({
      label: "Opened draft PR #9",
      url: "https://github.com/acme/app/pull/9",
      source: "stave",
    });
  });
});

describe("mission runtime: host dispatch", () => {
  test("returns refusals and invalid arguments as results rather than errors", async () => {
    const harness = createHarness();
    expect(
      await invokeMissionRuntime(harness.runtime, "get", { missionId: "missing" }),
    ).toMatchObject({ ok: false, code: "not-active" });
    const detail = await harness.runtime.startMission(startInput());
    await harness.tick();
    expect(
      await invokeMissionRuntime(harness.runtime, "report-stage", {
        missionKey: "key-turn-1",
        report: { summary: "" },
      }),
    ).toMatchObject({ ok: false, code: "invalid-args" });
    expect(
      await invokeMissionRuntime(harness.runtime, "list", { workspaceId: "ws-1" }),
    ).toMatchObject({ ok: true, value: { missions: [{ id: detail.mission.id }] } });
  });
});
