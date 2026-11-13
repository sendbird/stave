import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { TarsStore } from "../electron/persistence/tars-store";
import { RunLedgerStore } from "../electron/persistence/run-ledger-store";
import { createSecondaryRunCoordinator } from "../electron/main/runs/secondary-run-coordinator";
import { createTarsConversationService } from "../electron/main/tars-conversation-service";
import { TarsAgentCatalogPendingError } from "../src/lib/tars/agents";
import type { TarsDecision } from "../src/lib/tars/conversation";
import type { SecondaryProviderExecutionRequest } from "../src/lib/runs/secondary-run";
import { SETTINGS, testContext, REGISTRY } from "./tars-test-context";

const START = Date.parse("2026-11-05T00:00:00.000Z");
const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });

/**
 * The conversation service on real stores with a clock the test moves. The
 * host is simulated: while `hostDown`, it cannot admit a decision, which
 * leaves a control's outcome unknown.
 */
function fixture(options: { allowedAgentIds?: string[]; queueWaitMs?: number } = {}) {
  const database = new Database(":memory:");
  cleanup.push(() => { if (!database.closed) database.close(); });
  const conversations = new TarsConversationStore(database);
  conversations.configure({ ...SETTINGS, ...(options.allowedAgentIds ? { allowedAgentIds: options.allowedAgentIds } : {}) });
  const responsibilities = new TarsStore(database);
  const ledger = new RunLedgerStore(database);
  let clock = START;
  const now = () => new Date(clock).toISOString();
  const replies: TarsDecision[] = [];
  const requests: SecondaryProviderExecutionRequest[] = [];
  const state: { hostDown: boolean; catalogReady: boolean; hang: Promise<void> | null; applyCalls: number } = { hostDown: false, catalogReady: true, hang: null, applyCalls: 0 };
  const coordinator = createSecondaryRunCoordinator({
    getLedger: () => ({ getRunAggregate: ledger.getAggregate.bind(ledger), claimRunStep: ledger.claimStep.bind(ledger),
      markRunStepWaiting: ledger.markStepWaiting.bind(ledger), completeRunStep: ledger.completeStep.bind(ledger),
      failRunStep: ledger.failStep.bind(ledger), cancelRunStep: ledger.cancelStep.bind(ledger), listRunReceipts: ledger.listReceipts.bind(ledger) }),
    executeHost: async (request) => {
      requests.push(request);
      const text = JSON.stringify(replies.shift() ?? { reply: "Noted.", actions: [] });
      return { executionId: request.executionId, providerId: request.input.providerId, model: request.input.model, status: "completed", text,
        truncated: false, eventCount: 1, collectedEventCount: 1, outputBytes: text.length, stopReason: null, error: null };
    },
    cancelHost: async () => ({ ok: true }), now,
  });
  const errors: unknown[] = [];
  const service = createTarsConversationService({ conversations, responsibilities, coordinator, now,
    context: async () => testContext(responsibilities, REGISTRY), agentCatalogReady: () => state.catalogReady,
    // A host that answers refuses each saved action (the work is not Tars's here), which settles it.
    applyDecision: async ({ messageId, expectedRevision }) => {
      state.applyCalls++;
      // A request the host has not answered yet: it settles only when the test releases it.
      if (state.hang) await state.hang;
      if (state.hostDown) throw new Error("The host service did not answer.");
      const message = conversations.get(messageId)!;
      return message.decision!.actions.map((action, index) => {
        const intent = conversations.recordReceipt(messageId, expectedRevision, index, action, now());
        return intent.status !== "pending" ? intent : conversations.settleReceipt(messageId, index, intent.revision,
          { status: "rejected", error: "The responsibility is not owned by the personal representative.", reason: "notOwned" }, now());
      });
    },
    queueWaitMs: options.queueWaitMs ?? 60_000, retryDelaysMs: [3_600_000], onError: (error) => errors.push(error) });
  cleanup.push(() => { void service.stop(); });
  service.start();
  let sent = 0;
  const send = async (text: string) => { const message = service.sendMessage({ requestId: `message-${sent++}`, text }); await service.whenIdle(); return message; };
  const advance = async (ms: number) => { clock += ms; service.wake(); await service.whenIdle(); };
  return { conversations, service, replies, requests, state, errors, send, advance, now };
}

