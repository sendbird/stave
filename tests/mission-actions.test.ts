import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  createMissionActionExecutor,
  type MissionPullRequest,
  type MissionScmPort,
  type ScmStep,
} from "../electron/host-service/supervision/mission-actions";
import { MissionStore } from "../electron/persistence/mission-store";
import type { PullRequestCheck } from "../src/lib/missions/checks";
import {
  buildMissionActionKey,
  createMission,
  createStageRecord,
  type MissionAggregate,
} from "../src/lib/missions/domain";
import { CHECKS_REPAIR_COMMIT_MESSAGE } from "../src/lib/missions/pull-request-draft";
import { PlaybookSchema, type PlaybookStage } from "../src/lib/playbooks/schema";

const START = "2026-09-26T10:00:00.000Z";
const OK: ScmStep = { ok: true, value: true };

const STAGES: PlaybookStage[] = [
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
  const playbook = PlaybookSchema.parse({
    version: 1,
    id: "playbook_actions",
    name: "Actions playbook",
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
      playbook,
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

const PASSING: PullRequestCheck[] = [{ name: "unit tests", state: "SUCCESS" }];
const FAILING: PullRequestCheck[] = [
  { name: "unit tests", state: "FAILURE", link: "https://github.com/acme/app/actions/runs/2/job/22" },
];

function createHarness() {
  const store = new MissionStore(new Database(":memory:"));
  let clock = new Date(START);
  const calls: string[] = [];
  const state = {
    branch: "feature/csv" as string | null,
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
    readCommitLog: async () => ({ baseBranch: "main", log: "a1b2c3d feat(billing): add csv export" }),
  };
  const perform = createMissionActionExecutor({
    store,
    scm,
    resolveWorkspacePath: async () => "/tmp/repo-ws",
    now: () => clock,
  });
  return {
    store,
    state,
    calls,
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
    harness.store.recordEvent(
      "mission-2",
      {
        kind: "turn-started",
        idempotencyKey: "mission-2:watch:1:turn:2",
        detail: { stageId: "watch", attempt: 1, reason: "repair-checks" },
      },
      new Date(START),
    );
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
    harness.store.recordEvent(
      "mission-2",
      {
        kind: "turn-started",
        idempotencyKey: "mission-2:watch:1:turn:2",
        detail: { stageId: "watch", attempt: 1, reason: "repair-checks" },
      },
      new Date(START),
    );
    // The repair made no change: nothing to commit or push, and the checks
    // still fail on the same head.
    expect(await harness.perform(aggregate)).toEqual({ status: "in-progress" });
    harness.advance(61_000);
    expect(await harness.perform(aggregate)).toEqual({
      status: "failed",
      detail: "Checks still fail after 1 repair: unit tests.",
    });
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
