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
  /** While set, a pull request read waits for it, as a slow `gh` would. */
  let slowRead: Promise<void> | null = null;
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
    readPullRequest: async () => {
      if (slowRead) await slowRead;
      return pr;
    },
    now: () => clock,
    setInterval: (() => 0) as unknown as typeof globalThis.setInterval,
    clearInterval: () => {},
  });

  async function create(triggers: Partial<ProjectTriggers>, coordinatorTaskId = "coord") {
    const detail = await runtime.create({
      name: "Move",
      goal: "Move every screen.",
      coordinator: { workspaceId: "ws-coord", taskId: coordinatorTaskId },
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
    /** Holds pull request reads until the returned function releases them. */
    slowPullRequestReads: () => {
      let release!: () => void;
      slowRead = new Promise<void>((resolve) => {
        release = resolve;
      });
      return () => {
        slowRead = null;
        release();
      };
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
    await h.runtime.observeIssues({ items: [ISSUE("ACME-1")] });
    h.setBusy(true);
    await h.runtime.observeIssues({ items: [ISSUE("ACME-5")] });
    await h.runtime.requestTick();
    expect(h.wakes()).toHaveLength(0);
    h.setBusy(false);
    await h.runtime.requestTick();
    expect(h.wakes()).toHaveLength(1);
  });

  test("each source's first list is its own first look, and an empty list keeps it", async () => {
    const h = harness();
    await h.create({ issueAssigned: true });
    // Issues has not loaded yet; then only Crane syncs.
    await h.runtime.observeIssues({ items: [] });
    await h.runtime.observeIssues({ items: [ISSUE("CRN-1", { source: "crane" })] });
    // Jira syncs later: what it lists then was already assigned.
    await h.runtime.observeIssues({ items: [ISSUE("CRN-1", { source: "crane" }), ISSUE("ACME-1")] });
    await h.runtime.requestTick();
    expect(h.wakes()).toHaveLength(0);
    // Assigned since, though created before watching started: news.
    await h.runtime.observeIssues({ items: [ISSUE("CRN-1", { source: "crane" }), ISSUE("ACME-1"), ISSUE("ACME-2")] });
    await h.runtime.requestTick();
    expect(h.wakes()).toEqual([expect.stringContaining("ACME-2")]);
  });

  test("a first look takes in every assigned issue, and a changed filter looks again", async () => {
    const h = harness();
    const projectId = await h.create({ issueAssigned: true, issueFilter: "dashboard" });
    const billing = (key: string) => ISSUE(key, { labels: ["billing"], title: "Other" });
    await h.runtime.observeIssues({ items: [ISSUE("ACME-1"), billing("ACME-3")] });
    // Seen though outside the filter.
    expect(h.store.markTriggersSeen(projectId, ["issue:jira:ACME-3"], MISSION_NOW)).toEqual([]);
    // Assigned after the first look, outside the filter.
    await h.runtime.observeIssues({ items: [ISSUE("ACME-1"), billing("ACME-3"), billing("ACME-4")] });

    const before = h.store.getProject(projectId)!.settings.triggers;
    h.advance(60_000);
    await h.runtime.updateSettings({ projectId, settings: { triggers: { ...before, issueFilter: " Dashboard " } } });
    expect(h.store.getProject(projectId)!.settings.triggers.issueSince).toBe(before.issueSince);
    await h.runtime.updateSettings({ projectId, settings: { triggers: { ...before, issueFilter: "" } } });
    expect(h.store.getProject(projectId)!.settings.triggers.issueSince).toBe(new Date(MISSION_NOW.getTime() + 60_000).toISOString());
    await h.runtime.observeIssues({ items: [ISSUE("ACME-1"), billing("ACME-3"), billing("ACME-4")] });
    await h.runtime.requestTick();
    expect(h.wakes()).toHaveLength(0);
  });

  test("a slow pull request read never holds up the project's commands", async () => {
    const h = harness();
    const projectId = await h.create({ pullRequestFeedback: true });
    h.endedMissionWithPullRequest(projectId);
    h.setPullRequest({ number: 9, url: "https://github.com/acme/app/pull/9", state: "OPEN", checks: "FAILURE", reviewDecision: null, headSha: "a1" });
    const release = h.slowPullRequestReads();
    const tick = h.runtime.requestTick();
    let paused = false;
    const pausing = h.runtime.pause({ projectId }).then(() => {
      paused = true;
    });
    for (let wait = 0; wait < 50 && !paused; wait += 1) await Bun.sleep(1);
    expect(paused).toBe(true);
    release();
    await Promise.all([tick, pausing]);
    // Read while it was active; recorded only for a project still active.
    expect(h.wakes()).toHaveLength(0);
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

describe("quitting and relaunching", () => {
  test("quitting pauses active projects; relaunching resumes only those, with the schedule starting over", async () => {
    const h = harness();
    const running = await h.create({ schedule: "daily" });
    const held = await h.create({}, "coord-2");
    await h.runtime.pause({ projectId: held });
    h.runtime.start();
    h.runtime.stop();
    expect(h.store.getProject(running)).toMatchObject({ state: "paused" });
    expect(h.store.getProject(running)!.reasonDetail).toContain("Stave was closed");
    expect(h.store.getProject(held)).toMatchObject({ state: "paused", reasonDetail: "Paused by you." });

    // A day passes while Stave is closed; the missed check-in does not fire.
    h.advance(26 * 60 * 60_000);
    h.runtime.start();
    expect(h.store.getProject(running)).toMatchObject({ state: "active", reasonDetail: null });
    expect(h.store.getProject(held)).toMatchObject({ state: "paused" });
    await h.runtime.requestTick();
    expect(h.wakes().filter((prompt) => prompt.includes("Scheduled check-in"))).toHaveLength(0);
    h.runtime.stop();
  });
});

describe("end date", () => {
  test("a project past its end date expires on its own and stops waking its coordinator", async () => {
    const h = harness();
    const projectId = await h.create({ schedule: "every-4h" });
    await h.runtime.updateSettings({ projectId, settings: { endsAt: new Date(MISSION_NOW.getTime() + 60 * 60_000).toISOString() } });
    await h.runtime.requestTick();
    expect(h.store.getProject(projectId)!.state).toBe("active");
    h.advance(5 * 60 * 60_000);
    await h.runtime.requestTick();
    const project = h.store.getProject(projectId)!;
    expect(project.state).toBe("expired");
    expect(project.reasonDetail).toContain("Reached its end date");
    expect(h.wakes()).toHaveLength(0);
    const refused = await invokeProjectRuntime(() => h.runtime.pause({ projectId }));
    expect(refused).toMatchObject({ ok: false });
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
