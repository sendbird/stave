import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  classifyMissionTurnEnding,
  createMissionActionExecutor,
  type MissionPullRequest,
  type MissionScmPort,
  type MissionTurnEnding,
  type ScmStep,
} from "../electron/host-service/supervision/mission-actions";
import { MissionStore } from "../electron/persistence/mission-store";
import type { PersistedTurnStreamEvent } from "../electron/persistence/turn-event-payload";
import type { PullRequestCheck } from "../src/lib/missions/checks";
import {
  buildMissionActionKey,
  buildMissionTurnOutcomeKey,
  createMission,
  createStageRecord,
  type MissionAggregate,
} from "../src/lib/missions/domain";
import { CHECKS_REPAIR_COMMIT_MESSAGE } from "../src/lib/missions/pull-request-draft";
import { WorkflowSchema, type WorkflowStage } from "../src/lib/workflows/schema";

const START = "2026-09-26T10:00:00.000Z";
const OK: ScmStep = { ok: true, value: true };

const STAGES: WorkflowStage[] = [
  {
    id: "build",
    title: "Build",
    kind: "ai",
    instruction: "Build it.",
    doneWhen: "It is built.",
  },
  { id: "open-pr", title: "Open draft PR", kind: "action", action: { type: "open-draft-pr" } },
  {
    id: "watch",
    title: "Watch checks",
    kind: "action",
    action: { type: "watch-checks", repairAttempts: 1, timeoutMinutes: 30 },
  },
  { id: "ready", title: "Ready for review", kind: "action", action: { type: "mark-pr-ready" } },
];

/** The mission with Build completed and the stage at `index` running. */
function missionAt(store: MissionStore, index: number): MissionAggregate {
  const workflow = WorkflowSchema.parse({
    version: 1,
    id: "workflow_actions",
    name: "Actions workflow",
    purpose: "Ship the change.",
    checkIns: "when-stuck",
    team: "solo",
    stages: STAGES,
    createdAt: START,
    updatedAt: START,
  });
  const change = createMission({
    id: `mission-${index}`,
    input: {
      workspaceId: "ws-1",
      leadTaskId: "task-1",
      workflow,
      assignment: "Add CSV export to the billing page.",
      consent: {
        checkIns: "when-stuck",
        permissionMode: "guided",
        authorizedEffectStageIds: ["open-pr", "watch", "ready"],
      },
    },
    repositoryPath: "/tmp/repo",
    fingerprint: { providerId: "claude-code", model: "sonnet" },
    now: new Date(START),
  });
  store.create(change, new Date(START));
  const build = {
    ...change.upserts[0]!,
    status: "completed" as const,
    report: {
      outcome: "complete" as const,
      summary: "Built the export.",
      decisions: [],
      evidence: [],
      artifacts: [],
      reportedAt: START,
      turnId: "turn-1",
    },
    reportRevision: 1,
  };
  const current = {
    ...createStageRecord({ missionId: change.mission.id, stageId: STAGES[index]!.id, attempt: 1 }),
    status: "running" as const,
    startedAt: START,
  };
  return {
    mission: { ...change.mission, currentStageIndex: index },
    stages: [build, current],
  };
}

function pr(overrides: Partial<MissionPullRequest> = {}): MissionPullRequest {
  return {
    number: 7,
    url: "https://github.com/acme/app/pull/7",
    state: "OPEN",
    isDraft: true,
    headRefOid: "head-1",
    mergeable: "MERGEABLE",
    mergeStateStatus: "BLOCKED",
    reviewDecision: "REVIEW_REQUIRED",
    ...overrides,
  };
}

/** What the runtime records around a checks repair turn it starts. */
function recordRepairTurn(
  store: MissionStore,
  missionId: string,
  outcome: "linked" | "failed" | "interrupted",
  turn = 2,
): string | null {
  const turnKey = `${missionId}:watch:1:turn:${turn}`;
  const identity = { stageId: "watch", attempt: 1 };
  const at = new Date(START);
  store.recordEvent(
    missionId,
    { kind: "turn-started", idempotencyKey: turnKey, detail: { ...identity, reason: "repair-checks" } },
    at,
  );
  if (outcome === "failed") {
    store.recordEvent(
      missionId,
      {
        kind: "turn-failed",
        idempotencyKey: buildMissionTurnOutcomeKey(turnKey, "failed"),
        detail: { ...identity, detail: "provider unavailable" },
      },
      at,
    );
    return null;
  }
  const turnId = `repair-turn-${turn}`;
  store.recordEvent(
    missionId,
    {
      kind: "turn-linked",
      idempotencyKey: buildMissionTurnOutcomeKey(turnKey, "linked"),
      detail: { missionId, ...identity, turnId },
    },
    at,
  );
  if (outcome === "interrupted") {
    store.recordEvent(
      missionId,
      {
        kind: "turn-interrupted",
        idempotencyKey: buildMissionTurnOutcomeKey(turnKey, "interrupted"),
        detail: { ...identity, turnId },
      },
      at,
    );
  }
  return turnId;
}

