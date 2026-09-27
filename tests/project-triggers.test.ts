import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { MissionStore } from "../electron/persistence/mission-store";
import { ProjectStore } from "../electron/persistence/project-store";
import {
  createProjectRuntime,
  invokeProjectRuntime,
  type ProjectRuntimeDependencies,
} from "../electron/host-service/supervision/project-runtime";
import { createMission, replaceStageRecord } from "../src/lib/missions/domain";
import { DEFAULT_PROJECT_TRIGGERS, type ProjectTriggers } from "../src/lib/projects/domain";
import {
  buildCoordinatorWakePrompt,
  collectPendingTriggers,
  issueMatchesFilter,
  latestScheduleSlot,
  pullRequestTriggers,
  type ObservedIssue,
  type ProjectPullRequestSignal,
} from "../src/lib/projects/policy";
import { MISSION_NOW, starterPlaybook } from "./fixtures/mission-fixtures";

function harness() {
  const db = new Database(":memory:");
  const store = new ProjectStore(db);
  const missions = new MissionStore(db);
  let clock = new Date(MISSION_NOW);
  let busy = false;
  let pr: ProjectPullRequestSignal | null = null;
  const turns: Array<Parameters<ProjectRuntimeDependencies["runSupervisedTurn"]>[0]> = [];
  const runtime = createProjectRuntime({
    store,
    missions,
    startMission: async () => {
      throw new Error("unused");
    },
    getMissionReport: async () => null,
    getTaskSnapshot: async () => ({ exists: true, archived: false, providerId: "claude-code", model: "sonnet", activeTurnId: busy ? "t" : null }),
    runSupervisedTurn: async (turn) => {
      turns.push(turn);
      return { turnId: `turn-${turns.length}` };
    },
    resolveRepositoryPath: async () => "/tmp/repo",
    createMissionWorkspace: async () => ({ workspaceId: "ws" }),
    createIdleTask: async () => ({ taskId: "task" }),
    resolveProjectGrant: () => null,
    setCoordinatorTasks: () => {},
    readPullRequest: async () => pr,
    now: () => clock,
    setInterval: (() => 0) as unknown as typeof globalThis.setInterval,
    clearInterval: () => {},
  });

  async function create(triggers: Partial<ProjectTriggers>) {
    const detail = await runtime.create({
      name: "Move",
      goal: "Move every screen.",
      coordinator: { workspaceId: "ws-coord", taskId: "coord" },
      settings: { triggers: { ...DEFAULT_PROJECT_TRIGGERS, ...triggers } },
    });
    return detail.project.id;
  }

  /** A mission of the project that ended after opening a draft PR. */
  function endedMissionWithPullRequest(projectId: string) {
    const change = createMission({
      id: "mission-1",
      input: {
        workspaceId: "ws-m",
        leadTaskId: "task-m",
        playbook: starterPlaybook("request-to-pr"),
        assignment: "Move billing.",
        consent: { checkIns: "when-stuck", permissionMode: "guided", authorizedEffectStageIds: [] },
      },
      repositoryPath: "/tmp/repo",
      fingerprint: { providerId: "claude-code", model: "sonnet" },
      now: clock,
      projectId,
    });
    missions.create(change, clock);
    const record = {
      ...change.upserts[0]!,
      stageId: "open-draft-pr",
      status: "completed" as const,
      facts: { diff: null, commands: [], toolCalls: [], action: { type: "open-draft-pr" as const, prUrl: "https://github.com/acme/app/pull/9", prNumber: 9, created: true } },
    };
    missions.apply(
      { mission: { ...change.mission, state: "completed" }, upserts: replaceStageRecord([], record).filter((entry) => entry === record), events: [] },
      clock,
    );
  }

  return {
    runtime,
    store,
    turns,
    create,
    endedMissionWithPullRequest,
    setBusy: (value: boolean) => {
      busy = value;
    },
    setPullRequest: (value: ProjectPullRequestSignal | null) => {
      pr = value;
    },
    advance: (ms: number) => {
      clock = new Date(clock.getTime() + ms);
    },
    wakes: () => turns.slice(1).map((turn) => turn.prompt),
  };
}

