import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  createMissionRuntime,
  type MissionRuntimeDependencies,
} from "../electron/host-service/supervision/mission-runtime";
import { createProjectRuntime } from "../electron/host-service/supervision/project-runtime";
import { MissionStore } from "../electron/persistence/mission-store";
import { ProjectStore } from "../electron/persistence/project-store";
import type { MissionReport } from "../src/lib/missions/report";
import { buildProjectMemoryContext } from "../src/lib/projects/briefing";
import { DEFAULT_PROJECT_SETTINGS } from "../src/lib/projects/domain";
import { MISSION_NOW, starterPlaybook } from "./fixtures/mission-fixtures";

const PROJECT = {
  id: "project-1",
  name: "Design system move",
  goal: "Move every screen.",
  repositoryPath: "/tmp/repo",
  coordinator: { workspaceId: "ws-coord", taskId: "coord-task" },
  settings: DEFAULT_PROJECT_SETTINGS,
  state: "active" as const,
  summary: null,
  reasonDetail: null,
  createdAt: MISSION_NOW.toISOString(),
  updatedAt: MISSION_NOW.toISOString(),
};

function memory(id: string, status: "candidate" | "accepted", content: string) {
  return { id, projectId: "project-1", kind: "decision" as const, content, status, sourceMissionId: "m0", createdAt: MISSION_NOW.toISOString() };
}

function missionHarness(projects: ProjectStore, missions: MissionStore) {
  const runCalls: Array<Parameters<MissionRuntimeDependencies["runSupervisedTurn"]>[0]> = [];
  let taskCounter = 0;
  const runtime = createMissionRuntime({
    store: missions,
    getTaskSupervisionSnapshot: async ({ taskId }) => ({
      workspaceId: "ws-1",
      taskId,
      repositoryPath: "/tmp/repo",
      exists: true,
      archived: false,
      providerId: "claude-code",
      model: "sonnet",
      activeTurnId: null,
      pendingApprovalCount: 0,
      pendingUserInputCount: 0,
    }),
    listRecentTurns: () => [],
    runSupervisedTurn: async (args) => {
      runCalls.push(args);
      taskCounter += 1;
      return { turnId: `turn-${taskCounter}` };
    },
    completeInterruptedTurn: () => true,
    countActiveDelegatedTasks: () => 0,
    isReportingAvailable: async () => true,
    resolveMissionGrant: () => null,
    resolveWorkspacePath: async () => "/tmp/repo",
    readHeadSha: async () => "abc",
    collectStageFacts: async () => ({ diff: null, commands: [], toolCalls: [], action: null }),
    readProjectContext: (projectId) => {
      const project = projects.getProject(projectId);
      return project
        ? buildProjectMemoryContext({ projectName: project.name, memories: projects.listMemories(projectId, { acceptedOnly: true }) })
        : null;
    },
    now: () => MISSION_NOW,
    setInterval: (() => 0) as unknown as typeof globalThis.setInterval,
    clearInterval: () => {},
  });
  return { runtime, runCalls };
}

function startInput(leadTaskId: string) {
  return {
    workspaceId: "ws-1",
    leadTaskId,
    playbook: starterPlaybook("request-to-pr"),
    assignment: "Move the settings form.",
    consent: { checkIns: "when-stuck" as const, permissionMode: "guided" as const, authorizedEffectStageIds: [] },
  };
}

describe("project memory", () => {
  test("an accepted decision is recalled by the next mission of the same project, and not outside it", async () => {
    const db = new Database(":memory:");
    const projects = new ProjectStore(db);
    const missions = new MissionStore(db);
    projects.create(PROJECT);
    projects.addMemory(memory("mem-1", "accepted", "Use the shared Table component — it handles overflow."));
    projects.addMemory(memory("mem-2", "candidate", "Maybe drop the legacy grid."));
    const { runtime, runCalls } = missionHarness(projects, missions);

    await runtime.startMission(startInput("task-in-project"), { projectId: "project-1" });
    await runtime.requestTick();
    await runtime.startMission(startInput("task-outside"));
    await runtime.requestTick();

    const inProject = runCalls.find((call) => call.taskId === "task-in-project")!;
    const outside = runCalls.find((call) => call.taskId === "task-outside")!;
    const memoryPart = inProject.retrievedContextParts.find((part) => part.sourceId === "stave:project-memory");
    expect(memoryPart?.content).toContain("Use the shared Table component");
    // Candidates wait for review; they are never recalled.
    expect(memoryPart?.content).not.toContain("legacy grid");
    expect(outside.retrievedContextParts.some((part) => part.sourceId === "stave:project-memory")).toBe(false);
  });

  test("a project with nothing accepted adds no memory context", () => {
    expect(buildProjectMemoryContext({ projectName: "x", memories: [memory("m", "candidate", "Not yet.")] })).toBeNull();
  });
});

describe("project library", () => {
  test("links from mission reports are grouped by mission and classified", async () => {
    const db = new Database(":memory:");
    const projects = new ProjectStore(db);
    const missions = new MissionStore(db);
    projects.create(PROJECT);
    const { runtime: missionRuntime } = missionHarness(projects, missions);
    const detail = await missionRuntime.startMission(startInput("task-a"), { projectId: "project-1" });
    missions.apply({ mission: { ...detail.mission, state: "completed" }, upserts: [], events: [] }, MISSION_NOW);
    const report = {
      links: [
        { label: "Opened draft PR #612", url: "https://github.com/acme/app/pull/612", source: "stave" },
        { label: "Jira ACME-12", url: "https://acme.atlassian.net/browse/ACME-12", source: "agent" },
        { label: "Preview", url: "https://app-git-billing.vercel.app", source: "agent" },
      ],
    } as unknown as MissionReport;
    const runtime = createProjectRuntime({
      store: projects,
      missions,
      startMission: async () => {
        throw new Error("unused");
      },
      getMissionReport: async () => report,
      getTaskSnapshot: async () => ({ exists: true, archived: false, providerId: "claude-code", model: "sonnet", activeTurnId: null }),
      runSupervisedTurn: async () => ({ turnId: "t" }),
      resolveRepositoryPath: async () => "/tmp/repo",
      createMissionWorkspace: async () => ({ workspaceId: "ws" }),
      createIdleTask: async () => ({ taskId: "t" }),
      resolveProjectGrant: () => null,
      setCoordinatorTasks: () => {},
    });
    const project = await runtime.get({ projectId: "project-1" });
    expect(project.library.map((item) => [item.kind, item.verified, item.missionTitle])).toEqual([
      ["pull-request", true, "Move the settings form."],
      ["issue", false, "Move the settings form."],
      ["preview", false, "Move the settings form."],
    ]);
  });
});
