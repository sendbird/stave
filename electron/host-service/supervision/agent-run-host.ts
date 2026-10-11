/**
 * Builds the agent run runtime from the host service's real dependencies, so
 * `electron/host-service.ts` only wires it.
 *
 * Used by: `electron/host-service.ts`.
 */
import { AdaptiveRoutingIntentSchema } from "../../../src/lib/agent-runs/resources";
import { freezeAdaptivePolicy } from "./adaptive-policy";
import { peekApiConnection } from "../../provider-accounts/gateway-runtime";
import { hostAgents } from "./assign-host";
import { createAgentRunRouter } from "./agent-run-route-host";
import type { AgentConfig } from "../../../src/lib/agents/schema";
import { classifyUtilityRoute } from "../../providers/utility-inference";
import { readWorkspaceRevision } from "./workspace-revision";
import { observeWorkspaceScript } from "./workspace-script-verification";
import type { AgentRunChangedEvent } from "../../../src/lib/agent-runs/api";
import { readStaveLocalMcpManifest } from "../../main/stave-local-mcp-manifest";
import { runCommandArgs } from "../../main/utils/command";
import { resolveAgentRunGrant } from "../../providers/agent-run-grants";
import { countActiveDelegatedTasks } from "../delegated-task-signals";
import * as localMcpRuntime from "../local-mcp-runtime";
import { ensureHostServicePersistenceReady } from "../persistence";
import { fetchGitHubPrStatus, readScmPrBody, updateScmPrBody } from "../scm-runtime";
import { loadUserPermissionOptions, runSupervisedTurn } from "../supervised-turn";
import { createLocalMcpReachabilityProbe } from "./local-mcp-reachability";
import {
  classifyAgentRunTurnEnding,
  observeAgentRunTurnEnding,
  createAgentRunActionExecutor,
  type AgentRunScriptRun,
} from "./agent-run-actions";
import { getScriptEntry } from "../../../src/lib/workspace-scripts/config";
import { resolveScriptsForWorkspace, runScriptEntry } from "../../main/workspace-scripts";
import { createScmAgentRunPort } from "./agent-run-scm";
import { createAgentRunRuntime } from "./agent-run-runtime";
import {
  collectStageFacts,
  readHeadSha,
  readAgentRunWorkspaceState,
} from "./stage-facts";

/** Enough recent messages to cover every turn of one stage attempt. */
const STAGE_FACT_MESSAGE_LIMIT = 80;