const ISSUE = (key: string, patch: Partial<ObservedIssue> = {}): ObservedIssue => ({
  source: "jira",
  key,
  title: `Fix ${key}`,
  url: `https://acme.atlassian.net/browse/${key}`,
  labels: ["dashboard"],
  project: "ACME",
  createdAt: "2026-09-01T00:00:00.000Z",
  ...patch,
});

describe("project start conditions", () => {
  test("issues already assigned when watching starts never wake; a newly assigned one does, once", async () => {
    const h = harness();
    await h.create({ issueAssigned: true, issueFilter: "dashboard" });
    expect(await h.runtime.observeIssues({ items: [ISSUE("ACME-1")] })).toEqual({ triggered: 0 });
    await h.runtime.requestTick();
    expect(h.wakes()).toHaveLength(0);

    await h.runtime.observeIssues({ items: [ISSUE("ACME-1"), ISSUE("ACME-2"), ISSUE("ACME-3", { labels: ["billing"], title: "Other" })] });
    await h.runtime.requestTick();
    expect(h.wakes()).toHaveLength(1);
    expect(h.wakes()[0]).toContain("Issue assigned to the user: ACME-2 · Fix ACME-2");
    expect(h.wakes()[0]).not.toContain("ACME-3");

    await h.runtime.observeIssues({ items: [ISSUE("ACME-1"), ISSUE("ACME-2")] });
    await h.runtime.requestTick();
    expect(h.wakes()).toHaveLength(1);
  });

  test("an issue created after watching started wakes even on the first look", async () => {
    const h = harness();
    await h.create({ issueAssigned: true });
    await h.runtime.observeIssues({ items: [ISSUE("ACME-9", { createdAt: new Date(MISSION_NOW.getTime() + 60_000).toISOString() })] });
    await h.runtime.requestTick();
    expect(h.wakes()[0]).toContain("ACME-9");
  });

  test("pull request feedback on a mission's PR wakes the coordinator once per head, and a merge once", async () => {
    const h = harness();
    const projectId = await h.create({ pullRequestFeedback: true });
    h.endedMissionWithPullRequest(projectId);
    h.setPullRequest({ number: 9, url: "https://github.com/acme/app/pull/9", state: "OPEN", checks: "FAILURE", reviewDecision: null, headSha: "a1" });
    await h.runtime.requestTick();
    const firstWakes = h.wakes().filter((prompt) => prompt.includes("Pull request:"));
    expect(firstWakes).toHaveLength(1);
    expect(firstWakes[0]).toContain('#9 of "Move billing." has failing checks');

    // Same head, five minutes on: nothing new.
    h.advance(5 * 60_000);
    await h.runtime.requestTick();
    expect(h.wakes().filter((prompt) => prompt.includes("Pull request:"))).toHaveLength(1);

    h.advance(5 * 60_000);
    h.setPullRequest({ number: 9, url: "https://github.com/acme/app/pull/9", state: "MERGED", checks: "SUCCESS", reviewDecision: "APPROVED", headSha: "a2" });
    await h.runtime.requestTick();
    const merged = h.wakes().filter((prompt) => prompt.includes("merged"));
    expect(merged).toHaveLength(1);
  });

  test("a schedule wakes the coordinator at its next slot, never for slots before it was set", async () => {
    const h = harness();
    await h.create({ schedule: "daily" });
    await h.runtime.requestTick();
    expect(h.wakes()).toHaveLength(0);
    h.advance(25 * 60 * 60_000);
    await h.runtime.requestTick();
    expect(h.wakes()).toHaveLength(1);
    expect(h.wakes()[0]).toContain("Scheduled check-in: Every day at 09:00");
    await h.runtime.requestTick();
    expect(h.wakes()).toHaveLength(1);
  });

  test("triggers that fire while the coordinator is in a turn wait for it", async () => {
    const h = harness();
    await h.create({ issueAssigned: true });
    await h.runtime.observeIssues({ items: [] });
    h.setBusy(true);
    await h.runtime.observeIssues({ items: [ISSUE("ACME-5")] });
    await h.runtime.requestTick();
    expect(h.wakes()).toHaveLength(0);
    h.setBusy(false);
    await h.runtime.requestTick();
    expect(h.wakes()).toHaveLength(1);
  });

  test("turning a watch on starts it from now; changing the schedule restarts it", async () => {
    const h = harness();
    const projectId = await h.create({});
    const before = h.store.getProject(projectId)!.settings.triggers;
    expect(before).toMatchObject({ issueSince: null, scheduleSince: null });
    h.advance(60_000);
    await h.runtime.updateSettings({ projectId, settings: { triggers: { ...before, issueAssigned: true, schedule: "weekly" } } });
    const after = h.store.getProject(projectId)!.settings.triggers;
    expect(after.issueSince).toBe(new Date(MISSION_NOW.getTime() + 60_000).toISOString());
    expect(after.scheduleSince).toBe(after.issueSince);
    h.advance(60_000);
    // A stale client value never moves the start.
    await h.runtime.updateSettings({ projectId, settings: { triggers: { ...after, issueSince: null } } });
    expect(h.store.getProject(projectId)!.settings.triggers.issueSince).toBe(after.issueSince);
  });
});

