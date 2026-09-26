import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { MissionStore } from "../electron/persistence/mission-store";
import { ProjectStore } from "../electron/persistence/project-store";
import type { ProjectGrant } from "../electron/providers/project-grants";
import {
  createProjectRuntime,
  invokeProjectRuntime,
  type ProjectRuntimeDependencies,
} from "../electron/host-service/supervision/project-runtime";
import { createMission, replaceStageRecord, type MissionStartInput } from "../src/lib/missions/domain";
import { MISSION_NOW, starterPlaybook } from "./fixtures/mission-fixtures";

function createHarness(options: { askBeforeStarting?: boolean; parallelLimit?: number } = {}) {
  const db = new Database(":memory:");
  const store = new ProjectStore(db);
  const missions = new MissionStore(db);
  let clock = new Date(MISSION_NOW);
  const grants = new Map<string, ProjectGrant>();
  const turns: Array<Parameters<ProjectRuntimeDependencies["runSupervisedTurn"]>[0]> = [];
  const workspaces: string[] = [];
  const started: Array<{ input: MissionStartInput; projectId: string }> = [];
  const coordinators: Array<ReadonlyArray<{ taskId: string; projectId: string }>> = [];
  let coordinatorBusy = false;
  let workspaceCounter = 0;
  let turnError: Error | null = null;
  const problems: string[] = [];

  const runtime = createProjectRuntime({
    store,
    missions,
    startMission: async (input, { projectId }) => {
      started.push({ input, projectId });
      const change = createMission({
        id: `mission-${started.length}`,
        input,
        repositoryPath: "/tmp/repo",
        fingerprint: { providerId: "claude-code", model: "sonnet" },
        now: clock,
        projectId,
      });
      missions.create(change, clock);
      return { mission: change.mission, stages: change.upserts, events: [], report: null };
    },
    getMissionReport: async () => null,
    getTaskSnapshot: async () => ({
      exists: true,
      archived: false,
      providerId: "claude-code",
      model: "sonnet",
      activeTurnId: coordinatorBusy ? "busy-turn" : null,
    }),
    runSupervisedTurn: async (turn) => {
      if (turnError) throw turnError;
      turns.push(turn);
      return { turnId: `turn-${turns.length}` };
    },
    notifyProjectProblem: ({ detail }) => {
      problems.push(detail);
    },
    resolveRepositoryPath: async () => "/tmp/repo",
    createMissionWorkspace: async ({ name }) => {
      workspaceCounter += 1;
      workspaces.push(name);
      return { workspaceId: `ws-mission-${workspaceCounter}` };
    },
    createIdleTask: async ({ workspaceId }) => ({ taskId: `task-${workspaceId}` }),
    resolveProjectGrant: (key) => grants.get(key) ?? null,
    setCoordinatorTasks: (entries) => coordinators.push(entries),
    now: () => clock,
    setInterval: (() => 0) as unknown as typeof globalThis.setInterval,
    clearInterval: () => {},
  });

  async function createProject() {
    const detail = await runtime.create({
      name: "Design system move",
      goal: "Move billing and settings to the new components.",
      coordinator: { workspaceId: "ws-coord", taskId: "coord-task" },
      settings: {
        askBeforeStarting: options.askBeforeStarting ?? true,
        parallelLimit: options.parallelLimit ?? 2,
      },
    });
    grants.set("project-key", { projectId: detail.project.id, taskId: "coord-task", turnId: "turn-x" });
    return detail.project.id;
  }

  return {
    runtime,
    store,
    missions,
    turns,
    workspaces,
    started,
    coordinators,
    grants,
    createProject,
    problems,
    setBusy: (busy: boolean) => {
      coordinatorBusy = busy;
    },
    setTurnError: (error: Error | null) => {
      turnError = error;
    },
    advance: (ms = 1_000) => {
      clock = new Date(clock.getTime() + ms);
    },
  };
}

