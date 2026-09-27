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
import { describeProposalStart } from "../src/components/layout/issues/useProposalActions";
import type { MissionDetail } from "../src/lib/missions/api";
import { createMission, type MissionStartInput } from "../src/lib/missions/domain";
import { playbookChoiceForId } from "../src/lib/missions/start-sheet";
import type { ObservedPullRequest, ProposedMission } from "../src/lib/missions/proposed";
import type { Playbook } from "../src/lib/playbooks/schema";
import { applyStartsWhen, describeStartsWhen } from "../src/lib/playbooks/starts-when";
import type { ObservedIssue } from "../src/lib/projects/policy";
import { toObservedPullRequest } from "../src/store/proposals-store";
import { MISSION_NOW, starterPlaybook } from "./fixtures/mission-fixtures";

const SINCE = "2026-09-26T09:00:00.000Z";

function issue(key: string, createdAt: string, labels: string[] = []): ObservedIssue {
  return { source: "crane", key, title: `Fix ${key}`, url: `https://crane.example/${key}`, labels, project: "WEB", createdAt };
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

function harness() {
  const db = new Database(":memory:");
  const store = new MissionStore(db);
  let clock = new Date(MISSION_NOW);
  const starts: MissionStartInput[] = [];
  const tasks: Array<{ workspaceId: string; title: string }> = [];
  const changes: number[] = [];
  const deps: ProposalRuntimeDependencies = {
    store,
    startMission: async (input) => {
      starts.push(input);
      return { mission: { id: `mission-${starts.length}` } } as unknown as MissionDetail;
    },
    createIdleTask: async (task) => {
      tasks.push(task);
      return { taskId: `task-${tasks.length}` };
    },
    resolveMissionGrant: (key) => (key === "grant" ? { missionId: "triage-mission" } : null),
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
    expect(await observe(pullRequest())).toEqual({ proposed: 1, started: 0 });
    expect(await observe(pullRequest())).toEqual({ proposed: 0, started: 0 });
    expect(await observe(pullRequest({ checks: "SUCCESS", headSha: "def" }))).toEqual({ proposed: 0, started: 0 });
    expect(await observe(pullRequest({ headSha: "ghi" }))).toEqual({ proposed: 1, started: 0 });
    const [latest] = await pending(h.runtime);
    expect(latest).toMatchObject({ source: "pull-request", workspaceId: "ws", workspaceName: "web-app", detail: "Checks failed on PR #612" });
  });

  test("auto-start starts in the workspace with nothing outside this machine authorized", async () => {
    const h = harness();
    h.runtime.setPlaybooks([watching(true)]);
    expect(await h.runtime.observePullRequest({ workspaceId: "ws", workspaceName: "web-app", pr: pullRequest() })).toEqual({
      proposed: 0,
      started: 1,
    });
    expect(h.tasks).toEqual([expect.objectContaining({ workspaceId: "ws" })]);
    expect(h.starts[0]).toMatchObject({ workspaceId: "ws", leadTaskId: "task-1", consent: { authorizedEffectStageIds: [] } });
    const [started] = (await h.runtime.list({ state: "started" })).proposals;
    expect(started).toMatchObject({ missionId: "mission-1" });
    expect(await h.runtime.observePullRequest({ workspaceId: "ws", workspaceName: "web-app", pr: pullRequest() })).toEqual({
      proposed: 0,
      started: 0,
    });
  });

  test("a playbook whose first stage publishes never auto-starts", async () => {
    const h = harness();
    const publishing = watching(true);
    publishing.stages = [{ ...publishing.stages[0]!, kind: "ai", role: "publish" } as Playbook["stages"][number], ...publishing.stages.slice(1)];
    h.runtime.setPlaybooks([publishing]);
    expect(await h.runtime.observePullRequest({ workspaceId: "ws", workspaceName: "web-app", pr: pullRequest() })).toEqual({
      proposed: 1,
      started: 0,
    });
    expect(h.starts).toHaveLength(0);
  });

  test("a workspace a mission already works in is left alone", async () => {
    const h = harness();
    h.runtime.setPlaybooks([watching(true)]);
    h.busy("ws");
    expect(await h.runtime.observePullRequest({ workspaceId: "ws", workspaceName: "web-app", pr: pullRequest() })).toEqual({
      proposed: 0,
      started: 0,
    });
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
    expect(proposals[0]).toMatchObject({ source: "schedule", workspaceId: "ws", detail: "Every day at 09:00" });

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
    const input = { title: "Export CSV", assignment: "Add CSV export to billing.", url: "https://slack.example/t/1" };

    await expect(h.runtime.proposeForGrant({ missionKey: "nope", input })).rejects.toThrow("Only a mission's turns");
    expect(await h.runtime.proposeForGrant({ missionKey: "grant", input })).toMatchObject({ state: "pending", message: expect.stringContaining("Proposed") });
    expect(await h.runtime.proposeForGrant({ missionKey: "grant", input })).toMatchObject({ message: expect.stringContaining("already proposed") });
    const [proposal] = await pending(h.runtime);
    expect(proposal).toMatchObject({
      source: "triage",
      playbookId: "starter_request-to-pr",
      proposedByMissionId: "triage-mission",
      detail: "Proposed by Triage requests",
    });
    expect(playbookChoiceForId(proposal!.playbookId)).toBe("starter:request-to-pr");
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
});

describe("editing start conditions", () => {
  const base = starterPlaybook("fix-failing-checks");
  const now = new Date("2026-09-27T12:00:00.000Z");

  test("each condition is stamped when turned on, and none left removes startsWhen", () => {
    const withIssue = applyStartsWhen(base, { issueAssigned: { filter: "" } }, now);
    expect(withIssue.startsWhen).toEqual({ issueAssigned: { filter: "", since: now.toISOString() } });
    const edited = applyStartsWhen(withIssue, { issueAssigned: { filter: "bug" } }, new Date("2026-09-28T00:00:00.000Z"));
    expect(edited.startsWhen?.issueAssigned).toEqual({ filter: "bug", since: now.toISOString() });
    expect("startsWhen" in applyStartsWhen(edited, { issueAssigned: null }, now)).toBe(false);
  });

  test("auto-start needs a pull request or schedule condition; a new schedule restamps", () => {
    const withPr = applyStartsWhen(base, { pullRequest: { checksFailed: true, changesRequested: false }, autoStart: true }, now);
    expect(withPr.startsWhen?.autoStart).toBe(true);
    const issueOnly = applyStartsWhen(applyStartsWhen(withPr, { issueAssigned: { filter: "" } }, now), { pullRequest: null }, now);
    expect(issueOnly.startsWhen?.autoStart).toBeUndefined();
    const noChecks = applyStartsWhen(withPr, { pullRequest: { checksFailed: false, changesRequested: false } }, now);
    expect("startsWhen" in noChecks).toBe(false);

    const scheduled = applyStartsWhen(base, { schedule: { schedule: "daily", workspaceId: "ws", workspaceName: "web-app" } }, now);
    const later = new Date("2026-09-30T00:00:00.000Z");
    expect(applyStartsWhen(scheduled, { schedule: { schedule: "daily", workspaceId: "ws", workspaceName: "web-app" } }, later).startsWhen?.schedule?.since).toBe(
      now.toISOString(),
    );
    expect(applyStartsWhen(scheduled, { schedule: { schedule: "weekly", workspaceId: "ws", workspaceName: "web-app" } }, later).startsWhen?.schedule?.since).toBe(
      later.toISOString(),
    );
    expect(describeStartsWhen(applyStartsWhen(withPr, { schedule: { schedule: "weekdays", workspaceId: "ws", workspaceName: "w" } }, now).startsWhen)).toBe(
      "PR checks fail · Weekdays at 09:00",
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

  test("the panel lists what waits and what was decided, and guides an empty list to start conditions", () => {
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
          onOpenPlaybooks: () => {},
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
    expect(empty).toContain("Open playbooks");
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
