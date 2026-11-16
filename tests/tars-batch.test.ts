import { createTarsRuntime } from "../electron/host-service/tars-runtime";
import { actTars } from "../electron/host-service/tars-control";
import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { TarsStore } from "../electron/persistence/tars-store";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { applyTarsDecision } from "../electron/host-service/tars-decisions";
import { createTarsBatchRuntime } from "../electron/host-service/tars-batch";
import { TarsDecisionActionSchema, type TarsDecisionAction } from "../src/lib/tars/conversation";
import { tarsFollowUpRefusal } from "../electron/host-service/tars-follow-up-admission";
import { parseTarsDecisionOutput } from "../electron/main/tars-planner";

const dbs: Database[] = [];
afterEach(() => { for (const db of dbs.splice(0)) db.close(); });
const now = "2026-11-16T00:00:00.000Z";
function fixture() {
  const db = new Database(":memory:"); dbs.push(db);
  db.exec("CREATE TABLE app_state(key TEXT PRIMARY KEY, value_json TEXT, updated_at TEXT)");
  const responsibilities = new TarsStore(db);
  const conversations = new TarsConversationStore(db);
  const make = (repositoryPath = "/tmp/repository") => responsibilities.create({ requestId: crypto.randomUUID(), workspaceId: "source", repositoryPath, title: "Work", instruction: "Verify work", acceptanceCriteria: ["Verified"], providerId: "codex" }, now);
  return { db, responsibilities, conversations, make };
}
const actions: TarsDecisionAction[] = [
  { kind: "bulkControl", operation: "pause", scope: { kind: "all" } },
  { kind: "cleanup", scope: { kind: "repository", repositoryPath: "/tmp/repository" }, deleteBranches: false, permanentlyDeleteArchived: false },
];

test.each(actions)("strict planner parser admits $kind and rejects unknown fields", action => {
  expect(TarsDecisionActionSchema.parse(action)).toEqual(action);
  expect(TarsDecisionActionSchema.safeParse({ ...action, force: true }).success).toBe(false);
  expect(parseTarsDecisionOutput(JSON.stringify({ reply: "Confirm the card", actions: [action] })).actions).toEqual([action]);
  expect(parseTarsDecisionOutput(JSON.stringify({ reply: "Confirm the card", actions: [action, action] })).actions).toHaveLength(1);
});

test.each(actions)("automatic follow-ups cannot propose $kind", action => {
  const f = fixture();
  expect(tarsFollowUpRefusal(action, { kind: "followUp", eventKey: "event", responsibilityId: "owned", reason: "blocked", observedRevision: 1, summary: "Blocked" }, f.responsibilities)).toBeTruthy();
});

test.each(["careful", "balanced", "handsOff"] as const)("%s cannot bypass one batch confirmation (real SQLite)", async autonomy => {
  const f = fixture(); f.make();
  f.conversations.configure({ providerId: "codex", model: "model", maxTurns: 10, autonomy });
  const queued = f.conversations.create({ requestId: "request", text: "Pause everything and clean up finished work" }, now);
  const claimed = f.conversations.claim(queued.id, queued.revision, now);
  const message = f.conversations.answer(claimed.id, claimed.revision, { reply: "Confirm the card", actions }, now);
  const control = async () => { throw new Error("Must not act before confirmation"); };
  const receipts = await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, { conversations: f.conversations, responsibilities: f.responsibilities, readRegistry: () => [], requestTick() {}, control });
  expect(receipts.map(row => row.status)).toEqual(["proposed", "proposed"]);
  expect(f.responsibilities.snapshot().responsibilities[0]!.state).toBe("queued");
});

test("repository bulk preview freezes membership and skips changed revisions (real SQLite)", async () => {
  const f = fixture(); const owned = f.make(); f.make("/tmp/other");
  let calls = 0;
  const runtime = createTarsBatchRuntime({ conversations: () => f.conversations, responsibilities: () => f.responsibilities,
    cleanup: { list: async () => { throw new Error("Unexpected cleanup"); }, act: async () => { throw new Error("Unexpected cleanup"); } },
    control: async () => { calls++; throw new Error("Changed work must be skipped"); } });
  const preview = await runtime.invoke({ operation: "preview", action: { kind: "bulkControl", operation: "pause", scope: { kind: "repository", repositoryPath: owned.repositoryPath } } });
  expect(preview.items).toHaveLength(1);
  f.make();
  f.responsibilities.patch(owned.id, owned.revision, { priority: 10 }, now);
  const confirmed = await runtime.invoke({ operation: "confirm", id: preview.id });
  expect(confirmed.items).toMatchObject([{ status: "skipped", reason: "stale" }]); expect(calls).toBe(0);
  expect(await runtime.invoke({ operation: "confirm", id: preview.id })).toEqual(confirmed);
});


