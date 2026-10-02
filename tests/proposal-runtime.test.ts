import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MissionStore } from "../electron/persistence/mission-store";
import {
  createProposalRuntime,
  invokeProposalRuntime,
  type ProposalRuntimeDependencies,
} from "../electron/host-service/supervision/proposal-runtime";
import { ProposedMissionsPanel } from "../src/components/layout/issues/ProposedMissionsPanel";
import { describeMissingWorkspace, describeProposalStart } from "../src/components/layout/issues/useProposalActions";
import type { MissionDetail } from "../src/lib/missions/api";
import { createMission, currentStageRecord, type MissionStartInput } from "../src/lib/missions/domain";
import type { ObservedPullRequest, ProposedMission } from "../src/lib/missions/proposed";
import type { Playbook } from "../src/lib/playbooks/schema";
import { summarizeWatching } from "../src/lib/playbooks/starts-when";
import type { ObservedIssue } from "../src/lib/projects/policy";
import { pullRequestWatchKey, toObservedPullRequest } from "../src/store/proposals-store";
import { MISSION_NOW, starterPlaybook } from "./fixtures/mission-fixtures";

const SINCE = "2026-09-26T09:00:00.000Z";
const DAY_MS = 24 * 60 * 60_000;

function issue(key: string, createdAt: string, labels: string[] = [], source = "crane"): ObservedIssue {
  return { source, key, title: `Fix ${key}`, url: `https://${source}.example/${key}`, labels, project: "WEB", createdAt };
}

function pullRequest(patch: Partial<ObservedPullRequest> = {}): ObservedPullRequest {
  return {
    number: 612,
    url: "https://github.com/acme/web/pull/612",
    title: "Move billing",
    state: "OPEN",
    checks: "FAILURE",
    reviewDecision: null,
    headSha: "abc",
    ...patch,
  };
}

function withStartsWhen(playbook: Playbook, startsWhen: Playbook["startsWhen"]): Playbook {
  return { ...playbook, startsWhen };
}

type Grant = NonNullable<ReturnType<ProposalRuntimeDependencies["resolveMissionGrant"]>>;

function harness(options: { failStart?: boolean } = {}) {
  const db = new Database(":memory:");
  const store = new MissionStore(db);
  let clock = new Date(MISSION_NOW);
  const starts: MissionStartInput[] = [];
  const tasks: Array<{ workspaceId: string; title: string }> = [];
  const changes: number[] = [];
  const grants = new Map<string, Grant>();
  const deps: ProposalRuntimeDependencies = {
    store,
    startMission: async (input) => {
      if (options.failStart) throw new Error("The provider is not signed in.");
      starts.push(input);
      return { mission: { id: `mission-${starts.length}` } } as unknown as MissionDetail;
    },
    createIdleTask: async (task) => {
      tasks.push(task);
      return { taskId: `task-${tasks.length}` };
    },
    resolveMissionGrant: (key) => grants.get(key) ?? null,
    resolveWorkspaceRepository: async (workspaceId) => (workspaceId === "ws" ? "/tmp/web" : null),
    emitChanged: () => changes.push(1),
    now: () => clock,
    setInterval: (() => 0) as unknown as typeof globalThis.setInterval,
    clearInterval: () => {},
  };
  const runtime = createProposalRuntime(deps);
  return {
    store,
    runtime,
    starts,
    tasks,
    changes,
    grants,
    now: () => clock,
    /** The workspace's mission ends, so start conditions may act there again. */
    free(workspaceId: string) {
      db.prepare("UPDATE missions SET state = 'completed' WHERE workspace_id = ?").run(workspaceId);
    },
    advance(ms: number) {
      clock = new Date(clock.getTime() + ms);
    },
    at(iso: string) {
      clock = new Date(iso);
    },
    /** An active mission in the workspace, so start conditions leave it alone. */
    busy(workspaceId: string) {
      const change = createMission({
        id: `busy-${workspaceId}`,
        input: {
          workspaceId,
          leadTaskId: "lead",
          playbook: starterPlaybook("request-to-pr"),
          assignment: "Other work.",
          consent: { checkIns: "when-stuck", permissionMode: "guided", authorizedEffectStageIds: [] },
        },
        repositoryPath: "/tmp/repo",
        fingerprint: { providerId: "claude-code", model: "sonnet" },
        now: clock,
      });
      store.create(change, clock);
    },
  };
}

