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
import { addIdleTask } from "../electron/host-service/idle-task";
import { createEmptyWorkspaceState } from "../src/store/workspace-session-state";
import { rememberAdaptiveCatalog } from "../electron/providers/adaptive-observations";
import { createHostConstrainedRouter, createHostResourceFreezer } from "../electron/host-service/supervision/agent-run-routing-host";
import { TarsStore } from "../electron/persistence/tars-store";
import { buildAgentRouteSettings } from "../src/store/agent-route-settings-sync";
import { defaultSettings } from "../src/store/app-settings";
import { buildStarterProfile } from "../src/lib/providers/auto-routing-profile";
import { DelegationPolicyStore } from "../electron/persistence/delegation-policy-store";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readIndependentReview } from "../electron/host-service/delegated-task-signals";
import { readWorkspaceRevision } from "../electron/host-service/supervision/workspace-revision";

const idle = { ok: true as const, activeTurnId: null, latestTurnId: null, latestTurnCompletedAt: null, latestTurnError: null };
const agent = { ...getBuiltinAgent("reviewer")!, workflow: undefined };
const request = (patch = {}) => ({ repositoryPath: "/tmp/stave", parentWorkspaceId: "ws", parentTaskId: "parent",
  delegationKey: "assignment", prompt: "Review and verify the change.", providerId: "codex", agentConfigId: agent.id,
  workspace: { mode: "same-workspace" }, access: "read-only", ...patch });

