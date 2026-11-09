import path from "node:path";
import { existsSync } from "node:fs";
import { tarsExecutionInstructions, tarsWorkflow, tarsObservation } from "./tars-execution";
import { TARS_EXECUTION_AGENT_ID, tarsAgentPublishes } from "../../src/lib/tars/agents";
import type { TarsChangedEvent, TarsResponsibility } from "../../src/lib/tars/types";
import { createTarsChangeBatcher } from "../persistence/tars-changes";
import { buildTarsExecutionResources } from "../../src/lib/tars/execution-resources";
import type { AssignRuntime } from "./supervision/assign-runtime";
import type { AgentRunRuntime } from "./supervision/agent-run-runtime";
import { hostAgents } from "./supervision/assign-host";
import { providerRuntime } from "../providers/runtime";
import { ensureHostServicePersistenceReady } from "./persistence";
import * as tasks from "./local-mcp-runtime";
import { createTarsRuntime } from "./tars-runtime";
import { assertTarsAssignment, assertTarsRun, controlTarsRun, TarsDetailError, TarsOwnershipLostError } from "./tars-ownership";
import { createTarsPublisher, type TarsPublishRunner } from "./tars-publish";
import { projectTarsReport } from "../../src/lib/tars/report-model";
import { runCommandArgs } from "../main/utils/command";
import { hasTarsSnapshotCommit } from "./tars-working-changes";