/** Runs an action from a workspace's scripts for an agent run's Run script stage. */
async function runAgentRunScript(args: { workspaceId: string; scriptId: string; signal?: AbortSignal }): Promise<AgentRunScriptRun> {
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
    const { result, verification } = await observeWorkspaceScript({ cwd: workspace.path, run: () => runScriptEntry({
      workspaceId: args.workspaceId,
      scriptEntry,
      signal: args.signal,
      repositoryPath: repository.repositoryPath,
      workspacePath: workspace.path,
      workspaceName: workspace.name,
      branch: workspace.branch ?? repository.defaultBranch ?? "",
    }) });
    if (!("exitCode" in result)) return { ok: false, detail: `“${args.scriptId}” did not run as an action.` };
    const output = "output" in result && typeof result.output === "string" ? result.output : "";
    return result.ok && typeof result.exitCode === "number" && Number.isInteger(result.exitCode)
      ? { ok: true, exitCode: result.exitCode, output, verification }
      : { ok: false, detail: "error" in result && result.error ? String(result.error) : typeof result.exitCode === "number" && Number.isInteger(result.exitCode) ? `“${args.scriptId}” exited with ${result.exitCode}.` : `“${args.scriptId}” did not report a process exit status.`, exitCode: result.exitCode, output };
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

export function createHostAgentRunRuntime(args: {
  emitChanged: (event: AgentRunChangedEvent) => void;
  /** The agent a task runs as, or null. An agent run routes by it and ends without it. */
  taskAgent?: (taskId: string) => AgentConfig | null;
  delegatedAssignment?: import("./agent-run-runtime").AgentRunRuntimeDependencies["delegatedAssignment"];
}) {
  const persistence = ensureHostServicePersistenceReady();
  const readTurnEnding = (turnId: string) => classifyAgentRunTurnEnding(persistence.getStreamEvents({ turnId }));
  const routeAgentRun = createAgentRunRouter({
    readTask: localMcpRuntime.getTaskSupervisionSnapshot,
    readDraft: ({ workspaceId, taskId }) =>
      persistence.loadWorkspaceShell({ workspaceId })?.promptDraftByTask?.[taskId]?.runtimeOverrides,
    readMessages: (messageArgs) => persistence.loadTaskMessagesPage(messageArgs)?.messages ?? [],
    readSettings: () => persistence.delegationPolicies.loadRouteSettings(),
    resolveWorkspacePath,
    classify: (request) => classifyUtilityRoute(request),
  });
  const reachability = createLocalMcpReachabilityProbe({
    readManifest: readStaveLocalMcpManifest,
  });
  const performAction = createAgentRunActionExecutor({
    store: persistence.agentRuns,
    scm: createScmAgentRunPort(),
    resolveWorkspacePath,
    runScript: runAgentRunScript,
    readTurnEnding,
  });
  return createAgentRunRuntime({
    store: persistence.agentRuns,
    usesApiConnection: (providerId, accountProfileId) => peekApiConnection(providerId, accountProfileId) !== undefined,
    freezeResources: ({ run, authority, routingIntent, accounts }) => {
      if (run.fingerprint.providerId !== "codex" && run.fingerprint.providerId !== "claude-code") throw new Error("Adaptive resources require a supported provider.");
      return freezeAdaptivePolicy({
      providerId: run.fingerprint.providerId, model: run.fingerprint.model,
      agent: args.taskAgent?.(run.leadTaskId) ?? null,
      draft: authority ? null : routingIntent ?? persistence.loadWorkspaceShell({ workspaceId: run.workspaceId })?.promptDraftByTask?.[run.leadTaskId]?.runtimeOverrides,
      settings: persistence.delegationPolicies.loadRouteSettings(), maxTurns: 30,
      delegated: Boolean(authority), effort: authority?.effort, modelPinned: authority?.modelPinned, effortPinned: authority?.effortPinned,
      ...(accounts ? { accounts } : {}),
    }); },
    stopResourceTask: localMcpRuntime.stopManagedTaskTurn,
    resourceExecutionLive: (childRunId, executionId) => {
      const root = persistence.agentRuns.listActiveAgentRuns().find((run) => persistence.agentRuns.readResources(run.id)?.reservations.some((row) => row.childRunId === childRunId));
      if (!root) return true;
      const match = persistence.listRunAggregatesByOrigin({ originKind: "task", originId: root.leadTaskId, limit: 200 }).find(({ step }) => step.executionId === executionId);
      if (!match) return true;
      const claim = persistence.listRunReceipts({ runId: match.run.id }).find((row) => row.type === "accepted" && row.detail?.attempt === match.step.attempt);
      if (claim?.detail?.agentRunId !== childRunId) return true;
      return match.step.status === "running" || match.step.status === "waiting";
    },
    delegatedAssignment: args.delegatedAssignment,
    delegatedExecutionCurrent: (agentRunId, taskId, authority) =>
      persistence.listRunAggregatesByOwnedTask({ taskId, limit: 50 }).some(({ run, step }) => {
        if (run.origin.id !== authority.parentTaskId || step.executionId !== authority.executionId ||
            (step.status !== "running" && step.status !== "waiting") || step.target?.taskId !== taskId) return false;
        const claim = persistence.listRunReceipts({ runId: run.id }).find((receipt) => receipt.type === "accepted" && receipt.detail?.attempt === step.attempt);
        return claim?.detail?.agentRunId === agentRunId;
      }),
    agentNames: () => Object.fromEntries(hostAgents().map((agent) => [agent.id, agent.name])),
    getTaskSupervisionSnapshot: localMcpRuntime.getTaskSupervisionSnapshot,
    listRecentTurns: (turnArgs) => persistence.listTurns(turnArgs),
    runSupervisedTurn,
    userPermissionOptions: loadUserPermissionOptions,
    completeInterruptedTurn: (turnId) => persistence.completeInterruptedTurn({ id: turnId }),
    countActiveDelegatedTasks: (taskId) => countActiveDelegatedTasks({ parentTaskId: taskId }),
    isReportingAvailable: async (options) => {
      if (options?.fresh) reachability.invalidate();
      return reachability.isReachable();
    },
    resolveAgentRunGrant,
    resolveWorkspacePath,
    readHeadSha: (cwd) => readHeadSha({ cwd, run: runCommandArgs }),
    readWorkspaceRevision,
    collectStageFacts: async (factArgs) =>
      collectStageFacts({
        cwd: factArgs.cwd,
        startHeadSha: factArgs.startHeadSha,
        turnIds: factArgs.turnIds,
        currentTurnId: factArgs.currentTurnId,
        messages:
          persistence.loadTaskMessagesPage({
            workspaceId: factArgs.workspaceId,
            taskId: factArgs.taskId,
            limit: STAGE_FACT_MESSAGE_LIMIT,
          })?.messages ?? [],
        run: runCommandArgs,
      }),
    readWorkspaceState: (cwd) =>
      readAgentRunWorkspaceState({
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
    notifyAgentRunProblem: ({ agentRun, detail }) =>
      localMcpRuntime.notifySupervisorProblem({
        workspaceId: agentRun.workspaceId,
        taskId: agentRun.leadTaskId,
        body: detail,
        payload: { source: "agent-run", agentRunId: agentRun.id },
        dedupeKey: `agentRun.turn_failed:${agentRun.id}:${detail}`,
      }),
    readTurnUsage: ({ workspaceId, taskId, turnId }) => {
      const [turn] = persistence.listTurns({ workspaceId, taskId, turnId });
      return turn ? { completed: Boolean(turn.completedAt), usage: turn.usage ?? null } : null;
    },
    routeAgentTurn: (turnArgs) =>
      routeAgentRun({ ...turnArgs, ...(turnArgs.agentRun.turnCount === 0 ? { draftOverride: AdaptiveRoutingIntentSchema.safeParse(
        persistence.agentRuns.listEventsByKind(turnArgs.agentRun.id, ["agent-run-started"])[0]?.detail.routingIntent).data } : {}), agent: args.taskAgent?.(turnArgs.agentRun.leadTaskId) ?? null }),
    ...(args.taskAgent ? { taskRunsAsAgent: (taskId: string) => args.taskAgent!(taskId) !== null } : {}),
    readTurnEnding,
    emitChanged: args.emitChanged,
    readObservedTurnEnding: (turnId) => observeAgentRunTurnEnding(persistence.getStreamEvents({ turnId })),
  });
}