async function pending(runtime: ReturnType<typeof harness>["runtime"]) {
  return (await runtime.list({ state: "pending" })).proposals;
}

describe("assigned issues", () => {
  test("the first look takes in what was assigned before; only issues created since propose", async () => {
    const h = harness();
    h.runtime.setPlaybooks([withStartsWhen(starterPlaybook("request-to-pr"), { issueAssigned: { filter: "", since: SINCE } })]);
    const before = issue("WEB-1", "2026-09-20T00:00:00.000Z");
    const after = issue("WEB-2", "2026-09-26T09:30:00.000Z");
    expect(await h.runtime.observeIssues({ items: [before, after] })).toEqual({ proposed: 1 });
    expect(await h.runtime.observeIssues({ items: [before, after] })).toEqual({ proposed: 0 });

    const later = issue("WEB-3", "2026-09-26T09:40:00.000Z");
    expect(await h.runtime.observeIssues({ items: [before, after, later] })).toEqual({ proposed: 1 });
    const proposals = await pending(h.runtime);
    expect(proposals.map((proposal) => proposal.issue?.key).sort()).toEqual(["WEB-2", "WEB-3"]);
    expect(proposals[0]).toMatchObject({ source: "issue", playbookId: "playbook_request_to_pr", workspaceId: null, detail: "Assigned to you" });
    expect(h.starts).toHaveLength(0);
  });

  test("a filter narrows which issues propose, and demand follows the playbooks", async () => {
    const h = harness();
    expect(await h.runtime.issueDemand()).toEqual({ watching: false });
    h.runtime.setPlaybooks([withStartsWhen(starterPlaybook("request-to-pr"), { issueAssigned: { filter: "bug", since: SINCE } })]);
    expect(await h.runtime.issueDemand()).toEqual({ watching: true });
    await h.runtime.observeIssues({
      items: [issue("WEB-4", "2026-09-26T09:30:00.000Z", ["bug"]), issue("WEB-5", "2026-09-26T09:30:00.000Z", ["docs"])],
    });
    expect((await pending(h.runtime)).map((proposal) => proposal.issue?.key)).toEqual(["WEB-4"]);
  });

  test("the first look takes in every assigned issue, matching or not, so a broader filter floods nothing", async () => {
    const h = harness();
    const watch = (filter: string) =>
      h.runtime.setPlaybooks([withStartsWhen(starterPlaybook("request-to-pr"), { issueAssigned: { filter, since: SINCE } })]);
    const items = [
      issue("WEB-1", "2026-09-20T00:00:00.000Z", ["docs"]),
      issue("WEB-2", "2026-09-20T00:00:00.000Z", ["bug"]),
      issue("WEB-3", "2026-09-26T09:30:00.000Z", ["bug"]),
    ];
    watch("bug");
    expect(await h.runtime.observeIssues({ items })).toEqual({ proposed: 1 });
    watch("");
    expect(await h.runtime.observeIssues({ items })).toEqual({ proposed: 0 });
    expect((await pending(h.runtime)).map((proposal) => proposal.issue?.key)).toEqual(["WEB-3"]);
  });

  test("a source that syncs after the first look gets a first look of its own", async () => {
    const h = harness();
    h.runtime.setPlaybooks([withStartsWhen(starterPlaybook("request-to-pr"), { issueAssigned: { filter: "", since: SINCE } })]);
    const crane = [issue("WEB-1", "2026-09-20T00:00:00.000Z")];
    expect(await h.runtime.observeIssues({ items: crane })).toEqual({ proposed: 0 });

    const jiraOld = issue("OPS-1", "2026-09-01T00:00:00.000Z", [], "jira");
    const jiraNew = issue("OPS-2", "2026-09-26T09:30:00.000Z", [], "jira");
    expect(await h.runtime.observeIssues({ items: [...crane, jiraOld, jiraNew] })).toEqual({ proposed: 1 });

    // After its first look, an older ticket newly assigned is news too.
    const reassigned = issue("OPS-3", "2026-08-01T00:00:00.000Z", [], "jira");
    expect(await h.runtime.observeIssues({ items: [...crane, jiraOld, jiraNew, reassigned] })).toEqual({ proposed: 1 });
    expect((await pending(h.runtime)).map((proposal) => proposal.issue?.key).sort()).toEqual(["OPS-2", "OPS-3"]);
  });

  test("an empty list is not a first look", async () => {
    const h = harness();
    h.runtime.setPlaybooks([withStartsWhen(starterPlaybook("request-to-pr"), { issueAssigned: { filter: "", since: SINCE } })]);
    expect(await h.runtime.observeIssues({ items: [] })).toEqual({ proposed: 0 });
    const items = [issue("WEB-1", "2026-09-20T00:00:00.000Z"), issue("WEB-2", "2026-09-26T09:30:00.000Z")];
    expect(await h.runtime.observeIssues({ items })).toEqual({ proposed: 1 });
    expect((await pending(h.runtime)).map((proposal) => proposal.issue?.key)).toEqual(["WEB-2"]);
  });
});

