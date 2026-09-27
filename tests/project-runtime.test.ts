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
import { createMission, createStageRecord, replaceStageRecord, type MissionStartInput } from "../src/lib/missions/domain";
import { MISSION_NOW, starterPlaybook } from "./fixtures/mission-fixtures";

/** A scheduled check-in the project observed and no wake has delivered yet. */
function observeCheckIn(store: ProjectStore, projectId: string, id: string) {
  store.recordEvent(
    projectId,
    { kind: "trigger-observed", idempotencyKey: `test:${projectId}:${id}`, detail: { triggerId: id, triggerKind: "schedule", summary: `Check-in ${id}` } },
    MISSION_NOW,
  );
}

function createHarness(options: { askBeforeStarting?: boolean; parallelLimit?: number } = {}) {
  const db = new Database(":memory:");
  const store = new ProjectStore(db);
  const missions = new MissionStore(db);
  let clock = new Date(MISSION_NOW);
  const grants = new Map<string, ProjectGrant>();
  const turns: Array<Parameters<ProjectRuntimeDependencies["runSupervisedTurn"]>[0]> = [];
  const workspaces: string[] = [];
  const idleTasks: Array<{ provider: string; model?: string | null }> = [];
  const started: Array<{ input: MissionStartInput; projectId: string }> = [];
  const coordinators: Array<ReadonlyArray<{ taskId: string; projectId: string }>> = [];
  let coordinatorBusy = false;
  /** Busy answers for the next snapshots, before falling back to `coordinatorBusy`. */
  const busyAnswers: boolean[] = [];
  let workspaceCounter = 0;
  let workspaceExisted = false;
  /** Stave "dies" inside the mission start: it records the mission and never returns. */
  let hangInStartMission = false;
  let turnError: Error | null = null;
  const problems: string[] = [];

  const deps: ProjectRuntimeDependencies = {
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
      if (hangInStartMission) return new Promise<never>(() => {});
      return { mission: change.mission, stages: change.upserts, events: [], report: null };
    },
    getMissionReport: async () => null,
    getTaskSnapshot: async () => ({
      exists: true,
      archived: false,
      providerId: "claude-code",
      model: "sonnet",
      activeTurnId: (busyAnswers.length > 0 ? busyAnswers.shift() : coordinatorBusy) ? "busy-turn" : null,
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
      return { workspaceId: `ws-mission-${workspaceCounter}`, existed: workspaceExisted };
    },
    createIdleTask: async ({ workspaceId, provider, model }) => {
      idleTasks.push({ provider, model });
      return { taskId: `task-${workspaceId}` };
    },
    resolveProjectGrant: (key) => grants.get(key) ?? null,
    setCoordinatorTasks: (entries) => coordinators.push(entries),
    now: () => clock,
    setInterval: (() => 0) as unknown as typeof globalThis.setInterval,
    clearInterval: () => {},
  };
  const runtime = createProjectRuntime(deps);

  async function createProject(coordinatorTaskId = "coord-task") {
    const detail = await runtime.create({
      name: "Design system move",
      goal: "Move billing and settings to the new components.",
      coordinator: { workspaceId: "ws-coord", taskId: coordinatorTaskId },
      settings: {
        askBeforeStarting: options.askBeforeStarting ?? true,
        parallelLimit: options.parallelLimit ?? 2,
      },
    });
    grants.set("project-key", { projectId: detail.project.id, taskId: coordinatorTaskId, turnId: "turn-x" });
    return detail.project.id;
  }

  return {
    runtime,
    deps,
    store,
    missions,
    turns,
    workspaces,
    idleTasks,
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
    answerBusy: (...answers: boolean[]) => {
      busyAnswers.push(...answers);
    },
    setWorkspaceExisted: (existed: boolean) => {
      workspaceExisted = existed;
    },
    setHangInStartMission: (hang: boolean) => {
      hangInStartMission = hang;
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
    expect(harness.workspaces).toEqual([`project-billing-table-${proposal.id.slice(0, 8)}`]);
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

  test("a coordinator may name a model; the user may change provider and model before starting", async () => {
    const harness = createHarness();
    const projectId = await harness.createProject();
    const refused = await invokeProjectRuntime(() =>
      harness.runtime.startMissionForGrant({
        projectKey: "project-key",
        input: { playbookId: "request-to-pr", assignment: "Part a.", providerId: "codex", model: "claude-sonnet-5", startKey: "a" },
      }),
    );
    expect(refused).toMatchObject({ ok: false, code: "refused" });
    expect((refused as { message: string }).message).toContain("is not a Codex model");

    await harness.runtime.startMissionForGrant({
      projectKey: "project-key",
      input: { playbookId: "request-to-pr", assignment: "Part b.", providerId: "codex", model: "gpt-6-luna", startKey: "b" },
    });
    const proposal = harness.store.listProposals(projectId)[0]!;
    expect(proposal).toMatchObject({ providerId: "codex", model: "gpt-6-luna" });
    // Switching provider without a model falls back to that provider's default.
    await harness.runtime.approveProposal({ projectId, proposalId: proposal.id, providerId: "claude-code" });
    expect(harness.idleTasks.at(-1)).toEqual({ provider: "claude-code", model: null });
    expect(harness.store.getProposal(proposal.id)).toMatchObject({ providerId: "claude-code", model: null, state: "started" });

    await harness.runtime.startMissionForGrant({
      projectKey: "project-key",
      input: { playbookId: "request-to-pr", assignment: "Part c.", startKey: "c" },
    });
    const next = harness.store.listProposals(projectId).find((entry) => entry.startKey === "c")!;
    await harness.runtime.approveProposal({ projectId, proposalId: next.id, providerId: "codex", model: "gpt-6-sol" });
    expect(harness.idleTasks.at(-1)).toEqual({ provider: "codex", model: "gpt-6-sol" });
  });
});

describe("project runtime: worktrees, wakes and restarts", () => {
  test("missions with the same name get worktrees of their own; a branch that already has one fails the start", async () => {
    const harness = createHarness({ askBeforeStarting: false, parallelLimit: 3 });
    const projectId = await harness.createProject();
    for (const key of ["a", "b"]) {
      await harness.runtime.startMissionForGrant({
        projectKey: "project-key",
        input: { playbookId: "request-to-pr", assignment: `Part ${key}.`, worktreeName: "billing", startKey: key },
      });
    }
    await harness.runtime.requestTick();
    expect(harness.workspaces).toEqual([
      expect.stringMatching(/^project-billing-[0-9a-f]{8}$/),
      expect.stringMatching(/^project-billing-[0-9a-f]{8}$/),
    ]);
    expect(new Set(harness.workspaces).size).toBe(2);

    harness.setWorkspaceExisted(true);
    await harness.runtime.startMissionForGrant({
      projectKey: "project-key",
      input: { playbookId: "request-to-pr", assignment: "Part c.", worktreeName: "billing", startKey: "c" },
    });
    await harness.runtime.requestTick();
    const refused = harness.store.listProposals(projectId).find((proposal) => proposal.startKey === "c")!;
    expect(refused).toMatchObject({ state: "failed", workspaceId: null, missionId: null });
    expect(refused.detail).toContain("already exists");
    expect(harness.started).toHaveLength(2);
  });

  test("resuming a project the daily cap paused lets the coordinator continue", async () => {
    const harness = createHarness();
    const projectId = await harness.createProject();
    // The kickoff and 23 more automatic turns today.
    for (let wake = 2; wake <= 24; wake += 1) {
      harness.store.recordEvent(projectId, { kind: "coordinator-woken", idempotencyKey: `seed-${wake}`, detail: { delivered: {}, triggers: [] } }, MISSION_NOW);
    }
    observeCheckIn(harness.store, projectId, "schedule:a");
    await harness.runtime.requestTick();
    expect(harness.store.getProject(projectId)).toMatchObject({ state: "paused" });
    expect(harness.turns).toHaveLength(1);

    harness.advance(60_000);
    await harness.runtime.resume({ projectId });
    expect(harness.store.getProject(projectId)).toMatchObject({ state: "active" });
    expect(harness.turns).toHaveLength(2);
    expect(harness.turns[1]!.prompt).toContain("Check-in schedule:a");
  });

  test("a sign-off at a later stage wakes the coordinator again", async () => {
    const harness = createHarness({ askBeforeStarting: false });
    await harness.createProject();
    await harness.runtime.startMissionForGrant({
      projectKey: "project-key",
      input: { playbookId: "request-to-pr", assignment: "Move billing.", startKey: "a" },
    });
    await harness.runtime.requestTick();
    const aggregate = harness.missions.getAggregate("mission-1")!;
    const first = { ...aggregate.stages[0]!, status: "awaiting-sign-off" as const };
    harness.missions.apply({ mission: aggregate.mission, upserts: [first], events: [] }, MISSION_NOW);
    await harness.runtime.requestTick();
    expect(harness.turns.slice(1).map((turn) => turn.prompt)).toEqual([expect.stringContaining("waits for the user's sign-off")]);

    const next = {
      ...createStageRecord({ missionId: "mission-1", stageId: aggregate.mission.playbook.stages[1]!.id, attempt: 1 }),
      status: "awaiting-sign-off" as const,
    };
    harness.missions.apply(
      { mission: { ...aggregate.mission, currentStageIndex: 1 }, upserts: [{ ...first, status: "completed" }, next], events: [] },
      MISSION_NOW,
    );
    await harness.runtime.requestTick();
    expect(harness.turns.slice(1)).toHaveLength(2);
    expect(harness.turns[2]!.prompt).toContain("waits for the user's sign-off");
  });

  test("the kickoff waits for a busy coordinator task, and what came meanwhile follows it", async () => {
    const harness = createHarness();
    harness.setBusy(true);
    const projectId = await harness.createProject();
    expect(harness.turns).toHaveLength(0);
    expect(harness.store.listEventsOfKind(projectId, "coordinator-woken")).toHaveLength(0);
    observeCheckIn(harness.store, projectId, "schedule:a");

    harness.setBusy(false);
    await harness.runtime.requestTick();
    expect(harness.turns).toHaveLength(1);
    expect(harness.turns[0]!.prompt).toContain("Plan this project");
    expect(harness.turns[0]!.prompt).not.toContain("Check-in");
    await harness.runtime.requestTick();
    expect(harness.turns).toHaveLength(2);
    expect(harness.turns[1]!.prompt).toContain("Check-in schedule:a");
  });

  test("a wake whose coordinator turned busy stays pending instead of being lost", async () => {
    const harness = createHarness();
    const projectId = await harness.createProject();
    observeCheckIn(harness.store, projectId, "schedule:a");
    // Free when the tick decides, busy by the time the wake would start.
    harness.answerBusy(false, true);
    await harness.runtime.requestTick();
    expect(harness.turns).toHaveLength(1);
    expect(harness.store.listEventsOfKind(projectId, "coordinator-woken")).toHaveLength(1);

    await harness.runtime.requestTick();
    expect(harness.turns).toHaveLength(2);
    expect(harness.turns[1]!.prompt).toContain("Check-in schedule:a");
  });

  test("what a wake delivered holds however many events follow it", async () => {
    const harness = createHarness({ askBeforeStarting: false });
    const projectId = await harness.createProject();
    await harness.runtime.startMissionForGrant({
      projectKey: "project-key",
      input: { playbookId: "request-to-pr", assignment: "Part a.", startKey: "a" },
    });
    await harness.runtime.requestTick();
    const aggregate = harness.missions.getAggregate("mission-1")!;
    harness.missions.apply({ mission: { ...aggregate.mission, state: "cancelled" }, upserts: [], events: [] }, MISSION_NOW);
    await harness.runtime.requestTick();
    expect(harness.turns).toHaveLength(2);

    for (let index = 0; index < 600; index += 1) {
      harness.store.recordEvent(projectId, { kind: "summary", detail: {} }, MISSION_NOW);
    }
    await harness.runtime.requestTick();
    expect(harness.turns).toHaveLength(2);
    // The next wake carries only what is new.
    observeCheckIn(harness.store, projectId, "schedule:a");
    await harness.runtime.requestTick();
    expect(harness.turns).toHaveLength(3);
    expect(harness.turns[2]!.prompt).toContain("Check-in schedule:a");
    expect(harness.turns[2]!.prompt).not.toContain("cancelled");
  });

  test("a memory of another project is never changed or removed", async () => {
    const harness = createHarness();
    const first = await harness.createProject("coord-a");
    const second = await harness.createProject("coord-b");
    harness.store.addMemory({
      id: "memory-b",
      projectId: second,
      kind: "note",
      content: "Billing keeps its own table.",
      status: "candidate",
      sourceMissionId: null,
      createdAt: MISSION_NOW.toISOString(),
    });
    for (const status of ["accepted", "removed"] as const) {
      const refused = await invokeProjectRuntime(() => harness.runtime.setMemoryStatus({ projectId: first, memoryId: "memory-b", status }));
      expect(refused).toMatchObject({ ok: false, code: "not-found" });
    }
    expect(harness.store.listMemories(second)).toMatchObject([{ id: "memory-b", status: "candidate" }]);
  });

  test("a start cut off after its mission started is recovered as started, not failed", async () => {
    const harness = createHarness({ askBeforeStarting: false });
    const projectId = await harness.createProject();
    harness.setHangInStartMission(true);
    await harness.runtime.startMissionForGrant({
      projectKey: "project-key",
      input: { playbookId: "request-to-pr", assignment: "Move billing.", startKey: "a" },
    });
    for (let wait = 0; wait < 100 && harness.started.length === 0; wait += 1) await Bun.sleep(1);
    const cut = harness.store.listProposals(projectId)[0]!;
    // Each finished step was kept on the proposal.
    expect(cut).toMatchObject({ state: "approved", workspaceId: "ws-mission-1", taskId: "task-ws-mission-1", missionId: null });

    // Stave relaunches over the same database.
    const relaunched = createProjectRuntime(harness.deps);
    relaunched.start();
    expect(harness.store.getProposal(cut.id)).toMatchObject({ state: "started", missionId: "mission-1", detail: null });
    relaunched.stop();
  });

  test("an ended project's proposals cannot be approved", async () => {
    const harness = createHarness();
    const projectId = await harness.createProject();
    await harness.runtime.startMissionForGrant({
      projectKey: "project-key",
      input: { playbookId: "request-to-pr", assignment: "Move billing.", startKey: "a" },
    });
    await harness.runtime.end({ projectId, outcome: "completed" });
    const proposal = harness.store.listProposals(projectId)[0]!;
    const refused = await invokeProjectRuntime(() => harness.runtime.approveProposal({ projectId, proposalId: proposal.id }));
    expect(refused).toMatchObject({ ok: false, code: "stale" });
    expect(harness.store.getProposal(proposal.id)).toMatchObject({ state: "pending" });
    expect(harness.started).toHaveLength(0);
  });
});