describe("project runtime", () => {
  test("creating a project registers its coordinator and wakes it to plan, read-only", async () => {
    const harness = createHarness();
    const projectId = await harness.createProject();
    expect(harness.coordinators.at(-1)).toEqual([{ taskId: "coord-task", projectId }]);
    expect(harness.turns).toHaveLength(1);
    const kickoff = harness.turns[0]!;
    expect(kickoff.taskId).toBe("coord-task");
    expect(kickoff.prompt).toContain("Plan this project");
    expect(kickoff.runtimeOptions?.claudeDisallowedTools).toContain("Edit");
    expect(kickoff.retrievedContextParts?.[0]).toMatchObject({ sourceId: "stave:project-coordinator" });
  });

  test("a coordinator's start is a proposal until the user approves; then it starts through intake", async () => {
    const harness = createHarness();
    const projectId = await harness.createProject();
    const result = await harness.runtime.startMissionForGrant({
      projectKey: "project-key",
      input: { playbookId: "request-to-pr", assignment: "Move the billing table.", worktreeName: "Billing Table", startKey: "billing" },
    });
    expect(result.state).toBe("pending");
    expect(harness.started).toHaveLength(0);

    // The same start key never proposes twice.
    const again = await harness.runtime.startMissionForGrant({
      projectKey: "project-key",
      input: { playbookId: "request-to-pr", assignment: "Move the billing table.", startKey: "billing" },
    });
    expect(again.message).toContain("already used");
    const proposal = harness.store.listProposals(projectId)[0]!;

    const detail = await harness.runtime.approveProposal({ projectId, proposalId: proposal.id });
    expect(harness.workspaces).toEqual(["project-billing-table"]);
    expect(harness.started).toHaveLength(1);
    expect(harness.started[0]).toMatchObject({
      projectId,
      input: { workspaceId: "ws-mission-1", leadTaskId: "task-ws-mission-1", assignment: "Move the billing table." },
    });
    expect(detail.proposals[0]).toMatchObject({ state: "started", missionId: "mission-1" });
    expect(detail.missions.map((mission) => mission.missionId)).toEqual(["mission-1"]);
  });

  test("with asking off, missions start right away up to the parallel limit", async () => {
    const harness = createHarness({ askBeforeStarting: false, parallelLimit: 1 });
    await harness.createProject();
    for (const key of ["a", "b"]) {
      await harness.runtime.startMissionForGrant({
        projectKey: "project-key",
        input: { playbookId: "request-to-pr", assignment: `Part ${key}.`, startKey: key },
      });
    }
    await harness.runtime.requestTick();
    expect(harness.started.map((entry) => entry.input.assignment)).toEqual(["Part a."]);
  });

  test("the coordinator wakes once when missions end, and learns their decisions", async () => {
    const harness = createHarness({ askBeforeStarting: false });
    const projectId = await harness.createProject();
    await harness.runtime.startMissionForGrant({
      projectKey: "project-key",
      input: { playbookId: "request-to-pr", assignment: "Move billing.", startKey: "a" },
    });
    await harness.runtime.requestTick();
    const aggregate = harness.missions.getAggregate("mission-1")!;
    const record = {
      ...aggregate.stages[0]!,
      status: "completed" as const,
      report: {
        outcome: "complete" as const,
        summary: "Moved it.",
        decisions: [{ decision: "Use the shared Table", reason: "It handles overflow." }],
        evidence: [],
        artifacts: [],
        reportedAt: MISSION_NOW.toISOString(),
        turnId: "t",
      },
      reportRevision: 1,
    };
    harness.missions.apply(
      { mission: { ...aggregate.mission, state: "completed" }, upserts: replaceStageRecord(aggregate.stages, record).filter((entry) => entry === record), events: [] },
      MISSION_NOW,
    );
    harness.runtime.notifyMissionChanged({ missionId: "mission-1" });
    await harness.runtime.requestTick();
    const wakes = harness.turns.slice(1);
    expect(wakes).toHaveLength(1);
    expect(wakes[0]!.prompt).toContain("Move billing. (mission-1) completed: Moved it.");
    expect(harness.store.listMemories(projectId)).toMatchObject([
      { kind: "decision", status: "candidate", content: "Use the shared Table — It handles overflow.", sourceMissionId: "mission-1" },
    ]);
    // Exactly once for that state.
    await harness.runtime.requestTick();
    expect(harness.turns.slice(1)).toHaveLength(1);
  });

  test("project tools refuse a turn without a grant, and missions of other projects", async () => {
    const harness = createHarness();
    await harness.createProject();
    const denied = await invokeProjectRuntime(() => harness.runtime.getForGrant({ projectKey: "unknown" }));
    expect(denied).toMatchObject({ ok: false, code: "refused" });
    const foreign = createMission({
      id: "other-mission",
      input: {
        workspaceId: "ws-x",
        leadTaskId: "task-x",
        playbook: starterPlaybook("request-to-pr"),
        assignment: "Elsewhere.",
        consent: { checkIns: "when-stuck", permissionMode: "guided", authorizedEffectStageIds: [] },
      },
      repositoryPath: "/tmp/repo",
      fingerprint: { providerId: "claude-code", model: "sonnet" },
      now: MISSION_NOW,
    });
    harness.missions.create(foreign, MISSION_NOW);
    const report = await invokeProjectRuntime(() =>
      harness.runtime.getMissionReportForGrant({ projectKey: "project-key", missionId: "other-mission" }),
    );
    expect(report).toMatchObject({ ok: false, code: "not-found" });
    const briefing = await harness.runtime.getForGrant({ projectKey: "project-key" });
    expect(briefing.playbooks.some((option) => option.id === "request-to-pr" && option.source === "template")).toBe(true);
  });

  test("a start recorded before a restart is reported, never replayed", async () => {
    const harness = createHarness();
    const projectId = await harness.createProject();
    await harness.runtime.startMissionForGrant({
      projectKey: "project-key",
      input: { playbookId: "request-to-pr", assignment: "Move billing.", startKey: "a" },
    });
    const proposal = harness.store.listProposals(projectId)[0]!;
    harness.store.upsertProposal({ ...proposal, state: "approved" });
    harness.store.recordEvent(projectId, { kind: "mission-started", idempotencyKey: `project:${projectId}:start:${proposal.id}`, detail: {} }, MISSION_NOW);
    harness.runtime.start();
    await harness.runtime.requestTick();
    expect(harness.started).toHaveLength(0);
    expect(harness.store.getProposal(proposal.id)).toMatchObject({ state: "failed" });
  });

  test("changes of several missions coalesce into one coordinator turn after it frees up", async () => {
    const harness = createHarness({ askBeforeStarting: false });
    const projectId = await harness.createProject();
    for (const key of ["a", "b"]) {
      await harness.runtime.startMissionForGrant({
        projectKey: "project-key",
        input: { playbookId: "request-to-pr", assignment: `Part ${key}.`, startKey: key },
      });
    }
    await harness.runtime.requestTick();
    harness.setBusy(true);
    for (const missionId of ["mission-1", "mission-2"]) {
      const aggregate = harness.missions.getAggregate(missionId)!;
      harness.missions.apply({ mission: { ...aggregate.mission, state: "cancelled" }, upserts: [], events: [] }, MISSION_NOW);
      harness.runtime.notifyMissionChanged({ missionId });
    }
    await harness.runtime.requestTick();
    expect(harness.turns).toHaveLength(1);
    harness.setBusy(false);
    await harness.runtime.requestTick();
    expect(harness.turns).toHaveLength(2);
    expect(harness.turns[1]!.prompt).toContain("Part a. (mission-1) cancelled");
    expect(harness.turns[1]!.prompt).toContain("Part b. (mission-2) cancelled");
    expect(harness.store.listEvents(projectId).filter((event) => event.kind === "coordinator-woken")).toHaveLength(2);
  });

  test("a wake that cannot start tells the user and is not retried in a loop", async () => {
    const harness = createHarness({ askBeforeStarting: false });
    const projectId = await harness.createProject();
    await harness.runtime.startMissionForGrant({
      projectKey: "project-key",
      input: { playbookId: "request-to-pr", assignment: "Part a.", startKey: "a" },
    });
    await harness.runtime.requestTick();
    const aggregate = harness.missions.getAggregate("mission-1")!;
    harness.missions.apply({ mission: { ...aggregate.mission, state: "cancelled" }, upserts: [], events: [] }, MISSION_NOW);
    harness.setTurnError(new Error("The provider is not signed in."));
    await harness.runtime.requestTick();
    await harness.runtime.requestTick();
    expect(harness.problems).toEqual([expect.stringContaining("could not wake: The provider is not signed in.")]);
    expect(harness.store.listEvents(projectId).filter((event) => event.kind === "coordinator-wake-failed")).toHaveLength(1);
  });
});
