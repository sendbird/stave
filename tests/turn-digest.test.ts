import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { SqliteStore } from "../electron/persistence/sqlite-store";
import { TurnDigestStore } from "../electron/persistence/turn-digest-store";
import { UsageStatisticsStore } from "../electron/persistence/usage-statistics-store";
import { recordTurnCompletedChecks } from "../electron/host-service/turn-check-digest";
import {
  appendTurnDigestEntry,
  createTurnDigest,
  parseTurnDigest,
  serializeTurnDigest,
  settleTurnDigestFailure,
  turnDigestChecksEntry,
  turnDigestEntryForEvent,
  turnDigestStallEntry,
  TURN_DIGEST_BYTE_LIMIT,
  TURN_DIGEST_ENTRY_LIMIT,
  TURN_DIGEST_STALL_MS,
  type TurnDigest,
} from "../src/lib/providers/turn-digest";
import { PROVIDER_TURN_STALL_THRESHOLD_MS } from "../src/lib/providers/turn-status";

const T0 = Date.parse("2026-10-22T10:00:00.000Z");
const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString();

function harness(db = new Database(":memory:")) {
  const store = Object.create(SqliteStore.prototype) as SqliteStore;
  Object.assign(store, { db, _closed: false });
  (store as unknown as { bootstrap: () => void }).bootstrap();
  Object.assign(store, {
    usageStatistics: new UsageStatisticsStore(db as never),
    turnDigests: new TurnDigestStore(db as never),
    // Removing a task also clears its Lens review records; none exist here.
    lensReviewRecords: { deleteTask: async () => {}, deleteWorkspace: async () => {} },
  });
  return { db, store };
}

function begin(store: SqliteStore, id: string, extra: { createdAt?: string; accountProfileId?: string; taskId?: string } = {}) {
  store.beginTurn({
    id,
    workspaceId: "workspace",
    taskId: extra.taskId ?? "task",
    providerId: "codex",
    createdAt: extra.createdAt ?? at(0),
    ...(extra.accountProfileId ? { accountProfileId: extra.accountProfileId } : {}),
  });
}

function digestOf(db: Database, turnId: string): TurnDigest | null {
  const row = db.prepare("SELECT digest_json FROM turns WHERE id = ?").get(turnId) as { digest_json: string | null };
  return parseTurnDigest(row.digest_json);
}

