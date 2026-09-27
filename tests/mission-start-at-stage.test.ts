import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createMissionRuntime } from "../electron/host-service/supervision/mission-runtime";
import { MissionStore } from "../electron/persistence/mission-store";
import { createMission, MissionStartInputSchema } from "../src/lib/missions/domain";
import { applyMissionDecision, decideMissionAction } from "../src/lib/missions/policy";
import { evaluatePreStartChecks } from "../src/lib/missions/pre-start-checks";
import { buildMissionReport } from "../src/lib/missions/report";
import {
  buildMissionStartInput,
  defaultAuthorizedEffects,
  describeStartButton,
  listMissionStops,
  remainingStages,
} from "../src/lib/missions/start-sheet";
import { MISSION_NOW, observe, starterPlaybook } from "./fixtures/mission-fixtures";

const playbook = starterPlaybook("request-to-pr");
const indexOf = (id: string) => playbook.stages.findIndex((stage) => stage.id === id);
const consent = {
  checkIns: "plan-and-publishing" as const,
  permissionMode: "guided" as const,
  authorizedEffectStageIds: defaultAuthorizedEffects(playbook),
};

function input(startStageIndex: number) {
  return buildMissionStartInput({ workspaceId: "ws-1", taskId: "task-1", playbook, assignment: "Verify the fix.", consent, startStageIndex });
}

