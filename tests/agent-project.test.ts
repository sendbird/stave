import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createMission } from "../src/lib/missions/domain";
import type { MissionStartInput } from "../src/lib/missions/domain";
import { MissionStore } from "../electron/persistence/mission-store";
import { ProjectStore } from "../electron/persistence/project-store";
import { createProjectRuntime, type ProjectRuntimeDependencies } from "../electron/host-service/supervision/project-runtime";
import type { ProjectGrant } from "../electron/providers/project-grants";
import { duplicateAgent } from "@/lib/agents/library";
import { getBuiltinAgent } from "@/lib/agents/starters";

const NOW = new Date("2026-09-29T09:00:00.000Z");

function harness(settings: { agents?: string[] | null } = {}) {
  const db = new Database(":memory:");
  const store = new ProjectStore(db);
  const missions = new MissionStore(db);
  const grants = new Map<string, ProjectGrant>();
  const recorded: Array<Parameters<NonNullable<ProjectRuntimeDependencies["recordTaskAgent"]>>[0]> = [];
  const started: MissionStartInput[] = [];
  const reviewer = { ...duplicateAgent(getBuiltinAgent("reviewer")!, []), id: "reviewer-copy", name: "Reviewer copy" };
  const deps: ProjectRuntimeDependencies = {
    store,
    missions,
    listAgents: () => [getBuiltinAgent("implementer")!, getBuiltinAgent("researcher")!, reviewer],
    recordTaskAgent: (task) => {
      recorded.push(task);
    },
    startMission: async (input, { projectId }) => {
      started.push(input);
      const change = createMission({ id: `mission-${started.length}`, input, repositoryPath: "/tmp/repo", fingerprint: { providerId: "claude-code", model: "sonnet" }, now: NOW, projectId });
      missions.create(change, NOW);
      return { mission: change.mission, stages: change.upserts, events: [], report: null };
    },
    getMissionReport: async () => null,
    getTaskSnapshot: async () => ({ exists: true, archived: false, providerId: "claude-code", model: "sonnet", activeTurnId: null }),
    runSupervisedTurn: async () => ({ turnId: "turn" }),
    resolveRepositoryPath: async () => "/tmp/repo",
    createMissionWorkspace: async () => ({ workspaceId: "ws-mission-1" }),
    createIdleTask: async ({ workspaceId }) => ({ taskId: `task-${workspaceId}` }),
    resolveProjectGrant: (key) => grants.get(key) ?? null,
    setCoordinatorTasks: () => {},
    now: () => NOW,
    setInterval: (() => 0) as unknown as typeof globalThis.setInterval,
    clearInterval: () => {},
  };
  const runtime = createProjectRuntime(deps);
  return {
    runtime,
    store,
    recorded,
    started,
    async create() {
      const detail = await runtime.create({
        name: "Billing",
        goal: "Move billing to the new table.",
        coordinator: { workspaceId: "ws-coord", taskId: "coord-task" },
        settings: { askBeforeStarting: false, ...(settings.agents !== undefined ? { agents: settings.agents } : {}) },
      });
      grants.set("key", { projectId: detail.project.id, taskId: "coord-task", turnId: "t" });
      return detail.project.id;
    },
    start(agentConfigId?: string, startKey = "one") {
      return runtime.startMissionForGrant({
        projectKey: "key",
        input: { playbookId: "request-to-pr", assignment: "Move the table.", startKey, ...(agentConfigId ? { agentConfigId } : {}) },
      });
    },
  };
}

describe("a project's agents", () => {
  test("the coordinator sees the project's agents, and a mission's task runs as the one it picks", async () => {
    const h = harness({ agents: ["implementer", "reviewer-copy"] });
    const projectId = await h.create();
    const briefing = await h.runtime.getForGrant({ projectKey: "key" });
    expect(briefing.agents.map((agent) => agent.id)).toEqual(["implementer", "reviewer-copy"]);
    await h.start("implementer");
    await h.runtime.requestTick();
    expect(h.started).toHaveLength(1);
    expect(h.recorded).toEqual([
      expect.objectContaining({ taskId: "task-ws-mission-1", agent: expect.objectContaining({ id: "implementer" }) }),
    ]);
    expect(h.store.listProposals(projectId)[0]).toMatchObject({ agentConfigId: "implementer", agentName: "Implementer" });
    // Delegations from the project's tasks are limited to the same list.
    expect(h.runtime.agentsForTask("coord-task")).toEqual(["implementer", "reviewer-copy"]);
    expect(h.runtime.agentsForTask("task-ws-mission-1")).toEqual(["implementer", "reviewer-copy"]);
    expect(h.runtime.agentsForTask("unrelated")).toBeNull();
  });

  test("an agent outside the list, or one that cannot run a task, is refused and nothing starts", async () => {
    const h = harness({ agents: ["implementer", "reviewer-copy"] });
    await h.create();
    await expect(h.start("researcher")).rejects.toThrow("not one of this project's agents");
    const readOnly = harness({ agents: null });
    await readOnly.create();
    // A Reviewer copy keeps the built-in's Worker and Delegated task uses only.
    await expect(readOnly.start("reviewer-copy")).rejects.toThrow("not usable as a main agent");
    expect([...h.started, ...readOnly.started]).toHaveLength(0);
  });

  test("a project without agents and a mission without one behave as before", async () => {
    const h = harness();
    await h.create();
    await h.start();
    await h.runtime.requestTick();
    expect(h.started).toHaveLength(1);
    expect(h.recorded).toHaveLength(0);
    expect(h.runtime.agentsForTask("coord-task")).toBeNull();
  });
});
