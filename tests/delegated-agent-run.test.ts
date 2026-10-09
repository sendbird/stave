import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { AgentRunStore } from "../electron/persistence/agent-run-store";
import { AgentAssignmentStore } from "../electron/persistence/agent-assignment-store";
import { RunLedgerStore } from "../electron/persistence/run-ledger-store";
import { createAssignRuntime } from "../electron/host-service/supervision/assign-runtime";
import { createAgentRunRuntime, type AgentRunTurnRow } from "../electron/host-service/supervision/agent-run-runtime";
import { prepareDelegatedAgentRun } from "../electron/host-service/supervision/delegated-agent-run-host";
import { createDelegatedTaskCoordinator, type DelegatedTaskHostPort } from "../electron/main/runs/delegated-task-coordinator";
import { createDelegatedAgentRunPort } from "../electron/main/runs/delegated-agent-run-port";
import { applyAgentToDelegation } from "../src/lib/agents/delegate";
import { getBuiltinAgent } from "../src/lib/agents/starters";
import { resolveDelegationPermissionPolicy } from "../src/lib/runs/delegation-policy";
import { DelegateTaskArgsSchema, resolveDelegatedTaskControls } from "../src/lib/runs/delegated-task";
import { buildAgentRunWorkflow } from "../src/lib/agent-runs/agent-run";
import { buildDelegatedAgentRunInput } from "../src/lib/agent-runs/delegated-run";
import type { AgentConfig } from "../src/lib/agents/schema";
import { createAgentRun, EMPTY_STAGE_FACTS, AgentRunStartInputSchema } from "../src/lib/agent-runs/domain";
import type { AgentRunChangedEvent } from "../src/lib/agent-runs/api";
import type { AgentRunStageGrant } from "../electron/providers/agent-run-grants";
import type { ProviderRuntimeOptions } from "../src/lib/providers/provider.types";
import { freezeAdaptivePolicy } from "../electron/host-service/supervision/adaptive-policy";
import { addIdleTask } from "../electron/host-service/idle-task";
import { createEmptyWorkspaceState } from "../src/store/workspace-session-state";

const idle = { ok: true as const, activeTurnId: null, latestTurnId: null, latestTurnCompletedAt: null, latestTurnError: null };
const agent = { ...getBuiltinAgent("reviewer")!, workflow: undefined };
const request = (patch = {}) => ({ repositoryPath: "/tmp/stave", parentWorkspaceId: "ws", parentTaskId: "parent",
  delegationKey: "assignment", prompt: "Review and verify the change.", providerId: "codex", agentConfigId: agent.id,
  workspace: { mode: "same-workspace" }, access: "read-only", ...patch });

