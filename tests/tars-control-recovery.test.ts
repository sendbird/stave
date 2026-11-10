import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { TarsStore } from "../electron/persistence/tars-store";
import { AgentRunStore } from "../electron/persistence/agent-run-store";
import { TarsConversationStore, TarsStorageBusyError } from "../electron/persistence/tars-conversation-store";
import { createTarsRuntime, type TarsRuntimePorts, type TarsExecutionObservation } from "../electron/host-service/tars-runtime";
import { actTars } from "../electron/host-service/tars-control";
import { controlTarsRun, tarsRunControlApplied, withTarsRunCommand } from "../electron/host-service/tars-ownership";
import { createAgentRunRuntime, type AgentRunRuntimeDependencies } from "../electron/host-service/supervision/agent-run-runtime";
import { createAgentRun, EMPTY_STAGE_FACTS } from "../src/lib/agent-runs/domain";
import { tarsWorkflow } from "../electron/host-service/tars-execution";
import type { TarsControlOperation } from "../src/lib/tars/conversation";
import type { TarsDetailCode } from "../src/lib/tars/types";
import { runWorkspacePreparation } from "../electron/host-service/workspace-preparation";

const NOW = "2026-11-12T00:00:00.000Z";
const cleanup: Array<() => void> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) close(); });

function fixture() {
  const directory = mkdtempSync(path.join(tmpdir(), "tars-controls-"));
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "state.sqlite");
  let observed: TarsExecutionObservation = { state: "running", detail: null };
  let db: Database, store: TarsStore, conversations: TarsConversationStore, runs: AgentRunStore;
  let runRuntime: ReturnType<typeof createAgentRunRuntime>;
  let runtime: ReturnType<typeof createTarsRuntime>;
  let starts = 0, continuations = 0;
  const calls: string[] = [];
  function open(overrides: Partial<TarsRuntimePorts> = {}) {
    db = new Database(filename); store = new TarsStore(db); conversations = new TarsConversationStore(db); runs = new AgentRunStore(db);
    runRuntime = createAgentRunRuntime({ store: runs, now: () => new Date(NOW),
      hasPendingControl: (id) => conversations.hasPendingControlForTask(id),
      getTaskSupervisionSnapshot: async () => ({ exists: true, archived: false, providerId: "codex", model: "test", activeTurnId: null,
        pendingApprovalCount: 0, pendingUserInputCount: 0, repositoryPath: directory }),
      listRecentTurns: () => [], runSupervisedTurn: async () => { starts++; return { turnId: "unexpected" }; },
      completeInterruptedTurn: () => false, countActiveDelegatedTasks: () => 0, isReportingAvailable: async () => true,
      resolveAgentRunGrant: () => null, resolveWorkspacePath: async () => directory, readHeadSha: async () => null,
      collectStageFacts: async () => EMPTY_STAGE_FACTS,
    } as AgentRunRuntimeDependencies);
    runtime = createTarsRuntime({ store, controls: conversations, messages: conversations, now: () => NOW,
      validateScope: async () => {}, prepareWorkspace: async () => { throw new Error("Must keep the existing workspace"); },
      prepareTask: async () => { throw new Error("Must keep the existing task"); }, findRun: async () => null,
      startRun: async () => { throw new Error("Must not start initial execution"); }, observe: async () => observed,
      hasControlEffect: (row, key) => Boolean(row.agentRunId && tarsRunControlApplied(runs.listEventsByKind(row.agentRunId, ["control-applied"]), key)),
      controlRun: async (row, operation, autoExtendMaxTurns, commandId) => {
        calls.push(operation);
        await controlTarsRun(row, operation, { agentRuns: runRuntime, hasAssignment: () => true,
          commandId, commandEvents: (id) => runs.listEventsByKind(id, ["control-applied"]), autoExtendMaxTurns,
          readTask: async () => ({ activeTurnId: null }), readRun: (id) => runs.getAggregate(id)?.agentRun ?? null,
          linkedTurns: () => [], userTurnIds: () => [], abortTurn: () => {} });
      },
      respondTask: async () => { throw new Error("Repair must use a continuation"); },
      deliverMessage: async () => { throw new Error("Completed execution cannot take a reply"); }, hasUserTurn: () => false,
      continueWork: async (row, continuation) => {
        expect(row.taskId).toBe("same-task"); expect(row.executionWorkspaceId).toBe("same-workspace");
        expect(continuation.previousRunId).toBe("original-run");
        continuations++; return "repair-run";
      }, ...overrides,
    });
  }
  open();
  const created = store!.create({ requestId: "original", title: "Fix and verify", instruction: "Fix and verify the existing result.",
    acceptanceCriteria: ["Tests pass"], workspaceId: "source", repositoryPath: directory, providerId: "codex", maxTurns: 30 }, NOW);
  const row = store!.patch(created.id, created.revision, { state: "running", taskId: "same-task", executionWorkspaceId: "same-workspace", agentRunId: "original-run" }, NOW);
  const change = createAgentRun({ id: "original-run", input: { origin: "agent", workspaceId: "same-workspace", leadTaskId: "same-task",
    workflow: tarsWorkflow(row, NOW), assignment: row.instruction, maxTurns: 30,
    consent: { checkIns: "when-stuck", permissionMode: "auto", authorizedEffectStageIds: [] } }, repositoryPath: directory,
    fingerprint: { providerId: "codex", model: "test" }, now: new Date(NOW) });
  runs!.create(change, new Date(NOW));
  cleanup.push(() => { runtime.stop(); runRuntime.stop(); if (!db.closed) db.close(); });
  const current = () => store.get(row.id)!;
  const click = (operation: TarsControlOperation, requestId = operation, expectedRevision = current().revision, text?: string) =>
    actTars({ requestId, source: "click", responsibilityId: row.id, expectedRevision, operation, ...(text ? { input: { text } } : {}) },
      { conversations, responsibilities: store, runtime, now: () => NOW });
  const tick = async () => { runtime.requestTick(); await runtime.drain(); };
  return { current, click, tick, calls, get db() { return db; }, get store() { return store; }, get runs() { return runs; },
    get conversations() { return conversations; }, get runtime() { return runtime; }, get runRuntime() { return runRuntime; },
    observe: (value: TarsExecutionObservation) => { observed = value; }, starts: () => starts, continuations: () => continuations,
    reopen: async (overrides: Partial<TarsRuntimePorts> = {}) => { runtime.stop(); runRuntime.stop(); await runtime.drain(); await runRuntime.whenIdle(); db.close(); open(overrides); },
  };
}