test.each(["pause", "resume", "cancel"] as const)("bulk %s uses the real control ledger within repository scope", async operation => {
  const f = fixture();
  const state = operation === "resume" ? "paused" : "running";
  const rows = [f.make(), f.make(), f.make("/tmp/other")].map(row => f.responsibilities.patch(row.id, row.revision,
    { state, executionWorkspaceId: `exec-${row.id}`, taskId: `task-${row.id}`, agentRunId: `run-${row.id}` }, now));
  const calls: string[] = [];
  const runtime = createTarsRuntime({ store: f.responsibilities, now: () => now, validateScope: async () => {}, prepareWorkspace: async () => "exec", prepareTask: async () => {}, findRun: async () => null,
    startRun: async row => `run-${row.id}`, observe: async () => ({ state: "running", detail: null }), controlRun: async row => { calls.push(row.id); } });
  const batch = createTarsBatchRuntime({ conversations: () => f.conversations, responsibilities: () => f.responsibilities,
    cleanup: { list: async () => { throw new Error("Unexpected cleanup"); }, act: async () => { throw new Error("Unexpected cleanup"); } },
    control: input => actTars(input, { conversations: f.conversations, runtime, responsibilities: f.responsibilities }) });
  const preview = await batch.invoke({ operation: "preview", action: { kind: "bulkControl", operation, scope: { kind: "repository", repositoryPath: "/tmp/repository" } } });
  expect(preview.items).toHaveLength(2);
  const result = await batch.invoke({ operation: "confirm", id: preview.id });
  expect(result.items.every(item => item.status === "applied")).toBe(true);
  expect(f.responsibilities.get(rows[2]!.id)!.state).toBe(state);
  for (const row of rows.slice(0, 2)) expect(f.responsibilities.get(row.id)!.state).toBe(operation === "pause" ? "paused" : operation === "cancel" ? "cancelled" : "running");
  const count = calls.length;
  await batch.invoke({ operation: "confirm", id: preview.id });
  expect(calls).toHaveLength(count);
  runtime.stop();
});

test("a user batch proposal settles its saved receipt once; follow-up origin is refused by host admission", async () => {
  const f = fixture();
  f.conversations.configure({ providerId: "codex", model: "model", maxTurns: 10, autonomy: "handsOff" });
  const ports = { conversations: f.conversations, responsibilities: f.responsibilities, readRegistry: () => [], requestTick() {}, control: async () => { throw new Error("Unexpected control"); } };
  const batch = createTarsBatchRuntime({ conversations: () => f.conversations, responsibilities: () => f.responsibilities,
    cleanup: { list: async () => ({ rows: [], policy: { merged: { enabled: false, value: 1 }, inactive: { enabled: false, value: 1 }, archived: { enabled: false, value: 1 }, maximum: { enabled: false, value: 1 } }, recent: [] }), act: async () => { throw new Error("Unexpected cleanup"); } }, control: async () => { throw new Error("Unexpected control"); } });
  for (const automatic of [false, true]) {
    const queued = f.conversations.create({ requestId: `request-${automatic}`, text: "Clean up finished work" }, now, undefined,
      automatic ? { kind: "followUp", eventKey: "event", responsibilityId: "owned", reason: "blocked", observedRevision: 1, summary: "Blocked" } : undefined);
    const claimed = f.conversations.claim(queued.id, queued.revision, now);
    const message = f.conversations.answer(claimed.id, claimed.revision, { reply: "Confirm the card", actions: [actions[1]!] }, now);
    const [receipt] = await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, ports);
    const proposal = { messageId: message.id, actionIndex: 0 };
    if (automatic) {
      expect(receipt).toMatchObject({ status: "rejected", reason: "notByFollowUp" });
      await expect(batch.invoke({ operation: "preview", action: actions[1], proposal })).rejects.toThrow("current user proposal");
    } else {
      const preview = await batch.invoke({ operation: "preview", action: actions[1], proposal });
      await batch.invoke({ operation: "confirm", id: preview.id });
      expect(f.conversations.getReceipt(message.id, 0)!.status).toBe("applied");
      expect(await batch.invoke({ operation: "preview", action: actions[1], proposal })).toMatchObject({ state: "applied" });
    }
  }
});

test("one bulk record restores only controls with host-saved Undo evidence", async () => {
  const { undoTarsAction } = await import("../electron/host-service/tars-action-undo");
  const f = fixture(); const row = f.make();
  const runtime = createTarsRuntime({ store: f.responsibilities, now: () => now, validateScope: async () => {}, prepareWorkspace: async () => "exec", prepareTask: async () => {}, findRun: async () => null,
    startRun: async current => `run-${current.id}`, observe: async () => ({ state: "running", detail: null }), controlRun: async () => {} });
  const batch = createTarsBatchRuntime({ conversations: () => f.conversations, responsibilities: () => f.responsibilities,
    cleanup: { list: async () => { throw new Error("Unexpected cleanup"); }, act: async () => { throw new Error("Unexpected cleanup"); } },
    control: input => actTars(input, { conversations: f.conversations, runtime, responsibilities: f.responsibilities }),
    undo: (requestId, expectedRevision) => undoTarsAction({ requestId, expectedRevision }, { conversations: f.conversations, responsibilities: f.responsibilities,
      readRegistry: () => [{ repositoryPath: row.repositoryPath, workspaces: [{ id: "source" }] }] as never,
      serialize: runtime.serializeUndo, control: runtime.act }) });
  const preview = await batch.invoke({ operation: "preview", action: { kind: "bulkControl", operation: "pause", scope: { kind: "all" } } });
  const applied = await batch.invoke({ operation: "confirm", id: preview.id });
  expect(applied.items).toMatchObject([{ status: "applied", undoable: true }]);
  const restored = await batch.invoke({ operation: "restore", id: preview.id });
  expect(restored.state).toBe("restored");
  expect(f.responsibilities.get(row.id)!.state).toBe("queued");
  const revision = f.responsibilities.get(row.id)!.revision;
  await batch.invoke({ operation: "restore", id: preview.id });
  expect(f.responsibilities.get(row.id)!.revision).toBe(revision);
  runtime.stop();
});
