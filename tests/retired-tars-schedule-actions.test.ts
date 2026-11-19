import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { applyTarsDecision } from "../electron/host-service/tars-decisions";
import { dropRetiredTarsScheduleActions } from "../electron/persistence/retired-tars-schedule-actions";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { TarsStore } from "../electron/persistence/tars-store";
import { TarsActionReceiptSchema, TarsMessageSchema } from "../src/lib/tars/conversation";
import { REGISTRY, SETTINGS } from "./tars-test-context";

const NOW = "2026-11-12T09:00:00.000Z";
/** A schedule action as a release with Tars schedules saved it. */
const SCHEDULE = { kind: "schedule", operation: "create", title: "Release check", request: "Check the release branch.", workspaceId: "source",
  when: { kind: "recurring", every: 1, unit: "days", at: { hour: 9, minute: 0 } } };
/** The profile as a release with Tars schedules left it: this release has not opened it yet. */
const unopened = (database: Database) => database.exec("DROP TABLE IF EXISTS tars_schedule_actions_retired");
const body = (database: Database, sql: string, ...params: string[]) => JSON.parse((database.query(sql).get(...params) as { body_json: string }).body_json);

/**
 * A profile from a release with Tars schedules: one reply that proposed a
 * schedule and a clear, one that only listed schedules, and one with no
 * schedule at all. Saved through the store, then rewritten to the old shape.
 */
function oldProfile() {
  const database = new Database(":memory:");
  const store = new TarsConversationStore(database);
  store.configure(SETTINGS);
  const answered = (requestId: string, actions: Array<{ kind: "clear"; scopes: ["conversation"] }>) => {
    const message = store.create({ requestId, text: requestId }, NOW);
    return store.answer(message.id, store.claim(message.id, message.revision, NOW).revision, { reply: `Reply to ${requestId}`, actions }, NOW);
  };
  const proposed = (requestId: string) => {
    const message = answered(requestId, [{ kind: "clear", scopes: ["conversation"] }]);
    const receipt = store.recordReceipt(message.id, message.revision, 0, message.decision!.actions[0]!, NOW);
    store.settleReceipt(message.id, 0, receipt.revision, { status: "proposed" }, NOW);
    return message;
  };
  const mixed = proposed("mixed");
  const listed = answered("listed", []);
  const plain = proposed("plain");
  // The old shape: the schedule action came first, so the clear's receipt sat at position 1.
  database.query(`UPDATE tars_action_receipts SET action_index = 1, body_json = json_set(body_json, '$.actionIndex', 1) WHERE message_id = ?`).run(mixed.id);
  database.query(`UPDATE tars_messages SET body_json = json_set(body_json, '$.decision.actions', json(?)) WHERE id = ?`)
    .run(JSON.stringify([SCHEDULE, { kind: "clear", scopes: ["conversation"] }]), mixed.id);
  database.query(`UPDATE tars_messages SET body_json = json_set(body_json, '$.decision.actions', json(?)) WHERE id = ?`)
    .run(JSON.stringify([{ kind: "schedule", operation: "list" }]), listed.id);
  const receipt = (messageId: string, action: unknown, status: "proposed" | "applied") => database
    .query("INSERT INTO tars_action_receipts (message_id, action_index, request_hash, revision, body_json) VALUES (?, 0, ?, 2, ?)")
    .run(messageId, "a".repeat(64), JSON.stringify({ messageId, actionIndex: 0, requestHash: "a".repeat(64), action, status, responsibilityId: null,
      error: null, reason: null, revision: 2, createdAt: NOW, updatedAt: NOW }));
  receipt(mixed.id, SCHEDULE, "proposed");
  receipt(listed.id, { kind: "schedule", operation: "list" }, "applied");
  // What the removed schedule store kept beside the conversation.
  database.exec(`CREATE TABLE tars_schedules (id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, state TEXT NOT NULL, created_at TEXT NOT NULL, body_json TEXT NOT NULL);
    INSERT INTO tars_schedules VALUES ('tars-1', 'schedule:mixed:0', 'active', '${NOW}', '{}');`);
  unopened(database);
  return { database, mixed: mixed.id, listed: listed.id, plain: plain.id };
}