test("#3 a lost control receipt cannot extend twice after SQLite reopen and another limit pause", async () => {
  const f = fixture();
  const run = f.runs.getAggregate("original-run")!;
  f.runs.apply({ agentRun: { ...run.agentRun, state: "paused", pauseReason: "limit-reached", turnCount: 30 }, upserts: [], events: [] }, new Date(NOW));
  const revision = f.current().revision;
  const apply = f.conversations.applyAction.bind(f.conversations);
  f.conversations.applyAction = () => { throw new TarsStorageBusyError(); };
  await expect(f.click("extend", "one-extension", revision)).rejects.toThrow();
  expect(f.runs.getAggregate("original-run")!.agentRun.maxTurns).toBe(40);
  expect(f.conversations.getAction("one-extension")!.status).toBe("pending");
  f.conversations.applyAction = apply;
  const extended = f.runs.getAggregate("original-run")!;
  f.runs.apply({ agentRun: { ...extended.agentRun, state: "paused", pauseReason: "limit-reached", turnCount: 40 }, upserts: [], events: [] }, new Date(NOW));
  await f.reopen();
  expect((await f.click("extend", "one-extension", revision)).record.status).toBe("applied");
  await f.runtime.drain(); await f.runRuntime.whenIdle();
  expect(f.runs.getAggregate("original-run")!.agentRun.maxTurns).toBe(40);
  expect(f.runs.listEventsByKind("original-run", ["control-applied"])).toHaveLength(1);
  expect(f.calls).toEqual(["extend"]);
});

test("#3 a failed Run receipt write rolls back the budget mutation too", async () => {
  const f = fixture(); const run = f.runs.getAggregate("original-run")!;
  f.runs.apply({ agentRun: { ...run.agentRun, state: "paused", pauseReason: "limit-reached", turnCount: 30 }, upserts: [], events: [] }, new Date(NOW));
  f.db.exec("CREATE TRIGGER fail_control_receipt BEFORE INSERT ON agent_run_events WHEN NEW.kind = 'control-applied' BEGIN SELECT RAISE(ABORT, 'receipt write failed'); END;");
  await expect(withTarsRunCommand("atomic-extend", "extend", () => f.runRuntime.extend({ agentRunId: "original-run", additionalTurns: 10 }))).rejects.toThrow("receipt write failed");
  expect(f.runs.getAggregate("original-run")!.agentRun.maxTurns).toBe(30);
  expect(f.runs.listEventsByKind("original-run", ["control-applied"])).toHaveLength(0);
});

test.each(["pause", "cancel", "takeover"] as const)("#4 startup recovers saved %s before the Supervisor can execute", async (operation) => {
  const f = fixture(); const row = f.current();
  f.conversations.recordAction({ requestId: `saved-${operation}`, source: "click", responsibilityId: row.id, expectedRevision: row.revision, operation }, NOW);
  await f.reopen();
  await f.runRuntime.requestTick(); await f.runRuntime.whenIdle();
  expect(f.starts()).toBe(0);
  await f.tick();
  expect(f.conversations.getAction(`saved-${operation}`)).toMatchObject({ requestId: `saved-${operation}`, status: "applied" });
  expect(f.current().state).toBe(operation === "pause" ? "paused" : operation === "cancel" ? "cancelled" : "takenOver");
  expect(f.calls).toEqual([operation]);
  expect(f.starts()).toBe(0);
});