function harness(providerId: "claude-code" | "codex" = "codex", options: { agent?: AgentConfig; adaptive?: boolean; accountProfileId?: string; routing?: boolean; explicitAuto?: boolean; pinnedRoot?: boolean; tarsRoot?: boolean; decisionMetadata?: boolean; beforeTaskCreated?: () => Promise<void>; workspacePath?: string } = {}) {
  const savedAgent = options.agent ?? agent;
  const workspacePath = options.workspacePath ?? "/tmp/stave";
  const readHead = async () => options.workspacePath ? execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspacePath, encoding: "utf8" }).trim() : "abc1234";
  const db = new Database(":memory:");
  const assignmentStore = new AgentAssignmentStore(db), tars = new TarsStore(db);
  const runs = new AgentRunStore(db), assignments = createAssignRuntime({ store: assignmentStore, allowNativeSubagents: taskId => !runs.resourceConfig(runs.getActiveAgentRunForTask(taskId)?.id ?? "") });
  const ledger = new RunLedgerStore(db);
  db.run("CREATE TABLE app_state (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL)");
  const routeSettings = new DelegationPolicyStore(db);
  routeSettings.saveRouteSettings(buildAgentRouteSettings({ ...defaultSettings, autoRoutingEnabled: !options.explicitAuto,
    autoRoutingProfile: buildStarterProfile("starter-quality-first") }));
  let session = createEmptyWorkspaceState();
  let clock = new Date("2026-10-09T00:00:00Z");
  const rootModel = options.explicitAuto ? (providerId === "codex" ? "gpt-6-luna" : "claude-haiku-5-5")
    : (providerId === "codex" ? "gpt-6-sol" : "sonnet");
  const freezeResources = createHostResourceFreezer({ assignments: assignmentStore, tars, taskAgent: assignments.agentForTask,
    draft: () => undefined, settings: () => routeSettings.loadRouteSettings(), profiles: () => [] });
  if (options.adaptive) {
    session = addIdleTask(session, { taskId: "parent", workspaceId: "ws", title: "Parent", provider: providerId,
      model: rootModel }).session;
    assignments.recordTaskAgent({ requestId: "root", taskId: "parent", workspaceId: "ws", repositoryPath: "/tmp/stave",
      agent: getBuiltinAgent("implementer")!, providerId, model: rootModel, assignment: "Integrate" });
    const root = createAgentRun({ id: "root", input: AgentRunStartInputSchema.parse({ origin: "agent", workspaceId: "ws", leadTaskId: "parent",
      assignment: "Integrate", workflow: buildAgentRunWorkflow({ agent: { name: "Root" }, now: clock }), maxTurns: 30,
      expiresAt: "2026-10-10T00:00:00Z", consent: { permissionMode: "manual", checkIns: "when-stuck", authorizedEffectStageIds: [] } }),
      repositoryPath: "/tmp/stave", fingerprint: { providerId, model: rootModel }, now: clock });
    let admission;
    if (options.explicitAuto || options.tarsRoot) {
      const row = tars.create({ requestId: "tars-parent", title: "Integrate", instruction: "Integrate", acceptanceCriteria: ["Verified"],
        workspaceId: "source", repositoryPath: "/tmp/stave", providerId, model: options.pinnedRoot ? root.agentRun.fingerprint.model : null }, clock.toISOString());
      tars.patch(row.id, row.revision, { executionWorkspaceId: "ws", taskId: "parent" }, clock.toISOString());
      assignments.recordTaskAgent({ requestId: `tars-${row.id}`, taskId: "parent", workspaceId: "ws", repositoryPath: "/tmp/stave",
        agent: getBuiltinAgent("implementer")!, providerId, model: null, assignment: "Integrate" });
      root.agentRun.workflow.id = `tars-${row.id}`;
      admission = { tarsResponsibilityId: row.id };
    }
    const rootPolicy = freezeResources({ run: root.agentRun, routingIntent: options.pinnedRoot
      ? { model: root.agentRun.fingerprint.model, modelProviderId: providerId, autoRouting: false } : { autoRouting: true }, admission,
      ...(options.accountProfileId ? { accounts: providerId === "codex" ? { codexAccountProfileId: options.accountProfileId } : { claudeAccountProfileId: options.accountProfileId } } : {}) });
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
  let classified = 0;
  const constrained = createHostConstrainedRouter({ runs, assignment: assignments.assignmentForTask,
    settings: () => options.explicitAuto || options.pinnedRoot ? new DelegationPolicyStore(db).loadRouteSettings() : buildAgentRouteSettings({ ...defaultSettings, autoRoutingEnabled: true }),
    profiles: () => [], history: () => [], cwd: async () => "/tmp/stave",
    classify: async () => { classified++; return { ok: true, classification: { version: 2, intent: "review", complexity: "low", risk: "normal", continuity: "new", domain: "logic", evidenceCodes: [] },
      ...(options.decisionMetadata ? { utility: { providerId: null, model: "moonshotai/jev", selectionReason: "explicit" as const, degraded: false, attempts: [],
        routing: { providerId: "gateway" as const, model: "moonshotai/jev", preferred: { mode: "gateway" as const, connectionId: "11111111-1111-4111-8111-111111111111", model: "moonshotai/jev" }, fallback: false, elapsedMs: 24, reportedCostUsd: 0.001 } } } : {}) }; } });
  const createRuntime = () => createAgentRunRuntime({
    store: runs, delegatedAssignment: assignments.assignmentForTask,
    ...(options.routing ? { routeConstrainedTurn: constrained } : {}),
    freezeResources,
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
    resolveAgentRunGrant: key => grants.get(key) ?? null, resolveWorkspacePath: async () => workspacePath,
    readHeadSha: readHead, readWorkspaceRevision: options.workspacePath ? readWorkspaceRevision : undefined,
    collectStageFacts: async () => options.workspacePath ? { ...EMPTY_STAGE_FACTS, workspaceRevision: await readWorkspaceRevision(workspacePath) } : EMPTY_STAGE_FACTS,
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
    resolveWorkspace: async () => ({ workspaceId: "ws", workspacePath, repositoryPath: workspacePath }),
    createWorkspace: async () => { throw new Error("not needed"); }, getTaskStatus: async () => idle,
    runTask: async () => { singleTurns++; return { turnId: "single-turn" }; },
    stopTask: async () => { stops++; }, releaseTaskParent: async () => {},
    runAgentRun: port.run, readAgentRun: port.read, stopAgentRun: port.stop,
    replyAgentRun: args => runtime.reply(args),
  };
  const createCoordinator = () => createDelegatedTaskCoordinator({
    ...(options.routing ? { resolveTurnRoute: constrained } : {}),
    host, readHead, readResourceRoot: taskId => runtime.resourceRootForTask(taskId), concurrencyLimit: 3, getLedger: () => ({
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
      taskId: args.target.taskId, workspaceId: args.target.workspaceId, repositoryPath: workspacePath, agent: args.snapshot.agent,
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
    get classified() { return classified; },
    get singleTurns() { return singleTurns; }, get stops() { return stops; }, get hostActions() { return hostActions; } };
}

describe("supervised saved-Agent delegations", () => {
  test.each(["valid", "moved-head", "legacy-caller", "cancelled"] as const)("only a completed pinned reviewer produces ledger proof (%s)", async (variant) => {
    const cwd = mkdtempSync(join(tmpdir(), "stave-pinned-review-"));
    const git = (...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
    const commit = (text: string) => {
      writeFileSync(join(cwd, "work.txt"), text);
      git("add", "work.txt");
      git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", text);
      return git("rev-parse", "HEAD");
    };
    const h = harness("codex", { workspacePath: cwd });
    try {
      git("init", "-q");
      const expectedHead = commit("reviewed");
      const response = await h.coordinator.delegateFromTool({
        prompt: "Review the pinned commit.", delegationKey: "review", provider: "codex", repositoryPath: cwd,
        agentConfigId: "reviewer", access: "read-only", workspace: { mode: "same-workspace" }, expectedHead, wait: false,
      }, { taskId: "parent", workspaceId: "ws", ...(variant === "legacy-caller" ? {} : { turnId: "parent-review-turn" }) });
      expect(response.accepted).toBe(true);
      for (let i = 0; i < 100 && !h.calls.length; i++) await Bun.sleep(1);
      expect(h.calls).toHaveLength(1);
      if (variant === "moved-head") commit("unreviewed");
      if (variant === "cancelled") {
        await h.runtime.cancel({ agentRunId: response.child!.agentRunId! });
      } else {
        await h.runtime.reportStage({ agentRunKey: "turn-1", report: { summary: "Review complete.", reviewVerdict: "passed" } });
        h.end("turn-1");
        await h.runtime.requestTick();
      }
      await h.coordinator.waitForInFlight();
      const store = { listRunAggregatesByOrigin: h.ledger.listAggregatesByOrigin.bind(h.ledger), listRunReceipts: h.ledger.listReceipts.bind(h.ledger) };
      const read = (turnId: string) => readIndependentReview({ taskId: "parent", workspaceId: "ws", turnIds: new Set([turnId]) }, store);
      expect(read("previous-attempt-turn")).toBeUndefined();
      const child = await h.coordinator.get(response.child!);
      expect(child?.phase).toBe(variant === "cancelled" ? "cancelled" : "completed");
      if (variant === "valid") {
        expect(read("parent-review-turn")).toMatchObject({
          delegationId: response.child!.runId, verdict: "passed", revision: await readWorkspaceRevision(cwd),
        });
        expect(child?.result).toContain("Review verdict: passed");
      } else {
        expect(read("parent-review-turn")).toBeUndefined();
      }
    } finally {
      h.runtime.stop();
      h.db.close();
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  for (const providerId of ["codex", "claude-code"] as const) for (const tarsRoot of [false, true]) test(`${providerId}: global-on pinned parent leaves helper classification free of its pin and keeps the helper effort (Tars: ${tarsRoot})`, async () => {
    const h = harness(providerId, { routing: true, adaptive: true, pinnedRoot: true, tarsRoot });
    expect(h.runs.resourceConfig("root")?.policy).toMatchObject({ modelLocked: true });
    expect(h.runs.resourceConfig("root")?.policy).not.toHaveProperty("autoRouting");
    const child = await h.start();
    expect(h.classified).toBeGreaterThan(0);
    const effort = providerId === "codex" ? "codexReasoningEffort" : "claudeEffort";
    expect(h.calls[0]!.runtimeOptions[effort]).toBe("high");
    // The parent's pin binds its own turns: the helper's Auto route picks from the whole eligible catalog
    // (the Claude parent is pinned to Sonnet, yet the review routes to Opus).
    expect(h.calls[0]!.runtimeOptions.model).toBe(providerId === "codex" ? "gpt-6-sol" : "claude-opus-5-5");
    h.end("turn-1"); h.restartRuntime(); await h.runtime.requestTick();
    expect(h.calls).toHaveLength(2);
    expect(h.calls[1]!.runtimeOptions[effort]).toBe("high");
    await h.coordinator.stop({ parentTaskId: child.parentTaskId, delegationKey: child.delegationKey }); await h.coordinator.waitForInFlight();
  });
  for (const providerId of ["codex", "claude-code"] as const) test(`${providerId}: explicit parent Auto survives delegated admission and continuation after runtime restart with app Auto off`, async () => {
    const h = harness(providerId, { routing: true, adaptive: true, explicitAuto: true });
    const child = await h.start();
    const initialClassifications = h.classified;
    expect(initialClassifications).toBeGreaterThan(0);
    expect(h.runs.resourceConfig(child.agentRunId!)?.policy.autoRouting).toBe(true);
    expect(h.calls[0]!.runtimeOptions).toMatchObject(providerId === "codex"
      ? { model: "gpt-6.2-sol", codexReasoningEffort: "high", codexFileAccess: "read-only" }
      : { model: "claude-opus-5-5", claudeEffort: "high", claudeSandboxReadOnly: true });
    h.end("turn-1"); h.restartRuntime(); await h.runtime.requestTick();
    expect(h.classified).toBe(initialClassifications + 1);
    expect(h.calls).toHaveLength(2);
    expect(h.calls[1]!.runtimeOptions).toEqual(h.calls[0]!.runtimeOptions);
    await h.coordinator.stop({ parentTaskId: child.parentTaskId, delegationKey: child.delegationKey }); await h.coordinator.waitForInFlight();
  });
  test("delegated AI host-check criteria refuse preparation with a reason before any run or turn", async () => {
    const h = harness("codex", { agent: { ...agent, workflow: [{ id: "check", title: "Check", kind: "ai", instruction: "Check work", doneWhen: "Checked",
      acceptanceCriteria: [{ text: "Workspace checks pass", verification: "stave-check" }],
    }] } });
    const response = await h.coordinator.delegate(request());
    expect(response.accepted).toBe(true);
    await h.coordinator.waitForInFlight();
    const child = await h.coordinator.get(response.child!);
    expect(child?.phase).toBe("failed");
    expect(child?.reason).toContain("Delegated runs cannot execute host workspace checks");
    expect(h.runs.getAggregate(response.child!.agentRunId!)).toBeNull();
    expect(h.calls).toHaveLength(0);
  });
  test("admission Decision is billed once for the first turn, persisted, and refreshed only on continuation", async () => {
    const h = harness("codex", { routing: true, decisionMetadata: true });
    const child = await h.start();
    expect(h.classified).toBe(1);
    const started = h.runs.listEventsByKind(child.agentRunId!, ["turn-started"])[0];
    expect(started?.detail?.routingDecision).toMatchObject({ providerId: "gateway", model: "moonshotai/jev", reportedCostUsd: 0.001 });
    h.end("turn-1"); h.restartRuntime(); await h.runtime.requestTick();
    expect(h.calls).toHaveLength(2); expect(h.classified).toBe(2);
    expect(h.calls[1]!.runtimeOptions.codexFileAccess).toBe("read-only");
    await h.coordinator.stop({ parentTaskId: child.parentTaskId, delegationKey: child.delegationKey }); await h.coordinator.waitForInFlight();
  });
  test("Decision routes a saved Auto delegate on admission and continuation while its persisted read-only authority survives restart", async () => {
    const h = harness("codex", { routing: true });
    const child = await h.start();
    expect(h.classified).toBeGreaterThan(0);
    expect(h.calls[0]!.runtimeOptions.codexFileAccess).toBe("read-only");
    // The delegate rule (flagship at medium effort) applies at run time.
    expect(h.calls[0]!.runtimeOptions.model).toBe("gpt-6.2-sol");
    h.end("turn-1"); h.restartRuntime(); await h.runtime.requestTick();
    expect(h.calls).toHaveLength(2);
    expect(h.classified).toBeGreaterThan(2);
    expect(h.calls[1]!.runtimeOptions.codexFileAccess).toBe("read-only");
    await h.coordinator.stop({ parentTaskId: child.parentTaskId, delegationKey: child.delegationKey }); await h.coordinator.waitForInFlight();
  });
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

  test("every turn of the supervised run stays one level deep; a run the user starts in that task does not", async () => {
    const h = harness(), child = await h.start();
    const caller = { taskId: child.delegatedTaskId, workspaceId: "ws" };
    // A later stage turn or reply of the delegated run: its id is not the recorded turn, its run is.
    const fromRun = await h.coordinator.delegateFromTool({ prompt: "Go deeper.", access: "read-only" }, { ...caller, turnId: "reply-turn", agentRunId: child.agentRunId! });
    expect(fromRun).toMatchObject({ accepted: false, reason: "invalid-request" });
    expect(fromRun.message).toContain("cannot start subagents");
    const fromUserRun = await h.coordinator.delegateFromTool({ prompt: "Review it.", access: "read-only", wait: false, provider: "codex" }, { ...caller, turnId: "user-turn", agentRunId: "user-run" });
    expect(fromUserRun).toMatchObject({ accepted: true, child: { parentTaskId: child.delegatedTaskId } });
    await h.coordinator.stop({ parentTaskId: child.parentTaskId, delegationKey: child.delegationKey }); await h.coordinator.waitForInFlight();
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

  for (const provider of ["claude-code", "codex"] as const) test(`${provider}: a parent's follow-up continues a stuck supervised child on its own route`, async () => {
    // Recorded failure: a stuck nested Reviewer could only be stopped; its parent had no way to answer it.
    const h = harness(provider), child = await h.start({ model: provider === "codex" ? "gpt-6-sol" : "sonnet", effort: "high" });
    h.end("turn-1"); await h.runtime.requestTick();
    h.end("turn-2"); await h.runtime.requestTick();
    // The app reconciles on every child Run change; the harness does it once here.
    await h.coordinator.reconcile({ taskId: child.delegatedTaskId!, agentRunId: child.agentRunId! });
    let waiting = await h.coordinator.get(child);
    for (let i = 0; i < 200 && !(waiting?.phase === "waiting" && waiting.waitsForPerson); i++) { await Bun.sleep(2); waiting = await h.coordinator.get(child); }
    expect(waiting).toMatchObject({ phase: "waiting", lifecycle: "supervised", waitsForPerson: true });
    const before = h.calls.length;
    const identity = { delegatedTaskId: waiting!.delegatedTaskId!, delegatedWorkspaceId: waiting!.delegatedWorkspaceId!, attempt: waiting!.attempt };
    // The Run keeps the permissions it was admitted with: a reply asking for others is refused, not silently ignored.
    const narrowed = await h.coordinator.followUp({ parentTaskId: child.parentTaskId, delegationKey: child.delegationKey,
      prompt: "Continue with approvals.", permissionProfile: "manual", expected: identity });
    expect(narrowed).toMatchObject({ accepted: false, reason: "invalid-request" });
    expect(h.calls.length).toBe(before);
    const followed = await h.coordinator.followUp({ parentTaskId: child.parentTaskId, delegationKey: child.delegationKey,
      prompt: "Review only the diff since abc1234 and report.",
      expected: { delegatedTaskId: waiting!.delegatedTaskId!, delegatedWorkspaceId: waiting!.delegatedWorkspaceId!, attempt: waiting!.attempt } });
    expect(followed.accepted).toBe(true);
    expect(h.calls.length).toBe(before + 1);
    // The reply keeps the admitted permissions and model; it is not a new delegation.
    expect(h.calls.at(-1)!.runtimeOptions).toMatchObject(h.policy.options);
    expect(h.calls.at(-1)!.runtimeOptions.model).toBe(child.requestedModel);
    expect(h.runs.listEventsByKind(child.agentRunId!, ["turn-started"]).at(-1)?.detail.reason).toBe("continue-after-user");
    await h.coordinator.stop({ parentTaskId: child.parentTaskId, delegationKey: child.delegationKey }); await h.coordinator.waitForInFlight();
  });

  for (const providerId of ["claude-code", "codex"] as const) test(`${providerId}: a delegated run keeps working past a saved smaller turn limit and completes`, async () => {
    const h = harness(providerId), child = await h.start({ maxTurns: 1 });
    h.end("turn-1"); await h.runtime.requestTick();
    // The reminder turn starts instead of ending the child at its saved limit of 1.
    expect(h.calls).toHaveLength(2);
    expect(h.runs.getAggregate(child.agentRunId!)?.agentRun).toMatchObject({ state: "running", stopReason: null, turnCount: 2, maxTurns: 1 });
    await h.report("turn-2"); h.end("turn-2"); await h.runtime.requestTick(); await h.coordinator.waitForInFlight();
    expect(h.runs.getAggregate(child.agentRunId!)?.agentRun.state).toBe("completed");
    expect((await h.coordinator.get(child))?.phase).toBe("completed");
  });

  test("an older tool call that still passes maxTurns names the same delegation when sent again, finished or not", async () => {
    const h = harness();
    // Saved before the update, with the caller's value in its request hash and run.
    const saved = await h.start({ maxTurns: 1 });
    const call = { prompt: "Review and verify the change.", provider: "codex", agentConfigId: agent.id, delegationKey: "assignment",
      workspace: { mode: "same-workspace" }, access: "read-only", maxTurns: 1, wait: false };
    const caller = { taskId: "parent", workspaceId: "ws" };
    // The value is accepted and ignored: the same call is the same delegation, and the run is not stopped by it.
    expect(await h.coordinator.delegateFromTool(call, caller)).toMatchObject({ accepted: true, child: { agentRunId: saved.agentRunId } });
    expect(h.calls).toHaveLength(1);
    await h.report("turn-1"); h.end("turn-1"); await h.runtime.requestTick(); await h.coordinator.waitForInFlight();
    expect((await h.coordinator.get(saved))?.phase).toBe("completed");
    expect(await h.coordinator.delegateFromTool(call, caller)).toMatchObject({ accepted: true, child: { agentRunId: saved.agentRunId } });
    expect(h.calls).toHaveLength(1);
  });

  test("a child that reports a criterion unmet ends, and its report still reaches the parent", async () => {
    const h = harness(), child = await h.start();
    await h.runtime.reportStage({ agentRunKey: "turn-1", report: {
      summary: "Review found a defect: inline-render.ts splits the font-src string to dodge the check.",
      acceptanceCriteria: [{ text: "Design-system violations fixed without gaming the check", status: "unmet" }] } });
    h.end("turn-1"); await h.runtime.requestTick(); await h.coordinator.waitForInFlight();
    const ended = await h.coordinator.get(child);
    expect(ended?.phase).toBe("failed");
    expect(h.runs.getAggregate(child.agentRunId!)?.agentRun.stopReason).toBe("acceptance-unmet");
    expect(ended?.result).toContain("splits the font-src string");
    expect(h.calls).toHaveLength(1);
  });

  test("blocked child retains its concurrency slot and exact supervisor; restart ignores native completion", async () => {
    const h = harness(), child = await h.start();
    await h.runtime.blockStage({ agentRunKey: "turn-1", block: { kind: "input", missing: "Select a target.", suggestedAction: "Reply in the child task." } });
    h.end("turn-1"); await h.runtime.requestTick();
    const restarted = h.createCoordinator(); await restarted.reconcile();
    const waiting = await restarted.get(child);
    expect(waiting?.phase).toBe("waiting"); expect(waiting?.reason).toContain("Select a target");
    // Its parent is its manager: it may answer the child's question with a follow-up on the same Run.
    expect(resolveDelegatedTaskControls(waiting!).canFollowUp).toBe(true);
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

  test("a child waiting for its usage reset does not need you, and needs you once the reset can no longer resume it", async () => {
    const h = harness(), child = await h.start(), read = h.host.readAgentRun;
    const live = await h.runtime.get({ agentRunId: child.agentRunId! });
    const sequence = live.events.at(-1)!.sequence;
    const limit = { turnId: "turn-1", resetsAt: "2026-09-26T11:00:00.000Z", accountProfileId: "system-default", fingerprint: live.agentRun.fingerprint };
    h.host.readAgentRun = async () => ({ ...live, agentRun: { ...live.agentRun, state: "paused", pauseReason: "usage-limit", reasonDetail: "",
      usageLimit: { ...limit, resumeAt: "2026-09-26T11:00:30.000Z" } }, events: [...live.events, { ...live.events.at(-1)!, sequence: sequence + 1 }] });
    const restarted = h.createCoordinator(); await restarted.reconcile();
    expect(await restarted.get(child)).toMatchObject({ phase: "waiting" });
    expect((await restarted.get(child))?.waitsForPerson).toBeUndefined();
    // The resume read found the account still exhausted with no reset time: the same words, now a wait for a person.
    h.host.readAgentRun = async () => ({ ...live, agentRun: { ...live.agentRun, state: "paused", pauseReason: "usage-limit", reasonDetail: "",
      usageLimit: { ...limit, resetsAt: null, resumeAt: null } }, events: [...live.events, { ...live.events.at(-1)!, sequence: sequence + 2 }] });
    await restarted.reconcile();
    expect((await restarted.get(child))?.waitsForPerson).toBe(true);
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
    const h = harness(), child = await h.start();
    // The first attempt ends unsuccessfully: a required criterion was not met.
    await h.runtime.reportStage({ agentRunKey: "turn-1", report: { summary: "The change is incomplete.",
      acceptanceCriteria: [{ text: "Change verified", status: "unmet" }] } });
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
  // The helper holds its start turns; the rest of the team's guard against loops stays shared.
  expect(h.runs.readResources("root")).toMatchObject({ spent: 1, reserved: 1, helpersLaunched: 1, activeHelpers: 1, remaining: 198 });
  expect(h.runs.getAggregate(id)?.agentRun.maxTurns).toBe(30);
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

test("a helper past its start turns draws each further turn from the shared budget", async () => {
  const h = harness("codex", { adaptive: true }), child = await h.start({ model: "gpt-6-sol" });
  const id = child.agentRunId!, at = new Date("2026-10-09T00:00:00Z");
  expect(h.runs.consumeResourceTurn(id, "second-held-turn", at)).toBe(true);
  expect(h.runs.readResources("root")).toMatchObject({ spent: 2, reserved: 0, remaining: 198 });
  h.end("turn-1"); await h.runtime.requestTick();
  expect(h.calls).toHaveLength(2);
  expect(h.runs.readResources("root")).toMatchObject({ spent: 3, reserved: 0, remaining: 197, activeHelpers: 1 });
  await h.coordinator.stop({ parentTaskId: "parent", delegationKey: "assignment" }); await h.coordinator.waitForInFlight();
});

test("a helper ends at the team's loop guard when only the parent's integration turn is left", async () => {
  const h = harness("codex", { adaptive: true }), child = await h.start({ model: "gpt-6-sol" });
  const id = child.agentRunId!, at = new Date("2026-10-09T00:00:00Z");
  expect(h.runs.consumeResourceTurn(id, "second-held-turn", at)).toBe(true);
  for (let turn = 0; h.runs.consumeResourceTurn("root", `root-${turn}`, at); turn++) if (turn > 400) throw new Error("The parent was never refused.");
  expect(h.runs.readResources("root")).toMatchObject({ remaining: 1, activeHelpers: 1 });
  h.end("turn-1"); await h.runtime.requestTick(); await h.coordinator.waitForInFlight();
  expect(h.calls).toHaveLength(1);
  expect(h.runs.getAggregate(id)?.agentRun).toMatchObject({ state: "stopped", stopReason: "turn-cap-reached" });
  expect((await h.coordinator.get(child))?.phase).toBe("failed");
  // The parent keeps its turn to integrate what the helper did.
  expect(h.runs.readResources("root")).toMatchObject({ remaining: 1, reserved: 0, activeHelpers: 0 });
  expect(h.runs.consumeResourceTurn("root", "integrate", at)).toBe(true);
});

test("a blocked helper past its saved max turns takes a reply instead of ending", async () => {
  const h = harness("codex", { adaptive: true }), child = await h.start({ model: "gpt-6-sol", maxTurns: 1 });
  const id = child.agentRunId!;
  await h.runtime.blockStage({ agentRunKey: "turn-1", block: { kind: "input", missing: "Select a target.", suggestedAction: "Reply in the child task." } });
  h.end("turn-1"); await h.runtime.requestTick();
  expect(h.runs.getAggregate(id)?.agentRun).toMatchObject({ state: "running", turnCount: 1, maxTurns: 1 });
  expect(h.runtime.prepareUserTurn({ taskId: child.delegatedTaskId, workspaceId: "ws", providerId: "codex", turnId: "past-saved-limit" })).not.toBeNull();
  expect(h.runs.getAggregate(id)?.agentRun).toMatchObject({ state: "running", stopReason: null });
  expect(h.runs.readResources("root")).toMatchObject({ spent: 2, activeHelpers: 1 });
  await h.coordinator.stop({ parentTaskId: "parent", delegationKey: "assignment" }); await h.coordinator.waitForInFlight();
});

test("a paused parent refuses a helper's reply without ending the helper", async () => {
  const h = harness("codex", { adaptive: true }), child = await h.start({ model: "gpt-6-sol", maxTurns: 5 });
  const id = child.agentRunId!, at = new Date("2026-10-09T00:00:00Z");
  expect(h.runs.consumeResourceTurn(id, "second-held-turn", at)).toBe(true);
  await h.runtime.blockStage({ agentRunKey: "turn-1", block: { kind: "input", missing: "Select a target.", suggestedAction: "Reply in the child task." } });
  h.end("turn-1"); await h.runtime.requestTick();
  await h.runtime.pause({ agentRunId: "root" });
  expect(h.runs.helperTurnRefusal(id)).toBe("unavailable");
  expect(() => h.runtime.prepareUserTurn({ taskId: child.delegatedTaskId, workspaceId: "ws", providerId: "codex", turnId: "while-paused" })).toThrow("cannot take the reply");
  expect(h.runs.getAggregate(id)?.agentRun.state).toBe("running");
  expect(h.runs.readResources("root")).toMatchObject({ spent: 2, activeHelpers: 1 });
  await h.runtime.resume({ agentRunId: "root" });
  expect(h.runtime.prepareUserTurn({ taskId: child.delegatedTaskId, workspaceId: "ws", providerId: "codex", turnId: "after-resume" })).not.toBeNull();
  expect(h.runs.readResources("root")?.spent).toBe(3);
  await h.coordinator.stop({ parentTaskId: "parent", delegationKey: "assignment" }); await h.coordinator.waitForInFlight();
});

for (const providerId of ["claude-code", "codex"] as const) test(`${providerId}: the Reply control continues a blocked helper past its saved max turns`, async () => {
  const h = harness(providerId, { adaptive: true }), child = await h.start({ maxTurns: 1 });
  const id = child.agentRunId!;
  await h.runtime.blockStage({ agentRunKey: "turn-1", block: { kind: "input", missing: "Choose a target.", suggestedAction: "Reply in the child task." } });
  h.end("turn-1"); await h.runtime.requestTick();
  const record = (await h.runtime.get({ agentRunId: id })).stages[0]!;
  await h.runtime.reply({ agentRunId: id, stageId: record.stageId, attempt: record.attempt, feedback: "Use CSV." });
  await h.runtime.requestTick();
  expect(h.calls).toHaveLength(2);
  expect(h.runs.getAggregate(id)?.agentRun).toMatchObject({ state: "running", stopReason: null, turnCount: 2, maxTurns: 1 });
  await h.report("turn-2"); h.end("turn-2"); await h.runtime.requestTick(); await h.coordinator.waitForInFlight();
  expect((await h.coordinator.get(child))?.phase).toBe("completed");
  expect(h.runs.readResources("root")).toMatchObject({ activeHelpers: 0, reserved: 0 });
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

test("helper preparation and replies enforce effort support from the inherited root account", async () => {
  const account = "helper-catalog-account", time = Date.parse("2026-10-09T00:00:00Z");
  const restrictEffort = () => rememberAdaptiveCatalog(account, { providerId: "codex", ok: true, detail: "Observed support",
    models: [{ model: "gpt-6-sol", displayName: "Sol", description: "", hidden: false, isDefault: true,
      defaultEffort: "medium", supportedEfforts: ["medium"] }] }, time);
  const h = harness("codex", { adaptive: true, accountProfileId: account });
  const child = await h.start({ model: "gpt-6-sol", effort: "high" });
  await h.runtime.blockStage({ agentRunKey: "turn-1", block: { kind: "input", missing: "Select target.", suggestedAction: "Reply." } });
  h.end("turn-1"); await h.runtime.requestTick();
  restrictEffort();
  expect(() => h.runtime.prepareUserTurn({ taskId: child.delegatedTaskId, workspaceId: "ws", providerId: "codex", turnId: "unsupported-child-reply" })).toThrow("does not support");
  expect(h.runs.readResources("root")?.spent).toBe(1);
  await h.coordinator.stop({ parentTaskId: "parent", delegationKey: "assignment" }); await h.coordinator.waitForInFlight();
  const fresh = harness("codex", { adaptive: true, accountProfileId: account });
  const admitted = await fresh.coordinator.delegate(request({ model: "gpt-6-sol", effort: "high" }));
  expect(admitted.accepted).toBe(true);
  await fresh.coordinator.waitForInFlight();
  expect((await fresh.coordinator.get(admitted.child!))?.phase).toBe("failed");
  expect(fresh.runs.getAggregate(admitted.child!.agentRunId!)).toBeNull();
  expect(fresh.calls).toHaveLength(0);
  expect(fresh.runs.readResources("root")).toMatchObject({ spent: 0, reserved: 0, activeHelpers: 0, helpersLaunched: 1 });
});

for (const providerId of ["codex", "claude-code"] as const) test(`${providerId}: Tars resumes its blocked helper through delegated admission and spends the existing team budget`, async () => {
  const { recoverTarsHelper } = await import("../electron/host-service/tars-helper-recovery");
  const { tarsResponsibility } = await import("./fixtures/tars-host-bridge");
  const h = harness(providerId, { adaptive: true, tarsRoot: true }), child = await h.start();
  await h.runtime.blockStage({ agentRunKey: "turn-1", block: { kind: "input", missing: "Which test target?" } });
  h.end("turn-1"); await h.runtime.requestTick();
  const detail = await h.runtime.get({ agentRunId: child.agentRunId! }), stage = detail.stages[0]!;
  const row = tarsResponsibility({ state: "waiting", taskId: "parent", waitingTaskId: child.delegatedTaskId,
    observedStage: `${child.agentRunId}/${stage.stageId}#${stage.attempt}:${stage.reportRevision}` });
  const before = h.runs.readResources("root")!.spent;
  await recoverTarsHelper(row, "Use the existing unit test target from the task.", {
    readHelpers: async () => [detail], readCurrent: id => h.runs.getAggregate(id), guardRoot: () => {}, reply: h.runtime.reply,
  });
  expect(h.calls).toHaveLength(2);
  expect(h.calls[1]?.parentTaskId).toBe("parent");
  expect(h.calls[1]?.runtimeOptions).toMatchObject(h.policy.options);
  expect(h.runs.readResources("root")!.spent).toBe(before + 1);
  await expect(recoverTarsHelper(row, "Retry old guidance", {
    readHelpers: async () => [detail], readCurrent: id => h.runs.getAggregate(id), guardRoot: () => {}, reply: h.runtime.reply,
  })).rejects.toThrow("no longer waits");
  expect(h.calls).toHaveLength(2);
});