describe("pull requests", () => {
  const watching = (autoStart: boolean) =>
    withStartsWhen(starterPlaybook("fix-failing-checks"), {
      pullRequest: { checksFailed: true, changesRequested: false },
      autoStart,
    });

  test("failing checks propose once per head commit", async () => {
    const h = harness();
    h.runtime.setPlaybooks([watching(false)]);
    const observe = (pr: ObservedPullRequest) => h.runtime.observePullRequest({ workspaceId: "ws", workspaceName: "web-app", pr });
    expect(await observe(pullRequest())).toEqual({ proposed: 1, started: 0, deferred: false });
    expect(await observe(pullRequest())).toEqual({ proposed: 0, started: 0, deferred: false });
    expect(await observe(pullRequest({ checks: "SUCCESS", headSha: "def" }))).toEqual({ proposed: 0, started: 0, deferred: false });
    expect(await observe(pullRequest({ headSha: "ghi" }))).toEqual({ proposed: 1, started: 0, deferred: false });
    const [latest] = await pending(h.runtime);
    expect(latest).toMatchObject({
      source: "pull-request",
      workspaceId: "ws",
      workspaceName: "web-app",
      repositoryPath: "/tmp/web",
      detail: "Checks failed on PR #612",
    });
  });

  test("auto-start starts in the workspace with nothing outside this machine authorized", async () => {
    const h = harness();
    h.runtime.setPlaybooks([watching(true)]);
    expect(await h.runtime.observePullRequest({ workspaceId: "ws", workspaceName: "web-app", pr: pullRequest() })).toEqual({
      proposed: 0,
      started: 1,
      deferred: false,
    });
    expect(h.tasks).toEqual([expect.objectContaining({ workspaceId: "ws" })]);
    expect(h.starts[0]).toMatchObject({ workspaceId: "ws", leadTaskId: "task-1", consent: { authorizedEffectStageIds: [] } });
    const [started] = (await h.runtime.list({ state: "started" })).proposals;
    expect(started).toMatchObject({ missionId: "mission-1" });
    expect(await h.runtime.observePullRequest({ workspaceId: "ws", workspaceName: "web-app", pr: pullRequest() })).toEqual({
      proposed: 0,
      started: 0,
      deferred: false,
    });
  });

  test("one pull request starts one mission; the rest wait as proposals", async () => {
    const h = harness();
    const both = withStartsWhen(starterPlaybook("fix-failing-checks"), {
      pullRequest: { checksFailed: true, changesRequested: true },
      autoStart: true,
    });
    const other = { ...watching(true), id: "playbook_other", name: "Other fixer" };
    h.runtime.setPlaybooks([both, other]);
    const pr = pullRequest({ reviewDecision: "CHANGES_REQUESTED" });
    expect(await h.runtime.observePullRequest({ workspaceId: "ws", workspaceName: "web-app", pr })).toEqual({
      proposed: 2,
      started: 1,
      deferred: false,
    });
    expect(h.tasks).toHaveLength(1);
    expect(await pending(h.runtime)).toHaveLength(2);
  });

  test("an auto-start that fails stays proposed, with its task for Start to reuse", async () => {
    const h = harness({ failStart: true });
    h.runtime.setPlaybooks([watching(true)]);
    expect(await h.runtime.observePullRequest({ workspaceId: "ws", workspaceName: "web-app", pr: pullRequest() })).toEqual({
      proposed: 1,
      started: 0,
      deferred: false,
    });
    const [proposal] = await pending(h.runtime);
    expect(proposal).toMatchObject({ taskId: "task-1", detail: "Could not start on its own: The provider is not signed in." });
  });

  test("a playbook whose first stage publishes never auto-starts", async () => {
    const h = harness();
    const publishing = watching(true);
    publishing.stages = [{ ...publishing.stages[0]!, kind: "ai", role: "publish" } as Playbook["stages"][number], ...publishing.stages.slice(1)];
    h.runtime.setPlaybooks([publishing]);
    expect(await h.runtime.observePullRequest({ workspaceId: "ws", workspaceName: "web-app", pr: pullRequest() })).toEqual({
      proposed: 1,
      started: 0,
      deferred: false,
    });
    expect(h.starts).toHaveLength(0);
  });

  test("a workspace a mission already works in is deferred, and decided once it is free", async () => {
    const h = harness();
    h.runtime.setPlaybooks([watching(true)]);
    h.busy("ws");
    const observe = (pr: ObservedPullRequest) => h.runtime.observePullRequest({ workspaceId: "ws", workspaceName: "web-app", pr });
    expect(await observe(pullRequest())).toEqual({ proposed: 0, started: 0, deferred: true });
    // Nothing to decide is never deferred.
    expect(await observe(pullRequest({ checks: "SUCCESS" }))).toEqual({ proposed: 0, started: 0, deferred: false });
    h.free("ws");
    expect(await observe(pullRequest())).toEqual({ proposed: 0, started: 1, deferred: false });
  });
});