function harness(providerId: "claude-code" | "codex" = "codex", options: { agent?: AgentConfig; adaptive?: boolean; beforeTaskCreated?: () => Promise<void> } = {}) {
  const savedAgent = options.agent ?? agent;
  const db = new Database(":memory:");
  const runs = new AgentRunStore(db), assignments = createAssignRuntime({ store: new AgentAssignmentStore(db), allowNativeSubagents: taskId => !runs.resourceConfig(runs.getActiveAgentRunForTask(taskId)?.id ?? "") });
  const ledger = new RunLedgerStore(db);
  let session = createEmptyWorkspaceState();
  let clock = new Date("2026-10-09T00:00:00Z");
  const rootPolicy = freezeAdaptivePolicy({ providerId, model: providerId === "codex" ? "gpt-6-sol" : "sonnet", agent: null,
    draft: { autoRouting: true }, settings: null, maxTurns: 30 });
  if (options.adaptive) {
    session = addIdleTask(session, { taskId: "parent", workspaceId: "ws", title: "Parent", provider: providerId,
      model: rootPolicy.allowedModels[0]! }).session;
    assignments.recordTaskAgent({ requestId: "root", taskId: "parent", workspaceId: "ws", repositoryPath: "/tmp/stave",
      agent: getBuiltinAgent("implementer")!, providerId, model: rootPolicy.allowedModels[0]!, assignment: "Integrate" });
    const root = createAgentRun({ id: "root", input: AgentRunStartInputSchema.parse({ origin: "agent", workspaceId: "ws", leadTaskId: "parent",
      assignment: "Integrate", workflow: buildAgentRunWorkflow({ agent: { name: "Root" }, now: clock }), maxTurns: 30,
      expiresAt: "2026-10-10T00:00:00Z", consent: { permissionMode: "manual", checkIns: "when-stuck", authorizedEffectStageIds: [] } }),
      repositoryPath: "/tmp/stave", fingerprint: { providerId, model: rootPolicy.allowedModels[0]! }, now: clock });
    root.events[0]!.detail = { ...root.events[0]!.detail, resources: rootPolicy };
    root.events[0]!.idempotencyKey = "root:policy";
    runs.create(root, clock);
  }
  const turns: AgentRunTurnRow[] = [];
  const grants = new Map<string, AgentRunStageGrant>();
  const calls: Array<{ taskId: string; parentTaskId?: string; runtimeOptions: ProviderRuntimeOptions }> = [];
  const listeners = new Set<(event: AgentRunChangedEvent) => void>();
  let singleTurns = 0, stops = 0, hostActions = 0;
  let observedModel: string | undefined;
  const policy = resolveDelegationPermissionPolicy({ providerId, access: "read-only" });
  const createRuntime = () => createAgentRunRuntime({
    store: runs, delegatedAssignment: assignments.assignmentForTask,
    freezeResources: ({ run, authority }) => freezeAdaptivePolicy({ providerId, model: run.fingerprint.model, agent: savedAgent,
      delegated: true, effort: authority?.effort, modelPinned: authority?.modelPinned, effortPinned: authority?.effortPinned,
      settings: null, maxTurns: 30 }),
    delegatedExecutionCurrent: (id, taskId, authority) => ledger.listAggregatesByOwnedTask({ taskId, limit: 50 }).some(({ run, step }) =>
      step.executionId === authority.executionId && (step.status === "running" || step.status === "waiting") &&
      ledger.listReceipts({ runId: run.id }).some(r => r.type === "accepted" && r.detail?.attempt === step.attempt && r.detail.agentRunId === id)),
    taskRunsAsAgent: taskId => assignments.agentForTask(taskId) !== null,
    getTaskSupervisionSnapshot: async ({ workspaceId, taskId }) => {
      const task = session.tasks.find(t => t.id === taskId);
      return { workspaceId, taskId, repositoryPath: "/tmp/stave", exists: Boolean(task), archived: false,
        providerId: task?.provider ?? providerId,
        model: observedModel ?? session.promptDraftByTask[taskId]?.runtimeOverrides?.model ?? "gpt-6-sol",
        activeTurnId: options.adaptive && taskId === "parent" ? "parent-turn" : turns.find(t => !t.completedAt)?.id ?? null, pendingApprovalCount: 0, pendingUserInputCount: 0 };
    },
    listRecentTurns: () => [...turns].reverse(),
    runSupervisedTurn: async args => {
      calls.push(args);
      const turnId = `turn-${calls.length}`;
      clock = new Date(clock.getTime() + 1000);
      turns.push({ id: turnId, createdAt: clock.toISOString(), completedAt: null });
      if (args.agentRunStage) grants.set(turnId, { ...args.agentRunStage, turnId, taskId: args.taskId });
      // Exercise the actual delegate role compiler for each captured provider dispatch.
      const compiled = assignments.prepareTurn({ ...args, turnId, providerId, prompt: args.prompt });
      expect(compiled?.provenance.role).toBe("delegate");
      if (options.adaptive) expect(compiled?.runtimeOptions.nativeSubagents).toEqual([]);
      else expect(compiled?.runtimeOptions.nativeSubagents).toBeUndefined();
      return { turnId };
    },
    countActiveDelegatedTasks: () => 0, isReportingAvailable: async () => true,
    resolveAgentRunGrant: key => grants.get(key) ?? null, resolveWorkspacePath: async () => "/tmp/stave",
    readHeadSha: async () => "abc1234", collectStageFacts: async () => EMPTY_STAGE_FACTS,
    readTurnEnding: () => "completed", userPermissionOptions: () => ({ codexFileAccess: "danger-full-access", claudePermissionMode: "bypassPermissions" }),
    routeAgentTurn: async () => { throw new Error("Supervised delegates must not use Auto routing"); },
    performAction: async () => { hostActions++; return { status: "failed", detail: "This action must not run under read-only authority." }; },
    emitChanged: event => { for (const listener of listeners) listener(event); }, now: () => clock,
  });
  let runtime = createRuntime();
  const port = createDelegatedAgentRunPort({
    prepare: start => prepareDelegatedAgentRun({ start, runtime, assignmentForTask: assignments.assignmentForTask,
      createTask: async args => { await options.beforeTaskCreated?.(); const added = addIdleTask(session, args); session = added.session; } }),
    activate: args => runtime.activateDelegatedAgentRun(args),
    get: args => runtime.readDelegatedAgentRun(args), cancel: args => runtime.cancel(args),
    stopTask: async () => { stops++; for (const row of turns) row.completedAt ??= clock.toISOString(); },
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, pollIntervalMs: 2,
  });
  const host: DelegatedTaskHostPort = {
    resolveWorkspace: async () => ({ workspaceId: "ws", workspacePath: "/tmp/stave", repositoryPath: "/tmp/stave" }),
    createWorkspace: async () => { throw new Error("not needed"); }, getTaskStatus: async () => idle,
    runTask: async () => { singleTurns++; return { turnId: "single-turn" }; },
    stopTask: async () => { stops++; }, releaseTaskParent: async () => {},
    runAgentRun: port.run, readAgentRun: port.read, stopAgentRun: port.stop,
  };
  const createCoordinator = () => createDelegatedTaskCoordinator({
    host, readResourceRoot: taskId => runtime.resourceRootForTask(taskId), concurrencyLimit: 3, getLedger: () => ({
      getRunAggregate: a => ledger.getAggregate(a), claimRunStep: a => ledger.claimStep(a),
      markRunStepWaiting: a => ledger.markStepWaiting(a), resumeRunStep: a => ledger.resumeStep(a),
      completeRunStep: a => ledger.completeStep(a), failRunStep: a => ledger.failStep(a), cancelRunStep: a => ledger.cancelStep(a),
      interruptRunStep: a => ledger.interruptStep(a), setRunStepTarget: a => ledger.setStepTarget(a),
      listRunReceipts: a => ledger.listReceipts(a), listRunAggregatesByOrigin: a => ledger.listAggregatesByOrigin(a),
      listActiveRunAggregatesByStepKind: a => ledger.listActiveAggregatesByStepKind(a), listRunAggregatesByOwnedTask: a => ledger.listAggregatesByOwnedTask(a),
    }),
    applyAgent: async args => {
      const result = applyAgentToDelegation({ args, agent: savedAgent, parentCanCall: null });
      return result.ok ? { ok: true, args: { ...result.args, prompt: args.prompt }, snapshot: result.snapshot, agentContentHash: result.snapshot.contentHash } : result;
    }, resolvePermissionPolicy: async () => policy,
    recordAgentAssignment: async args => { assignments.recordTaskAgent({ requestId: `delegated:${args.executionId}`,
      taskId: args.target.taskId, workspaceId: args.target.workspaceId, repositoryPath: "/tmp/stave", agent: args.snapshot.agent,
      role: "delegate", assignment: args.prompt, providerId, model: args.model ?? null }); },
  });
  const coordinator = createCoordinator();
  const start = async (patch = {}) => {
    const response = await coordinator.delegate(request({ providerId, ...patch }));
    expect(response.accepted).toBe(true);
    for (let i = 0; i < 100 && !calls.length; i++) await Bun.sleep(1);
    expect(calls).toHaveLength(1);
    return response.child!;
  };
  const end = (id: string) => { clock = new Date(clock.getTime() + 1000); turns.find(t => t.id === id)!.completedAt = clock.toISOString(); grants.delete(id); };
  const report = async (id: string) => runtime.reportStage({ agentRunKey: id, report: { summary: "Reviewed and verified.", decisions: [], evidence: [], artifacts: [] } });
  return { db, runs, assignments, ledger, get runtime() { return runtime; }, coordinator, createCoordinator, host, calls, policy, start, end, report, port,
    restartRuntime: () => { runtime.stop(); runtime = createRuntime(); }, setObservedModel: (model: string) => { observedModel = model; },
    get tasks() { return session.tasks; },
    get singleTurns() { return singleTurns; }, get stops() { return stops; }, get hostActions() { return hostActions; } };
}

