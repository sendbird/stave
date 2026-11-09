import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { TarsConversationStore, TarsStorageBusyError } from "../electron/persistence/tars-conversation-store";
import { TarsStore } from "../electron/persistence/tars-store";
import { RunLedgerStore } from "../electron/persistence/run-ledger-store";
import { createSecondaryRunCoordinator } from "../electron/main/runs/secondary-run-coordinator";
import { parseTarsDecisionOutput, processTarsMessage, TARS_PLANNER_MAX_EVENTS } from "../electron/main/tars-planner";
import { executeSecondaryProviderRun } from "../electron/providers/secondary-run-executor";
import type { SecondaryProviderExecutionRequest } from "../src/lib/runs/secondary-run";

import { SETTINGS, testContext } from "./tars-test-context";

const NOW = "2026-11-05T00:00:00.000Z";
const action = { kind: "delegate", workspaceId: "source", title: "Fix search", instruction: "Fix search", acceptanceCriteria: ["Search works"], priority: 50 };
function fixture(answer: (request: SecondaryProviderExecutionRequest) => Promise<string>) {
  const database = new Database(":memory:");
  const conversations = new TarsConversationStore(database);
  conversations.configure(SETTINGS);
  const responsibilities = new TarsStore(database);
  const ledger = new RunLedgerStore(database);
  const requests: SecondaryProviderExecutionRequest[] = [];
  const coordinator = createSecondaryRunCoordinator({
    getLedger: () => ({ getRunAggregate: ledger.getAggregate.bind(ledger), claimRunStep: ledger.claimStep.bind(ledger),
      markRunStepWaiting: ledger.markStepWaiting.bind(ledger), completeRunStep: ledger.completeStep.bind(ledger),
      failRunStep: ledger.failStep.bind(ledger), cancelRunStep: ledger.cancelStep.bind(ledger), listRunReceipts: ledger.listReceipts.bind(ledger) }),
    executeHost: async (request) => { requests.push(request); const text = await answer(request); return {
      executionId: request.executionId, providerId: request.input.providerId, model: request.input.model,
      status: "completed", text, truncated: false, eventCount: 2, collectedEventCount: 2,
      outputBytes: Buffer.byteLength(text), stopReason: null, error: null,
    }; }, cancelHost: async () => ({ ok: true }), now: () => NOW,
  });
  const ports = { conversations, coordinator, now: () => NOW,
    context: async () => testContext(responsibilities) };
  const create = (requestId = "current") => conversations.create({ requestId, text: "Fix search and check the result." }, NOW);
  return { database, conversations, responsibilities, ledger, requests, ports, create };
}

test("reasoning saves a proposal through the durable ledger without executing its actions", async () => {
  const f = fixture(async () => JSON.stringify({ reply: "I propose fixing search.", actions: [action] }));
  const message = f.create();
  await Promise.all([processTarsMessage(message.id, f.ports), processTarsMessage(message.id, f.ports)]);
  expect(f.requests).toHaveLength(1);
  expect(f.requests[0]?.input.toolsDisabled).toBe(true);
  expect(f.conversations.get(message.id)).toMatchObject({ state: "answered", decision: { actions: [action] } });
  expect(f.responsibilities.snapshot().responsibilities).toEqual([]);
  expect(f.ledger.getAggregate({ runId: `tars-message:${message.id}`, stepId: `tars-message:${message.id}:reason` })?.step.status).toBe("completed");
  f.database.close();
});

test("ordinary conversation returns an answer without proposing execution", async () => {
  const f = fixture(async () => JSON.stringify({ reply: "Here is the status.", actions: [] }));
  const message = f.create("discuss"); await processTarsMessage(message.id, f.ports);
  expect(f.conversations.get(message.id)?.state).toBe("answered");
  expect(f.conversations.listReceipts(message.id)).toEqual([]);
  expect(f.responsibilities.snapshot().responsibilities).toEqual([]);
  f.database.close();
});

