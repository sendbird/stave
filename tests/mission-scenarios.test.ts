import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  createMissionActionExecutor,
  type MissionPullRequest,
  type MissionScmPort,
  type ScmStep,
} from "../electron/host-service/supervision/mission-actions";
import {
  createMissionRuntime,
  type MissionRuntimeDependencies,
  type MissionTurnRow,
} from "../electron/host-service/supervision/mission-runtime";
import type { TaskSupervisionSnapshot } from "../electron/host-service/local-mcp-runtime";
import { MissionStore } from "../electron/persistence/mission-store";
import type { MissionStageGrant } from "../electron/providers/mission-grants";
import type { PullRequestCheck } from "../src/lib/missions/checks";
import { currentStageRecord, EMPTY_STAGE_FACTS, listExternalEffectStages, type StageFacts } from "../src/lib/missions/domain";
import { createPlaybookFromStarter, findPlaybookStarter } from "../src/dev/fixtures/legacy-playbook-starters";
import { buildAgentRunStartInput } from "../src/lib/missions/agent-run";
import { getBuiltinAgent } from "../src/lib/agents/starters";

/*
 * Design scenarios A1, A4 and A5 end to end through the host runtime and the
 * real Stave action executor, with the provider and GitHub faked at their
 * ports. A2 (no report → one nudge → stuck), A3 (restarts never replay a
 * start or an action) and A6 (Local MCP down) are covered at the same seams in
 * `tests/mission-runtime.test.ts` and `tests/mission-actions.test.ts`.
 */

const START = "2026-09-26T10:00:00.000Z";
const OK: ScmStep = { ok: true, value: true };
const FAILING: PullRequestCheck[] = [{ name: "unit tests", state: "FAILURE" }];
const PASSING: PullRequestCheck[] = [{ name: "unit tests", state: "SUCCESS" }];

function scenarioHarness(providerId: "claude-code" | "codex") {
  const store = new MissionStore(new Database(":memory:"));
  let clock = new Date(START);
  const advance = (ms = 1_000) => {
    clock = new Date(clock.getTime() + ms);
  };
  const turns: MissionTurnRow[] = [];
  const grants = new Map<string, MissionStageGrant>();
  const runCalls: Array<Parameters<MissionRuntimeDependencies["runSupervisedTurn"]>[0]> = [];
  let facts: StageFacts = EMPTY_STAGE_FACTS;
  let turnCounter = 0;
  const github = {
    dirty: true,
    unpushed: false,
    head: "head-1",
    pr: null as MissionPullRequest | null,
    checks: FAILING,
    commits: [] as string[],
    calls: [] as string[],
  };
  const scm: MissionScmPort = {
    currentBranch: async () => "feature/csv",
    headSha: async () => github.head,
    hasUncommittedChanges: async () => github.dirty,
    commitAll: async (_cwd, message) => {
      github.calls.push("commit");
      github.commits.push(message);
      github.dirty = false;
      github.unpushed = true;
      github.head = `head-${github.commits.length + 1}`;
      return OK;
    },
    hasUnpushedCommits: async () => github.unpushed,
    push: async () => {
      github.calls.push("push");
      github.unpushed = false;
      if (github.pr) github.pr = { ...github.pr, headRefOid: github.head };
      return OK;
    },
    readPullRequest: async () => ({ ok: true, value: github.pr }),
    createDraftPullRequest: async () => {
      github.calls.push("create-pr");
      github.pr = {
        number: 9,
        url: "https://github.com/acme/app/pull/9",
        state: "OPEN",
        isDraft: true,
        headRefOid: github.head,
        mergeable: "MERGEABLE",
        mergeStateStatus: "BLOCKED",
        reviewDecision: "REVIEW_REQUIRED",
      };
      return { ok: true, value: { url: github.pr.url, created: true } };
    },
    markReady: async () => {
      github.calls.push("mark-ready");
      if (github.pr) github.pr = { ...github.pr, isDraft: false };
      return OK;
    },
    readChecks: async () => ({ ok: true, value: github.checks }),
    readBaseBranch: async () => "main",
    readCommitLog: async () => ({ baseBranch: "main", log: "a1b2c3d feat(billing): add csv export" }),
  };
  const snapshot: TaskSupervisionSnapshot = {
    workspaceId: "ws-1",
    taskId: "task-1",
    repositoryPath: "/tmp/repo",
    exists: true,
    archived: false,
    providerId,
    model: providerId === "codex" ? "gpt-6" : "sonnet",
    activeTurnId: null,
    pendingApprovalCount: 0,
    pendingUserInputCount: 0,
  };
  const runtime = createMissionRuntime({
    store,
    getTaskSupervisionSnapshot: async () => snapshot,
    listRecentTurns: () => turns.slice(0, 20),
    runSupervisedTurn: async (args) => {
      runCalls.push(args);
      turnCounter += 1;
      const turnId = `turn-${turnCounter}`;
      advance();
      turns.unshift({ id: turnId, createdAt: clock.toISOString(), completedAt: null });
      if (args.missionStage) grants.set(`key-${turnId}`, { ...args.missionStage, turnId, taskId: args.taskId });
      return { turnId };
    },
    completeInterruptedTurn: () => true,
    countActiveDelegatedTasks: () => 0,
    isReportingAvailable: async () => true,
    resolveMissionGrant: (key) => grants.get(key) ?? null,
    resolveWorkspacePath: async () => "/tmp/repo-ws",
    readHeadSha: async () => github.head,
    collectStageFacts: async () => facts,
    readWorkspaceState: async () => ({
      branch: "feature/csv",
      branchPushed: !github.unpushed,
      openPullRequest: github.pr ? { url: github.pr.url, number: github.pr.number, isDraft: github.pr.isDraft } : null,
    }),
    performAction: createMissionActionExecutor({
      store,
      scm,
      resolveWorkspacePath: async () => "/tmp/repo-ws",
      now: () => clock,
    }),
    notifyMissionProblem: () => {},
    emitChanged: () => {},
    now: () => clock,
    setInterval: (() => 0) as unknown as typeof globalThis.setInterval,
    clearInterval: () => {},
  });

  const lastTurnId = () => `turn-${turnCounter}`;
  return {
    store,
    runtime,
    github,
    runCalls,
    advance,
    lastTurnId,
    setFacts: (next: StageFacts) => {
      facts = next;
    },
    endTurn: (id = lastTurnId()) => {
      advance();
      const row = turns.find((candidate) => candidate.id === id)!;
      row.completedAt = clock.toISOString();
      grants.delete(`key-${id}`);
    },
    userTurn: (id: string) => {
      advance();
      turns.unshift({ id, createdAt: clock.toISOString(), completedAt: null });
    },
    /** Ticks past the checks poll interval until the mission settles. */
    tickUntilQuiet: async (rounds = 6) => {
      for (let round = 0; round < rounds; round += 1) {
        advance(61_000);
        await runtime.requestTick();
      }
    },
    current: (missionId: string) => currentStageRecord(store.getAggregate(missionId)!),
    mission: (missionId: string) => store.getAggregate(missionId)!.mission,
  };
}

