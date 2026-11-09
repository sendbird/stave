import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { TarsStore } from "../electron/persistence/tars-store";
import { RunLedgerStore } from "../electron/persistence/run-ledger-store";
import { createSecondaryRunCoordinator } from "../electron/main/runs/secondary-run-coordinator";
import { createTarsConversationService } from "../electron/main/tars-conversation-service";
import { applyTarsDecision } from "../electron/host-service/tars-decisions";
import { AgentConfigSchema } from "../src/lib/agents/schema";
import { BUILTIN_AGENTS } from "../src/lib/agents/starters";
import { isTarsAgentCatalogPending } from "../src/lib/tars/agents";
import type { SecondaryProviderExecutionRequest } from "../src/lib/runs/secondary-run";
import { REGISTRY, testContext } from "./tars-test-context";

const NOW = "2026-11-05T00:00:00.000Z";
const RELEASE = AgentConfigSchema.parse({ version: 1, id: "release-notes", source: "custom", name: "Release notes",
  description: "Writes release notes.", instructions: "Write release notes.", model: { mode: "auto" }, permission: "auto",
  workspace: "same-workspace", report: ["summary"], usableAs: ["delegate"] });
const unit = (title: string, agentId: string) => ({ kind: "delegate" as const, workspaceId: "source", title, instruction: "Do it.",
  acceptanceCriteria: ["Done"], priority: 50, agentId });
const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });

test("startup race: saved-agent work waits for the synced catalog instead of being rejected, and built-ins never wait", async () => {
  const database = new Database(":memory:"); cleanup.push(() => database.close());
  const conversations = new TarsConversationStore(database);
  const responsibilities = new TarsStore(database);
  const ledger = new RunLedgerStore(database);
  conversations.configure({ providerId: "codex", model: "chosen", maxTurns: 8, allowedAgentIds: ["release-notes"] });
  // Main and the host start with built-ins only; the renderer syncs saved agents later.
  let mainReady = false; let hostReady = false;
  const requests: SecondaryProviderExecutionRequest[] = [];
  const errors: unknown[] = [];
  const decision = { reply: "Proposed.", actions: [unit("Saved", "release-notes"), unit("Built-in", "researcher")] };
  const coordinator = createSecondaryRunCoordinator({
    getLedger: () => ({ getRunAggregate: ledger.getAggregate.bind(ledger), claimRunStep: ledger.claimStep.bind(ledger),
      markRunStepWaiting: ledger.markStepWaiting.bind(ledger), completeRunStep: ledger.completeStep.bind(ledger),
      failRunStep: ledger.failStep.bind(ledger), cancelRunStep: ledger.cancelStep.bind(ledger), listRunReceipts: ledger.listReceipts.bind(ledger) }),
    executeHost: async (request) => {
      requests.push(request);
      const text = JSON.stringify(decision);
      return { executionId: request.executionId, providerId: request.input.providerId, model: request.input.model, status: "completed", text,
        truncated: false, eventCount: 1, collectedEventCount: 1, outputBytes: text.length, stopReason: null, error: null };
    },
    cancelHost: async () => ({ ok: true }), now: () => NOW,
  });
  const service = createTarsConversationService({ conversations, responsibilities, coordinator, now: () => NOW,
    context: async () => testContext(responsibilities, REGISTRY), agentCatalogReady: () => mainReady,
    // Only the message crosses the host boundary, as with the real host service.
    applyDecision: async (input) => {
      try {
        return await applyTarsDecision(input, { conversations, responsibilities, now: () => NOW, requestTick: () => {},
          readRegistry: () => [{ repositoryPath: "/tmp/project", workspaces: [{ id: "source" }] }] as never,
          agents: () => hostReady ? [...BUILTIN_AGENTS, RELEASE] : BUILTIN_AGENTS, agentCatalogReady: () => hostReady });
      } catch (error) { throw new Error(error instanceof Error ? error.message : String(error)); }
    },
    retryDelaysMs: [60_000], onError: (error) => errors.push(error) });
  cleanup.push(() => { void service.stop(); });
  service.start();
  const message = service.sendMessage({ requestId: "release", text: "Write the release notes." });
  await service.whenIdle();
  // A message that allows saved agents is not claimed or billed before main knows them.
  expect(conversations.get(message.id)?.state).toBe("queued");
  expect(requests).toHaveLength(0);
  expect(errors.length).toBeGreaterThan(0);
  expect(errors.every(isTarsAgentCatalogPending)).toBe(true);

  mainReady = true; service.wake(); await service.whenIdle();
  expect(conversations.get(message.id)?.state).toBe("answered");
  expect(requests).toHaveLength(1);
  // The host has not synced: the saved agent stays pending (never agentUnknown) and holds later actions in order.
  expect(conversations.listReceipts(message.id).map((receipt) => [receipt.status, receipt.reason])).toEqual([["pending", null]]);
  expect(responsibilities.snapshot().responsibilities).toHaveLength(0);
  service.wake(); await service.whenIdle();
  expect(conversations.listReceipts(message.id).map((receipt) => receipt.status)).toEqual(["pending"]);

  hostReady = true; service.wake(); await service.whenIdle();
  expect(conversations.listReceipts(message.id).map((receipt) => [receipt.status, receipt.reason])).toEqual([["applied", null], ["applied", null]]);
  expect(responsibilities.snapshot().responsibilities.map((row) => row.agentId).sort()).toEqual(["release-notes", "researcher"]);
  expect(requests).toHaveLength(1);
});