test("cancellation prevents a late model response from becoming an executable proposal", async () => {
  let release!: (text: string) => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const f = fixture(async () => { entered(); return new Promise((resolve) => { release = resolve; }); });
  const message = f.create(); const processing = processTarsMessage(message.id, f.ports);
  await started;
  const active = f.conversations.get(message.id)!;
  f.conversations.cancel(active.id, active.revision, NOW);
  release(JSON.stringify({ reply: "I propose fixing search.", actions: [action] })); await processing;
  expect(f.conversations.get(message.id)).toMatchObject({ state: "cancelled", decision: null });
  expect(f.conversations.listReceipts(message.id)).toEqual([]);
  f.database.close();
});

test("invalid output fails once and does not retry or invent work", async () => {
  const f = fixture(async () => '{"reply":"done","actions":[{"kind":"publish"}]}');
  const message = f.create(); await processTarsMessage(message.id, f.ports);
  await processTarsMessage(message.id, f.ports);
  expect(f.requests).toHaveLength(1);
  expect(f.conversations.get(message.id)).toMatchObject({ state: "failed", decision: null });
  f.database.close();
});

test.each([NOW, "2026-11-05T00:01:00.000Z"])("queued messages retain prior context and exclude later requests (%s)", async (later) => {
  const f = fixture(async () => JSON.stringify({ reply: "Continue the agreed plan.", actions: [] }));
  const previous = f.conversations.create({ requestId: "before", text: "The release must preserve the data." }, NOW);
  const claimed = f.conversations.claim(previous.id, previous.revision, NOW);
  f.conversations.answer(claimed.id, claimed.revision, { reply: "Preserve data during the release.", actions: [] }, NOW);
  const current = f.create("discuss");
  for (let i = 0; i < 32; i++) f.conversations.create({ requestId: `future-${i}`, text: `Unprocessed later request ${i}` }, later);
  await processTarsMessage(current.id, f.ports);
  const context = JSON.parse(f.requests[0]!.input.prompt.split("\n\n").at(-1)!);
  expect(context.history).toEqual([{ textExcerpt: previous.text, replyExcerpt: "Preserve data during the release.", state: "answered" }]);
  f.database.close();
});

test("a paid reply survives a Markdown fence, an over-long reply and an extra top-level key", async () => {
  const long = "가".repeat(8_100);
  const outputs = [
    `Here is the decision.\n\n\`\`\`json\n${JSON.stringify({ reply: "Fenced reply.", actions: [action] })}\n\`\`\``,
    JSON.stringify({ reply: long, actions: [] }),
    JSON.stringify({ reply: "Extra key.", actions: [action], confidence: 0.9 }),
  ];
  let next = 0;
  const f = fixture(async () => outputs[next++]!);
  const messages = outputs.map((_, index) => f.create(`tolerant-${index}`));
  for (const message of messages) await processTarsMessage(message.id, f.ports);
  const [fenced, truncated, extra] = messages.map((message) => f.conversations.get(message.id)!);
  expect(fenced).toMatchObject({ state: "answered", reply: "Fenced reply.", decision: { reply: "Fenced reply.", actions: [action] } });
  expect(truncated?.state).toBe("answered");
  expect(truncated?.reply).toHaveLength(8_000);
  expect(truncated?.reply?.startsWith("가".repeat(7_000))).toBe(true);
  expect(truncated?.reply?.endsWith("\n\n[…]")).toBe(true);
  expect(extra?.decision).toEqual({ reply: "Extra key.", actions: [action] });
  expect(f.requests[0]?.input.prompt).toContain("reply (string, at most 8000 characters)");
  f.database.close();
});

test("a null, empty or overlong branch proposal is dropped or cut, never failing the reply", () => {
  for (const branchName of [null, "", "  "]) {
    const parsed = parseTarsDecisionOutput(JSON.stringify({ reply: "ok", actions: [{ ...action, branchName }] })).actions[0];
    expect(parsed?.kind === "delegate" ? parsed.branchName : "not a delegate").toBeUndefined();
  }
  const long = parseTarsDecisionOutput(JSON.stringify({ reply: "ok", actions: [{ ...action, branchName: `feat/${"a".repeat(300)}` }] })).actions[0];
  expect(long?.kind === "delegate" ? long.branchName?.length : null).toBe(200);
});

