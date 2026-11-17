import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { TarsStore } from "../electron/persistence/tars-store";
import { RunLedgerStore } from "../electron/persistence/run-ledger-store";
import { createSecondaryRunCoordinator } from "../electron/main/runs/secondary-run-coordinator";
import { processTarsMessage, TARS_PLANNER_TIMEOUT_MS, tarsPlannerRetryCause } from "../electron/main/tars-planner";
import type { SecondaryProviderExecutionRequest, SecondaryProviderExecutionResult } from "../src/lib/runs/secondary-run";
import { SETTINGS, testContext } from "./tars-test-context";

const NOW = "2026-11-05T00:00:00.000Z";
const databases: Database[] = [];
afterEach(() => { for (const database of databases.splice(0)) database.close(); });

type Outcome = Pick<SecondaryProviderExecutionResult, "status" | "text" | "truncated" | "stopReason" | "error">;
const answered = (reply: string): Outcome => ({ status: "completed", text: JSON.stringify({ reply, actions: [] }), truncated: false, stopReason: null, error: null });
const timedOut: Outcome = { status: "failed", text: "", truncated: false, stopReason: "runtime_failure", error: "Provider turn timed out. timeout=300000ms" };

/** The real store, ledger and coordinator; each model call takes the next scripted outcome. */
function fixture(outcomes: Outcome[]) {
  const database = new Database(":memory:"); databases.push(database);
  const conversations = new TarsConversationStore(database);
  conversations.configure(SETTINGS);
  const responsibilities = new TarsStore(database);
  const ledger = new RunLedgerStore(database);
  const requests: SecondaryProviderExecutionRequest[] = [];
  const seen: Array<{ state: string | undefined; retry: unknown }> = [];
  const coordinator = createSecondaryRunCoordinator({
    getLedger: () => ({ getRunAggregate: ledger.getAggregate.bind(ledger), claimRunStep: ledger.claimStep.bind(ledger),
      markRunStepWaiting: ledger.markStepWaiting.bind(ledger), completeRunStep: ledger.completeStep.bind(ledger),
      failRunStep: ledger.failStep.bind(ledger), cancelRunStep: ledger.cancelStep.bind(ledger), listRunReceipts: ledger.listReceipts.bind(ledger) }),
    executeHost: async (request) => {
      requests.push(request);
      // What the conversation shows while this attempt runs.
      const current = conversations.list(10).at(-1);
      seen.push({ state: current?.state, retry: current?.retry });
      const outcome = outcomes.shift() ?? answered("Fallback.");
      return { executionId: request.executionId, providerId: request.input.providerId, model: request.input.model, eventCount: 2, collectedEventCount: 2,
        outputBytes: Buffer.byteLength(outcome.text), ...outcome };
    },
    cancelHost: async () => ({ ok: true }), now: () => NOW,
  });
  const ports = { conversations, coordinator, now: () => NOW, context: async () => testContext(responsibilities) };
  const create = () => conversations.create({ requestId: "current", text: "How is the release check going?" }, NOW);
  const step = (id: string) => ledger.getAggregate({ runId: `tars-message:${id}`, stepId: `tars-message:${id}:reason` })?.step;
  return { conversations, requests, seen, ports, create, step };
}

test("a timed-out turn is retried once with the same input, says it is retrying, and keeps the answer", async () => {
  const f = fixture([timedOut, answered("The release check is on its last stage.")]);
  const message = f.create();
  const warn = console.warn; console.warn = () => {};
  try { await processTarsMessage(message.id, f.ports); } finally { console.warn = warn; }
  expect(f.requests).toHaveLength(2);
  // The planner turn is bounded: a raised, fixed limit and at most two attempts.
  expect(f.requests[0]!.policy).toMatchObject({ timeoutMs: TARS_PLANNER_TIMEOUT_MS, maxAttempts: 2 });
  expect(TARS_PLANNER_TIMEOUT_MS).toBeGreaterThan(120_000);
  expect(TARS_PLANNER_TIMEOUT_MS).toBeLessThanOrEqual(600_000);
  expect(f.requests[1]!.input).toEqual(f.requests[0]!.input);
  // The second attempt ran while the message said it was retrying after a timeout.
  expect(f.seen[1]).toEqual({ state: "reasoning", retry: { attempt: 2, cause: "timeout", at: NOW } });
  expect(f.conversations.get(message.id)).toMatchObject({ state: "answered", reply: "The release check is on its last stage.", retry: { cause: "timeout" } });
  expect(f.step(message.id)).toMatchObject({ status: "completed", attempt: 2 });
});