test("once the catalog is known an unknown saved agent is rejected, and a built-in is admitted before any sync", async () => {
  const database = new Database(":memory:"); cleanup.push(() => database.close());
  const conversations = new TarsConversationStore(database);
  const responsibilities = new TarsStore(database);
  conversations.configure({ providerId: "codex", model: "chosen", maxTurns: 8, allowedAgentIds: ["release-notes"] });
  const answer = (requestId: string, actions: ReturnType<typeof unit>[]) => {
    const queued = conversations.create({ requestId, text: "Work." }, NOW);
    const claimed = conversations.claim(queued.id, queued.revision, NOW);
    return conversations.answer(claimed.id, claimed.revision, { reply: "Proposed.", actions }, NOW);
  };
  const ports = (ready: boolean) => ({ conversations, responsibilities, now: () => NOW, requestTick: () => {},
    readRegistry: () => [{ repositoryPath: "/tmp/project", workspaces: [{ id: "source" }] }] as never,
    agents: () => BUILTIN_AGENTS, agentCatalogReady: () => ready });
  const builtin = answer("builtin", [unit("Built-in", "implementer")]);
  expect((await applyTarsDecision({ messageId: builtin.id, expectedRevision: builtin.revision }, ports(false)))[0]).toMatchObject({ status: "applied" });
  const missing = answer("missing", [unit("Deleted", "release-notes")]);
  const pending = await applyTarsDecision({ messageId: missing.id, expectedRevision: missing.revision }, ports(false)).then(() => null, (error: unknown) => error);
  expect(isTarsAgentCatalogPending(pending)).toBe(true);
  expect(conversations.getReceipt(missing.id, 0)?.status).toBe("pending");
  expect((await applyTarsDecision({ messageId: missing.id, expectedRevision: missing.revision }, ports(true)))[0])
    .toMatchObject({ status: "rejected", reason: "agentUnknown" });
});

test("a failed host sync converges: Tars hands main's catalog over again and the serial queue recovers without a restart", async () => {
  const database = new Database(":memory:"); cleanup.push(() => database.close());
  const conversations = new TarsConversationStore(database);
  const responsibilities = new TarsStore(database);
  const ledger = new RunLedgerStore(database);
  conversations.configure({ providerId: "codex", model: "chosen", maxTurns: 8, allowedAgentIds: ["release-notes"] });
  // Main synced from the renderer, but its first forward to the live host failed.
  let hostReady = false; let resyncs = 0;
  const answers = [{ reply: "Proposed.", actions: [unit("Saved", "release-notes")] }, { reply: "Later.", actions: [unit("Later", "researcher")] }];
  const requests: SecondaryProviderExecutionRequest[] = [];
  const coordinator = createSecondaryRunCoordinator({
    getLedger: () => ({ getRunAggregate: ledger.getAggregate.bind(ledger), claimRunStep: ledger.claimStep.bind(ledger),
      markRunStepWaiting: ledger.markStepWaiting.bind(ledger), completeRunStep: ledger.completeStep.bind(ledger),
      failRunStep: ledger.failStep.bind(ledger), cancelRunStep: ledger.cancelStep.bind(ledger), listRunReceipts: ledger.listReceipts.bind(ledger) }),
    executeHost: async (request) => {
      const text = JSON.stringify(answers[requests.length]); requests.push(request);
      return { executionId: request.executionId, providerId: request.input.providerId, model: request.input.model, status: "completed", text,
        truncated: false, eventCount: 1, collectedEventCount: 1, outputBytes: text.length, stopReason: null, error: null };
    },
    cancelHost: async () => ({ ok: true }), now: () => NOW,
  });
  const service = createTarsConversationService({ conversations, responsibilities, coordinator, now: () => NOW,
    context: async () => testContext(responsibilities, REGISTRY), agentCatalogReady: () => true,
    resyncAgentCatalog: async () => {
      resyncs++;
      if (resyncs === 1) throw new Error("The host did not answer.");
      hostReady = true;
    },
    applyDecision: async (input) => {
      try {
        return await applyTarsDecision(input, { conversations, responsibilities, now: () => NOW, requestTick: () => {},
          readRegistry: () => [{ repositoryPath: "/tmp/project", workspaces: [{ id: "source" }] }] as never,
          agents: () => hostReady ? [...BUILTIN_AGENTS, RELEASE] : BUILTIN_AGENTS, agentCatalogReady: () => hostReady });
      } catch (error) { throw new Error(error instanceof Error ? error.message : String(error)); }
    },
    retryDelaysMs: [1, 1, 1] });
  cleanup.push(() => { void service.stop(); });
  service.start();
  const first = service.sendMessage({ requestId: "first", text: "Write the release notes." });
  const later = service.sendMessage({ requestId: "later", text: "Then research the follow-up." });
  // No wake, sync event or restart: only the service's own bounded retries.
  for (let attempt = 0; attempt < 200 && conversations.get(later.id)?.state !== "answered"; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 5)); await service.whenIdle();
  }
  await service.whenIdle();
  expect(resyncs).toBe(2);
  expect(conversations.listReceipts(first.id).map((receipt) => [receipt.status, receipt.reason])).toEqual([["applied", null]]);
  expect(conversations.get(later.id)?.state).toBe("answered");
  expect(conversations.listReceipts(later.id).map((receipt) => receipt.status)).toEqual(["applied"]);
  expect(responsibilities.snapshot().responsibilities.map((row) => row.agentId).sort()).toEqual(["release-notes", "researcher"]);
  expect(requests).toHaveLength(2);
});