const PASSING: PullRequestCheck[] = [{ name: "unit tests", state: "SUCCESS" }];
const FAILING: PullRequestCheck[] = [
  { name: "unit tests", state: "FAILURE", link: "https://github.com/acme/app/actions/runs/2/job/22" },
];

function createHarness() {
  const store = new MissionStore(new Database(":memory:"));
  let clock = new Date(START);
  const calls: string[] = [];
  const turnEndings = new Map<string, MissionTurnEnding>();
  const state = {
    branch: "feature/csv" as string | null,
    base: "main",
    head: "head-1",
    dirty: false,
    unpushed: false,
    pr: null as MissionPullRequest | null,
    checks: [] as PullRequestCheck[],
    push: OK as ScmStep,
    readPr: null as ScmStep<MissionPullRequest | null> | null,
    readChecks: null as ScmStep<PullRequestCheck[]> | null,
    createResult: null as ScmStep<{ url: string; created: boolean }> | null,
    drafts: [] as Array<{ title: string; body: string }>,
    commits: [] as string[],
  };
  const scm: MissionScmPort = {
    currentBranch: async () => state.branch,
    headSha: async () => state.head,
    hasUncommittedChanges: async () => state.dirty,
    commitAll: async (_cwd, message) => {
      calls.push("commit");
      state.commits.push(message);
      state.dirty = false;
      state.unpushed = true;
      state.head = `head-${state.commits.length + 1}`;
      return OK;
    },
    hasUnpushedCommits: async () => state.unpushed,
    push: async () => {
      calls.push("push");
      if (state.push.ok) state.unpushed = false;
      return state.push;
    },
    readPullRequest: async () => {
      calls.push("read-pr");
      return state.readPr ?? { ok: true, value: state.pr };
    },
    createDraftPullRequest: async (_cwd, draft) => {
      calls.push("create-pr");
      state.drafts.push(draft);
      return state.createResult ?? { ok: true, value: { url: "https://github.com/acme/app/pull/9", created: true } };
    },
    markReady: async () => {
      calls.push("mark-ready");
      return OK;
    },
    readChecks: async () => {
      calls.push("read-checks");
      return state.readChecks ?? { ok: true, value: state.checks };
    },
    readBaseBranch: async () => state.base,
    readCommitLog: async () => ({ baseBranch: state.base, log: "a1b2c3d feat(billing): add csv export" }),
  };
  const perform = createMissionActionExecutor({
    store,
    scm,
    resolveWorkspacePath: async () => "/tmp/repo-ws",
    readTurnEnding: (turnId) => turnEndings.get(turnId) ?? "completed",
    now: () => clock,
  });
  return {
    store,
    state,
    calls,
    turnEndings,
    perform: (aggregate: MissionAggregate) => perform({ aggregate }),
    advance: (ms: number) => {
      clock = new Date(clock.getTime() + ms);
    },
    keys: (missionId: string) =>
      store
        .listEventsByKind(missionId, ["action-started", "action-finished"])
        .map((event) => event.idempotencyKey),
  };
}

