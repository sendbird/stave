/**
 * Builds the project runtime from the host service's real dependencies, so
 * `electron/host-service.ts` only wires it.
 *
 * Used by: `electron/host-service.ts`.
 */
import type { ProjectChangedEvent } from "../../../src/lib/projects/api";
import { resolveProjectGrant, setProjectCoordinatorTasks } from "../../providers/project-grants";
import * as localMcpRuntime from "../local-mcp-runtime";
import { ensureHostServicePersistenceReady } from "../persistence";
import { runSupervisedTurn } from "../supervised-turn";
import type { MissionRuntime } from "./mission-runtime";
import { createProjectRuntime } from "./project-runtime";

async function resolveRepositoryPath(workspaceId: string) {
  const repositories = await localMcpRuntime.listKnownRepositories();
  for (const repository of repositories) {
    if (repository.workspaces.some((workspace) => workspace.id === workspaceId)) return repository.repositoryPath;
  }
  return null;
}

export function createHostProjectRuntime(args: {
  missionRuntime: Pick<MissionRuntime, "startMission" | "get">;
  emitChanged: (event: ProjectChangedEvent) => void;
}) {
  const persistence = ensureHostServicePersistenceReady();
  return createProjectRuntime({
    store: persistence.projects,
    missions: persistence.missions,
    startMission: (input, options) => args.missionRuntime.startMission(input, options),
    getMissionReport: async (missionId) => (await args.missionRuntime.get({ missionId })).report,
    getTaskSnapshot: async (target) => {
      const snapshot = await localMcpRuntime.getTaskSupervisionSnapshot(target);
      return {
        exists: snapshot.exists,
        archived: snapshot.archived,
        providerId: snapshot.providerId,
        model: snapshot.model,
        activeTurnId: snapshot.activeTurnId,
      };
    },
    runSupervisedTurn: (turn) =>
      runSupervisedTurn({
        ...turn,
        fingerprint: turn.fingerprint as Parameters<typeof runSupervisedTurn>[0]["fingerprint"],
      }),
    resolveRepositoryPath,
    createMissionWorkspace: async ({ repositoryPath, name, label }) => {
      const created = await localMcpRuntime.createWorkspace({ repositoryPath, name, label, mode: "branch" });
      return { workspaceId: created.workspaceId };
    },
    createIdleTask: (task) => localMcpRuntime.createIdleTask(task),
    resolveProjectGrant,
    setCoordinatorTasks: setProjectCoordinatorTasks,
    notifyProjectProblem: ({ project, detail }) =>
      localMcpRuntime.notifySupervisorProblem({
        workspaceId: project.coordinator.workspaceId,
        taskId: project.coordinator.taskId,
        body: detail,
        payload: { source: "project", projectId: project.id },
        dedupeKey: `project.problem:${project.id}:${detail}`,
      }),
    emitChanged: args.emitChanged,
  });
}
