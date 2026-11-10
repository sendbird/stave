import { projectTarsActivity } from "../src/lib/tars/activity";
import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { TarsStore } from "../electron/persistence/tars-store";
import { RunLedgerStore } from "../electron/persistence/run-ledger-store";
import { createSecondaryRunCoordinator } from "../electron/main/runs/secondary-run-coordinator";
import { processTarsMessage, parseTarsDecisionOutput, tarsMessageRunIdentity } from "../electron/main/tars-planner";
import { inspectTarsResponsibility, TARS_INSPECTION_TOTAL_CHARS, TARS_INSPECTION_VIEW_CHARS } from "../electron/main/tars-inspections";
import { TarsInspectActionSchema, TarsMessageViewSchema, tarsMessageView } from "../src/lib/tars/conversation";
import type { SecondaryProviderExecutionRequest } from "../src/lib/runs/secondary-run";
import { SETTINGS, testContext } from "./tars-test-context";

const NOW = "2026-11-12T00:00:00.000Z";
const databases: Database[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
const inspect = { kind: "inspect", responsibilityId: "work", view: "report" } as const;
const mutation = { kind: "control", responsibilityId: "work", expectedRevision: 1, operation: "pause" } as const;
function fixture(answer: (request: SecondaryProviderExecutionRequest, index: number) => Promise<unknown> = async () => ({ reply: "Final", actions: [] })) {
  const db = new Database(":memory:"); databases.push(db);
  const conversations = new TarsConversationStore(db); conversations.configure(SETTINGS);
  const tars = new TarsStore(db);
  const row = tars.create({ requestId: "work", title: "Search", instruction: "Fix search", acceptanceCriteria: ["Search works"],
    workspaceId: "source", repositoryPath: "/tmp/project", providerId: "codex" }, NOW);
  const action = { ...inspect, responsibilityId: row.id };
  const ledger = new RunLedgerStore(db);
  const requests: SecondaryProviderExecutionRequest[] = [];
  const reads: string[] = [];
  const coordinator = createSecondaryRunCoordinator({ getLedger: () => ({
    getRunAggregate: ledger.getAggregate.bind(ledger), claimRunStep: ledger.claimStep.bind(ledger),
    markRunStepWaiting: ledger.markStepWaiting.bind(ledger), completeRunStep: ledger.completeStep.bind(ledger),
    failRunStep: ledger.failStep.bind(ledger), cancelRunStep: ledger.cancelStep.bind(ledger), listRunReceipts: ledger.listReceipts.bind(ledger),
  }), executeHost: async (request) => {
    requests.push(request);
    const value = await answer(request, requests.length - 1);
    const text = JSON.stringify(value);
    return { executionId: request.executionId, providerId: request.input.providerId, model: request.input.model,
      status: "completed", text, truncated: false, eventCount: 2, collectedEventCount: 2, outputBytes: Buffer.byteLength(text), stopReason: null, error: null };
  }, cancelHost: async () => ({ ok: true }), now: () => NOW });
  const message = conversations.create({ requestId: "question", text: "What failed in the search checks?" }, NOW);
  const ports = { conversations, coordinator, context: async () => testContext(tars), now: () => NOW,
    inspect: async (_row: typeof row, view: typeof action.view | "changes" | "checks" | "transcript" | "pullRequest") => {
      reads.push(view); return { source: "test-host", evidence: "Search assertion failed" };
    } };
  return { db, conversations, tars, row, action, ledger, requests, reads, message, ports };
}
const dataOf = (request: SecondaryProviderExecutionRequest) => JSON.parse(request.input.prompt.split("\n\n").at(-1)!);

test("inspect is strict, reads all five views and rejects paths, tools and unsupported views", () => {
  for (const view of ["report", "changes", "transcript", "checks", "pullRequest"]) expect(TarsInspectActionSchema.safeParse({ ...inspect, view }).success).toBe(true);
  for (const extra of [{ view: "review" }, { command: "git diff" }, { path: "/tmp/other" }, { expectedRevision: 1 }])
    expect(TarsInspectActionSchema.safeParse({ ...inspect, ...extra }).success).toBe(false);
  expect(parseTarsDecisionOutput(JSON.stringify({ reply: "Read", actions: [inspect] })).actions).toEqual([inspect]);
});

test("host reads before a final decision, discards mixed actions and gives each round its own ledger identity", async () => {
  const f = fixture(async (_request, index) => index === 0 ? { reply: "Read", actions: [f.action, mutation] } : { reply: "The assertion failed", actions: [mutation] });
  await processTarsMessage(f.message.id, f.ports);
  expect(f.reads).toEqual(["report"]);
  expect(f.requests).toHaveLength(2);
  expect(f.requests.every((request) => request.input.toolsDisabled)).toBe(true);
  const data = dataOf(f.requests[1]!);
  expect(data.currentMessage).toEqual(dataOf(f.requests[0]!).currentMessage);
  expect(data.inspections[0]).toMatchObject({ responsibilityId: f.row.id, status: "read", view: "report", observedAt: NOW });
  expect(data.inspections[0].content).toContain("Search assertion failed");
  expect(f.conversations.get(f.message.id)?.decision?.actions).toEqual([mutation]);
  expect(f.conversations.listReceipts(f.message.id)).toEqual([]);
  for (const round of [0, 1]) {
    const identity = tarsMessageRunIdentity(f.message.id, round);
    expect(f.ledger.getAggregate(identity)?.step.status).toBe("completed");
    const keys = f.ledger.listReceipts({ runId: identity.runId }).map((receipt) => receipt.idempotencyKey);
    expect(keys).toContain(`${identity.runId}:claim:started`);
    expect(keys).toContain(`${identity.runId}:complete:completed`);
  }
  // Reprocessing an answered message cannot bill or apply anything again.
  await processTarsMessage(f.message.id, f.ports);
  expect(f.requests).toHaveLength(2);
});

test("two extra rounds only, final inspect is refused along with all other actions", async () => {
  const f = fixture(async () => ({ reply: "Still reading", actions: [f.action, mutation] }));
  await processTarsMessage(f.message.id, f.ports);
  expect(f.requests).toHaveLength(3);
  expect(f.reads).toHaveLength(2);
  expect(f.requests[2]!.input.prompt).toContain("FINAL round: inspect is forbidden");
  expect(dataOf(f.requests[2]!).inspections).toHaveLength(2);
  expect(f.conversations.get(f.message.id)).toMatchObject({ state: "answered", decision: { actions: [] } });
});

test("unknown ownership and unavailable readers are observations, never I/O grants", async () => {
  const f = fixture();
  const observation = await inspectTarsResponsibility(inspect, f.tars.snapshot(), f.ports.inspect, NOW, TARS_INSPECTION_TOTAL_CHARS);
  expect(observation).toMatchObject({ status: "notOwned", content: "" });
  expect(f.reads).toEqual([]);
  expect(await inspectTarsResponsibility(f.action, f.tars.snapshot(), undefined, NOW, TARS_INSPECTION_TOTAL_CHARS)).toMatchObject({ status: "unavailable" });
  expect(await inspectTarsResponsibility(f.action, f.tars.snapshot(), async () => { throw new Error("private host exception"); }, NOW, TARS_INSPECTION_TOTAL_CHARS))
    .toMatchObject({ status: "unavailable", content: "" });
});

test("view and total bounds include escaped JSON across repeated reads, without splitting a surrogate", async () => {
  const f = fixture();
  let remaining = TARS_INSPECTION_TOTAL_CHARS;
  let spent = 0;
  for (let i = 0; i < 16; i++) {
    const observation = await inspectTarsResponsibility(f.action, f.tars.snapshot(), async () => '\u0000😀"'.repeat(20_000), NOW, remaining);
    if (!observation) continue;
    expect(observation.content.length).toBeLessThanOrEqual(TARS_INSPECTION_VIEW_CHARS);
    expect(/[\uD800-\uDBFF]$/.test(observation.content)).toBe(false);
    expect(observation.status === "sizeLimit" || observation.truncated).toBe(true);
    const size = JSON.stringify(observation).length; remaining -= size; spent += size;
  }
  expect(spent).toBeLessThanOrEqual(TARS_INSPECTION_TOTAL_CHARS);
  expect(spent).toBeGreaterThan(20_000);
});

test("reading status is persisted and shared; recovery refuses late results and never replays a partial decision", async () => {
  const f = fixture(async () => ({ reply: "Read before pausing", actions: [f.action, mutation] }));
  let started!: () => void; let release!: () => void;
  const entered = new Promise<void>((resolve) => { started = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const processing = processTarsMessage(f.message.id, { ...f.ports, inspect: async () => { started(); await gate; return "Late report"; } });
  await entered;
  const reopened = new TarsConversationStore(f.db);
  expect(TarsMessageViewSchema.parse(tarsMessageView(reopened.get(f.message.id)!))).toMatchObject({ state: "reasoning", inspection: { reading: true, title: "Search", view: "report", round: 1 } });
  reopened.recover(NOW);
  release(); await processing;
  await processTarsMessage(f.message.id, { ...f.ports, conversations: reopened });
  expect(f.requests).toHaveLength(1);
  expect(reopened.get(f.message.id)).toMatchObject({ state: "failed", errorCode: "interrupted", decision: null });
  expect(reopened.listReceipts(f.message.id)).toEqual([]);
});

test("a follow-up round retries transient failure under its own fail and claim keys", async () => {
  const f = fixture(async (_request, index) => {
    if (index === 0) return { reply: "Read", actions: [f.action] };
    if (index === 1) throw new Error("Provider turn timed out.");
    return { reply: "Recovered", actions: [] };
  });
  await processTarsMessage(f.message.id, f.ports);
  expect(f.requests).toHaveLength(3);
  expect(f.reads).toEqual(["report"]);
  expect(f.requests[1]!.input).toEqual(f.requests[2]!.input);
  const identity = tarsMessageRunIdentity(f.message.id, 1);
  expect(f.ledger.getAggregate(identity)?.step).toMatchObject({ status: "completed", attempt: 2 });
  const keys = f.ledger.listReceipts({ runId: identity.runId }).map((receipt) => receipt.idempotencyKey);
  expect(keys).toContain(`provider:${f.requests[1]!.executionId}:failed:failed`);
  expect(keys).toContain(`${identity.runId}:claim:2:started`);
  expect(f.conversations.get(f.message.id)).toMatchObject({ state: "answered", reply: "Recovered" });
});

test("cancelling while a later planner round runs refuses its late work actions", async () => {
  let started!: () => void; let release!: () => void;
  const entered = new Promise<void>((resolve) => { started = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const f = fixture(async (_request, index) => {
    if (index === 0) return { reply: "Read", actions: [f.action] };
    started(); await gate; return { reply: "Late", actions: [mutation] };
  });
  const processing = processTarsMessage(f.message.id, f.ports);
  await entered;
  const message = f.conversations.get(f.message.id)!;
  f.conversations.cancel(message.id, message.revision, NOW);
  release(); await processing;
  expect(f.conversations.get(message.id)).toMatchObject({ state: "cancelled", decision: null });
  expect(f.conversations.listReceipts(message.id)).toEqual([]);
});

test("an inspect beyond the action count limit cannot turn a mixed reply into work mutations", async () => {
  const f = fixture(async () => ({ reply: "Read", actions: [...Array.from({ length: 8 }, () => mutation), f.action] }));
  await processTarsMessage(f.message.id, f.ports);
  expect(f.requests).toHaveLength(1);
  expect(f.reads).toEqual([]);
  expect(f.conversations.get(f.message.id)?.decision?.actions).toEqual([]);
});

test("the full loop respects one serialized observation budget across both inspection rounds", async () => {
  const f = fixture(async (_request, index) => ({ reply: "Evidence", actions: index < 2 ? Array.from({ length: 8 }, () => f.action) : [] }));
  await processTarsMessage(f.message.id, { ...f.ports, inspect: async () => '\u0000😀'.repeat(30_000) });
  const data = dataOf(f.requests[2]!);
  expect(JSON.stringify(data.inspections).length).toBeLessThanOrEqual(TARS_INSPECTION_TOTAL_CHARS);
  expect(data.inspections.some((observation: { truncated: boolean }) => observation.truncated)).toBe(true);
  expect(f.requests.every((request) => request.input.prompt.length <= 95_002)).toBe(true);
});

test("Activity retains every inspection's metadata across reads without exporting inspected content", async () => {
  const f = fixture((_request, round) => round === 0
    ? { reply: "Reading", actions: [{ ...inspect, responsibilityId: f.row.id }, { ...inspect, responsibilityId: f.row.id, view: "checks" }] }
    : { reply: "Checked", actions: [] });
  try {
    await processTarsMessage(f.message.id, f.ports);
    const message = f.conversations.listViews(10).find(message => message.id === f.message.id)!;
    expect(message.inspections?.map(inspection => [inspection.view, inspection.reading, inspection.status])).toEqual([
      ["report", false, "read"], ["checks", false, "read"],
    ]);
    expect(JSON.stringify(message.inspections)).not.toContain("Search assertion failed");
    expect(message.inspections).toHaveLength(2);
    const activity = projectTarsActivity({ settings: null, messages: [message], receipts: [], activity: [], records: [] }, [f.row]);
    expect(activity.filter(entry => entry.content.kind === "inspection")).toHaveLength(2);
  } finally { f.db.close(); }
});