test("a message behind an action whose outcome is unknown says why it waits, then goes on after the bounded wait", async () => {
  const f = fixture();
  f.state.hostDown = true;
  // The first reply pauses work; the host never acknowledges it, so its outcome stays unknown.
  f.replies.push({ reply: "Pausing it.", actions: [{ kind: "control", responsibilityId: "release", expectedRevision: 1, operation: "pause" }] });
  const first = await f.send("Pause the release check");
  expect(f.conversations.get(first.id)?.state).toBe("answered");
  expect(f.conversations.listReceipts(first.id).map((receipt) => receipt.status)).toEqual([]);
  const second = await f.send("What is on the release branch?");
  // Held in order, with a visible reason instead of a silent queue; no model call yet.
  expect(f.conversations.get(second.id)).toMatchObject({ state: "queued", waiting: { reason: "earlierAction", since: f.now() } });
  expect(f.requests).toHaveLength(1);
  // Still inside the bound: it keeps waiting, and keeps the time its wait began.
  const since = f.now();
  await f.advance(30_000);
  expect(f.conversations.get(second.id)).toMatchObject({ state: "queued", waiting: { reason: "earlierAction", since } });
  // Past the bound, the later message proceeds; the earlier action is still retried on its own.
  await f.advance(31_000);
  expect(f.conversations.get(second.id)).toMatchObject({ state: "answered" });
  expect(f.conversations.get(second.id)!.waiting).toBeUndefined();
  expect(f.requests).toHaveLength(2);
  expect(f.conversations.listPendingActions(8).map((message) => message.id)).toEqual([first.id]);
  // Once the host answers again, the held action settles.
  f.state.hostDown = false;
  await f.advance(1_000);
  expect(f.conversations.listPendingActions(8)).toEqual([]);
});

test("a message waiting for saved agents says so, and fails visibly once the bounded wait passes", async () => {
  const f = fixture({ allowedAgentIds: ["release-notes"] });
  f.state.catalogReady = false;
  const first = await f.send("Write the release notes.");
  expect(f.conversations.get(first.id)).toMatchObject({ state: "queued", waiting: { reason: "agentCatalog" } });
  expect(f.errors.some((error) => error instanceof TarsAgentCatalogPendingError)).toBe(true);
  expect(f.requests).toHaveLength(0);
  await f.advance(61_000);
  // Never reasoned with an incomplete agent list, and never left queued without a word.
  expect(f.conversations.get(first.id)).toMatchObject({ state: "failed", errorCode: "agentsUnavailable" });
  expect(f.conversations.get(first.id)!.waiting).toBeUndefined();
  expect(f.requests).toHaveLength(0);
  // A later message waits its own bounded time, and starts as soon as the agents load.
  const second = await f.send("Try again.");
  expect(f.conversations.get(second.id)).toMatchObject({ state: "queued", waiting: { reason: "agentCatalog" } });
  f.state.catalogReady = true;
  await f.advance(1_000);
  expect(f.conversations.get(second.id)?.state).toBe("answered");
  expect(f.requests).toHaveLength(1);
});

test("an earlier action the host never answers holds later messages only for the bounded wait, and is never sent twice", async () => {
  const f = fixture({ queueWaitMs: 40 });
  let release!: () => void;
  f.state.hang = new Promise<void>((resolve) => { release = resolve; });
  f.replies.push({ reply: "Pausing it.", actions: [{ kind: "control", responsibilityId: "release", expectedRevision: 1, operation: "pause" }] });
  const first = await f.send("Pause the release check");
  expect(f.state.applyCalls).toBe(1);
  const second = await f.send("What is on the release branch?");
  // The unanswered request no longer holds the queue past its bound, and it was not sent again.
  expect(f.conversations.get(second.id)?.state).toBe("answered");
  expect(f.requests).toHaveLength(2);
  expect(f.state.applyCalls).toBe(1);
  expect(f.conversations.listPendingActions(8).map((message) => message.id)).toEqual([first.id]);
  // When the host finally answers, that same request settles the action.
  f.state.hang = null;
  release();
  await new Promise((resolve) => setTimeout(resolve, 10));
  await f.service.whenIdle();
  expect(f.state.applyCalls).toBe(1);
  expect(f.conversations.listPendingActions(8)).toEqual([]);
});