test.each(["pause", "cancel"] as const)("#6 %s aborts a hung preparation without waiting for the command", async (operation) => {
  const f = fixture(); let signal: AbortSignal | undefined;
  f.store.patch(f.current().id, f.current().revision, { state: "preparing", agentRunId: null, executionWorkspaceId: null }, NOW);
  await f.reopen({ prepareWorkspace: (_row, next) => { signal = next; return new Promise(() => {}); } });
  f.runtime.requestTick();
  for (let i = 0; i < 100 && !signal; i++) await Bun.sleep(1);
  expect(signal).toBeDefined();
  expect((await f.click(operation)).record.status).toBe("applied");
  expect(signal!.aborted).toBe(true);
  expect(f.current().state).toBe(operation === "cancel" ? "cancelled" : "paused");
});

test("#6 preparation timeout persists an actionable failure, including a real shell timeout", async () => {
  const f = fixture();
  f.store.patch(f.current().id, f.current().revision, { state: "preparing", agentRunId: null, executionWorkspaceId: null }, NOW);
  await f.reopen({ preparationTimeoutMs: 20, prepareWorkspace: () => new Promise(() => {}) });
  await f.tick();
  expect(f.current()).toMatchObject({ state: "blocked", detailCode: "preparationFailed", detail: expect.stringContaining("resume this work") });
  await expect(runWorkspacePreparation({ cwd: tmpdir(), command: "sleep 30", timeoutMs: 20 })).rejects.toThrow("timed out");
});

test.skipIf(process.platform === "win32")("#6 cancel terminates a real post-create shell and its watcher", async () => {
  const f = fixture(); const pidFile = path.join(f.current().repositoryPath, "watcher.pid");
  f.store.patch(f.current().id, f.current().revision, { state: "preparing", agentRunId: null, executionWorkspaceId: null }, NOW);
  await f.reopen({ prepareWorkspace: async (row, signal) => {
    await runWorkspacePreparation({ cwd: row.repositoryPath, command: "sleep 30 & echo $! > watcher.pid; wait", signal });
    return "same-workspace";
  } });
  f.runtime.requestTick();
  for (let i = 0; i < 500 && !existsSync(pidFile); i++) await Bun.sleep(2);
  expect(existsSync(pidFile)).toBe(true);
  const pid = Number(readFileSync(pidFile, "utf8").trim());
  expect((await f.click("cancel")).record.status).toBe("applied");
  const alive = () => { try { process.kill(pid, 0); return true; } catch { return false; } };
  for (let i = 0; i < 500 && alive(); i++) await Bun.sleep(2);
  expect(alive()).toBe(false);
});

test.each(["unverifiedCompletion", "incompleteReport", "staleVerification"] as TarsDetailCode[])("#10 explicit repair of %s keeps task, workspace and reports", async (detailCode) => {
  for (const operation of ["message", "requestChanges", "retryStage"] as const) {
    const f = fixture(); f.observe({ state: "blocked", detailCode, detail: "Verification must be repaired" }); await f.tick();
    const before = f.current();
    const outcome = (await f.click(operation, `repair-${operation}`, before.revision, operation === "retryStage" ? undefined : "Repair and verify this result")).record;
    expect(outcome.status, JSON.stringify(outcome)).toBe("applied");
    await f.tick();
    expect(f.current()).toMatchObject({ taskId: before.taskId, executionWorkspaceId: before.executionWorkspaceId,
      agentRunId: "repair-run", previousRunIds: ["original-run"] });
    expect(f.runs.getAggregate("original-run")).not.toBeNull(); expect(f.continuations()).toBe(1);
  }
});

test("#12 a saved correction crosses only the eligible completion transition, including restart", async () => {
  const f = fixture(); const revision = f.current().revision;
  f.observe({ state: "completed", detail: null }); await f.tick();
  expect(f.current().continuationFromRevision).toBe(revision);
  await f.reopen();
  expect((await f.click("message", "late-correction", revision, "Also verify the empty result")).record.status).toBe("applied");
  await f.tick(); expect(f.continuations()).toBe(1);
  const changed = fixture(); const stale = changed.current().revision;
  changed.observe({ state: "completed", detail: null }); await changed.tick();
  changed.store.patch(changed.current().id, changed.current().revision, { detail: "Another intervening edit" }, NOW);
  expect((await changed.click("message", "unrelated-change", stale, "Correct it")).record.reason).toBe("stale");
});