describe("turn digest rules", () => {
  test("an unrecovered error and a retry are told apart, and a repeated retry counts on one entry", () => {
    expect(turnDigestEntryForEvent({ type: "error", message: "Rate limited", recoverable: true }, at(1)))
      .toMatchObject({ kind: "retry", message: "Rate limited", count: 1 });
    expect(turnDigestEntryForEvent({ type: "error", message: "Auth failed", recoverable: false }, at(1)))
      .toMatchObject({ kind: "error", message: "Auth failed" });
    let digest = createTurnDigest();
    for (const minute of [1, 2, 3]) {
      digest = appendTurnDigestEntry(digest, turnDigestEntryForEvent({ type: "error", message: "Rate limited", recoverable: true }, at(minute))!);
    }
    expect(digest.entries).toEqual([{ kind: "retry", at: at(1), message: "Rate limited", count: 3, lastAt: at(3) }]);
  });

  test("a model the runtime changed is a route entry; resolving the requested model is not", () => {
    expect(turnDigestEntryForEvent({ type: "model_resolved", resolvedProviderId: "codex", resolvedModel: "gpt-a" }, at(0))).toBeNull();
    expect(turnDigestEntryForEvent({
      type: "model_resolved",
      resolvedProviderId: "claude-code",
      resolvedModel: "claude-b",
      modelExecution: { requestedModel: "claude-a", actualModel: "claude-b", reason: "Claude switched models." },
    }, at(0))).toEqual({ kind: "route", at: at(0), fromModel: "claude-a", toModel: "claude-b", reason: "Claude switched models." });
    expect(turnDigestEntryForEvent({
      type: "model_resolved",
      resolvedProviderId: "codex",
      resolvedModel: "gpt-c",
      agentRunRoute: { cause: "evidence" },
    }, at(0))).toEqual({ kind: "route", at: at(0), toModel: "gpt-c", cause: "evidence" });
  });

  test("a stall is five minutes of silence, matching the run line, unless the turn was waiting for an answer", () => {
    expect(TURN_DIGEST_STALL_MS).toBe(PROVIDER_TURN_STALL_THRESHOLD_MS);
    expect(turnDigestStallEntry({ previousAt: at(0), previousEventType: "text", at: at(4.9), endsTurn: false })).toBeNull();
    expect(turnDigestStallEntry({ previousAt: at(0), previousEventType: "text", at: at(6), endsTurn: true }))
      .toEqual({ kind: "stall", at: at(0), silentMs: 360_000, endedTurn: true });
    expect(turnDigestStallEntry({ previousAt: at(0), previousEventType: "approval", at: at(30), endsTurn: false })).toBeNull();
    expect(turnDigestStallEntry({ previousAt: at(0), previousEventType: "user_input", at: at(30), endsTurn: false })).toBeNull();
  });

  test("the digest keeps at most 64 entries and 16 KB, giving up retries and stalls before errors and checks", () => {
    let digest = createTurnDigest();
    digest = appendTurnDigestEntry(digest, turnDigestEntryForEvent({ type: "error", message: "Fatal", recoverable: false }, at(0))!);
    digest = appendTurnDigestEntry(digest, turnDigestChecksEntry({ totalEntries: 1, executedEntries: 1, failures: [] }, at(0))!);
    for (let index = 0; index < 100; index += 1) {
      digest = appendTurnDigestEntry(digest, { kind: "stall", at: at(index), silentMs: 400_000, endedTurn: false });
    }
    expect(digest.entries).toHaveLength(TURN_DIGEST_ENTRY_LIMIT);
    expect(digest.omitted).toBe(102 - TURN_DIGEST_ENTRY_LIMIT);
    expect(digest.entries.slice(0, 2).map((entry) => entry.kind)).toEqual(["error", "checks"]);

    let large = createTurnDigest();
    for (let index = 0; index < 60; index += 1) {
      large = appendTurnDigestEntry(large, turnDigestEntryForEvent({ type: "error", message: `${index} ${"x".repeat(1_000)}`, recoverable: true }, at(index))!);
    }
    expect(new TextEncoder().encode(serializeTurnDigest(large)).length).toBeLessThanOrEqual(TURN_DIGEST_BYTE_LIMIT);
    expect(large.entries.length + large.omitted).toBe(60);
    expect(large.entries.every((entry) => entry.kind === "retry" && entry.message.length <= 400)).toBe(true);
  });

  test("a check run reads pass, warn or fail and keeps a bounded list of failures", () => {
    expect(turnDigestChecksEntry({ totalEntries: 0, executedEntries: 0, failures: [] }, at(0))).toBeNull();
    expect(turnDigestChecksEntry({ totalEntries: 2, executedEntries: 2, failures: [] }, at(0))).toMatchObject({ status: "pass", executed: 2, total: 2 });
    expect(turnDigestChecksEntry({ totalEntries: 2, executedEntries: 2, failures: [{ scriptId: "lint", message: "1 warning", blocking: false }] }, at(0)))
      .toMatchObject({ status: "warn" });
    const failing = turnDigestChecksEntry({
      totalEntries: 9,
      executedEntries: 9,
      failures: Array.from({ length: 9 }, (_, index) => ({ scriptId: `check-${index}`, message: "failed ".repeat(80), blocking: index === 8 })),
    }, at(0));
    expect(failing).toMatchObject({ status: "fail", omittedFailures: 3 });
    expect(failing?.kind === "checks" && failing.failures.every((failure) => failure.message.length <= 200)).toBe(true);
  });

  test("a turn that ends on a recoverable error without continuing records that error, once", () => {
    let digest = createTurnDigest();
    for (const minute of [1, 2, 3]) {
      digest = appendTurnDigestEntry(digest, { kind: "retry", at: at(minute), message: "Overloaded", count: 1 });
    }
    const lastError = { message: "Overloaded", recoverable: true, continuationObserved: false };
    const settled = settleTurnDigestFailure(digest, lastError, true);
    expect(settled.entries).toEqual([
      { kind: "retry", at: at(1), message: "Overloaded", count: 2 },
      { kind: "error", at: at(3), message: "Overloaded", count: 1 },
    ]);
    expect(settleTurnDigestFailure(settled, lastError, true)).toBe(settled);
    expect(settleTurnDigestFailure(digest, { ...lastError, continuationObserved: true }, true)).toBe(digest);
    expect(settleTurnDigestFailure(digest, lastError, false)).toBe(digest);
  });

  test("a digest written by a newer version keeps the entries this version can read", () => {
    const stored = JSON.stringify({
      version: 1,
      omitted: 2,
      accountProfileId: "account-a",
      entries: [
        { kind: "error", at: at(0), message: "Fatal", count: 1 },
        { kind: "future-kind", at: at(1) },
      ],
    });
    expect(parseTurnDigest(stored)).toEqual({
      version: 1,
      omitted: 3,
      accountProfileId: "account-a",
      entries: [{ kind: "error", at: at(0), message: "Fatal", count: 1 }],
    });
    expect(parseTurnDigest("{not json")).toBeNull();
    expect(parseTurnDigest(JSON.stringify({ version: 2, entries: [] }))).toBeNull();
  });
});

