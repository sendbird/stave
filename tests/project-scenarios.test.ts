import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import type { TaskSupervisionSnapshot } from "../electron/host-service/local-mcp-runtime";
import { createMissionRuntime, type MissionRuntime, type MissionTurnRow } from "../electron/host-service/supervision/mission-runtime";
import {
  createProjectRuntime,
  type ProjectRuntime,
  type ProjectRuntimeDependencies,
} from "../electron/host-service/supervision/project-runtime";
import { MissionStore } from "../electron/persistence/mission-store";
import { ProjectStore } from "../electron/persistence/project-store";
import type { MissionStageGrant } from "../electron/providers/mission-grants";
import type { ProjectGrant } from "../electron/providers/project-grants";
import { currentStageRecord, EMPTY_STAGE_FACTS } from "../src/lib/missions/domain";
import { buildProjectMemoryContext } from "../src/lib/projects/briefing";
import { MISSION_NOW, starterPlaybook } from "./fixtures/mission-fixtures";

/*
 * Design scenarios P1–P4 end to end: the project runtime and the mission
 * runtime wired together over one database, as the host wires them, with the
 * providers faked at the turn port. Restarts build fresh runtimes over the
 * same database, the way relaunching Stave does.
 */

type Provider = "claude-code" | "codex";

/** A short playbook the coordinator picks: understand, then build, never asking first. */
const QUICK_CHANGE = (() => {
  const base = starterPlaybook("request-to-pr");
  return { ...base, id: "playbook_quick_change", name: "Quick change", checkIns: "when-stuck" as const, stages: base.stages.slice(0, 2) };
})();