describe("talking to the coordinator from the project", () => {
  test("a message starts a read-only coordinator turn; while it answers, another is refused", async () => {
    const h = harness();
    const projectId = await h.create({});
    const detail = await h.runtime.messageCoordinator({ projectId, text: "  Split billing into two missions.  " });
    const turn = h.turns.at(-1)!;
    expect(turn.prompt).toBe("Split billing into two missions.");
    expect(turn.runtimeOptions?.claudeDisallowedTools).toContain("Edit");
    expect(detail.coordinatorState).toMatchObject({ available: true, busy: false });

    h.setBusy(true);
    const refused = await invokeProjectRuntime(() => h.runtime.messageCoordinator({ projectId, text: "Again" }));
    expect(refused).toMatchObject({ ok: false, code: "stale" });
  });
});

describe("start condition policy", () => {
  test("schedule slots land on 09:00 local for day schedules and on four-hour marks", () => {
    const monday = new Date(2026, 8, 28, 8, 30);
    expect(latestScheduleSlot("off", monday)).toBeNull();
    expect(latestScheduleSlot("daily", monday)?.getDate()).toBe(27);
    // Before Monday 09:00 the latest weekday slot is Friday's.
    expect(latestScheduleSlot("weekdays", monday)?.getDay()).toBe(5);
    expect(latestScheduleSlot("weekly", new Date(2026, 8, 28, 9, 5))?.getHours()).toBe(9);
    expect(latestScheduleSlot("every-4h", new Date(2026, 8, 28, 10, 59))?.getHours()).toBe(8);
  });

  test("pending triggers exclude what a wake delivered and the issue baseline", () => {
    const event = (kind: string, detail: Record<string, unknown>, sequence: number) =>
      ({ id: `e${sequence}`, projectId: "p", sequence, kind, idempotencyKey: null, detail, createdAt: MISSION_NOW.toISOString() }) as never;
    const pending = collectPendingTriggers([
      event("trigger-observed", { triggerId: "issue:jira:A", triggerKind: "issue-assigned", summary: "A" }, 1),
      event("trigger-observed", { triggerId: "issue:jira:B", triggerKind: "issue-assigned", summary: "B" }, 2),
      event("trigger-observed", { baseline: true }, 3),
      event("coordinator-woken", { delivered: {}, triggers: ["issue:jira:A"] }, 4),
    ]);
    expect(pending.map((trigger) => trigger.id)).toEqual(["issue:jira:B"]);
    expect(buildCoordinatorWakePrompt([], pending)).toContain("Decide whether each belongs to this project's goal.");
  });

  test("an issue filter matches key, title, project or labels; a PR only speaks when there is news", () => {
    expect(issueMatchesFilter(ISSUE("ACME-1"), "")).toBe(true);
    expect(issueMatchesFilter(ISSUE("ACME-1"), "Dash")).toBe(true);
    expect(issueMatchesFilter(ISSUE("ACME-1"), "acme")).toBe(true);
    expect(issueMatchesFilter(ISSUE("ACME-1"), "billing")).toBe(false);
    const quiet = pullRequestTriggers({
      missionId: "m",
      missionTitle: "x",
      pr: { number: 1, url: "u", state: "OPEN", checks: "PENDING", reviewDecision: "REVIEW_REQUIRED", headSha: "h" },
    });
    expect(quiet).toEqual([]);
  });
});