describe("dropRetiredTarsScheduleActions", () => {
  test("a saved schedule action no longer matches the conversation contract", () => {
    const { database, mixed } = oldProfile();
    expect(TarsMessageSchema.safeParse(body(database, "SELECT body_json FROM tars_messages WHERE id = ?", mixed)).success).toBe(false);
    expect(TarsActionReceiptSchema.safeParse(body(database, "SELECT body_json FROM tars_action_receipts WHERE message_id = ? AND action_index = 0", mixed)).success).toBe(false);
    database.close();
  });

  test("opening the conversation retires saved schedule actions in place, removes their receipts, and keeps the rest readable", () => {
    const { database, mixed, listed, plain } = oldProfile();
    const untouched = body(database, "SELECT body_json FROM tars_messages WHERE id = ?", plain);

    const store = new TarsConversationStore(database);

    const messages = store.list();
    expect(messages.map((message) => [message.text, message.reply, message.decision?.actions.map((action) => action.kind)])).toEqual([
      ["mixed", "Reply to mixed", ["retired", "clear"]], ["listed", "Reply to listed", ["retired"]], ["plain", "Reply to plain", ["clear"]],
    ]);
    // The clear keeps its position and its receipt, so what names it by position still finds it.
    expect(store.listReceipts(mixed).map((receipt) => [receipt.actionIndex, receipt.action.kind, receipt.status])).toEqual([[1, "clear", "proposed"]]);
    expect(store.listReceipts(listed)).toEqual([]);
    expect(body(database, "SELECT body_json FROM tars_messages WHERE id = ?", plain)).toEqual(untouched);
    // Nothing is left waiting to be applied because of the removal.
    expect(store.listPendingActions()).toEqual([]);
    // The schedule store's tables are left as they were; nothing reads them.
    expect(database.query("SELECT COUNT(*) AS count FROM tars_schedules").get()).toEqual({ count: 1 });
    database.close();
  });

  test("an interrupted reply that mixed a schedule with other actions resumes on the receipts it already had", async () => {
    const database = new Database(":memory:");
    const store = new TarsConversationStore(database);
    store.configure(SETTINGS);
    const clear = { kind: "clear" as const, scopes: ["conversation" as const] };
    const delegate = { kind: "delegate" as const, workspaceId: "source", title: "Repair search", instruction: "Repair search and verify it.",
      acceptanceCriteria: ["Search works"], priority: 50 };
    const queued = store.create({ requestId: "interrupted", text: "Clear the conversation and repair search." }, NOW);
    const message = store.answer(queued.id, store.claim(queued.id, queued.revision, NOW).revision, { reply: "On it.", actions: [clear, delegate] }, NOW);
    // Stave stopped after it saved each intent and before it settled either.
    store.recordReceipt(message.id, message.revision, 0, clear, NOW);
    store.recordReceipt(message.id, message.revision, 1, delegate, NOW);
    // The old shape: the schedule action came first, so the other two sat at positions 1 and 2.
    for (const index of [1, 0]) database.query(`UPDATE tars_action_receipts SET action_index = ?, body_json = json_set(body_json, '$.actionIndex', ?)
      WHERE message_id = ? AND action_index = ?`).run(index + 1, index + 1, message.id, index);
    database.query(`UPDATE tars_messages SET body_json = json_set(body_json, '$.decision.actions', json(?)) WHERE id = ?`)
      .run(JSON.stringify([SCHEDULE, clear, delegate]), message.id);
    unopened(database);

    const conversations = new TarsConversationStore(database);
    const responsibilities = new TarsStore(database);
    const pending = conversations.listPendingActions();
    expect(pending.map((entry) => entry.id)).toEqual([message.id]);
    for (const entry of pending) await applyTarsDecision({ messageId: entry.id, expectedRevision: entry.revision },
      { conversations, responsibilities, readRegistry: () => REGISTRY, requestTick: () => {}, now: () => NOW });

    // Each action settled the receipt it already had; none got a second one at a new position.
    expect(conversations.listReceipts(message.id).map((receipt) => [receipt.actionIndex, receipt.action.kind, receipt.status]))
      .toEqual([[1, "clear", "proposed"], [2, "delegate", "applied"]]);
    // The work is named by the position the reply gave it, so a restart finds the same work again.
    expect(responsibilities.snapshot().responsibilities.map((row) => row.requestId)).toEqual([`tars-message:${message.id}:2`]);
    expect(conversations.listPendingActions()).toEqual([]);
    database.close();
  });

  test.each(["with nothing to convert", "converted"])("a later open of a profile %s reads no message or receipt, and writes nothing", (kind) => {
    const database = kind === "converted" ? oldProfile().database : new Database(":memory:");
    new TarsConversationStore(database);
    const statements: string[] = [];
    const changes = () => (database.query("SELECT total_changes() AS count").get() as { count: number }).count;
    const before = changes();
    dropRetiredTarsScheduleActions({ prepare: (sql) => { statements.push(sql); return database.prepare(sql); },
      transaction: (operation) => database.transaction(operation) });
    expect(statements.filter((sql) => /tars_messages|tars_action_receipts/.test(sql))).toEqual([]);
    expect(changes()).toBe(before);
    database.close();
  });
});
