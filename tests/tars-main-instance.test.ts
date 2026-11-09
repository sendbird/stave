import { expect, test } from "bun:test";
import path from "node:path";

test("main service and existing runs IPC share one coordinator and preserve selected settings without a renderer", () => {
  const source = `
    import { mock } from "bun:test";
    import { Database } from "bun:sqlite";
    import { mkdtempSync, rmSync } from "node:fs";
    import { tmpdir } from "node:os";
    import path from "node:path";
    import { TarsConversationStore } from "./electron/persistence/tars-conversation-store";
    import { TarsStore } from "./electron/persistence/tars-store";
    import { RunLedgerStore } from "./electron/persistence/run-ledger-store";
    import { applyTarsDecision } from "./electron/host-service/tars-decisions";
    const database = new Database(":memory:");
    const tarsConversations = new TarsConversationStore(database);
    const tars = new TarsStore(database); const ledger = new RunLedgerStore(database);
    const profile = mkdtempSync(path.join(tmpdir(), "stave-main-instance-"));
    const registry = [{ repositoryPath: "/tmp/project", repositoryName: "Project", workspaces: [{ id: "source", name: "Source", updatedAt: "2026-11-05T00:00:00.000Z" }] }];
    const store = { tarsConversations, tars,
      loadRepositoryRegistry: () => registry, loadWorkspaceShellSummary: () => null,
      agentRuns: { getLatestAgentRunForTask: () => null },
      getRunAggregate: ledger.getAggregate.bind(ledger), claimRunStep: ledger.claimStep.bind(ledger),
      markRunStepWaiting: ledger.markStepWaiting.bind(ledger), completeRunStep: ledger.completeStep.bind(ledger),
      failRunStep: ledger.failStep.bind(ledger), cancelRunStep: ledger.cancelStep.bind(ledger), listRunReceipts: ledger.listReceipts.bind(ledger) };
    const handlers = new Map(); let providerCalls = 0; let applyCalls = 0;
    let release; let entered; let request;
    const started = new Promise((resolve) => { entered = resolve; });
    const result = new Promise((resolve) => { release = resolve; });
    mock.module("electron", () => ({ webContents: { getAllWebContents: () => [] }, app: { getPath: () => profile }, ipcMain: { handle: (key, callback) => handlers.set(key, callback) } }));
    mock.module("./electron/main/state", () => ({ ensurePersistenceReady: async () => store }));
    mock.module("./electron/main/host-service-client", () => ({ onHostServiceEvent: () => () => {}, invokeHostService: async (method, input) => {
      if (method === "runs.execute-secondary") {
        providerCalls++; request = input; entered(); await result;
        const text = JSON.stringify({ reply: "Proposed fix", actions: [{ kind: "delegate", workspaceId: "source", title: "Fix", instruction: "Fix search", acceptanceCriteria: ["Verified"], priority: 50 }] });
        return { executionId: input.executionId, providerId: input.input.providerId, model: input.input.model, status: "completed",
          text, truncated: false, eventCount: 2, collectedEventCount: 2, outputBytes: Buffer.byteLength(text), stopReason: null, error: null };
      }
      if (method === "tars.apply-decision") { applyCalls++; return applyTarsDecision(input, {
        conversations: tarsConversations, responsibilities: tars, readRegistry: () => registry, requestTick: () => {} }); }
      if (method === "runs.cancel-secondary") return { ok: true };
      throw new Error("Unexpected host method " + method);
    } }));
    mock.module("./electron/main/runs/delegated-task-coordinator-instance", () => ({ reconcileDelegatedTasks: async () => {}, getDelegatedTaskCoordinator: () => ({}) }));
    const { getTarsConversationService, startTarsConversationService, stopTarsConversationService } = await import("./electron/main/tars-conversation-instance");
    const { registerRunHandlers } = await import("./electron/main/ipc/runs");
    registerRunHandlers(); await startTarsConversationService();
    const [service, sameService] = await Promise.all([getTarsConversationService(), getTarsConversationService()]);
    service.configureConversation({ providerId: "codex", model: "chosen", maxTurns: 4,
      runtimeHints: { codexAccountProfileId: "system-default", codexBinaryPath: "/tmp/codex", codexReasoningEffort: "high", claudeEffort: "low" } });
    const message = service.sendMessage({ requestId: "main", text: "Fix search" });
    await started;
    const duplicate = handlers.get("runs:execute-secondary")(null, { runId: request.runId, stepId: request.stepId, executionId: request.executionId, input: request.input });
    release(); await duplicate; await service.whenIdle();
    await stopTarsConversationService();
    console.log(JSON.stringify({ same: service === sameService, providerCalls, applyCalls, hints: request.input.runtimeHints,
      state: tarsConversations.get(message.id).state, responsibilities: tars.snapshot().responsibilities.length }));
    database.close(); rmSync(profile, { recursive: true, force: true });
  `;
  const result = Bun.spawnSync({ cmd: [process.execPath, "--eval", source], cwd: path.join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(JSON.parse(result.stdout.toString())).toEqual({ same: true, providerCalls: 1, applyCalls: 1,
    hints: { codexAccountProfileId: "system-default", codexBinaryPath: "/tmp/codex", codexReasoningEffort: "high" },
    state: "answered", responsibilities: 1 });
});

test("a failed conversation service start is retried by the next request instead of staying cached", () => {
  const source = `
    import { mock } from "bun:test";
    import { Database } from "bun:sqlite";
    import { mkdtempSync, rmSync } from "node:fs";
    import { tmpdir } from "node:os";
    import path from "node:path";
    import { TarsConversationStore } from "./electron/persistence/tars-conversation-store";
    import { TarsStore } from "./electron/persistence/tars-store";
    const database = new Database(":memory:");
    const store = { tarsConversations: new TarsConversationStore(database), tars: new TarsStore(database) };
    const profile = mkdtempSync(path.join(tmpdir(), "stave-main-retry-"));
    let attempts = 0;
    mock.module("electron", () => ({ webContents: { getAllWebContents: () => [] }, app: { getPath: () => profile }, ipcMain: { handle: () => {} } }));
    mock.module("./electron/main/state", () => ({ ensurePersistenceReady: async () => {
      attempts++; if (attempts === 1) throw new Error("Persistence is not ready yet."); return store; } }));
    mock.module("./electron/main/host-service-client", () => ({ onHostServiceEvent: () => () => {}, invokeHostService: async () => { throw new Error("No host in this test"); } }));
    mock.module("./electron/main/runs/delegated-task-coordinator-instance", () => ({ reconcileDelegatedTasks: async () => {}, getDelegatedTaskCoordinator: () => ({}) }));
    const { getTarsConversationService, stopTarsConversationService } = await import("./electron/main/tars-conversation-instance");
    let firstFailed = false;
    try { await getTarsConversationService(); } catch { firstFailed = true; }
    const service = await getTarsConversationService();
    const conversation = service.getConversation();
    await stopTarsConversationService();
    console.log(JSON.stringify({ firstFailed, attempts, messages: conversation.messages.length }));
    database.close(); rmSync(profile, { recursive: true, force: true });
  `;
  const result = Bun.spawnSync({ cmd: [process.execPath, "--eval", source], cwd: path.join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(JSON.parse(result.stdout.toString())).toEqual({ firstFailed: true, attempts: 2, messages: 0 });
});
