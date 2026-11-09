import path from "node:path";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  tarsExecutionInstructions, tarsRunInitialContext, tarsWorkflow, tarsObservation, tarsHelperObservation, withTarsActiveStage, type TarsHelperRead,
} from "./tars-execution";
import { DelegatedAgentRunAuthoritySchema } from "../../src/lib/agent-runs/delegated-run";
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
import {
  assertTarsAssignment, assertTarsControl, assertTarsRun, controlTarsRun, TarsDetailError, TarsOwnershipLostError, TarsRequestUnavailableError,
  TarsRunEndedError, TarsStageChangedError, TarsTaskBusyError,
} from "./tars-ownership";
import { currentStageRecord } from "../../src/lib/agent-runs/domain";
import { TARS_PENDING_REQUESTS_MAX, type TarsPendingRequest } from "../../src/lib/tars/types";
import { createTarsPublisher, type TarsPublishRunner } from "./tars-publish";
import { projectTarsReport } from "../../src/lib/tars/report-model";
import { runCommandArgs } from "../main/utils/command";
import { hasTarsSnapshotCommit, releaseTarsWorkingChangesRef } from "./tars-working-changes";
import { isTarsResponsibilityTerminal } from "../../src/lib/tars/attention";
import { parseTarsRequestMessageId } from "../../src/lib/tars/brief";

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
  /** The task a delegated run's parent delegated it from; null for a run nobody delegated. */
  function delegatedParentTaskId(agentRunId: string): string | null {
    const started = persistence.agentRuns.listEventsByKind(agentRunId, ["agent-run-started"])[0];
    if (!started || !("delegation" in started.detail)) return null;
    const authority = DelegatedAgentRunAuthoritySchema.safeParse(started.detail.delegation);
    return authority.success ? authority.data.parentTaskId : null;
  }
  /**
   * The active helper runs of a lead run at any depth: runs delegated from its
   * task, and from their tasks in turn. A helper that cannot be read is left
   * out, so a failed read is never taken for a wait.
   */
  async function readHelpers(lead: { id: string; leadTaskId: string }): Promise<TarsHelperRead[]> {
    const active = persistence.agentRuns.listActiveAgentRuns().filter((run) => run.id !== lead.id);
    const team = new Set([lead.leadTaskId]);
    const helpers: typeof active = [];
    for (let grew = true; grew;) {
      grew = false;
      for (const run of active) {
        if (helpers.includes(run) || team.has(run.leadTaskId)) continue;
        const parent = delegatedParentTaskId(run.id);
        if (!parent || !team.has(parent)) continue;
        helpers.push(run); team.add(run.leadTaskId); grew = true;
      }
    }
    const reads = await Promise.all(helpers.map(async (run): Promise<TarsHelperRead | null> => {
      try {
        const [detail, task] = await Promise.all([args.agentRuns.get({ agentRunId: run.id }),
          tasks.getTaskSupervisionSnapshot({ workspaceId: run.workspaceId, taskId: run.leadTaskId })]);
        return { detail, pendingRequests: task.exists ? (task.pendingApprovalCount ?? 0) + (task.pendingUserInputCount ?? 0) : 0 };
      } catch { return null; }
    }));
    return reads.filter((read): read is TarsHelperRead => read !== null);
  }
  /**
   * Gives each waiting request its `ref`: workspace, task, message and provider
   * request id together, so a reused provider id never names another request.
   */
  function withRefs(requests: ReadonlyArray<Omit<TarsPendingRequest, "ref" | "taskId" | "workspaceId">>, workspaceId: string, taskId: string): TarsPendingRequest[] {
    return requests.slice(0, TARS_PENDING_REQUESTS_MAX).map((request) => ({ ...request, taskId, workspaceId,
      ref: createHash("sha256").update([workspaceId, taskId, request.messageId, request.requestId].join("\u0000")).digest("hex").slice(0, 24) }));
  }
  /** The approvals and questions waiting in one task, as the planner and the conversation show them. */
  async function pendingIn(workspaceId: string, taskId: string): Promise<TarsPendingRequest[]> {
    try {
      const snapshot = await tasks.getTaskSupervisionSnapshot({ workspaceId, taskId });
      return withRefs(snapshot.pendingRequests ?? [], workspaceId, taskId);
    } catch { return []; }
  }
  async function validateScope(row: Pick<TarsResponsibility, "workspaceId" | "repositoryPath">) {
    const repositories = await tasks.listKnownRepositories();
    const repository = repositories.find((item) => path.resolve(item.repositoryPath) === path.resolve(row.repositoryPath));
    if (!repository?.workspaces.some((workspace) => workspace.id === row.workspaceId))
      throw new TarsDetailError("scopeUnregistered", "The source workspace does not belong to this registered repository.");
  }
  /**
   * A message's snapshot ref is only needed until every unit that shares it
   * has its workspace (whose branch then keeps the commit) and the message's
   * admission has settled, so a retried admission still finds it.
   */
  async function releaseSnapshotWhenUnused(row: TarsResponsibility, ref: string) {
    const messageId = parseTarsRequestMessageId(row.requestId);
    if (!messageId || persistence.tarsConversations.listReceipts(messageId).some((receipt) => receipt.status === "pending")) return;
    const waiting = persistence.tars.snapshot().responsibilities.some((other) => other.id !== row.id && !other.executionWorkspaceId
      && other.workingChanges?.kind === "snapshot" && other.workingChanges.ref === ref && !isTarsResponsibilityTerminal(other));
    if (!waiting) await releaseTarsWorkingChangesRef(row.repositoryPath, ref).catch(() => undefined);
  }
  return createTarsRuntime({
    store: persistence.tars,
    onQueueChanged: () => args.emitChanged?.({ scope: "snapshot" }),
    concurrencyLimit: () => persistence.tarsConversations.getSettings()?.maxConcurrentResponsibilities ?? 0,
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
      let workspaceId: string;
      if (!row.branchName) workspaceId = (await create(fallback)).workspaceId;
      else {
        try { workspaceId = (await create(row.branchName)).workspaceId; }
        catch (error) {
          // git can still refuse a rule-following name, for example `ABC-123/x` when a branch `ABC-123` exists.
          // The name is deterministic, so retrying it would fail forever; `tars/<id>` is unique and equally stable.
          try { workspaceId = (await create(fallback)).workspaceId; } catch { throw error; }
        }
      }
      if (row.workingChanges?.kind === "snapshot") await releaseSnapshotWhenUnused(row, row.workingChanges.ref);
      return workspaceId;
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
        // The attachments travel as a reference; the run's first turn reads their content from the message.
        initialContext: tarsRunInitialContext(row, { representative: identity.name, responsibilities: portfolio }),
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
      // The requests themselves, bounded, so the user can answer them through Tars.
      const own = withRefs(snapshot.pendingRequests ?? [], row.executionWorkspaceId, row.taskId);
      const withRequests = (value: typeof observation, requests: readonly TarsPendingRequest[]) =>
        requests.length ? { ...value, pendingRequests: requests.slice(0, TARS_PENDING_REQUESTS_MAX) } : value;
      // Every observation of a run still going names its own current stage attempt, which stage commands are bound to.
      if (observation.state === "running" && (snapshot.pendingApprovalCount || snapshot.pendingUserInputCount))
        return withTarsActiveStage(detail, withRequests({ state: "waiting", detail: "The execution task is waiting for your input or approval.", detailCode: "waitingForUser",
          detailParams: null, runTurns: detail.agentRun.turnCount }, own));
      // A running lead may be waiting on a helper that waits on the user.
      if (observation.state === "running") {
        const helpers = await readHelpers(detail.agentRun);
        const helperRequests = (await Promise.all(helpers.filter((helper) => helper.pendingRequests > 0)
          .map((helper) => pendingIn(helper.detail.agentRun.workspaceId, helper.detail.agentRun.leadTaskId)))).flat();
        const helperWait = tarsHelperObservation(helpers);
        return withTarsActiveStage(detail, helperWait ? withRequests(helperWait, helperRequests) : observation);
      }
      return withTarsActiveStage(detail, withRequests(observation, own));
    },
    async respondTask(row, request, options) {
      const latest = persistence.agentRuns.getLatestAgentRunForTask(row.taskId!);
      if (!latest) throw new TarsDetailError("ownershipUnverified", "This task's execution ownership could not be verified.");
      // The run is Tars's and the user has not taken it over in its task.
      const guard = (run: Parameters<typeof assertTarsControl>[1]) => {
        assertTarsControl(row, run);
        if (!hasAssignment(row)) throw new Error("The task's agent assignment is unavailable.");
      };
      guard(latest);
      const agentRunId = row.agentRunId!;
      if (request.operation === "message") {
        const task = await tasks.getTaskSupervisionSnapshot({ workspaceId: row.executionWorkspaceId!, taskId: row.taskId! });
        // A running turn, or older words still kept for this work: the words wait with the request and are
        // said once the turn ends, after the older ones (`deliverMessage`).
        if (task.activeTurnId || options?.queueBehind) { if (options?.canQueue) return "queued"; throw new TarsTaskBusyError(); }
        await args.agentRuns.replyAsUser({ agentRunId, prompt: request.input!.text! }, guard);
        return;
      }
      if (request.operation === "requestChanges") {
        const detail = await args.agentRuns.get({ agentRunId });
        const record = currentStageRecord(detail);
        if (!row.activeStage || row.activeStage !== `${record.stageId}#${record.attempt}`) throw new TarsStageChangedError();
        await args.agentRuns.requestChanges({ agentRunId, stageId: record.stageId, attempt: record.attempt, feedback: request.input!.text! }, guard);
        return;
      }
      // Only a request Tars observed in the work's own task or a helper task of its run, read again here.
      const entry = row.pendingRequests?.find((candidate) => candidate.ref === request.input!.requestRef);
      if (!entry) throw new TarsRequestUnavailableError();
      const team = entry.taskId === row.taskId && entry.workspaceId === row.executionWorkspaceId ? true
        : (await readHelpers(latest)).some((helper) => helper.detail.agentRun.leadTaskId === entry.taskId && helper.detail.agentRun.workspaceId === entry.workspaceId);
      if (!team) throw new TarsRequestUnavailableError("That request's task is no longer part of this work.");
      const current = await pendingIn(entry.workspaceId, entry.taskId);
      if (!current.some((candidate) => candidate.ref === entry.ref && candidate.kind === entry.kind)) throw new TarsRequestUnavailableError();
      guard(persistence.agentRuns.getLatestAgentRunForTask(row.taskId!) ?? latest);
      // Once, as the user's own answer on the card: never an "always allow" rule.
      // The task's own answer path checks the message again inside its queue: a reused provider id in another message is refused.
      const target = { workspaceId: entry.workspaceId, taskId: entry.taskId, requestId: entry.requestId, expectedMessageId: entry.messageId };
      try {
        if (request.operation === "answer") await tasks.respondUserInput({ ...target, answers: request.input!.answers! });
        else await tasks.respondApproval({ ...target, approved: request.operation === "approve" });
      } catch (error) {
        if (error instanceof Error && /^Pending (approval|user input) not found/.test(error.message)) throw new TarsRequestUnavailableError();
        throw error;
      }
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
    messages: persistence.tarsConversations,
    /**
     * The same reply path as a message said at once, under the same ownership
     * checks, only once the task is free: no turn running, no approval or
     * question waiting, and the run's stage able to take a reply.
     */
    async deliverMessage(row, text, turnId) {
      const latest = persistence.agentRuns.getLatestAgentRunForTask(row.taskId!);
      if (!latest) throw new TarsDetailError("ownershipUnverified", "This task's execution ownership could not be verified.");
      const guard = (run: Parameters<typeof assertTarsControl>[1]) => {
        assertTarsControl(row, run);
        if (!hasAssignment(row)) throw new Error("The task's agent assignment is unavailable.");
      };
      guard(latest);
      if (latest.state === "completed" || latest.state === "cancelled" || latest.state === "stopped") throw new TarsRunEndedError();
      const task = await tasks.getTaskSupervisionSnapshot({ workspaceId: row.executionWorkspaceId!, taskId: row.taskId! });
      if (!task.exists || task.archived) throw new TarsOwnershipLostError("The owned task is unavailable.", "taskUnavailable");
      if (task.activeTurnId || task.pendingApprovalCount || task.pendingUserInputCount) return "busy";
      const aggregate = persistence.agentRuns.getAggregate(latest.id);
      // A paused run, or a stage that cannot take a reply now (waiting for sign-off), keeps it queued.
      if (!aggregate || latest.state !== "running" || !["running", "blocked", "stuck"].includes(currentStageRecord(aggregate).status)) return "busy";
      // Started as the turn the delivery saved, so the run's record of that turn says whether it reached the task.
      await args.agentRuns.replyAsUser({ agentRunId: latest.id, prompt: text, turnId }, guard);
      return "sent";
    },
    hasUserTurn: (agentRunId, turnId) => persistence.agentRuns.hasUserTurn(agentRunId, turnId),
    // Older work's brief reads its admitting message back, without the message's attachments.
    readRequest: (messageId) => persistence.tarsConversations.workRequestOf(messageId),
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