describe("schedules", () => {
  test("each slot after the schedule was set proposes once, and auto-start runs it", async () => {
    const h = harness();
    h.at("2026-09-28T08:00:00"); // Monday, before 09:00 local
    const schedule = { schedule: "daily" as const, workspaceId: "ws", workspaceName: "web-app", since: new Date("2026-09-28T07:00:00").toISOString() };
    h.runtime.setPlaybooks([withStartsWhen(starterPlaybook("triage-requests"), { schedule })]);
    await h.runtime.requestTick();
    expect(await pending(h.runtime)).toHaveLength(0);

    h.at("2026-09-28T09:05:00");
    await h.runtime.requestTick();
    await h.runtime.requestTick();
    const proposals = await pending(h.runtime);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({ source: "schedule", workspaceId: "ws", repositoryPath: "/tmp/web", detail: "Every day at 09:00" });

    h.runtime.setPlaybooks([withStartsWhen(starterPlaybook("triage-requests"), { schedule, autoStart: true })]);
    h.at("2026-09-29T09:05:00");
    await h.runtime.requestTick();
    expect(h.starts).toHaveLength(1);
    expect(h.starts[0]!.playbook.name).toBe("Triage requests");
  });

  test("a slot that passed while Stave was closed is proposed, never started late", async () => {
    const h = harness();
    const schedule = { schedule: "daily" as const, workspaceId: "ws", workspaceName: "web-app", since: new Date("2026-09-27T07:00:00").toISOString() };
    h.at("2026-09-28T10:30:00");
    h.runtime.start();
    h.runtime.setPlaybooks([withStartsWhen(starterPlaybook("triage-requests"), { schedule, autoStart: true })]);
    await h.runtime.requestTick();
    expect(h.starts).toHaveLength(0);
    const [missed] = await pending(h.runtime);
    expect(missed?.detail).toBe("Every day at 09:00 · missed while Stave was closed");
    h.runtime.stop();
  });

  test("a slot the computer slept through is proposed, not started hours late", async () => {
    const h = harness();
    const schedule = { schedule: "daily" as const, workspaceId: "ws", workspaceName: "web-app", since: new Date("2026-09-28T07:00:00").toISOString() };
    h.at("2026-09-28T08:00:00");
    h.runtime.start();
    h.runtime.setPlaybooks([withStartsWhen(starterPlaybook("triage-requests"), { schedule, autoStart: true })]);
    h.at("2026-09-28T13:00:00");
    await h.runtime.requestTick();
    expect(h.starts).toHaveLength(0);
    expect((await pending(h.runtime))[0]?.detail).toBe("Every day at 09:00 · missed while this computer was asleep");

    // A slot reached on time still starts.
    h.at("2026-09-29T09:03:00");
    await h.runtime.requestTick();
    expect(h.starts).toHaveLength(1);
    h.runtime.stop();
  });

  test("schedules that share a workspace and a slot start one mission", async () => {
    const h = harness();
    const schedule = { schedule: "daily" as const, workspaceId: "ws", workspaceName: "web-app", since: new Date("2026-09-28T07:00:00").toISOString() };
    const triage = withStartsWhen(starterPlaybook("triage-requests"), { schedule, autoStart: true });
    h.runtime.setPlaybooks([triage, { ...triage, id: "playbook_second", name: "Second triage" }]);
    h.at("2026-09-28T09:01:00");
    await h.runtime.requestTick();
    expect(h.starts).toHaveLength(1);
    expect(await pending(h.runtime)).toHaveLength(1);
  });
});