function world() {
  const db = new Database(":memory:");
  const projects = new ProjectStore(db);
  const missions = new MissionStore(db);
  let clock = new Date(MISSION_NOW);
  const advance = (ms = 1_000) => {
    clock = new Date(clock.getTime() + ms);
  };
  let turnCounter = 0;
  const turns: Array<MissionTurnRow & { taskId: string }> = [];
  const missionGrants = new Map<string, MissionStageGrant>();
  const projectGrants = new Map<string, ProjectGrant>();
  const taskProviders = new Map<string, Provider>();
  const missionTurns: Array<{ taskId: string; turnId: string; prompt: string; context: string }> = [];
  const coordinatorTurns: Array<{ turnId: string; prompt: string }> = [];
  const worktrees: string[] = [];
  let coordinatorTurnOpen = false;

  function openTurn(taskId: string) {
    turnCounter += 1;
    const turnId = `turn-${turnCounter}`;
    advance();
    turns.unshift({ id: turnId, taskId, createdAt: clock.toISOString(), completedAt: null });
    return turnId;
  }

  let missionRuntime!: MissionRuntime;
  let projectRuntime!: ProjectRuntime;

  function boot() {
    missionRuntime = createMissionRuntime({
      store: missions,
      getTaskSupervisionSnapshot: async ({ workspaceId, taskId }): Promise<TaskSupervisionSnapshot> => {
        const providerId = taskProviders.get(taskId) ?? "claude-code";
        return {
          workspaceId,
          taskId,
          repositoryPath: "/tmp/acme",
          exists: true,
          archived: false,
          providerId,
          model: providerId === "codex" ? "gpt-6" : "sonnet",
          activeTurnId: null,
          pendingApprovalCount: 0,
          pendingUserInputCount: 0,
        };
      },
      listRecentTurns: ({ taskId, limit }) => turns.filter((turn) => turn.taskId === taskId).slice(0, limit),
      runSupervisedTurn: async (args) => {
        const turnId = openTurn(args.taskId);
        missionTurns.push({
          taskId: args.taskId,
          turnId,
          prompt: args.prompt,
          context: args.retrievedContextParts.map((part) => part.content).join("\n"),
        });
        if (args.missionStage) missionGrants.set(`key-${turnId}`, { ...args.missionStage, turnId, taskId: args.taskId });
        return { turnId };
      },
      completeInterruptedTurn: () => true,
      countActiveDelegatedTasks: () => 0,
      isReportingAvailable: async () => true,
      resolveMissionGrant: (key) => missionGrants.get(key) ?? null,
      resolveWorkspacePath: async (workspaceId) => `/tmp/acme-${workspaceId}`,
      readHeadSha: async () => "abc",
      collectStageFacts: async () => EMPTY_STAGE_FACTS,
      // Every mission turn reports usage once it ends: Claude with a cost, Codex tokens only.
      readTurnUsage: ({ taskId, turnId }) => {
        const turn = turns.find((row) => row.id === turnId);
        if (!turn) return null;
        const codex = taskProviders.get(taskId) === "codex";
        return {
          completed: Boolean(turn.completedAt),
          usage: turn.completedAt ? { inputTokens: 10_000, outputTokens: 1_000, ...(codex ? {} : { totalCostUsd: 0.25 }) } : null,
        };
      },
      readProjectContext: (projectId) => {
        const project = projects.getProject(projectId);
        return project
          ? buildProjectMemoryContext({ projectName: project.name, memories: projects.listMemories(projectId, { acceptedOnly: true }) })
          : null;
      },
      // As in the host: every mission change reaches the project runtime.
      emitChanged: ({ missionId }) => projectRuntime.notifyMissionChanged({ missionId }),
      now: () => clock,
      setInterval: (() => 0) as unknown as typeof globalThis.setInterval,
      clearInterval: () => {},
    });
    const deps: ProjectRuntimeDependencies = {
      store: projects,
      missions,
      startMission: (input, options) => missionRuntime.startMission(input, options),
      getMissionReport: async (missionId) => (await missionRuntime.get({ missionId })).report,
      getMissionUsage: (missionId) => missionRuntime.readUsage({ missionId }),
      getTaskSnapshot: async ({ taskId }) => ({
        exists: true,
        archived: false,
        providerId: taskProviders.get(taskId) ?? "claude-code",
        model: "sonnet",
        activeTurnId: coordinatorTurnOpen ? "coordinator-turn" : null,
      }),
      runSupervisedTurn: async ({ taskId, prompt }) => {
        const turnId = openTurn(taskId);
        coordinatorTurns.push({ turnId, prompt });
        return { turnId };
      },
      resolveRepositoryPath: async () => "/tmp/acme",
      createMissionWorkspace: async ({ name }) => {
        worktrees.push(name);
        return { workspaceId: `ws-${name}` };
      },
      createIdleTask: async ({ workspaceId, provider }) => {
        const taskId = `task-${workspaceId}`;
        taskProviders.set(taskId, provider);
        return { taskId };
      },
      resolveProjectGrant: (key) => projectGrants.get(key) ?? null,
      setCoordinatorTasks: () => {},
      now: () => clock,
      setInterval: (() => 0) as unknown as typeof globalThis.setInterval,
      clearInterval: () => {},
    };
    projectRuntime = createProjectRuntime(deps);
    missionRuntime.start();
    projectRuntime.start();
  }

  boot();

  return {
    projects,
    missions,
    worktrees,
    missionTurns,
    coordinatorTurns,
    get project() {
      return projectRuntime;
    },
    get mission() {
      return missionRuntime;
    },
    advance,
    /** Quit and relaunch: fresh runtimes over the same database. */
    relaunch: () => {
      projectRuntime.stop();
      missionRuntime.stop();
      boot();
    },
    setCoordinatorTurnOpen: (open: boolean) => {
      coordinatorTurnOpen = open;
    },
    grantCoordinator: (projectId: string) => {
      projectGrants.set("coordinator-key", { projectId, taskId: "coordinator", turnId: coordinatorTurns.at(-1)?.turnId ?? "turn-0" });
    },
    /** The lead task reports its current stage, then the turn ends. */
    reportStage: async (taskId: string, summary: string, decisions: Array<{ decision: string; reason: string }> = []) => {
      const turn = missionTurns.filter((entry) => entry.taskId === taskId).at(-1)!;
      const receipt = await missionRuntime.reportStage({
        missionKey: `key-${turn.turnId}`,
        report: { summary, decisions, evidence: [], artifacts: [] },
      });
      expect(receipt).toMatchObject({ recorded: true });
      advance();
      turns.find((row) => row.id === turn.turnId)!.completedAt = clock.toISOString();
      missionGrants.delete(`key-${turn.turnId}`);
    },
    tick: async () => {
      advance(61_000);
      await missionRuntime.requestTick();
      await projectRuntime.requestTick();
    },
    endCoordinatorTurn: () => {
      const last = coordinatorTurns.at(-1);
      const row = last ? turns.find((candidate) => candidate.id === last.turnId) : undefined;
      if (row) row.completedAt = clock.toISOString();
    },
  };
}