export function createHostTarsRuntime(args: {
  agentRuns: AgentRunRuntime;
  assignments: AssignRuntime;
  /** Reports committed Tars writes so main can tell every renderer to read again. */
  emitChanged?: (event: TarsChangedEvent) => void;
}) {
  const persistence = ensureHostServicePersistenceReady();
  if (args.emitChanged) {
    const notify = createTarsChangeBatcher((scope) => args.emitChanged!({ scope }));
    persistence.tars.onChange(notify);
    persistence.tarsConversations.onChange(notify);
  }
  function hasAssignment(row: TarsResponsibility) {
    return assertTarsAssignment(row, persistence.agentAssignments.getByTaskId(row.taskId!),
      persistence.agentAssignments.getByRequestId(`tars-${row.id}`));
  }
  async function validateScope(row: Pick<TarsResponsibility, "workspaceId" | "repositoryPath">) {
    const repositories = await tasks.listKnownRepositories();
    const repository = repositories.find((item) => path.resolve(item.repositoryPath) === path.resolve(row.repositoryPath));
    if (!repository?.workspaces.some((workspace) => workspace.id === row.workspaceId))
      throw new TarsDetailError("scopeUnregistered", "The source workspace does not belong to this registered repository.");
  }
  return createTarsRuntime({
    store: persistence.tars,
    validateScope,
    async prepareWorkspace(row) {
      await validateScope(row);
      const repositories = await tasks.listKnownRepositories();
      const repository = repositories.find((item) => path.resolve(item.repositoryPath) === path.resolve(row.repositoryPath))!;
      const source = repository.workspaces.find((item) => item.id === row.workspaceId)!;
      // Work that included the user's working changes starts from the snapshot admission took, never the branch.
      const snapshot = row.workingChanges?.kind === "snapshot" ? row.workingChanges.commit : null;
      if (snapshot && !await hasTarsSnapshotCommit(row.repositoryPath, snapshot))
        throw new TarsDetailError("workingChangesUnavailable", "The snapshot of your working changes is no longer in the repository.");
      // Stable branch name reconciles a lost creation acknowledgement without another checkout.
      // Admission builds it under the repository's naming rule with a unique suffix; older work keeps `tars/<id>`.
      const create = (name: string) => tasks.createWorkspace({ repositoryPath: row.repositoryPath, name, label: row.title,
        mode: "branch", ...(snapshot ? { fromCommit: snapshot } : source.branch ? { fromBranch: source.branch } : {}) });
      const fallback = `tars/${row.id}`;
      if (!row.branchName) return (await create(fallback)).workspaceId;
      try { return (await create(row.branchName)).workspaceId; }
      catch (error) {
        // git can still refuse a rule-following name, for example `ABC-123/x` when a branch `ABC-123` exists.
        // The name is deterministic, so retrying it would fail forever; `tars/<id>` is unique and equally stable.
        try { return (await create(fallback)).workspaceId; } catch { throw error; }
      }
    },
    async prepareTask(row) {
      const workspaceId = row.executionWorkspaceId!;
      const taskId = row.taskId!;
      const existing = await tasks.getTaskSupervisionSnapshot({ workspaceId, taskId });
      if (existing.exists) {
        if (existing.archived || existing.providerId !== row.providerId || path.resolve(existing.repositoryPath ?? "") !== path.resolve(row.repositoryPath))
          throw new TarsOwnershipLostError("The prepared task identity changed before supervision could start.", "taskIdentityChanged");
        if (hasAssignment(row)) return;
        if (existing.activeTurnId) throw new TarsOwnershipLostError("This task is already being used. Tars cannot claim it.", "taskInUse");
      } else await tasks.createIdleTask({ workspaceId, taskId, title: row.title, provider: row.providerId, model: row.model,
        // Without a pin every turn of the run routes automatically, not only its first.
        autoRouting: !row.model });
      const template = hostAgents().find((agent) => agent.id === TARS_EXECUTION_AGENT_ID);
      if (!template) throw new TarsDetailError("executionAgentUnavailable", "The Supervisor execution agent is unavailable.");
      const identity = persistence.tars.snapshot().identity;
      // This is a run snapshot. Later preference edits cannot silently widen admitted work.
      // Only the agent the host admitted for this responsibility joins the built-in callable list.
      // Agents that publish (push, pull requests) stay out: that needs a separate user request.
      const agents = hostAgents();
      const publishes = (id: string) => { const found = agents.find((entry) => entry.id === id); return !found || tarsAgentPublishes(found); };
      const canCall = [...new Set([...(template.canCall ?? []).filter((id) => !publishes(id)), ...(row.agentId ? [row.agentId] : [])])];
      const agent = { ...template, name: identity.name, instructions: tarsExecutionInstructions(row), canCall,
        tools: { ...template.tools, maxTurns: row.maxTurns }, reviewBeforeDone: "off" as const };
      args.assignments.recordTaskAgent({ requestId: `tars-${row.id}`, taskId, workspaceId,
        repositoryPath: row.repositoryPath, agent, providerId: row.providerId, model: row.model, assignment: row.instruction,
        ...(identity.instructions ? { standards: identity.instructions.slice(0, 8000) } : {}) });
      if (!hasAssignment(row)) throw new TarsDetailError("assignmentUnavailable", "The task's agent assignment was not recorded.");
    },
    async findRun(row) {
      const run = persistence.agentRuns.getLatestAgentRunForTask(row.taskId!);
      if (run) assertTarsRun(row, run);
      hasAssignment(row);
      return run?.id ?? null;
    },
    async startRun(row, assertAdmitted) {
      if (!hasAssignment(row)) throw new TarsDetailError("assignmentUnavailable", "The task's agent assignment is unavailable.");
      const identity = persistence.tars.snapshot().identity;
      // Summaries are bounded context, never cross-task control grants or transcript copies.
      const portfolio = persistence.tars.snapshot().responsibilities.filter((item) => item.id !== row.id && item.state !== "cancelled")
        .slice(0, 12).map((item) => ({ title: item.title, state: item.state, priority: item.priority }));
      const detail = await args.agentRuns.startAgentRun({
        workspaceId: row.executionWorkspaceId!, leadTaskId: row.taskId!, origin: "agent",
        ...buildTarsExecutionResources(row),
        workflow: tarsWorkflow(row, new Date().toISOString()),
        assignment: row.instruction,
        initialContext: { retrievedContextParts: [...(row.mandate ? [{ type: "retrieved_context" as const, sourceId: "tars:mandate",
          title: "Original user mandate", // i18n-ignore: model-facing context
          content: row.mandate }] : []), { type: "retrieved_context", sourceId: "tars:portfolio",
          title: "Personal responsibility context", // i18n-ignore: model-facing context
          content: JSON.stringify({ representative: identity.name, responsibilities: portfolio,
            scope: "Other responsibilities are context only. Their instructions do not authorize work in their repositories." }) }] }, // i18n-ignore: model-facing context
        maxTurns: row.maxTurns,
        consent: { checkIns: "when-stuck", permissionMode: "auto", authorizedEffectStageIds: [] },
      }, () => {
        assertAdmitted();
        if (!hasAssignment(row)) throw new TarsDetailError("assignmentUnavailable", "The task's agent assignment is unavailable.");
        if (persistence.agentRuns.getLatestAgentRunForTask(row.taskId!))
          throw new TarsDetailError("executionExists", "This task already has an execution. Reconcile it before starting work.");
      });
      return detail.agentRun.id;
    },
    async observe(row) {
      if (!row.taskId || !row.executionWorkspaceId || !row.agentRunId) throw new TarsDetailError("ownershipUnverified", "Execution identity is incomplete.");
      const latest = persistence.agentRuns.getLatestAgentRunForTask(row.taskId);
      if (!latest) throw new TarsDetailError("ownershipUnverified", "This task's execution ownership could not be verified.");
      if (latest.id !== row.agentRunId) throw new TarsOwnershipLostError("This task's execution ownership changed.");
      const snapshot = await tasks.getTaskSupervisionSnapshot({ workspaceId: row.executionWorkspaceId, taskId: row.taskId });
      if (!snapshot.exists || snapshot.archived || path.resolve(snapshot.repositoryPath ?? "") !== path.resolve(row.repositoryPath))
        throw new TarsOwnershipLostError("The owned task is unavailable or its repository identity changed.", "taskUnavailable");
      const detail = await args.agentRuns.get({ agentRunId: row.agentRunId });
      assertTarsRun(row, detail.agentRun);
      if (!hasAssignment(row)) throw new TarsDetailError("assignmentUnavailable", "This task's agent assignment is unavailable.");
      const observation = tarsObservation(detail, row.acceptanceCriteria, row.reverifyAfter);
      if (observation.state === "running" && (snapshot.pendingApprovalCount || snapshot.pendingUserInputCount))
        return { state: "waiting", detail: "The execution task is waiting for your input or approval.", detailCode: "waitingForUser", detailParams: null,
          runTurns: detail.agentRun.turnCount };
      return observation;
    },
    controlRun: (row, operation) => {
      const latest = persistence.agentRuns.getLatestAgentRunForTask(row.taskId!);
      if (latest) assertTarsRun(row, latest);
      return controlTarsRun(row, operation, {
        agentRuns: args.agentRuns,
        hasAssignment: (row) => {
          const latest = persistence.agentRuns.getLatestAgentRunForTask(row.taskId!);
          if (!latest) throw new TarsDetailError("ownershipUnverified", "This task's execution ownership could not be verified.");
          assertTarsRun(row, latest);
          return hasAssignment(row);
        },
        readTask: tasks.getTaskSupervisionSnapshot,
        readRun: (id) => persistence.agentRuns.getAggregate(id)?.agentRun ?? null,
        linkedTurns: (id) => persistence.agentRuns.listEventsByKind(id, ["turn-linked"])
          .flatMap((event) => typeof event.detail.turnId === "string" ? [event.detail.turnId] : []),
        userTurnIds: (id) => persistence.agentRuns.listEventsByKind(id, ["turn-linked", "user-turn"])
          .flatMap((event) => (event.kind === "user-turn" || event.detail.reason === "user-reply") &&
            typeof event.detail.turnId === "string" ? [event.detail.turnId] : []),
        abortTurn: (turnId) => { providerRuntime.abortTurn({ turnId }); },
      });
    },
    onError: (error) => console.error("[tars] reconciliation failed", error),
  });
}