describe("starting a mission at a later stage", () => {
  test("earlier stages are recorded as skipped and the mission starts where the user chose", () => {
    const change = createMission({
      id: "mission-1",
      input: input(indexOf("verify")),
      repositoryPath: "/tmp/repo",
      fingerprint: { providerId: "claude-code", model: "sonnet" },
      now: MISSION_NOW,
    });
    expect(change.mission.currentStageIndex).toBe(indexOf("verify"));
    // Starting signs the chosen stage off, as its sign-off card would.
    expect(change.upserts.map((record) => [record.stageId, record.status])).toEqual([
      ["understand", "skipped"],
      ["build", "skipped"],
      ["verify", "running"],
    ]);
    expect(change.upserts[0]!.detail).toBe("Not run: the mission started at Verify.");
    expect(change.events[0]!.detail).toMatchObject({ startStageId: "verify" });

    // The report says why the first stages never ran.
    const report = buildMissionReport({
      aggregate: { mission: { ...change.mission, state: "cancelled" }, stages: change.upserts },
      workspace: { branch: null, branchPushed: false, openPullRequest: null },
      endedAt: MISSION_NOW,
    });
    expect(report.stages.slice(0, 2).map((stage) => stage.status)).toEqual(["skipped", "skipped"]);
  });

  test("a start outside the playbook is refused", () => {
    expect(MissionStartInputSchema.safeParse(input(playbook.stages.length)).success).toBe(false);
    // Starting at the first stage sends nothing extra.
    expect("startStageIndex" in input(0)).toBe(false);
  });

  test("starting signs off the chosen stage; only later stops remain, and the button says where it starts", () => {
    expect(listMissionStops(playbook, consent, indexOf("build")).map((index) => playbook.stages[index]!.title)).toEqual([
      "Ready for review",
    ]);
    expect(describeStartButton(playbook, consent, indexOf("build"))).toBe("Start at Build — asks before Ready for review");
    expect(describeStartButton(playbook, { ...consent, checkIns: "when-stuck" }, indexOf("verify"))).toBe(
      "Start at Verify — runs to the end",
    );
  });

  test("the mission does not ask again at the stage it starts at", () => {
    // Build follows the plan stage, so plan-and-publishing asks before it.
    const change = createMission({
      id: "mission-1",
      input: input(indexOf("build")),
      repositoryPath: "/tmp/repo",
      fingerprint: { providerId: "claude-code", model: "sonnet" },
      now: MISSION_NOW,
    });
    const aggregate = { mission: change.mission, stages: change.upserts };
    expect(decideMissionAction({ aggregate, observation: observe(), now: MISSION_NOW })).toEqual({
      action: "start-stage-turn",
      stageIndex: indexOf("build"),
      attempt: 1,
      reason: "stage-start",
    });
    expect(listMissionStops(playbook, consent, indexOf("build"))).not.toContain(indexOf("build"));

    // An action stage signed off at start runs, and gets its start time then.
    const atOpenPr = createMission({
      id: "mission-2",
      input: input(indexOf("open-draft-pr")),
      repositoryPath: "/tmp/repo",
      fingerprint: { providerId: "claude-code", model: "sonnet" },
      now: MISSION_NOW,
    });
    const openPr = { mission: atOpenPr.mission, stages: atOpenPr.upserts };
    const decision = decideMissionAction({ aggregate: openPr, observation: observe(), now: MISSION_NOW });
    expect(decision).toEqual({ action: "execute-action", stageIndex: indexOf("open-draft-pr") });
    const started = applyMissionDecision({ aggregate: openPr, decision, now: MISSION_NOW });
    expect(started.upserts[0]).toMatchObject({ stageId: "open-draft-pr", status: "running", startedAt: MISSION_NOW.toISOString() });
  });

  test("a start stage that writes outside the workspace without consent still asks, and the sheet says so", () => {
    const withheld = { ...consent, authorizedEffectStageIds: consent.authorizedEffectStageIds.filter((id) => id !== "open-draft-pr") };
    const change = createMission({
      id: "mission-1",
      input: buildMissionStartInput({
        workspaceId: "ws-1",
        taskId: "task-1",
        playbook,
        assignment: "Open the PR.",
        consent: withheld,
        startStageIndex: indexOf("open-draft-pr"),
      }),
      repositoryPath: "/tmp/repo",
      fingerprint: { providerId: "claude-code", model: "sonnet" },
      now: MISSION_NOW,
    });
    expect(change.upserts.at(-1)).toMatchObject({ stageId: "open-draft-pr", status: "pending" });
    const aggregate = { mission: change.mission, stages: change.upserts };
    expect(decideMissionAction({ aggregate, observation: observe(), now: MISSION_NOW })).toEqual({
      action: "request-sign-off",
    });
    expect(listMissionStops(playbook, withheld, indexOf("open-draft-pr"))[0]).toBe(indexOf("open-draft-pr"));
  });

  test("starting after Open draft PR needs a pull request that already exists", () => {
    const base = {
      providerSupported: true,
      reporting: { state: "ready" } as never,
      github: { state: "authenticated", pullRequest: null } as never,
      dirtyFileCount: 0,
      dirtyAcknowledged: false,
      activeMission: false,
    };
    const fromStart = evaluatePreStartChecks({ ...base, playbook: remainingStages(playbook, 0) });
    expect(fromStart.find((check) => check.id === "pull-request")).toBeUndefined();
    const fromChecks = evaluatePreStartChecks({ ...base, playbook: remainingStages(playbook, indexOf("watch-checks")) });
    expect(fromChecks.find((check) => check.id === "pull-request")).toMatchObject({ state: "fail", blocking: true });
  });

  test("the runtime runs the chosen stage first", async () => {
    const store = new MissionStore(new Database(":memory:"));
    const prompts: string[] = [];
    const runtime = createMissionRuntime({
      store,
      getTaskSupervisionSnapshot: async () => ({
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
      }),
      listRecentTurns: () => [],
      runSupervisedTurn: async (args) => {
        prompts.push(args.missionStage?.stageId ?? "none");
        return { turnId: `turn-${prompts.length}` };
      },
      completeInterruptedTurn: () => true,
      countActiveDelegatedTasks: () => 0,
      isReportingAvailable: async () => true,
      resolveMissionGrant: () => null,
      resolveWorkspacePath: async () => "/tmp/repo",
      readHeadSha: async () => "abc",
      collectStageFacts: async () => ({ diff: null, commands: [], toolCalls: [], action: null }),
      now: () => MISSION_NOW,
      setInterval: (() => 0) as unknown as typeof globalThis.setInterval,
      clearInterval: () => {},
    });
    await runtime.startMission(input(indexOf("verify")));
    await runtime.requestTick();
    expect(prompts).toEqual(["verify"]);
  });
});