describe("Open draft PR", () => {
  test("commits what was left, pushes, and opens a draft from the mission", async () => {
    const harness = createHarness();
    const aggregate = missionAt(harness.store, 1);
    harness.state.dirty = true;
    const outcome = await harness.perform(aggregate);
    expect(outcome).toEqual({
      status: "succeeded",
      result: {
        type: "open-draft-pr",
        prUrl: "https://github.com/acme/app/pull/9",
        prNumber: 9,
        created: true,
      },
    });
    expect(harness.calls).toEqual(["read-pr", "commit", "push", "create-pr"]);
    expect(harness.state.commits).toEqual(["chore: add CSV export to the billing page"]);
    expect(harness.state.drafts[0]?.title).toBe("feat(billing): add csv export");
    expect(harness.state.drafts[0]?.body).toContain("- **Build:** Built the export.");
    const key = buildMissionActionKey({ missionId: "mission-1", stageId: "open-pr", attempt: 1 });
    expect(harness.keys("mission-1")).toEqual([key, `${key}:finished`]);
  });

  test("after a restart, an existing pull request is adopted instead of opening another", async () => {
    const harness = createHarness();
    const aggregate = missionAt(harness.store, 1);
    const key = buildMissionActionKey({ missionId: "mission-1", stageId: "open-pr", attempt: 1 });
    harness.store.recordEvent(
      "mission-1",
      { kind: "action-started", idempotencyKey: key, detail: { stageId: "open-pr", attempt: 1 } },
      new Date(START),
    );
    harness.state.pr = pr();
    expect(await harness.perform(aggregate)).toEqual({
      status: "succeeded",
      result: { type: "open-draft-pr", prUrl: pr().url, prNumber: 7, created: false },
    });
    expect(harness.calls).toEqual(["read-pr"]);
    expect(harness.keys("mission-1").filter((value) => value === key)).toHaveLength(1);
  });

  test("an existing pull request gets what was left and the unpushed commits before it is adopted", async () => {
    // After "Ask for changes", Verify reran and left work behind; the branch
    // already has the pull request from the first attempt.
    const harness = createHarness();
    harness.state.pr = pr();
    harness.state.dirty = true;
    expect(await harness.perform(missionAt(harness.store, 1))).toEqual({
      status: "succeeded",
      result: { type: "open-draft-pr", prUrl: pr().url, prNumber: 7, created: false },
    });
    expect(harness.calls).toEqual(["read-pr", "commit", "push"]);

    // Commits made by hand are pushed too, and a second pull request is never opened.
    const ahead = createHarness();
    ahead.state.pr = pr();
    ahead.state.unpushed = true;
    await ahead.perform(missionAt(ahead.store, 1));
    expect(ahead.calls).toEqual(["read-pr", "push"]);
    expect(ahead.state.unpushed).toBe(false);
  });

  test("refuses the base branch before committing or pushing anything", async () => {
    const harness = createHarness();
    harness.state.branch = "main";
    harness.state.dirty = true;
    expect(await harness.perform(missionAt(harness.store, 1))).toEqual({
      status: "failed",
      detail:
        "The workspace is on main, the base branch, so Stave will not commit or push to it. Move the work to a feature branch, then retry this stage.",
    });
    expect(harness.calls).toEqual([]);
    expect(harness.state.commits).toEqual([]);
  });

  test("a pull request gh reports as existing is adopted", async () => {
    const harness = createHarness();
    harness.state.createResult = {
      ok: true,
      value: { url: "https://github.com/acme/app/pull/12", created: false },
    };
    const outcome = await harness.perform(missionAt(harness.store, 1));
    expect(outcome).toMatchObject({ status: "succeeded", result: { prNumber: 12, created: false } });
  });

  test("missing authentication or a refused push blocks with the sentence", async () => {
    const auth = createHarness();
    auth.state.readPr = { ok: false, detail: "GitHub CLI is not authenticated. Run `gh auth login` first." };
    expect(await auth.perform(missionAt(auth.store, 1))).toEqual({
      status: "failed",
      detail: "GitHub CLI is not authenticated. Run `gh auth login` first.",
    });
    const push = createHarness();
    push.state.push = { ok: false, detail: "The branch is protected, so Stave cannot push to it." };
    expect(await push.perform(missionAt(push.store, 1))).toEqual({
      status: "failed",
      detail: "The branch is protected, so Stave cannot push to it.",
    });
    expect(push.calls).not.toContain("create-pr");
  });
});

describe("Ready for review", () => {
  test("marks a draft ready and leaves a ready one alone", async () => {
    const draft = createHarness();
    draft.state.pr = pr();
    expect(await draft.perform(missionAt(draft.store, 3))).toEqual({
      status: "succeeded",
      result: { type: "mark-pr-ready", prUrl: pr().url },
    });
    expect(draft.calls).toEqual(["read-pr", "mark-ready"]);

    const ready = createHarness();
    ready.state.pr = pr({ isDraft: false });
    await ready.perform(missionAt(ready.store, 3));
    expect(ready.calls).toEqual(["read-pr"]);
  });

  test("pushes the workspace's HEAD before marking ready when the pull request lacks it", async () => {
    const harness = createHarness();
    harness.state.pr = pr({ headRefOid: "head-0" });
    harness.state.unpushed = true;
    const aggregate = missionAt(harness.store, 3);
    expect(await harness.perform(aggregate)).toEqual({ status: "in-progress" });
    expect(harness.calls).toEqual(["read-pr", "push"]);

    // GitHub moved the pull request to the pushed head.
    harness.state.pr = pr({ headRefOid: "head-1" });
    harness.advance(5_000);
    expect(await harness.perform(aggregate)).toEqual({
      status: "succeeded",
      result: { type: "mark-pr-ready", prUrl: pr().url },
    });
    expect(harness.calls.slice(2)).toEqual(["read-pr", "mark-ready"]);
  });

  test("a pull request that never shows the workspace's HEAD blocks instead of being marked ready", async () => {
    const harness = createHarness();
    harness.state.pr = pr({ headRefOid: "0123456789abcdef" });
    harness.state.head = "fedcba9876543210";
    const aggregate = missionAt(harness.store, 3);
    expect(await harness.perform(aggregate)).toEqual({ status: "in-progress" });
    harness.advance(2 * 60_000);
    expect(await harness.perform(aggregate)).toEqual({
      status: "failed",
      detail:
        "The pull request's head is 0123456, not this workspace's fedcba9. Push or pull so they match, then retry this stage.",
    });
    expect(harness.calls).not.toContain("mark-ready");
  });
});