describe("supervised saved-Agent delegations", () => {
  test("omission selects supervision only for saved Agents, and explicit lifecycles and historical limits remain distinct", () => {
    expect(DelegateTaskArgsSchema.parse(request()).lifecycle).toBe("supervised");
    expect(DelegateTaskArgsSchema.parse(request({ agentConfigId: undefined })).lifecycle).toBe("one-turn");
    for (const lifecycle of ["one-turn", "detached"])
      expect(DelegateTaskArgsSchema.parse(request({ lifecycle })).lifecycle).toBe(lifecycle);
    expect(DelegateTaskArgsSchema.safeParse(request({ maxTurns: 31 })).success).toBe(false);
    expect(DelegateTaskArgsSchema.safeParse(request({ lifecycle: "one-turn", maxTurns: 2 })).success).toBe(false);
    expect(DelegateTaskArgsSchema.safeParse(request({ agentConfigId: undefined, lifecycle: "supervised" })).success).toBe(false);
  });

  test("first turn end stays open; a later scoped report completes once, with exact report and identity", async () => {
    const h = harness(), child = await h.start();
    expect(child.lifecycle).toBe("supervised");
    expect(h.singleTurns).toBe(0);
    expect(h.runs.getAggregate(child.agentRunId!)?.agentRun.maxTurns).toBe(30);
    h.end("turn-1"); await h.runtime.requestTick();
    await h.coordinator.reconcile();
    expect((await h.coordinator.get(child))?.phase).not.toBe("completed");
    expect(h.calls).toHaveLength(2);
    await h.report("turn-2"); h.end("turn-2"); await h.runtime.requestTick();
    await h.coordinator.waitForInFlight(); await h.coordinator.reconcile();
    const done = await h.coordinator.get(child);
    expect(done?.phase).toBe("completed"); expect(done?.result).toContain("Reviewed and verified.");
    expect(done?.delegatedTurnId).toBe("turn-2");
    expect(h.ledger.listReceipts({ runId: child.runId }).filter(r => r.type === "completed")).toHaveLength(1);
  });

  for (const provider of ["claude-code", "codex"] as const) test(`${provider} continuations and user replies retain admitted permissions and model`, async () => {
    const h = harness(provider), child = await h.start({ model: provider === "codex" ? "gpt-6-sol" : "sonnet", effort: "high" });
    h.end("turn-1"); await h.runtime.requestTick();
    expect(h.calls).toHaveLength(2);
    for (const call of h.calls) {
      expect(call.parentTaskId).toBe("parent");
      expect(call.runtimeOptions).toMatchObject(h.policy.options);
      expect(call.runtimeOptions.model).toBe(child.requestedModel);
      expect(call.runtimeOptions.boundSecretIds).toBeUndefined();
    }
    h.end("turn-2"); await h.runtime.requestTick();
    const reply = h.runtime.prepareUserTurn({ taskId: child.delegatedTaskId, workspaceId: "ws", turnId: "reply", providerId: provider });
    expect(reply?.runtimeOptions).toMatchObject(h.policy.options);
    expect(() => h.runtime.prepareUserTurn({ taskId: child.delegatedTaskId, turnId: "other", providerId: provider === "codex" ? "claude-code" : "codex" })).toThrow();
    await h.coordinator.stop({ parentTaskId: child.parentTaskId, delegationKey: child.delegationKey }); await h.coordinator.waitForInFlight();
  });

  test("a smaller turn limit fails the assignment rather than accepting the provider response", async () => {
    const h = harness(), child = await h.start({ maxTurns: 1 });
    h.end("turn-1"); await h.runtime.requestTick(); await h.coordinator.waitForInFlight();
    expect((await h.coordinator.get(child))?.phase).toBe("failed");
    expect(h.runs.getAggregate(child.agentRunId!)?.agentRun.stopReason).toBe("turn-cap-reached");
    expect(h.calls).toHaveLength(1);
  });

  test("blocked child retains its concurrency slot and exact supervisor; restart ignores native completion", async () => {
    const h = harness(), child = await h.start();
    await h.runtime.blockStage({ agentRunKey: "turn-1", block: { kind: "input", missing: "Select a target.", suggestedAction: "Reply in the child task." } });
    h.end("turn-1"); await h.runtime.requestTick();
    const restarted = h.createCoordinator(); await restarted.reconcile();
    const waiting = await restarted.get(child);
    expect(waiting?.phase).toBe("waiting"); expect(waiting?.reason).toContain("Select a target");
    expect(resolveDelegatedTaskControls(waiting!).canFollowUp).toBe(false);
    expect(resolveDelegatedTaskControls(waiting!).canDetach).toBe(false);
    expect(waiting?.agentRunId).toBe(child.agentRunId);
    h.host.readAgentRun = async () => null; await restarted.reconcile();
    expect((await restarted.get(child))?.phase).toBe("waiting");
    await h.coordinator.stop({ parentTaskId: child.parentTaskId, delegationKey: child.delegationKey }); await h.coordinator.waitForInFlight();
  });

  test("Stop cancels supervision before the native task and no further turn starts", async () => {
    const h = harness(), child = await h.start();
    await h.coordinator.stop({ parentTaskId: child.parentTaskId, delegationKey: child.delegationKey }); await h.coordinator.waitForInFlight(); await h.runtime.requestTick();
    expect(h.runs.getAggregate(child.agentRunId!)?.agentRun.state).toBe("cancelled");
    expect((await h.coordinator.get(child))?.phase).toBe("cancelled");
    expect(h.stops).toBe(1); expect(h.calls).toHaveLength(1);
  });

  test("a bounded reply resumes a blocked managed child in the same attempt and preserves its stage grant", async () => {
    const h = harness(), child = await h.start();
    await h.runtime.blockStage({ agentRunKey: "turn-1", block: { kind: "input", missing: "Choose a target.", suggestedAction: "Reply in the child task." } });
    h.end("turn-1"); await h.runtime.requestTick();
    const blocked = await h.runtime.get({ agentRunId: child.agentRunId! }), record = blocked.stages[0]!;
    await expect(h.runtime.reply({ agentRunId: child.agentRunId!, stageId: record.stageId, attempt: record.attempt + 1, feedback: "Use CSV." })).rejects.toThrow("stage changed");
    await h.runtime.reply({ agentRunId: child.agentRunId!, stageId: record.stageId, attempt: record.attempt, feedback: "Use CSV." });
    expect(h.calls).toHaveLength(2);
    expect(h.calls[1]?.parentTaskId).toBe("parent"); expect(h.calls[1]?.runtimeOptions).toMatchObject(h.policy.options);
    await h.report("turn-2"); h.end("turn-2"); await h.runtime.requestTick(); await h.coordinator.waitForInFlight();
    expect((await h.coordinator.get(child))?.phase).toBe("completed");
  });

  test("takeover ends the child supervisor even between native turns", async () => {
    const h = harness(), child = await h.start(); h.end("turn-1");
    await h.runtime.endAgentRunForTask({ taskId: child.delegatedTaskId!, delegatedOnly: true });
    await h.coordinator.waitForInFlight(); await h.runtime.requestTick();
    expect((await h.coordinator.get(child))?.phase).toBe("cancelled"); expect(h.calls).toHaveLength(1);
  });

  test("an absent supervisor after restart interrupts admission while host unavailability remains deferred", async () => {
    const h = harness(); let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    h.host.runAgentRun = async args => { await gate; return h.port.run(args); };
    const response = await h.coordinator.delegate(request());
    const restarted = h.createCoordinator(), read = h.host.readAgentRun;
    h.host.readAgentRun = async () => null; await restarted.reconcile();
    expect((await restarted.get(response.child!))?.phase).toBe("running");
    h.host.readAgentRun = read; await restarted.reconcile();
    expect((await restarted.get(response.child!))?.phase).toBe("interrupted");
    release(); await h.coordinator.waitForInFlight(); expect(h.calls).toHaveLength(0);
  });

  test("oversized supervised assignments return an actionable rejection instead of a generic invalid request", async () => {
    const h = harness(), response = await h.coordinator.delegate(request({ prompt: "x".repeat(8001) }));
    expect(response.accepted).toBe(false); expect(response.message).toContain("8000"); expect(response.message).toContain("one-turn");
    expect(h.calls).toHaveLength(0);
  });

  test("paused or non-reply stages cannot bypass delegated authority through an ordinary user turn", async () => {
    const h = harness(), child = await h.start();
    await h.runtime.pause({ agentRunId: child.agentRunId! });
    expect(() => h.runtime.prepareUserTurn({ taskId: child.delegatedTaskId!, workspaceId: "ws", turnId: "reply", providerId: "codex" })).toThrow("Resume the delegated Agent run");
    expect(h.calls).toHaveLength(1);
    await h.coordinator.stop({ parentTaskId: child.parentTaskId, delegationKey: child.delegationKey }); await h.coordinator.waitForInFlight();
  });

  test("new supervisor observations refresh waiting reasons and older waiting cannot undo a resume", async () => {
    const h = harness(), child = await h.start();
    await h.runtime.blockStage({ agentRunKey: "turn-1", block: { kind: "input", missing: "Select a target.", suggestedAction: "Reply in the child task." } });
    h.end("turn-1"); await h.runtime.requestTick();
    const blocked = await h.runtime.get({ agentRunId: child.agentRunId! });
    const read = h.host.readAgentRun;
    const latestSequence = blocked.events.at(-1)!.sequence;
    h.host.readAgentRun = async () => ({ ...blocked, agentRun: { ...blocked.agentRun, state: "paused", reasonDetail: "Paused for a new decision." },
      events: [...blocked.events, { ...blocked.events.at(-1)!, sequence: latestSequence + 1 }] });
    const restarted = h.createCoordinator(); await restarted.reconcile();
    expect((await restarted.get(child))?.reason).toBe("Paused for a new decision.");
    h.host.readAgentRun = async () => ({ ...blocked, stages: blocked.stages.map(stage => ({ ...stage, status: "running" })),
      events: [...blocked.events, { ...blocked.events.at(-1)!, sequence: latestSequence + 2 }] });
    await restarted.reconcile(); expect((await restarted.get(child))?.phase).toBe("running");
    h.host.readAgentRun = async () => blocked; await restarted.reconcile();
    expect((await restarted.get(child))?.phase).toBe("running");
    h.host.readAgentRun = read;
    await h.coordinator.stop({ parentTaskId: child.parentTaskId, delegationKey: child.delegationKey }); await h.coordinator.waitForInFlight();
  });

  test("running observations and repeated identical waiting do not grow the ledger", async () => {
    const h = harness(), child = await h.start(), read = h.host.readAgentRun;
    const running = await h.runtime.get({ agentRunId: child.agentRunId! }), count = h.ledger.listReceipts({ runId: child.runId }).length;
    h.host.readAgentRun = async () => ({ ...running, events: [...running.events, { ...running.events.at(-1)!, sequence: running.events.at(-1)!.sequence + 10 }] });
    const restarted = h.createCoordinator(); await restarted.reconcile();
    expect(h.ledger.listReceipts({ runId: child.runId })).toHaveLength(count);
    h.host.readAgentRun = read;
    await h.runtime.blockStage({ agentRunKey: "turn-1", block: { kind: "input", missing: "Choose a target.", suggestedAction: "Reply." } });
    h.end("turn-1"); await h.runtime.requestTick(); await h.coordinator.reconcile();
    const blocked = await h.runtime.get({ agentRunId: child.agentRunId! }), waitingCount = h.ledger.listReceipts({ runId: child.runId }).length;
    h.host.readAgentRun = async () => ({ ...blocked, events: [...blocked.events, { ...blocked.events.at(-1)!, sequence: blocked.events.at(-1)!.sequence + 20 }] });
    await h.coordinator.reconcile(); expect(h.ledger.listReceipts({ runId: child.runId })).toHaveLength(waitingCount);
    h.host.readAgentRun = read; await h.coordinator.stop({ parentTaskId: child.parentTaskId, delegationKey: child.delegationKey }); await h.coordinator.waitForInFlight();
  });

  test("an existing task model cannot replace the admitted model during preparation", async () => {
    const h = harness(); h.setObservedModel("gpt-6-luna");
    const response = await h.coordinator.delegate(request({ model: "gpt-6-sol" })); await h.coordinator.waitForInFlight();
    expect((await h.coordinator.get(response.child!))?.phase).toBe("failed"); expect(h.calls).toHaveLength(0);
  });

  test("already-cancelled admission creates no idle child when its preparation resumes", async () => {
    const h = harness(); let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    h.host.runAgentRun = async args => { await gate; return h.port.run(args); };
    await h.coordinator.delegate(request()); await h.coordinator.stop({ parentTaskId: "parent", delegationKey: "assignment" });
    release(); await h.coordinator.waitForInFlight(); expect(h.tasks).toHaveLength(0); expect(h.calls).toHaveLength(0);
  });

  test("external-effect workflow consent stays empty and public starts cannot forge delegation authority", () => {
    const workflow = buildAgentRunWorkflow({ agent: { ...agent, workflow: [{ id: "publish", title: "Publish", kind: "ai", role: "publish", instruction: "Publish.", doneWhen: "Published." }] }, now: new Date() });
    expect(AgentRunStartInputSchema.safeParse({ workspaceId: "ws", leadTaskId: "task", workflow, assignment: "Do it", consent: { checkIns: "when-stuck", permissionMode: "manual", authorizedEffectStageIds: [] }, delegation: { permissionPolicy: {} } }).success).toBe(false);
    const input = buildDelegatedAgentRunInput({ agent: { ...agent, workflow: workflow.stages }, now: new Date(), start: {
      agentRunId: "run", workspaceId: "ws", taskId: "task", title: "Publish", prompt: "Do it", model: "gpt-6-sol", maxTurns: 30,
      authority: { parentTaskId: "parent", executionId: "exec", agentConfigId: agent.id, agentContentHash: "hash", permissionPolicy: resolveDelegationPermissionPolicy({ providerId: "codex", access: "read-only" }) },
    } });
    expect(input.consent.authorizedEffectStageIds).toEqual([]);
    expect(input.workflow.team).toBe("solo");
  });

  test("a new runtime reconstructs continuation authority from SQLite rather than user settings", async () => {
    const h = harness(), child = await h.start();
    h.end("turn-1"); h.restartRuntime(); await h.runtime.requestTick();
    expect(h.calls).toHaveLength(2);
    expect(h.calls[1]?.runtimeOptions).toMatchObject(h.policy.options);
    expect(h.calls[1]?.parentTaskId).toBe("parent");
    await h.coordinator.stop({ parentTaskId: child.parentTaskId, delegationKey: child.delegationKey }); await h.coordinator.waitForInFlight();
  });

  test("Stop racing preparation never activates a provider turn", async () => {
    const h = harness();
    let release!: () => void, prepared!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const reached = new Promise<void>(resolve => { prepared = resolve; });
    h.host.runAgentRun = args => h.port.run({ ...args, onPrepared: async () => { prepared(); await gate; return args.onPrepared(); } });
    const response = await h.coordinator.delegate(request()); await reached;
    await h.coordinator.stop({ parentTaskId: "parent", delegationKey: "assignment" });
    release(); await h.coordinator.waitForInFlight();
    expect(h.calls).toHaveLength(0);
    expect((await h.coordinator.get(response.child!))?.phase).toBe("cancelled");
  });

  test("restart during unacknowledged preparation requires explicit retry and never replays dispatch", async () => {
    const h = harness();
    let release!: () => void, prepared!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const reached = new Promise<void>(resolve => { prepared = resolve; });
    h.host.runAgentRun = args => h.port.run({ ...args, onPrepared: async () => { prepared(); await gate; return args.onPrepared(); } });
    const response = await h.coordinator.delegate(request()); await reached;
    const restarted = h.createCoordinator(); await restarted.reconcile();
    expect((await restarted.get(response.child!))?.phase).toBe("interrupted");
    release(); await h.coordinator.waitForInFlight();
    expect(h.calls).toHaveLength(0);
    expect(h.runs.getAggregate(response.child!.agentRunId!)?.agentRun.state).toBe("cancelled");
  });

  test("retry owns a new supervisor and cannot borrow an old successful result", async () => {
    const h = harness(), child = await h.start({ maxTurns: 1 });
    h.end("turn-1"); await h.runtime.requestTick(); await h.coordinator.waitForInFlight();
    const old = await h.runtime.get({ agentRunId: child.agentRunId! });
    const admitted = await h.coordinator.retry({ repositoryPath: "/tmp/stave", parentWorkspaceId: "ws", parentTaskId: "parent",
      delegationKey: "assignment", prompt: "Review the corrected change.", expected: {
        delegatedTaskId: child.delegatedTaskId, delegatedWorkspaceId: child.delegatedWorkspaceId, attempt: child.attempt } });
    expect(admitted.accepted).toBe(true);
    expect(admitted.child?.agentRunId).not.toBe(child.agentRunId);
    for (let i = 0; i < 100 && h.calls.length < 2; i++) await Bun.sleep(1);
    const read = h.host.readAgentRun;
    h.host.readAgentRun = async () => ({ ...old, agentRun: { ...old.agentRun, state: "completed" }, report: { ...old.report!, outcome: "completed" } });
    const restarted = h.createCoordinator(); await restarted.reconcile();
    expect((await restarted.get(child))?.phase).not.toBe("completed");
    h.host.readAgentRun = read;
    await h.coordinator.stop({ parentTaskId: "parent", delegationKey: "assignment" }); await h.coordinator.waitForInFlight();
  });

  test("read-only permission blocks host script actions with an actionable stage state", async () => {
    const h = harness("codex", { agent: { ...agent, workflow: [{ id: "script", title: "Run check", kind: "action", action: { type: "run-script", scriptId: "check" } }] } });
    const response = await h.coordinator.delegate(request());
    for (let i = 0; i < 100 && !h.runs.getAggregate(response.child!.agentRunId!); i++) await Bun.sleep(1);
    await h.runtime.requestTick();
    const detail = await h.runtime.get({ agentRunId: response.child!.agentRunId! });
    expect(h.hostActions).toBe(0);
    expect(detail.stages[0]?.status).toBe("awaiting-sign-off");
    await h.runtime.signOff({ agentRunId: detail.agentRun.id, stageId: detail.stages[0]!.stageId, attempt: detail.stages[0]!.attempt });
    await h.runtime.requestTick();
    const blocked = await h.runtime.get({ agentRunId: detail.agentRun.id });
    expect(h.hostActions).toBe(0);
    expect(blocked.stages[0]?.status).toBe("blocked");
    expect(blocked.stages[0]?.detail).toContain("read-only");
    await h.coordinator.stop({ parentTaskId: "parent", delegationKey: "assignment" }); await h.coordinator.waitForInFlight();
  });
});