describe("triage", () => {
  test("only a mission's turn proposes, once per request, with request-to-pr by default", async () => {
    const h = harness();
    const triage = createMission({
      id: "triage-mission",
      input: {
        workspaceId: "ws",
        leadTaskId: "lead",
        playbook: starterPlaybook("triage-requests"),
        assignment: "Triage.",
        consent: { checkIns: "when-stuck", permissionMode: "guided", authorizedEffectStageIds: [] },
      },
      repositoryPath: "/tmp/repo",
      fingerprint: { providerId: "claude-code", model: "sonnet" },
      now: MISSION_NOW,
    });
    h.store.create(triage, MISSION_NOW);
    const stage = currentStageRecord(h.store.getAggregate("triage-mission")!);
    const grant = { missionId: "triage-mission", taskId: "lead", stageId: stage.stageId, attempt: stage.attempt };
    h.grants.set("grant", grant);
    h.grants.set("other-task", { ...grant, taskId: "someone-else" });
    h.grants.set("stale", { ...grant, attempt: grant.attempt + 1 });
    const input = { title: "Export CSV", assignment: "Add CSV export to billing.", url: "https://slack.example/t/1" };

    await expect(h.runtime.proposeForGrant({ missionKey: "nope", input })).rejects.toThrow("Only a mission's turns");
    await expect(h.runtime.proposeForGrant({ missionKey: "other-task", input })).rejects.toThrow("Only a mission's turns");
    await expect(h.runtime.proposeForGrant({ missionKey: "stale", input })).rejects.toThrow("moved on from this turn's stage");
    expect(await h.runtime.proposeForGrant({ missionKey: "grant", input })).toMatchObject({ state: "pending", message: expect.stringContaining("Proposed") });
    expect(await h.runtime.proposeForGrant({ missionKey: "grant", input })).toMatchObject({ message: expect.stringContaining("already proposed") });
    const [proposal] = await pending(h.runtime);
    expect(proposal).toMatchObject({
      source: "triage",
      playbookId: "starter_request-to-pr",
      proposedByMissionId: "triage-mission",
      detail: "Proposed by Triage requests",
    });
    await expect(h.runtime.proposeForGrant({ missionKey: "grant", input: { ...input, key: "x", playbookId: "missing" } })).rejects.toThrow(
      'No playbook "missing"',
    );
  });
});