function requestToPr() {
  return createPlaybookFromStarter(findPlaybookStarter("request-to-pr")!, { now: new Date(START), id: "playbook_request_to_pr" });
}

async function report(harness: ReturnType<typeof scenarioHarness>, summary: string, extra: Record<string, unknown> = {}) {
  const receipt = await harness.runtime.reportStage({
    missionKey: `key-${harness.lastTurnId()}`,
    report: { summary, decisions: [], evidence: [], artifacts: [], ...extra },
  });
  expect(receipt).toMatchObject({ recorded: true });
  harness.endTurn();
  await harness.runtime.requestTick();
}

async function runRequestToPr(providerId: "claude-code" | "codex") {
  const harness = scenarioHarness(providerId);
  const playbook = requestToPr();
  const detail = await harness.runtime.startMission({
    workspaceId: "ws-1",
    leadTaskId: "task-1",
    playbook,
    assignment: "Add CSV export to the billing page.",
    consent: {
      checkIns: "plan-and-publishing",
      permissionMode: "guided",
      authorizedEffectStageIds: listExternalEffectStages(playbook).map((stage) => stage.id),
    },
  });
  const missionId = detail.mission.id;
  const userActions: string[] = [];
  const signOff = async () => {
    const record = harness.current(missionId);
    expect(record.status).toBe("awaiting-sign-off");
    userActions.push(`sign-off:${record.stageId}`);
    await harness.runtime.signOff({ missionId, stageId: record.stageId, attempt: record.attempt });
    await harness.runtime.requestTick();
  };

  await harness.runtime.requestTick();
  expect(harness.current(missionId).stageId).toBe("understand");
  await report(harness, "Restated the request.", {
    acceptanceCriteria: [{ text: "Export button exists", status: "unverified" }],
  });

  // Plan and publishing: the stage after the plan asks first.
  await signOff();
  expect(harness.current(missionId)).toMatchObject({ stageId: "build", status: "running" });
  await report(harness, "Added the export.");

  harness.setFacts({
    diff: { filesChanged: 3, insertions: 40, deletions: 2 },
    commands: [{ command: "bun test", exitCode: 0, toolCallId: "call-test" }],
    toolCalls: [],
    action: null,
  });
  expect(harness.current(missionId).stageId).toBe("verify");
  await report(harness, "Checks pass.", {
    evidence: [{ label: "Unit tests pass", kind: "check", command: "bun test" }],
    acceptanceCriteria: [{ text: "Export button exists", status: "met" }],
  });

  // Open draft PR, then the checks: one failure, one repair turn, then green.
  await harness.tickUntilQuiet(3);
  expect(harness.github.calls).toContain("create-pr");
  const repairTurn = harness.runCalls.at(-1)!;
  expect(repairTurn.missionStage).toBeUndefined();
  expect(repairTurn.prompt).toContain("unit tests");
  harness.github.dirty = true;
  harness.github.checks = PASSING;
  harness.endTurn();
  await harness.tickUntilQuiet(4);

  // Ready for review asks first under plan and publishing.
  await signOff();
  await harness.tickUntilQuiet(2);
  return { harness, missionId, userActions };
}