describe("turn digest store", () => {
  test("a new turn starts with an empty digest and keeps its event-only facts after the journal is compacted", () => {
    const { db, store } = harness();
    begin(store, "turn");
    expect(digestOf(db, "turn")).toEqual(createTurnDigest());
    store.saveStreamEvents({
      turnId: "turn",
      createdAt: at(1),
      events: [
        { sequence: 1, event: { type: "model_resolved", resolvedProviderId: "codex", resolvedModel: "gpt-b", modelExecution: { requestedModel: "gpt-a", actualModel: "gpt-b", reason: "Rerouted." } } },
        { sequence: 2, event: { type: "error", message: "Overloaded", recoverable: true } },
        { sequence: 3, event: { type: "error", message: "Overloaded", recoverable: true } },
        { sequence: 4, event: { type: "text", text: "Partial reply" } },
        { sequence: 5, event: { type: "error", message: "Stream closed", recoverable: false } },
        { sequence: 6, event: { type: "done", stop_reason: "runtime_failure" } },
      ],
    });
    store.completeTurn({ id: "turn", completedAt: at(2) });
    expect(store.getStreamEvents({ turnId: "turn" }).map((entry) => entry.eventType)).toEqual(["error", "error", "error", "done"]);
    expect(digestOf(db, "turn")?.entries.map((entry) => entry.kind)).toEqual(["route", "retry", "error"]);
    expect(digestOf(db, "turn")?.entries[1]).toMatchObject({ count: 2 });
    // A replayed event is not counted twice.
    store.saveStreamEvent({ turnId: "turn", sequence: 3, createdAt: at(3), event: { type: "error", message: "Overloaded", recoverable: true } });
    expect(digestOf(db, "turn")?.entries[1]).toMatchObject({ count: 2 });
    const [summary] = store.turnDigests.listTurnHistory({ workspaceId: "workspace", taskId: "task" }).turns;
    expect(summary).toMatchObject({ id: "turn", outcome: "failed", error: "Stream closed", digest: { entryCount: 3, hasError: true, checks: null } });
    db.close();
  });

  test("closing a turn that failed on its retried error records the failure, not a retry", () => {
    const { db, store } = harness();
    begin(store, "turn");
    store.saveStreamEvents({
      turnId: "turn",
      createdAt: at(1),
      events: [
        { sequence: 1, event: { type: "error", message: "Claude turn failed.", recoverable: true } },
        { sequence: 2, event: { type: "done" } },
      ],
    });
    store.completeTurn({ id: "turn", completedAt: at(2) });
    store.completeTurn({ id: "turn", completedAt: at(3) });
    expect(store.getTurnReceipt("turn")).toMatchObject({ outcome: "failed", error: "Claude turn failed." });
    expect(digestOf(db, "turn")?.entries).toEqual([{ kind: "error", at: at(1), message: "Claude turn failed.", count: 1 }]);
    db.close();
  });

  test("silence before a resumed or final event is a stall, but waiting on an approval is not", () => {
    const { db, store } = harness();
    begin(store, "turn", { createdAt: at(0) });
    store.saveStreamEvent({ turnId: "turn", sequence: 1, createdAt: at(6), event: { type: "text", text: "late start" } });
    store.saveStreamEvent({ turnId: "turn", sequence: 2, createdAt: at(7), event: { type: "approval", toolName: "Bash", requestId: "r1", description: "Run tests" } });
    store.saveStreamEvent({ turnId: "turn", sequence: 3, createdAt: at(40), event: { type: "tool", toolUseId: "t1", toolName: "Bash", input: "{}", state: "input-available" } });
    store.saveStreamEvent({ turnId: "turn", sequence: 4, createdAt: at(52), event: { type: "done" } });
    expect(digestOf(db, "turn")?.entries).toEqual([
      { kind: "stall", at: at(0), silentMs: 360_000, endedTurn: false },
      { kind: "stall", at: at(40), silentMs: 720_000, endedTurn: true },
    ]);
    db.close();
  });

  test("a turn on another account than the task's previous turn on the same provider records the switch", () => {
    const { db, store } = harness();
    begin(store, "first", { createdAt: at(0), accountProfileId: "account-a" });
    begin(store, "second", { createdAt: at(10), accountProfileId: "account-b" });
    begin(store, "other-task", { createdAt: at(11), accountProfileId: "account-c", taskId: "task-2" });
    expect(digestOf(db, "first")?.entries).toEqual([]);
    expect(digestOf(db, "second")?.entries).toEqual([
      { kind: "account", at: at(10), providerId: "codex", fromAccountId: "account-a", toAccountId: "account-b", since: "previous-turn" },
    ]);
    expect(digestOf(db, "other-task")?.entries).toEqual([]);
    store.saveStreamEvent({ turnId: "second", sequence: 1, createdAt: at(12), event: { type: "provider_session", providerId: "codex", nativeSessionId: "s", accountProfileId: "account-d" } });
    expect(digestOf(db, "second")?.entries.at(-1)).toMatchObject({ kind: "account", fromAccountId: "account-b", toAccountId: "account-d", since: "turn" });
    db.close();
  });

  test("checks Stave runs after a turn closes are kept on that turn; other hooks and empty runs are not", () => {
    const { db, store } = harness();
    begin(store, "turn");
    store.completeTurn({ id: "turn", completedAt: at(1) });
    const failing = { trigger: "turn.completed" as const, totalEntries: 2, executedEntries: 2, failures: [{ scriptId: "test", message: "2 failed", blocking: true }] };
    expect(recordTurnCompletedChecks({ trigger: "task.created", hookContext: { turnId: "turn" } }, failing, store)).toBe(false);
    expect(recordTurnCompletedChecks({ trigger: "turn.completed", hookContext: {} }, failing, store)).toBe(false);
    expect(recordTurnCompletedChecks({ trigger: "turn.completed", hookContext: { turnId: "turn" } }, { ...failing, totalEntries: 0, failures: [] }, store)).toBe(false);
    expect(recordTurnCompletedChecks({ trigger: "turn.completed", hookContext: { turnId: "turn" } }, failing, store)).toBe(true);
    expect(digestOf(db, "turn")?.entries).toEqual([
      { kind: "checks", at: expect.any(String), status: "fail", executed: 2, total: 2, failures: [{ scriptId: "test", message: "2 failed", blocking: true }], omittedFailures: 0 },
    ]);
    expect(store.turnDigests.listTurnHistory({ workspaceId: "workspace", taskId: "task" }).turns[0]?.digest?.checks).toBe("fail");
    expect(recordTurnCompletedChecks({ trigger: "turn.completed", hookContext: { turnId: "missing" } }, failing, store)).toBe(false);
    db.close();
  });

  test("an old turns table gains the digest column; its turns read as No record", () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE turns (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, task_id TEXT NOT NULL, provider_id TEXT NOT NULL, created_at TEXT NOT NULL, completed_at TEXT, usage_json TEXT, receipt_json TEXT)");
    db.run("INSERT INTO turns VALUES ('old', 'workspace', 'task', 'stave', ?, ?, NULL, NULL)", [at(0), at(1)]);
    const { store } = harness(db);
    (store as unknown as { bootstrap: () => void }).bootstrap();
    begin(store, "new", { createdAt: at(5) });
    const page = store.turnDigests.listTurnHistory({ workspaceId: "workspace", taskId: "task" });
    expect(page.turns.map((turn) => [turn.id, turn.providerId, turn.digest])).toEqual([
      ["new", "codex", { entryCount: 0, hasError: false, checks: null }],
      ["old", "claude-code", null],
    ]);
    expect(store.turnDigests.readTurnRecord({ workspaceId: "workspace", taskId: "task", turnId: "old" })?.digest).toBeNull();
    db.close();
  });

  test("a turn's record finds its reply and request, shortened, without other turns' messages", () => {
    const { db, store } = harness();
    begin(store, "turn-a", { createdAt: at(0) });
    begin(store, "turn-b", { createdAt: at(5) });
    const insert = db.prepare("INSERT INTO messages (id, workspace_id, task_id, role, model, provider_id, content, is_streaming, parts_json, message_json) VALUES (?, 'workspace', 'task', ?, 'model', 'codex', ?, 0, '[]', ?)");
    const bigContent = "line\n".repeat(20_000);
    insert.run("workspace:task:m1", "user", "Fix the build", JSON.stringify({ id: "m1", role: "user", content: "Fix the build", parts: [] }));
    insert.run("workspace:task:m2", "assistant", "", JSON.stringify({
      id: "m2",
      role: "assistant",
      turnId: "turn-a",
      content: "Done",
      parts: [
        { type: "text", text: "Working on it" },
        { type: "tool_use", toolUseId: "t1", toolName: "Write", input: JSON.stringify({ file_path: "src/app.ts", content: bigContent }), output: "ok", state: "output-available" },
        { type: "approval", toolName: "Bash", requestId: "r1", description: "Run tests", state: "output-denied" },
      ],
    }));
    insert.run("workspace:task:m3", "user", "Now the docs", JSON.stringify({ id: "m3", role: "user", content: "Now the docs", parts: [] }));
    insert.run("workspace:task:m4", "assistant", "", JSON.stringify({ id: "m4", role: "assistant", turnId: "turn-b", content: "", parts: [] }));
    const record = store.turnDigests.readTurnRecord({ workspaceId: "workspace", taskId: "task", turnId: "turn-a" })!;
    expect(record.prompt).toBe("Fix the build");
    expect(record.messages.map((message) => message.id)).toEqual(["m2"]);
    expect(record.messages[0]?.parts.map((part) => part.type)).toEqual(["tool_use", "approval"]);
    const write = record.messages[0]?.parts[0];
    expect(write?.type === "tool_use" && write.input.length).toBeLessThan(10_000);
    expect(write?.type === "tool_use" && JSON.parse(write.input).file_path).toBe("src/app.ts");
    expect(store.turnDigests.readTurnRecord({ workspaceId: "workspace", taskId: "task", turnId: "turn-b" })?.prompt).toBe("Now the docs");
    expect(store.turnDigests.readTurnRecord({ workspaceId: "other", taskId: "task", turnId: "turn-a" })).toBeNull();
    db.close();
  });

  test("deleting the task deletes its turns' digests", () => {
    const { db, store } = harness();
    begin(store, "turn");
    store.removeTaskFromWorkspace({ workspaceId: "workspace", taskId: "task" });
    expect(store.turnDigests.listTurnHistory({ workspaceId: "workspace", taskId: "task" }).turns).toEqual([]);
    expect((db.prepare("SELECT COUNT(*) AS count FROM turns").get() as { count: number }).count).toBe(0);
    db.close();
  });
});