test("a delegation reason is kept, cut to its limit, or dropped when empty, never failing the reply", () => {
  const parse = (reason: unknown) => { const parsed = parseTarsDecisionOutput(JSON.stringify({ reply: "ok", actions: [{ ...action, reason }] })).actions[0];
    return parsed?.kind === "delegate" ? parsed.reason : "not a delegate"; };
  expect(parse("Search breaks on empty queries.")).toBe("Search breaks on empty queries.");
  expect(parse("x".repeat(500))).toHaveLength(200);
  for (const empty of [null, "", " "]) expect(parse(empty)).toBeUndefined();
});

test("the prompt asks for a branch name under each repository's rule, with the suffix left to the host", async () => {
  const f = fixture(async () => JSON.stringify({ reply: "ok", actions: [] }));
  const message = f.create();
  await processTarsMessage(message.id, f.ports);
  expect(f.requests[0]?.input.prompt).toContain("branchNamingRule");
  expect(f.requests[0]?.input.prompt).toContain("appends a short unique suffix");
  f.database.close();
});

test("an unexpected action field still rejects the whole decision", async () => {
  for (const extra of [{ repositoryPath: "/tmp/unrelated" }, { providerId: "codex" }]) {
    expect(() => parseTarsDecisionOutput(JSON.stringify({ reply: "ok", actions: [{ ...action, ...extra }] }))).toThrow();
  }
  expect(() => parseTarsDecisionOutput("I could not decide.")).toThrow("JSON decision");
  const f = fixture(async () => `\`\`\`json\n${JSON.stringify({ reply: "Use this path.", actions: [{ ...action, repositoryPath: "/tmp/unrelated" }] })}\n\`\`\``);
  const message = f.create(); await processTarsMessage(message.id, f.ports);
  expect(f.conversations.get(message.id)).toMatchObject({ state: "failed", decision: null, reply: null });
  f.database.close();
});

test("a claim that cannot take the lock leaves the message queued for a retry without a model call", async () => {
  const f = fixture(async () => JSON.stringify({ reply: "Claimed after a retry.", actions: [] }));
  const message = f.create();
  const claim = f.conversations.claim.bind(f.conversations);
  f.conversations.claim = () => { throw Object.assign(new Error("database is locked"), { code: "SQLITE_BUSY" }); };
  await expect(processTarsMessage(message.id, f.ports)).rejects.toThrow("database is locked");
  expect(f.conversations.get(message.id)).toEqual(message);
  expect(f.requests).toEqual([]);
  // A claim that lost a race to cancellation is not an error and is not retried.
  const other = f.create("lost-race");
  f.conversations.claim = (id, revision, now) => { f.conversations.cancel(id, revision, now); return claim(id, revision, now); };
  await processTarsMessage(other.id, f.ports);
  expect(f.conversations.get(other.id)?.state).toBe("cancelled");
  f.conversations.claim = claim;
  await processTarsMessage(message.id, f.ports);
  expect(f.conversations.get(message.id)?.state).toBe("answered");
  expect(f.requests).toHaveLength(1);
  f.database.close();
});

test("a paid reply survives a storage lock that outlasts busy_timeout while it is being saved", async () => {
  const f = fixture(async () => JSON.stringify({ reply: "Saved after the lock cleared.", actions: [] }));
  const message = f.create();
  const original = f.conversations.answer.bind(f.conversations);
  let calls = 0;
  f.conversations.answer = ((...args: Parameters<typeof original>) => {
    calls += 1;
    if (calls === 1) throw new TarsStorageBusyError();
    return original(...args);
  }) as typeof original;
  await processTarsMessage(message.id, f.ports);
  expect(calls).toBe(2);
  expect(f.requests).toHaveLength(1);
  expect(f.conversations.get(message.id)).toMatchObject({ state: "answered", decision: { reply: "Saved after the lock cleared." } });
});