describe("mission scenarios", () => {
  test("A1: a request reaches a ready PR with only the two sign-offs from the user", async () => {
    const { harness, missionId, userActions } = await runRequestToPr("claude-code");
    expect(userActions).toEqual(["sign-off:build", "sign-off:ready-for-review"]);
    expect(harness.mission(missionId).state).toBe("completed");
    expect(harness.github.calls.filter((call) => call === "create-pr")).toHaveLength(1);
    expect(harness.github.calls).toContain("mark-ready");
    // The repair was committed and pushed by Stave, then watched on its new head.
    expect(harness.github.commits.length).toBeGreaterThanOrEqual(2);

    const detail = await harness.runtime.get({ missionId });
    expect(detail.report?.outcome).toBe("completed");
    expect(detail.report?.links).toContainEqual(
      expect.objectContaining({ url: "https://github.com/acme/app/pull/9", source: "stave" }),
    );
    const evidence = detail.report!.stages.flatMap((stage) => stage.evidence);
    expect(evidence).toContainEqual(expect.objectContaining({ label: "Unit tests pass", source: "agent", freshness: "unknown" }));
    expect(evidence.some((item) => item.source === "stave" && /check/i.test(item.label))).toBe(true);
  });

  test("A4: a reply during a stage continues the mission; Take over pauses it", async () => {
    const harness = scenarioHarness("claude-code");
    const playbook = requestToPr();
    const detail = await harness.runtime.startMission({
      workspaceId: "ws-1",
      leadTaskId: "task-1",
      playbook,
      assignment: "Add CSV export.",
      consent: { checkIns: "when-stuck", permissionMode: "guided", authorizedEffectStageIds: [] },
    });
    const missionId = detail.mission.id;
    await harness.runtime.requestTick();
    harness.endTurn();
    // The user replies in the task instead of the agent reporting.
    harness.userTurn("user-turn-1");
    harness.endTurn("user-turn-1");
    await harness.runtime.requestTick();
    expect(harness.mission(missionId).state).toBe("running");
    expect(harness.runCalls.at(-1)!.retrievedContextParts[0]?.content ?? "").not.toBe("");

    await harness.runtime.takeOver({ missionId });
    await harness.runtime.requestTick();
    expect(harness.mission(missionId)).toMatchObject({ state: "paused", pauseReason: "taken-over" });
    const turnsBefore = harness.runCalls.length;
    harness.userTurn("user-turn-2");
    harness.endTurn("user-turn-2");
    await harness.runtime.requestTick();
    expect(harness.runCalls).toHaveLength(turnsBefore);
  });

  test("A5: the same request reaches a ready PR on a Codex lead task", async () => {
    const { harness, missionId, userActions } = await runRequestToPr("codex");
    expect(userActions).toEqual(["sign-off:build", "sign-off:ready-for-review"]);
    expect(harness.mission(missionId)).toMatchObject({ state: "completed", fingerprint: { providerId: "codex" } });
    // Mission turns run with the consent's permissions on Codex too.
    expect(harness.runCalls[0]!.runtimeOptions).toMatchObject({ codexApprovalPolicy: "untrusted" });
  });

  test("an agent with a three-stage workflow runs stage by stage, one report each", async () => {
    const harness = scenarioHarness("claude-code");
    const debuggerAgent = getBuiltinAgent("debugger")!;
    const detail = await harness.runtime.startMission(
      buildAgentRunStartInput({
        workspaceId: "ws-1",
        taskId: "task-1",
        agent: debuggerAgent,
        assignment: "The export button throws.",
        now: new Date(START),
      }),
    );
    const missionId = detail.mission.id;
    expect(detail.mission.playbook.stages.map((stage) => stage.id)).toEqual(["reproduce", "cause", "fix"]);
    await harness.runtime.requestTick();
    for (const stageId of ["reproduce", "cause", "fix"]) {
      expect(harness.current(missionId)).toMatchObject({ stageId, status: "running" });
      expect(harness.runCalls.at(-1)!.prompt).toContain(`: ${debuggerAgent.workflow!.find((stage) => stage.id === stageId)!.title}`);
      await report(harness, `Finished ${stageId}.`);
    }
    // Only when stuck: no sign-off between stages, and the run completes.
    expect(harness.mission(missionId).state).toBe("completed");
    const reported = harness.store.getAggregate(missionId)!.stages.filter((record) => record.report);
    expect(reported.map((record) => record.stageId).sort()).toEqual(["cause", "fix", "reproduce"]);
  });
});