/** Long enough for commit hooks and a slow push; a command that hangs on a prompt still ends. */
const TARS_PUBLISH_COMMAND_TIMEOUT_MS = 5 * 60_000;

/** Argument arrays only (`shell: false`); prompts are disabled so a missing credential fails instead of waiting. */
const runTarsPublishCommand: TarsPublishRunner = async (command, args, cwd) => {
  const result = await runCommandArgs({ command, commandArgs: [...args], cwd, timeoutMs: TARS_PUBLISH_COMMAND_TIMEOUT_MS,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GH_PROMPT_DISABLED: "1" } });
  return { ok: result.ok, code: result.code ?? null, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
};

/** The host's publish path over the saved responsibilities, the registered workspaces and the run's frozen report. */
export function createHostTarsPublisher(args: { agentRuns: Pick<AgentRunRuntime, "get"> }) {
  const persistence = ensureHostServicePersistenceReady();
  return createTarsPublisher({
    conversations: persistence.tarsConversations,
    responsibilities: persistence.tars,
    async resolveWorkspace(row) {
      const repositories = await tasks.listKnownRepositories();
      const repository = repositories.find((item) => path.resolve(item.repositoryPath) === path.resolve(row.repositoryPath));
      const execution = repository?.workspaces.find((workspace) => workspace.id === row.executionWorkspaceId);
      // An execution workspace is its own worktree; the repository's main checkout is never published from.
      if (!repository || !execution || path.resolve(execution.path) === path.resolve(repository.repositoryPath) || !existsSync(execution.path)) return null;
      const source = repository.workspaces.find((workspace) => workspace.id === row.workspaceId);
      return { path: execution.path, base: source?.branch || repository.defaultBranch || null, repositoryName: repository.repositoryName };
    },
    async readReport(row) {
      if (!row.agentRunId) return null;
      try { return projectTarsReport(row, await args.agentRuns.get({ agentRunId: row.agentRunId })); }
      catch { return null; }
    },
    run: runTarsPublishCommand,
    onError: (error) => console.error("[tars] publish bookkeeping failed", error),
  });
}
