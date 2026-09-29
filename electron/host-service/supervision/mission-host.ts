/**
 * Builds the mission runtime from the host service's real dependencies, so
 * `electron/host-service.ts` only wires it.
 *
 * Used by: `electron/host-service.ts`.
 */
import { hostAgents } from "./assign-host";
import type { MissionChangedEvent } from "../../../src/lib/missions/api";
import { buildProjectMemoryContext } from "../../../src/lib/projects/briefing";
import { readStaveLocalMcpManifest } from "../../main/stave-local-mcp-manifest";
import { runCommandArgs } from "../../main/utils/command";
import { resolveMissionGrant } from "../../providers/mission-grants";
import { countActiveDelegatedTasks } from "../delegated-task-signals";
import * as localMcpRuntime from "../local-mcp-runtime";
import { ensureHostServicePersistenceReady } from "../persistence";
import { fetchGitHubPrStatus, readScmPrBody, updateScmPrBody } from "../scm-runtime";
import { runSupervisedTurn } from "../supervised-turn";
import { createLocalMcpReachabilityProbe } from "./local-mcp-reachability";
import {
  classifyMissionTurnEnding,
  createMissionActionExecutor,
  type MissionScriptRun,
} from "./mission-actions";
import { getScriptEntry } from "../../../src/lib/workspace-scripts/config";
import { resolveScriptsForWorkspace, runScriptEntry } from "../../main/workspace-scripts";
import { createScmMissionPort } from "./mission-scm";
import { createMissionRuntime } from "./mission-runtime";
import {
  collectStageFacts,
  readHeadSha,
  readMissionWorkspaceState,
} from "./stage-facts";

/** Enough recent messages to cover every turn of one stage attempt. */
const STAGE_FACT_MESSAGE_LIMIT = 80;

/** Runs an action from a workspace's scripts for a mission's Run script stage. */
async function runMissionScript(args: { workspaceId: string; scriptId: string }): Promise<MissionScriptRun> {
  const repositories = await localMcpRuntime.listKnownRepositories();
  for (const repository of repositories) {
    const workspace = repository.workspaces.find((candidate) => candidate.id === args.workspaceId);
    if (!workspace) continue;
    const config = await resolveScriptsForWorkspace({
      repositoryPath: repository.repositoryPath,
      workspacePath: workspace.path,
    });
    const scriptEntry = getScriptEntry(config, { scriptId: args.scriptId, kind: "action" });
    if (!scriptEntry) {
      return {
        ok: false,
        detail: `This workspace has no script action “${args.scriptId}”. Add it in Settings → Repositories → Scripts, or change the stage.`,
      };
    }
    const result = await runScriptEntry({
      workspaceId: args.workspaceId,
      scriptEntry,
      repositoryPath: repository.repositoryPath,
      workspacePath: workspace.path,
      workspaceName: workspace.name,
      branch: workspace.branch ?? repository.defaultBranch ?? "",
    });
    if (!("exitCode" in result)) return { ok: false, detail: `“${args.scriptId}” did not run as an action.` };
    const output = "output" in result && typeof result.output === "string" ? result.output : "";
    return result.ok
      ? { ok: true, exitCode: result.exitCode ?? 0, output }
      : { ok: false, detail: "error" in result && result.error ? String(result.error) : `“${args.scriptId}” exited with ${result.exitCode}.`, exitCode: result.exitCode, output };
  }
  return { ok: false, detail: "The workspace could not be found." };
}

async function resolveWorkspacePath(workspaceId: string) {
  const repositories = await localMcpRuntime.listKnownRepositories();
  for (const repository of repositories) {
    const workspace = repository.workspaces.find((candidate) => candidate.id === workspaceId);
    if (workspace) return workspace.path;
  }
  return null;
}

export function createHostMissionRuntime(args: {
  emitChanged: (event: MissionChangedEvent) => void;
}) {
  const persistence = ensureHostServicePersistenceReady();
  const reachability = createLocalMcpReachabilityProbe({
    readManifest: readStaveLocalMcpManifest,
  });
  const performAction = createMissionActionExecutor({
    store: persistence.missions,
    scm: createScmMissionPort(),
    resolveWorkspacePath,
    runScript: runMissionScript,
    readTurnEnding: (turnId) => classifyMissionTurnEnding(persistence.getStreamEvents({ turnId })),
  });
  return createMissionRuntime({
    store: persistence.missions,
    agentNames: () => Object.fromEntries(hostAgents().map((agent) => [agent.id, agent.name])),
    getTaskSupervisionSnapshot: localMcpRuntime.getTaskSupervisionSnapshot,
    listRecentTurns: (turnArgs) => persistence.listTurns(turnArgs),
    runSupervisedTurn,
    completeInterruptedTurn: (turnId) => persistence.completeInterruptedTurn({ id: turnId }),
    countActiveDelegatedTasks: (taskId) => countActiveDelegatedTasks({ parentTaskId: taskId }),
    isReportingAvailable: async (options) => {
      if (options?.fresh) reachability.invalidate();
      return reachability.isReachable();
    },
    resolveMissionGrant,
    resolveWorkspacePath,
    readHeadSha: (cwd) => readHeadSha({ cwd, run: runCommandArgs }),
    collectStageFacts: async (factArgs) =>
      collectStageFacts({
        cwd: factArgs.cwd,
        startHeadSha: factArgs.startHeadSha,
        turnIds: factArgs.turnIds,
        messages:
          persistence.loadTaskMessagesPage({
            workspaceId: factArgs.workspaceId,
            taskId: factArgs.taskId,
            limit: STAGE_FACT_MESSAGE_LIMIT,
          })?.messages ?? [],
        run: runCommandArgs,
      }),
    readWorkspaceState: (cwd) =>
      readMissionWorkspaceState({
        cwd,
        run: runCommandArgs,
        readOpenPullRequest: async (workspacePath) => {
          const status = await fetchGitHubPrStatus({ cwd: workspacePath });
          const pr = status.ok ? status.pr : null;
          return pr && pr.state === "OPEN"
            ? { url: pr.url, number: pr.number, isDraft: pr.isDraft }
            : null;
        },
      }),
    performAction,
    updatePullRequestBody: async ({ cwd, merge }) => {
      const current = await readScmPrBody({ cwd });
      if (!current.ok) return { ok: false, detail: current.stderr };
      if (current.state && current.state !== "OPEN") {
        return { ok: false, detail: "The pull request is no longer open." };
      }
      const updated = await updateScmPrBody({ cwd, body: merge(current.body) });
      return updated.ok ? { ok: true, url: current.url } : { ok: false, detail: updated.stderr };
    },
    notifyMissionProblem: ({ mission, detail }) =>
      localMcpRuntime.notifySupervisorProblem({
        workspaceId: mission.workspaceId,
        taskId: mission.leadTaskId,
        body: detail,
        payload: { source: "mission", missionId: mission.id },
        dedupeKey: `mission.turn_failed:${mission.id}:${detail}`,
      }),
    readProjectContext: (projectId) => {
      const project = persistence.projects.getProject(projectId);
      if (!project) return null;
      return buildProjectMemoryContext({
        projectName: project.name,
        memories: persistence.projects.listMemories(projectId, { acceptedOnly: true }),
      });
    },
    readTurnUsage: ({ workspaceId, taskId, turnId }) => {
      const [turn] = persistence.listTurns({ workspaceId, taskId, turnId });
      return turn ? { completed: Boolean(turn.completedAt), usage: turn.usage ?? null } : null;
    },
    emitChanged: args.emitChanged,
  });
}