async function briefProject(w: ReturnType<typeof world>) {
  await w.project.syncPlaybooks({ playbooks: [QUICK_CHANGE] });
  const detail = await w.project.create({
    name: "Dashboard move",
    goal: "Move the billing table and the settings form to the new components.",
    coordinator: { workspaceId: "ws-coordinator", taskId: "coordinator" },
    settings: { askBeforeStarting: true, parallelLimit: 2 },
  });
  w.grantCoordinator(detail.project.id);
  return detail.project.id;
}

/** P1: the coordinator plans two missions; the user approves; both start, one per provider, on their own worktrees. */
async function planAndApproveTwo(w: ReturnType<typeof world>, projectId: string) {
  for (const [key, assignment, providerId] of [
    ["billing", "Move the billing table.", "claude-code"],
    ["settings", "Move the settings form.", "codex"],
  ] as const) {
    const result = await w.project.startMissionForGrant({
      projectKey: "coordinator-key",
      input: { playbookId: QUICK_CHANGE.id, assignment, providerId, worktreeName: key, startKey: key },
    });
    expect(result.state).toBe("pending");
  }
  w.endCoordinatorTurn();
  expect(w.missions.listMissionsForProject(projectId)).toHaveLength(0);
  for (const proposal of w.projects.listProposals(projectId)) {
    await w.project.approveProposal({ projectId, proposalId: proposal.id });
  }
  await w.tick();
}