describe("deciding", () => {
  test("dismiss and start move a proposal out of pending, once", async () => {
    const h = harness();
    h.runtime.setPlaybooks([withStartsWhen(starterPlaybook("fix-failing-checks"), { pullRequest: { checksFailed: true, changesRequested: false } })]);
    await h.runtime.observePullRequest({ workspaceId: "ws", workspaceName: "web-app", pr: pullRequest() });
    await h.runtime.observePullRequest({ workspaceId: "ws", workspaceName: "web-app", pr: pullRequest({ headSha: "def" }) });
    const [first, second] = await pending(h.runtime);
    expect((await h.runtime.dismiss({ id: first!.id })).state).toBe("dismissed");
    await expect(h.runtime.dismiss({ id: first!.id })).rejects.toThrow("already decided");
    expect(await h.runtime.markStarted({ id: second!.id, missionId: "mission-9" })).toMatchObject({ state: "started", missionId: "mission-9" });
    expect(await pending(h.runtime)).toHaveLength(0);
    expect(await invokeProposalRuntime(h.runtime, "dismiss", { id: "missing" })).toEqual({ ok: false, message: "The proposal was not found." });
  });

  test("decided proposals list by when they were decided", async () => {
    const h = harness();
    h.runtime.setPlaybooks([withStartsWhen(starterPlaybook("fix-failing-checks"), { pullRequest: { checksFailed: true, changesRequested: false } })]);
    await h.runtime.observePullRequest({ workspaceId: "ws", workspaceName: "web-app", pr: pullRequest({ headSha: "one" }) });
    h.advance(60_000);
    await h.runtime.observePullRequest({ workspaceId: "ws", workspaceName: "web-app", pr: pullRequest({ headSha: "two" }) });
    const [second, first] = await pending(h.runtime);
    h.advance(60_000);
    await h.runtime.dismiss({ id: second!.id });
    h.advance(60_000);
    await h.runtime.dismiss({ id: first!.id });
    const decided = (await h.runtime.list({ state: "decided" })).proposals;
    expect(decided.map((proposal) => proposal.id)).toEqual([first!.id, second!.id]);
  });

  test("starting forgets decisions after 30 days and seen slots and commits after 90, never issues", async () => {
    const h = harness();
    h.runtime.setPlaybooks([withStartsWhen(starterPlaybook("fix-failing-checks"), { pullRequest: { checksFailed: true, changesRequested: false } })]);
    await h.runtime.observePullRequest({ workspaceId: "ws", workspaceName: "web-app", pr: pullRequest({ headSha: "old" }) });
    const [old] = await pending(h.runtime);
    await h.runtime.dismiss({ id: old!.id });
    h.store.markTriggersSeen(["issue:playbook:crane:WEB-1"], h.now());

    h.advance(31 * DAY_MS);
    await h.runtime.observePullRequest({ workspaceId: "ws", workspaceName: "web-app", pr: pullRequest({ headSha: "new" }) });
    h.runtime.start();
    h.runtime.stop();
    expect((await h.runtime.list({ state: "decided" })).proposals).toHaveLength(0);
    expect(await pending(h.runtime)).toHaveLength(1);

    h.advance(60 * DAY_MS);
    h.runtime.start();
    h.runtime.stop();
    const oldKey = `pr:playbook_fix_failing_checks:ws:checks-failed:old`;
    const newKey = `pr:playbook_fix_failing_checks:ws:checks-failed:new`;
    expect(h.store.markTriggersSeen([oldKey, newKey, "issue:playbook:crane:WEB-1"], h.now())).toEqual([oldKey]);
  });
});

describe("what saved start conditions watch", () => {
  const base = starterPlaybook("fix-failing-checks");
  const since = "2026-09-27T12:00:00.000Z";

  test("the watch summary names what the playbooks watch", () => {
    const { startsWhen: _none, ...plain } = base;
    expect(summarizeWatching([plain])).toBeNull();
    const issues = { ...plain, startsWhen: { issueAssigned: { filter: "", since } } };
    const scheduled = { ...plain, startsWhen: { schedule: { schedule: "daily" as const, workspaceId: "ws", workspaceName: "web-app", since } } };
    expect(summarizeWatching([issues, scheduled, plain])).toBe("2 playbooks — assigned issues, a schedule");
    expect(summarizeWatching([{ ...plain, startsWhen: { pullRequest: { checksFailed: true, changesRequested: false } } }])).toBe(
      "1 playbook — pull requests in the open repository",
    );
  });
});