describe("Watch checks", () => {
  test("passing checks complete it, and the observation is recorded", async () => {
    const harness = createHarness();
    harness.state.pr = pr();
    harness.state.checks = PASSING;
    const outcome = await harness.perform(missionAt(harness.store, 2));
    expect(outcome).toMatchObject({
      status: "succeeded",
      result: { type: "watch-checks", outcome: "passed", checks: [{ name: "unit tests", state: "SUCCESS" }] },
    });
    const observed = harness.store.listEventsByKind("mission-2", ["checks-observed"]);
    expect(observed[0]?.detail).toMatchObject({ kind: "passed", headSha: "head-1", stageId: "watch" });
  });

  test("reads GitHub at most once a minute", async () => {
    const harness = createHarness();
    harness.state.pr = pr();
    harness.state.checks = [{ name: "unit tests", state: "IN_PROGRESS" }];
    const aggregate = missionAt(harness.store, 2);
    expect(await harness.perform(aggregate)).toEqual({ status: "in-progress" });
    harness.advance(5_000);
    expect(await harness.perform(aggregate)).toEqual({ status: "in-progress" });
    expect(harness.calls.filter((call) => call === "read-checks")).toHaveLength(1);
    harness.advance(60_000);
    await harness.perform(aggregate);
    expect(harness.calls.filter((call) => call === "read-checks")).toHaveLength(2);
    // An unchanged observation is recorded once.
    expect(harness.store.listEventsByKind("mission-2", ["checks-observed"])).toHaveLength(1);
  });

  test("a failure asks for a repair; the repair is committed, pushed and watched on its new head", async () => {
    const harness = createHarness();
    harness.state.pr = pr();
    harness.state.checks = FAILING;
    const aggregate = missionAt(harness.store, 2);
    const first = await harness.perform(aggregate);
    expect(first).toMatchObject({ status: "needs-turn", reason: "repair-checks" });

    // The runtime starts the repair turn and records it; the turn edits files.
    recordRepairTurn(harness.store, "mission-2", "linked");
    harness.state.dirty = true;
    harness.advance(10_000);
    expect(await harness.perform(aggregate)).toEqual({ status: "in-progress" });
    expect(harness.state.commits).toEqual([CHECKS_REPAIR_COMMIT_MESSAGE]);
    expect(harness.calls.slice(-2)).toEqual(["commit", "push"]);

    // GitHub has not moved the pull request to the pushed head yet.
    harness.advance(1_000);
    expect(await harness.perform(aggregate)).toEqual({ status: "in-progress" });

    harness.state.pr = pr({ headRefOid: harness.state.head });
    harness.state.checks = PASSING;
    harness.advance(61_000);
    expect(await harness.perform(aggregate)).toMatchObject({
      status: "succeeded",
      result: { outcome: "passed" },
    });
  });

  test("checks that still fail after the last repair block the stage", async () => {
    const harness = createHarness();
    harness.state.pr = pr();
    harness.state.checks = FAILING;
    const aggregate = missionAt(harness.store, 2);
    recordRepairTurn(harness.store, "mission-2", "linked");
    // The repair made no change: nothing to commit or push, and the checks
    // still fail on the same head.
    expect(await harness.perform(aggregate)).toEqual({ status: "in-progress" });
    harness.advance(61_000);
    expect(await harness.perform(aggregate)).toEqual({
      status: "failed",
      detail: "Checks still fail after 1 repair: unit tests.",
    });
  });

  test("a repair turn that did not finish pushes nothing and marks the stage stuck", async () => {
    const cases: Array<{ outcome: "interrupted" | "stopped" | "failed"; detail: string }> = [
      { outcome: "interrupted", detail: "Stave stopped while the checks repair turn ran" },
      { outcome: "stopped", detail: "The checks repair turn was stopped before it finished" },
      { outcome: "failed", detail: "The checks repair turn failed" },
    ];
    for (const { outcome, detail } of cases) {
      const harness = createHarness();
      harness.state.pr = pr();
      harness.state.checks = FAILING;
      const turnId = recordRepairTurn(harness.store, "mission-2", outcome === "interrupted" ? "interrupted" : "linked");
      if (outcome !== "interrupted") harness.turnEndings.set(turnId!, outcome);
      // The tree holds half a repair, or the user's own edits.
      harness.state.dirty = true;
      const result = await harness.perform(missionAt(harness.store, 2));
      expect(result.status).toBe("stuck");
      expect(result.status === "stuck" ? result.detail : "").toContain(detail);
      expect(harness.calls).not.toContain("commit");
      expect(harness.calls).not.toContain("push");
    }
  });

  test("a repair turn that never started is not a repair, so nothing is pushed", async () => {
    const harness = createHarness();
    harness.state.pr = pr();
    harness.state.checks = FAILING;
    recordRepairTurn(harness.store, "mission-2", "failed");
    // The user worked in the task meanwhile.
    harness.state.dirty = true;
    const outcome = await harness.perform(missionAt(harness.store, 2));
    // The one repair the stage allows is still available.
    expect(outcome).toMatchObject({ status: "needs-turn", reason: "repair-checks" });
    expect(harness.calls).not.toContain("commit");
    expect(harness.calls).not.toContain("push");
  });

  test("checks are read for the head Open draft PR pushed, not the one before it", async () => {
    const harness = createHarness();
    // GitHub still reports the previous head, whose checks passed.
    harness.state.pr = pr({ headRefOid: "head-0" });
    harness.state.checks = PASSING;
    const aggregate = missionAt(harness.store, 2);
    expect(await harness.perform(aggregate)).toEqual({ status: "in-progress" });
    expect(harness.calls).not.toContain("read-checks");

    harness.state.pr = pr({ headRefOid: "head-1" });
    harness.advance(61_000);
    expect(await harness.perform(aggregate)).toMatchObject({ status: "succeeded" });
  });

  test("no checks completes after the grace period", async () => {
    const harness = createHarness();
    harness.state.pr = pr();
    const aggregate = missionAt(harness.store, 2);
    expect(await harness.perform(aggregate)).toEqual({ status: "in-progress" });
    harness.advance(3 * 60_000);
    expect(await harness.perform(aggregate)).toMatchObject({
      status: "succeeded",
      result: { outcome: "no-checks" },
    });
  });

  test("changes requested are recorded without stopping the watch", async () => {
    const harness = createHarness();
    harness.state.pr = pr({ reviewDecision: "CHANGES_REQUESTED" });
    harness.state.checks = PASSING;
    expect(await harness.perform(missionAt(harness.store, 2))).toMatchObject({ status: "succeeded" });
    const observed = harness.store.listEventsByKind("mission-2", ["checks-observed"]);
    expect(observed[0]?.detail.reviewDecision).toBe("CHANGES_REQUESTED");
  });

  test("a few failed reads are waited out; a run of them blocks the stage", async () => {
    const harness = createHarness();
    harness.state.readPr = { ok: false, detail: "HTTP 502" };
    const aggregate = missionAt(harness.store, 2);
    for (let read = 0; read < 2; read += 1) {
      expect(await harness.perform(aggregate)).toEqual({ status: "in-progress" });
      harness.advance(61_000);
    }
    expect(await harness.perform(aggregate)).toEqual({
      status: "failed",
      detail: "Stave could not read the pull request's checks: HTTP 502",
    });
  });
});

describe("how a repair turn ended", () => {
  const done = (stopReason?: string): PersistedTurnStreamEvent => ({
    sequence: 2,
    eventType: "done",
    event: { type: "done", ...(stopReason ? { stop_reason: stopReason } : {}) },
    truncated: false,
  });
  const text: PersistedTurnStreamEvent = {
    sequence: 1,
    eventType: "text",
    event: { type: "text", text: "Fixed the test." },
    truncated: false,
  };

  test("reads the turn's done event, and a turn closed without one was stopped", () => {
    expect(classifyMissionTurnEnding([text, done("end_turn")])).toBe("completed");
    expect(classifyMissionTurnEnding([text, done()])).toBe("completed");
    expect(classifyMissionTurnEnding([text, done("user_abort")])).toBe("stopped");
    expect(classifyMissionTurnEnding([text, done("runtime_failure")])).toBe("failed");
    expect(classifyMissionTurnEnding([text])).toBe("stopped");
    expect(classifyMissionTurnEnding([])).toBe("stopped");
  });
});