test("adaptive saved helpers share the parent budget while resource changes retain read-only authority", async () => {
  const h = harness("codex", { adaptive: true }), child = await h.start({ model: "gpt-6-sol" });
  const id = child.agentRunId!;
  expect(h.runs.resourceConfig(id)?.link?.rootRunId).toBe("root");
  expect(h.runs.readResources("root")).toMatchObject({ spent: 1, helpersLaunched: 1, activeHelpers: 1, remaining: 1 });
  expect(h.runs.resourceConfig(id)?.policy).toMatchObject({ providerId: "codex", modelLocked: true, effortLocked: false });
  await h.runtime.requestResources({ agentRunKey: "turn-1", request: { effort: "high", reason: "capability-mismatch",
    rationale: "The linked review turn needs deeper reasoning.", evidenceRefs: ["turn-1"] } });
  h.end("turn-1"); await h.runtime.requestTick();
  expect(h.calls[1]?.runtimeOptions).toMatchObject({ model: "gpt-6-sol", codexReasoningEffort: "high", ...h.policy.options });
  expect(h.runs.readResources("root")?.spent).toBe(2);
  await h.report("turn-2"); h.end("turn-2"); await h.runtime.requestTick(); await h.coordinator.waitForInFlight();
  expect((await h.coordinator.get(child))?.phase).toBe("completed");
  expect(h.runs.readResources("root")).toMatchObject({ spent: 2, reserved: 0, activeHelpers: 0, helpersLaunched: 1 });
});

test("a parent ending while idle child creation is pending cannot activate a zombie helper", async () => {
  let finish!: () => void, enter!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const entered = new Promise<void>(resolve => { enter = resolve; });
  const h = harness("codex", { adaptive: true, beforeTaskCreated: () => { enter(); return pending; } });
  const response = await h.coordinator.delegate(request({ model: "gpt-6-sol" }));
  expect(response.accepted).toBe(true);
  await entered;
  await h.runtime.cancel({ agentRunId: "root" });
  finish(); await h.coordinator.waitForInFlight();
  expect(h.calls).toHaveLength(0);
  expect(h.runs.getAggregate(response.child!.agentRunId!)).toBeNull();
  expect(h.runs.readResources("root")).toMatchObject({ spent: 0, reserved: 0, activeHelpers: 0 });
  expect((await h.coordinator.get(response.child!))?.phase).toBe("failed");
});