describe("Issues → Proposed", () => {
  const proposal = (patch: Partial<ProposedMission> = {}): ProposedMission => ({
    id: "p1",
    sourceKey: "pr:x",
    source: "pull-request",
    title: "Move billing · #612",
    detail: "Checks failed on PR #612",
    url: "https://github.com/acme/web/pull/612",
    playbookId: "playbook_fix",
    playbookName: "Fix failing checks",
    assignment: "Fix it.",
    workspaceId: "ws",
    workspaceName: "web-app",
    issue: null,
    proposedByMissionId: null,
    state: "pending",
    missionId: null,
    createdAt: "2026-09-27T10:00:00.000Z",
    updatedAt: "2026-09-27T10:00:00.000Z",
    ...patch,
  });

  test("Start goes to the issue's kickoff, the trigger's workspace, or the open one", () => {
    expect(describeProposalStart(proposal(), { issueListed: false, activeWorkspaceName: "other" })).toEqual({
      label: "Start",
      where: "in web-app",
      disabledReason: null,
    });
    expect(describeProposalStart(proposal({ source: "issue", workspaceId: null }), { issueListed: true, activeWorkspaceName: null }).label).toBe("Kick off");
    expect(describeProposalStart(proposal({ source: "triage", workspaceId: null }), { issueListed: false, activeWorkspaceName: "api" }).where).toBe("in api");
    expect(
      describeProposalStart(proposal({ source: "triage", workspaceId: null }), { issueListed: false, activeWorkspaceName: null }).disabledReason,
    ).toContain("Open a workspace");
  });

  test("the panel lists what waits and what was decided, and says when nothing is proposed", () => {
    const render = (pending: ProposedMission[], recent: ProposedMission[]) =>
      renderToStaticMarkup(
        createElement(ProposedMissionsPanel, {
          pending,
          recent,
          loaded: true,
          now: new Date("2026-09-27T12:00:00.000Z"),
          startTarget: () => ({ label: "Start", where: "in web-app", disabledReason: null }),
          onStart: () => {},
          onDismiss: () => {},
          onOpenLink: () => {},
          onOpenMission: () => {},
        }),
      );
    const html = render([proposal()], [proposal({ id: "p2", state: "started", missionId: "m1", title: "Nightly triage" })]);
    expect(html).toContain("Waiting for you");
    expect(html).toContain("Move billing · #612");
    expect(html).toContain("Checks failed on PR #612");
    expect(html).toContain("in web-app");
    expect(html).toContain("2h");
    expect(html).toContain("Decided recently");
    expect(html).toContain("Started");
    const empty = render([], []);
    expect(empty).toContain("Nothing proposed right now");
    expect(empty).not.toContain("playbook");
    const watching = renderToStaticMarkup(
      createElement(ProposedMissionsPanel, {
        pending: [],
        recent: [],
        loaded: true,
        now: new Date("2026-09-27T12:00:00.000Z"),
        watching: "2 playbooks — assigned issues, a schedule",
        startTarget: () => ({ label: "Start", where: null, disabledReason: null }),
        onStart: () => {},
        onDismiss: () => {},
        onOpenLink: () => {},
        onOpenMission: () => {},
      }),
    );
    expect(watching).toContain("Watching: 2 playbooks — assigned issues, a schedule.");
  });

  test("the Proposed tab shows only with something waiting, decided, or watched", async () => {
    const { hasProposedWork } = await import("../src/lib/missions/proposed");
    expect(hasProposedWork({ pendingCount: 0, recentCount: 0, watching: null })).toBe(false);
    expect(hasProposedWork({ pendingCount: 1, recentCount: 0, watching: null })).toBe(true);
    expect(hasProposedWork({ pendingCount: 0, recentCount: 2, watching: null })).toBe(true);
    expect(hasProposedWork({ pendingCount: 0, recentCount: 0, watching: "1 playbook — a schedule" })).toBe(true);
  });

  test("a workspace Start cannot open is named with where it looked", () => {
    expect(describeMissingWorkspace(proposal({ repositoryPath: "/tmp/repos/web" })).title).toBe("Could not find web-app in web.");
    const unknown = describeMissingWorkspace(proposal());
    expect(unknown.title).toBe("Could not find web-app in the open repository.");
    expect(unknown.description).toContain("Open the repository it belongs to");
  });

  test("a changed pull request condition sends every pull request again", () => {
    const base = starterPlaybook("fix-failing-checks");
    expect(pullRequestWatchKey(null)).toBeNull();
    expect(pullRequestWatchKey([base])).toBeNull();
    const checks = withStartsWhen(base, { pullRequest: { checksFailed: true, changesRequested: false } });
    const key = pullRequestWatchKey([checks]);
    expect(key).not.toBeNull();
    expect(pullRequestWatchKey([withStartsWhen(base, { pullRequest: { checksFailed: true, changesRequested: true } })])).not.toBe(key);
    expect(pullRequestWatchKey([checks, { ...checks, id: "playbook_other" }])).not.toBe(key);
    expect(pullRequestWatchKey([withStartsWhen(base, { pullRequest: { checksFailed: true, changesRequested: false }, autoStart: true })])).not.toBe(key);
  });

  test("a workspace's pull request reads as the start condition sees it", () => {
    expect(toObservedPullRequest(undefined)).toBeNull();
    expect(
      toObservedPullRequest({
        pr: {
          number: 7,
          title: "T",
          state: "OPEN",
          isDraft: false,
          url: "https://github.com/a/b/pull/7",
          reviewDecision: "",
          mergeable: "MERGEABLE",
          mergeStateStatus: "CLEAN",
          checksRollup: "FAILURE",
          mergedAt: null,
          baseRefName: "main",
          headRefName: "b",
          headRefOid: "sha",
        },
        derived: "checks_failed",
        lastFetched: 0,
      }),
    ).toEqual({ number: 7, url: "https://github.com/a/b/pull/7", title: "T", state: "OPEN", checks: "FAILURE", reviewDecision: null, headSha: "sha" });
  });
});