describe("project scenarios", () => {
  test("P1: two missions start after the user's approval, on separate worktrees, one on Claude and one on Codex", async () => {
    const w = world();
    const projectId = await briefProject(w);
    expect(w.coordinatorTurns[0]!.prompt).toContain("Plan this project");

    await planAndApproveTwo(w, projectId);

    expect(w.worktrees).toEqual(["project-billing", "project-settings"]);
    const started = w.missions.listMissionsForProject(projectId);
    expect(started.map((mission) => mission.fingerprint.providerId).sort()).toEqual(["claude-code", "codex"]);
    expect(new Set(started.map((mission) => mission.workspaceId)).size).toBe(2);
    // Each lead task got its first stage turn.
    expect(new Set(w.missionTurns.map((turn) => turn.taskId))).toEqual(
      new Set(["task-ws-project-billing", "task-ws-project-settings"]),
    );
  });

  test("P2–P4: both finish, the coordinator wakes once and proposes the next; memory recalls in-project only; a relaunch duplicates nothing", async () => {
    const w = world();
    const projectId = await briefProject(w);
    await planAndApproveTwo(w, projectId);

    // Both missions run while the user talks to the coordinator.
    w.setCoordinatorTurnOpen(true);
    for (const taskId of ["task-ws-project-billing", "task-ws-project-settings"]) {
      await w.reportStage(taskId, "Restated the request.");
      await w.tick();
    }
    await w.reportStage("task-ws-project-billing", "Moved the billing table.", [
      { decision: "Use the shared Table component", reason: "It handles overflow and sticky headers." },
    ]);
    await w.reportStage("task-ws-project-settings", "Moved the settings form.");
    await w.tick();
    const missions = w.missions.listMissionsForProject(projectId);
    expect(missions.map((mission) => mission.state)).toEqual(["completed", "completed"]);
    expect(w.coordinatorTurns).toHaveLength(1);
    // What they spent: two ended turns each, cost only where the provider reports one.
    const views = (await w.project.get({ projectId })).missions;
    const byWorkspace = (id: string) => views.find((view) => view.workspaceId === id)!;
    expect(byWorkspace("ws-project-billing").usage).toMatchObject({ turns: 2, measuredTurns: 2, costUsd: 0.5 });
    expect(byWorkspace("ws-project-settings").usage).toMatchObject({ turns: 2, measuredTurns: 2, costUsd: null, inputTokens: 20_000 });
    expect((await w.mission.get({ missionId: byWorkspace("ws-project-billing").missionId })).report?.usage?.costUsd).toBe(0.5);
    // Mission insights read the same missions: one completed on each provider.
    const insights = await w.mission.getInsights({ days: 30 });
    expect(insights.rows.map((row) => [row.playbookName, row.providerId, row.missions, row.completed]).sort()).toEqual([
      ["Quick change", "claude-code", 1, 1],
      ["Quick change", "codex", 1, 1],
    ]);
    expect(insights.providers.find((row) => row.providerId === "claude-code")?.costPerMission).toBe(0.5);

    // P2: when the coordinator frees up, one wake carries both missions.
    w.setCoordinatorTurnOpen(false);
    await w.tick();
    await w.tick();
    expect(w.coordinatorTurns).toHaveLength(2);
    const wake = w.coordinatorTurns[1]!.prompt;
    expect(wake).toContain("Move the billing table.");
    expect(wake).toContain("Move the settings form.");
    // Within that Stave-started turn it reads both reports and proposes the next mission; the user sent nothing.
    w.grantCoordinator(projectId);
    for (const mission of missions) {
      const report = await w.project.getMissionReportForGrant({ projectKey: "coordinator-key", missionId: mission.id });
      expect(report).toMatchObject({ state: "completed", report: { outcome: "completed" } });
    }
    const next = await w.project.startMissionForGrant({
      projectKey: "coordinator-key",
      input: { playbookId: QUICK_CHANGE.id, assignment: "Move the navigation bar.", worktreeName: "navigation", startKey: "navigation" },
    });
    expect(next.state).toBe("pending");

    // P3: the decision waits for review; once accepted, the next mission of the project recalls it.
    const decision = w.projects.listMemories(projectId).find((memory) => memory.content.startsWith("Use the shared Table"))!;
    const billing = missions.find((mission) => mission.workspaceId === "ws-project-billing")!;
    expect(decision).toMatchObject({ status: "candidate", sourceMissionId: billing.id });
    await w.project.setMemoryStatus({ projectId, memoryId: decision.id, status: "accepted" });
    const proposal = w.projects.listProposals(projectId).find((entry) => entry.state === "pending")!;
    await w.project.approveProposal({ projectId, proposalId: proposal.id });
    await w.tick();
    const navigationTurn = w.missionTurns.find((turn) => turn.taskId === "task-ws-project-navigation")!;
    expect(navigationTurn.context).toContain("Use the shared Table component");
    // A mission outside the project never sees it.
    await w.mission.startMission({
      workspaceId: "ws-solo",
      leadTaskId: "task-solo",
      playbook: QUICK_CHANGE,
      assignment: "Fix a typo.",
      consent: { checkIns: "when-stuck", permissionMode: "guided", authorizedEffectStageIds: [] },
    });
    await w.tick();
    const soloTurn = w.missionTurns.find((turn) => turn.taskId === "task-solo")!;
    expect(soloTurn.context).not.toContain("Use the shared Table component");

    // P4: quit and relaunch — nothing starts twice and the coordinator is not woken again for what it saw.
    const before = {
      missions: w.missions.listMissionsForProject(projectId).length,
      worktrees: w.worktrees.length,
      coordinatorTurns: w.coordinatorTurns.length,
      navigationTurns: w.missionTurns.filter((turn) => turn.taskId === "task-ws-project-navigation").length,
    };
    w.relaunch();
    await w.tick();
    await w.tick();
    expect(w.missions.listMissionsForProject(projectId)).toHaveLength(before.missions);
    expect(w.worktrees).toHaveLength(before.worktrees);
    expect(w.coordinatorTurns).toHaveLength(before.coordinatorTurns);
    expect(w.missionTurns.filter((turn) => turn.taskId === "task-ws-project-navigation")).toHaveLength(before.navigationTurns);
    // The running mission continues where it was: its stage report is still accepted after the relaunch.
    await w.reportStage("task-ws-project-navigation", "Restated the request.");
    await w.tick();
    const navigation = w.missions.listMissionsForProject(projectId).find((mission) => mission.workspaceId === "ws-project-navigation")!;
    expect(currentStageRecord(w.missions.getAggregate(navigation.id)!).stageId).toBe("build");
  });
});