test("a second transient failure fails the message: the retry is bounded to one", async () => {
  const f = fixture([timedOut, timedOut, answered("Never read.")]);
  const message = f.create();
  const [warn, error] = [console.warn, console.error]; console.warn = () => {}; console.error = () => {};
  try { await processTarsMessage(message.id, f.ports); } finally { console.warn = warn; console.error = error; }
  expect(f.requests).toHaveLength(2);
  expect(f.conversations.get(message.id)).toMatchObject({ state: "failed", errorCode: "reasoningFailed", retry: { cause: "timeout" } });
  expect(f.conversations.get(message.id)!.error).toContain("timed out");
  expect(f.step(message.id)).toMatchObject({ status: "failed", attempt: 2 });
  // Processing it again neither claims nor calls the model a third time.
  await processTarsMessage(message.id, f.ports);
  expect(f.requests).toHaveLength(2);
});

test("a cut-short answer is retried once; a refusal and a malformed decision are not", async () => {
  const cut = fixture([{ ...answered("{"), truncated: true }, answered("Whole answer.")]);
  const first = cut.create();
  const warn = console.warn; console.warn = () => {};
  try { await processTarsMessage(first.id, cut.ports); } finally { console.warn = warn; }
  expect(cut.requests).toHaveLength(2);
  expect(cut.conversations.get(first.id)).toMatchObject({ state: "answered", retry: { cause: "truncated" } });

  const error = console.error; console.error = () => {};
  try {
    const refused = fixture([{ status: "failed", text: "", truncated: false, stopReason: "refusal", error: "The request was refused by policy." }, answered("Never read.")]);
    const second = refused.create();
    await processTarsMessage(second.id, refused.ports);
    expect(refused.requests).toHaveLength(1);
    expect(refused.conversations.get(second.id)).toMatchObject({ state: "failed" });
    expect(refused.conversations.get(second.id)!.retry).toBeUndefined();

    const malformed = fixture([{ status: "completed", text: "I could not decide.", truncated: false, stopReason: null, error: null }, answered("Never read.")]);
    const third = malformed.create();
    await processTarsMessage(third.id, malformed.ports);
    expect(malformed.requests).toHaveLength(1);
    expect(malformed.conversations.get(third.id)).toMatchObject({ state: "failed" });
  } finally { console.error = error; }
});

test("only transient provider failures are worth a retry", () => {
  const failed = (error: string, stopReason: string | null = "runtime_failure") => ({ status: "failed" as const, truncated: false, stopReason, error });
  expect(tarsPlannerRetryCause(failed("Provider turn timed out. timeout=120000ms"))).toBe("timeout");
  expect(tarsPlannerRetryCause(failed("529 Overloaded"))).toBe("provider");
  // Seen live: the provider runtime failed to start up; the next attempt succeeded.
  expect(tarsPlannerRetryCause(failed("workspace routing discovery failed"))).toBe("provider");
  expect(tarsPlannerRetryCause(failed("Rate limit reached for requests"))).toBe("provider");
  expect(tarsPlannerRetryCause(failed("socket hang up"))).toBe("provider");
  expect(tarsPlannerRetryCause({ status: "completed", truncated: true, stopReason: "max_tokens", error: null })).toBe("truncated");
  // Authority, account and format problems need the user, not another call.
  expect(tarsPlannerRetryCause(failed("Claude usage limit reached."))).toBeNull();
  expect(tarsPlannerRetryCause(failed("Not logged in. Run claude login."))).toBeNull();
  expect(tarsPlannerRetryCause(failed("Permission denied by policy"))).toBeNull();
  expect(tarsPlannerRetryCause(failed("refused", "refusal"))).toBeNull();
  expect(tarsPlannerRetryCause({ status: "cancelled", truncated: false, stopReason: null, error: "Provider turn timed out." })).toBeNull();
  expect(tarsPlannerRetryCause({ status: "completed", truncated: false, stopReason: null, error: null })).toBeNull();
});