test("a lock that never clears still fails the message after the bounded retries", async () => {
  const f = fixture(async () => JSON.stringify({ reply: "Never saved.", actions: [] }));
  const message = f.create();
  f.conversations.answer = (() => { throw new TarsStorageBusyError(); }) as typeof f.conversations.answer;
  await processTarsMessage(message.id, f.ports);
  expect(f.requests).toHaveLength(1);
  expect(f.conversations.get(message.id)?.state).toBe("failed");
});

test("a failure keeps its phase and cause on the message, before the model call as well as after it", async () => {
  const errors: unknown[][] = [];
  const log = console.error;
  console.error = (...args: unknown[]) => { errors.push(args); };
  try {
    // Before the model call there is no run in the ledger: the message is the only record.
    const early = fixture(async () => JSON.stringify({ reply: "Never asked.", actions: [] }));
    const first = early.create("early");
    await processTarsMessage(first.id, { ...early.ports, context: async () => { throw new Error("The workspace registry could not be read."); } });
    expect(early.requests).toEqual([]);
    expect(early.conversations.get(first.id)).toMatchObject({ state: "failed", errorCode: "reasoningFailed",
      error: "The representative could not finish this message. Retry explicitly after inspecting its state. Failed at context: The workspace registry could not be read." });
    early.database.close();
    // A provider that refuses at once names why, instead of a generic sentence.
    const refused = fixture(async () => "");
    const claimRun = refused.ports.coordinator;
    const second = refused.create("refused");
    await processTarsMessage(second.id, { ...refused.ports, coordinator: { ...claimRun, execute: async (args: Parameters<typeof claimRun.execute>[0]) => {
      const accepted = await claimRun.execute(args);
      return { ...accepted, execution: { ...accepted.execution!, status: "failed" as const, text: "", stopReason: "runtime_failure", error: "Claude usage limit reached." } };
    } } });
    expect(refused.conversations.get(second.id)?.error).toContain("Failed at model: The provider ended the reasoning turn failed (runtime_failure): Claude usage limit reached.");
    refused.database.close();
    // An invalid decision says where it went wrong without quoting the model's output.
    const invalid = fixture(async () => '{"reply":"Secret plan","actions":[{"kind":"publish"}]}');
    const third = invalid.create("invalid");
    await processTarsMessage(third.id, invalid.ports);
    const saved = invalid.conversations.get(third.id)?.error ?? "";
    expect(saved).toContain("Failed at decision: The decision did not match its schema at actions.0");
    expect(saved).not.toContain("Secret plan");
    invalid.database.close();
    expect(errors.map(([line, detail]) => [line, (detail as { phase: string }).phase])).toEqual([["[tars] reasoning failed", "context"],
      ["[tars] reasoning failed", "model"], ["[tars] reasoning failed", "decision"]]);
  } finally { console.error = log; }
});

test("a reply streamed as many small deltas reaches the planner whole, not truncated", async () => {
  const reply = JSON.stringify({ reply: "The decisive check still fails in vendor/clock.test.ts. Should I ask for permission to edit vendor/, or stop here?".repeat(4), actions: [] });
  const f = fixture(async () => reply);
  const message = f.create(); await processTarsMessage(message.id, f.ports);
  const request = f.requests[0]!;
  expect(request.policy.maxEvents).toBe(TARS_PLANNER_MAX_EVENTS);
  // The real executor counts every streamed event against the claimed policy.
  const result = await executeSecondaryProviderRun(request, {
    streamTurn: async () => [...[...reply].map((text) => ({ type: "text" as const, text })), { type: "done" as const, stop_reason: "end_turn" }],
    cleanupTask: () => ({ ok: true, message: "cleaned" }),
  });
  expect(result).toMatchObject({ status: "completed", truncated: false, text: reply });
});
