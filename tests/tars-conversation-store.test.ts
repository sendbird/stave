import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { isTarsStorageBusy, TarsConversationStore, TarsStorageBusyError } from "../electron/persistence/tars-conversation-store";
import { TarsStore } from "../electron/persistence/tars-store";
import { applyTarsDecision } from "../electron/host-service/tars-decisions";
import {
  TarsDecisionActionSchema, TarsDecisionSchema, TarsMessageInputSchema, TarsConversationSettingsSchema,
  type TarsDecision, type TarsMessageInput,
} from "../src/lib/tars/conversation";

const NOW = "2026-11-05T00:00:00.000Z";
const LATER = "2026-11-05T00:01:00.000Z";
const input: TarsMessageInput = {
  requestId: "message-a", text: "Fix search and verify its behavior.",
};
const decision: TarsDecision = { reply: "I will arrange the search work.", actions: [{
  kind: "delegate", workspaceId: "source-workspace", title: "Fix search", instruction: "Fix search and verify its behavior.",
  acceptanceCriteria: ["Search returns the expected results."], priority: 50,
}] };
const databases: Database[] = [];
const directories: string[] = [];
function open(filename = ":memory:") {
  const database = new Database(filename);
  databases.push(database);
  const store = new TarsConversationStore(database);
  if (!store.getSettings()) store.configure({ providerId: "codex", model: "test-model", maxTurns: 30 });
  return { database, store };
}
function persisted() {
  const directory = mkdtempSync(path.join(tmpdir(), "tars-conversation-"));
  directories.push(directory);
  return path.join(directory, "store.sqlite");
}
function answered(store: TarsConversationStore, proposal = decision, request = input) {
  const message = store.create(request, NOW);
  const claimed = store.claim(message.id, message.revision, NOW);
  return store.answer(message.id, claimed.revision, proposal, LATER);
}
afterEach(() => {
  for (const database of databases.splice(0)) {
    try { database.close(); } catch { /* A restart test already closed this connection. */ }
  }
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("Tars conversation persistence", () => {
  test("retains normalized user input and a complete immutable decision after restart", () => {
    const filename = persisted();
    const first = open(filename);
    const result = answered(first.store);
    first.database.close();
    const restarted = open(filename).store;
    expect(restarted.get(result.id)).toEqual(result);
    expect(restarted.list()).toEqual([result]);
    expect(restarted.create({ ...input, text: ` ${input.text} ` }, NOW)).toEqual(result);
    expect(() => restarted.create({ ...input, text: "A different mandate" }, NOW)).toThrow("different message");
    expect(() => restarted.create({ ...input, text: "A different question" }, NOW)).toThrow("different message");
    expect(() => restarted.answer(result.id, result.revision, { reply: "Changed", actions: [] }, LATER)).toThrow("state transition");
    expect(restarted.get(result.id)?.decision).toEqual(decision);
  });

  test("stale and concurrent claims cannot create a second reasoning attempt", () => {
    const filename = persisted();
    const first = open(filename).store;
    const second = open(filename).store;
    const message = first.create(input, NOW);
    const claimed = first.claim(message.id, message.revision, NOW);
    expect(() => second.claim(message.id, message.revision, NOW)).toThrow("changed");
    expect(() => second.claim(message.id, claimed.revision, NOW)).toThrow("state transition");
    expect(second.get(message.id)).toEqual(claimed);
  });

  test("a cancellation from another connection rejects late model completion", () => {
    const filename = persisted();
    const first = open(filename).store;
    const second = open(filename).store;
    const message = first.create(input, NOW);
    const claimed = first.claim(message.id, message.revision, NOW);
    const cancelled = second.cancel(message.id, claimed.revision, LATER);
    expect(() => first.answer(message.id, claimed.revision, decision, LATER)).toThrow("changed");
    expect(() => first.answer(message.id, cancelled.revision, decision, LATER)).toThrow("state transition");
    expect(() => first.fail(message.id, cancelled.revision, "Late failure", LATER)).toThrow("state transition");
    expect(first.get(message.id)).toMatchObject({ state: "cancelled", reply: null, decision: null });
  });

  test("restart fails an interrupted call visibly without requeuing it or changing queued and completed messages", () => {
    const filename = persisted();
    const first = open(filename);
    const pending = first.store.create({ ...input, requestId: "pending" }, NOW);
    const started = first.store.create(input, NOW);
    const reasoning = first.store.claim(started.id, started.revision, NOW);
    const completed = answered(first.store, decision, { ...input, requestId: "completed" });
    first.database.close();
    const restarted = open(filename).store;
    const recovered = restarted.recover(LATER);
    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toMatchObject({ id: reasoning.id, state: "failed", revision: reasoning.revision + 1, decision: null });
    expect(recovered[0]?.error).toContain("interrupted");
    expect(() => restarted.claim(reasoning.id, recovered[0]!.revision, LATER)).toThrow("state transition");
    expect(restarted.recover(LATER)).toEqual([]);
    expect(restarted.get(pending.id)).toEqual(pending);
    expect(restarted.get(completed.id)).toEqual(completed);
  });

  test("bounded history returns the latest messages in insertion order for equal timestamps", () => {
    const { store } = open();
    const messages = ["first", "second", "third"].map((requestId) => store.create({ ...input, requestId }, NOW));
    expect(store.list(2)).toEqual(messages.slice(1));
    for (const limit of [0, -1, 1001, 1.5, Number.NaN]) expect(() => store.list(limit)).toThrow("limit");
  });
});

describe("Tars action receipts", () => {
  test("requires a saved decision and rejects a changed action or discussion authority", () => {
    const { store } = open();
    const pending = store.create(input, NOW);
    expect(() => store.recordReceipt(pending.id, pending.revision, 0, decision.actions[0]!, NOW)).toThrow("decision must be saved");
    const claimed = store.claim(pending.id, pending.revision, NOW);
    const message = store.answer(pending.id, claimed.revision, decision, NOW);
    expect(() => store.recordReceipt(message.id, message.revision, 0, { ...decision.actions[0]!, priority: 100 }, NOW)).toThrow("does not match");
    expect(() => store.recordReceipt(message.id, message.revision, 1, decision.actions[0]!, NOW)).toThrow("does not match");
    expect(() => store.recordReceipt(message.id, claimed.revision, 0, decision.actions[0]!, NOW)).toThrow("changed");
    const discussion = answered(store, { reply: "A plain answer", actions: [] }, { ...input, requestId: "discussion" });
    expect(() => store.recordReceipt(discussion.id, discussion.revision, 0, decision.actions[0]!, NOW)).toThrow("does not match");
    expect(store.listReceipts(message.id)).toEqual([]);
  });

  test("records one immutable action receipt and preserves its settlement across restart", () => {
    const filename = persisted();
    const first = open(filename);
    const message = answered(first.store);
    const receipt = first.store.recordReceipt(message.id, message.revision, 0, decision.actions[0]!, NOW);
    expect(first.store.recordReceipt(message.id, message.revision, 0, decision.actions[0]!, LATER)).toEqual(receipt);
    first.database.close();
    const second = open(filename);
    expect(second.store.listReceipts(message.id)).toEqual([receipt]);
    const applied = second.store.settleReceipt(message.id, 0, receipt.revision, { status: "applied", responsibilityId: "responsibility-a" }, LATER);
    expect(() => second.store.settleReceipt(message.id, 0, receipt.revision, { status: "rejected", error: "late result" }, LATER)).toThrow("changed");
    expect(() => second.store.settleReceipt(message.id, 0, applied.revision, { status: "rejected", error: "late result" }, LATER)).toThrow("already settled");
    second.database.close();
    const third = open(filename).store;
    expect(third.listReceipts(message.id)).toEqual([applied]);
    expect(third.recordReceipt(message.id, message.revision, 0, decision.actions[0]!, LATER)).toEqual(applied);
  });

  test("rejects a reprioritization receipt for a different responsibility", () => {
    const { store } = open();
    const action = { kind: "reprioritize" as const, responsibilityId: "owned", expectedRevision: 2, priority: 80 };
    const message = answered(store, { reply: "Raise priority.", actions: [action] });
    const receipt = store.recordReceipt(message.id, message.revision, 0, action, NOW);
    expect(() => store.settleReceipt(message.id, 0, receipt.revision, { status: "applied", responsibilityId: "different" }, LATER)).toThrow("different responsibility");
    const rejected = store.settleReceipt(message.id, 0, receipt.revision, { status: "rejected", error: "The target revision changed." }, LATER);
    expect(rejected).toMatchObject({ status: "rejected", responsibilityId: null, error: "The target revision changed." });
  });

  test("responsibility creation and receipt application commit together and replay does no work", () => {
    const filename = persisted();
    const first = open(filename);
    const responsibilities = new TarsStore(first.database);
    const message = answered(first.store);
    const receipt = first.store.recordReceipt(message.id, message.revision, 0, decision.actions[0]!, NOW);
    let calls = 0;
    const apply = () => {
      calls += 1;
      const row = responsibilities.create({ requestId: "from-message", title: "Search", instruction: input.text,
        acceptanceCriteria: ["Search works."], repositoryPath: "/tmp/tars-project",
        workspaceId: "source-workspace", providerId: "codex" }, NOW);
      return { responsibilityId: row.id };
    };
    const applied = first.store.applyReceipt(message.id, 0, receipt.revision, apply, LATER);
    expect(calls).toBe(1);
    first.database.close();
    const second = open(filename);
    expect(new TarsStore(second.database).snapshot().responsibilities).toHaveLength(1);
    expect(second.store.applyReceipt(message.id, 0, receipt.revision, () => { throw new Error("Must never replay"); }, LATER)).toEqual(applied);
    expect(second.store.listReceipts(message.id)[0]?.status).toBe("applied");
  });

  test("an invalid outcome rolls back the responsibility write and leaves its receipt pending", () => {
    const { database, store } = open();
    const responsibilities = new TarsStore(database);
    const row = responsibilities.create({ requestId: "existing", title: "Search", instruction: input.text,
      acceptanceCriteria: ["Search works."], repositoryPath: "/tmp/tars-project",
      workspaceId: "source-workspace", providerId: "codex" }, NOW);
    const action = { kind: "reprioritize" as const, responsibilityId: row.id, expectedRevision: row.revision, priority: 90 };
    const message = answered(store, { reply: "Raise priority.", actions: [action] });
    const receipt = store.recordReceipt(message.id, message.revision, 0, action, NOW);
    expect(() => store.applyReceipt(message.id, 0, receipt.revision, () => {
      responsibilities.patch(row.id, row.revision, { priority: 90 }, LATER);
      return { responsibilityId: "incorrect-target" };
    }, LATER)).toThrow("different responsibility");
    expect(responsibilities.get(row.id)).toEqual(row);
    expect(store.listReceipts(message.id)).toEqual([receipt]);
    expect(() => store.applyReceipt(message.id, 0, receipt.revision, () => { throw new Error("Admission denied"); }, LATER)).toThrow("Admission denied");
    expect(store.listReceipts(message.id)).toEqual([receipt]);
  });
});

test("strict bounded schemas exclude invented actions, target paths and permission grants", () => {
  for (const extra of [{ authorizedEffects: ["publish"] }, { taskId: "other-task" }, { state: "answered" }]) {
    expect(TarsMessageInputSchema.safeParse({ ...input, ...extra }).success).toBe(false);
  }
  for (const override of [{ maxTurns: 0 }, { maxTurns: 101 }, { model: " " }, { providerId: "cursor" }]) {
    expect(TarsConversationSettingsSchema.safeParse({ providerId: "codex", model: "test-model", maxTurns: 30, ...override }).success).toBe(false);
  }
  expect(TarsMessageInputSchema.safeParse({ ...input, text: "a".repeat(32_000) }).success).toBe(true);
  expect(TarsMessageInputSchema.safeParse({ ...input, text: "a".repeat(32_001) }).success).toBe(false);
  const action = decision.actions[0]!;
  for (const extra of [{ repositoryPath: "/tmp/unrelated" }, { taskId: "other-task" }, { permissionMode: "auto" }]) {
    expect(TarsDecisionActionSchema.safeParse({ ...action, ...extra }).success).toBe(false);
  }
  expect(TarsDecisionSchema.safeParse({ ...decision, actions: Array(9).fill(action) }).success).toBe(false);
  expect(TarsDecisionSchema.safeParse({ reply: "", actions: [{ kind: "publish" }] }).success).toBe(false);
  expect(TarsDecisionSchema.safeParse({ ...decision, authorized: true }).success).toBe(false);
  expect(TarsDecisionActionSchema.safeParse({ ...action, acceptanceCriteria: [] }).success).toBe(false);
});

// Main and the host-service each open their own connection to stave.sqlite in
// WAL mode. A deferred transaction that reads and then writes fails its first
// write at once (SQLITE_BUSY_SNAPSHOT, no busy_timeout wait) when the other
// process commits in between.
describe("Tars writes shared by main and the host-service", () => {
  function connect(filename: string, busyTimeoutMs: number) {
    const database = new Database(filename);
    databases.push(database);
    database.exec("PRAGMA journal_mode = WAL");
    database.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
    return database;
  }
  /** `host` runs the unit under test. `main` never waits, so this single-threaded test cannot block. */
  function shared(hostBusyTimeoutMs = 5_000) {
    const filename = persisted();
    const host = connect(filename, hostBusyTimeoutMs);
    const store = new TarsConversationStore(host);
    store.configure({ providerId: "codex", model: "test-model", maxTurns: 30 });
    const responsibilities = new TarsStore(host);
    host.exec("CREATE TABLE other_process (id INTEGER PRIMARY KEY)");
    return { host, store, responsibilities, main: connect(filename, 0) };
  }
  /**
   * Commits from `main` right after the first read inside a host transaction.
   * A write the host's lock refuses is applied by `settle()` once the host has
   * committed, as busy_timeout would apply it.
   */
  function commitAfterFirstRead(host: Database, main: Database) {
    const prepare = host.prepare.bind(host);
    const write = () => main.exec("INSERT INTO other_process DEFAULT VALUES");
    let outcome: "not run" | "committed in between" | "waited" = "not run";
    (host as unknown as { prepare: unknown }).prepare = (query: string) => {
      const statement = prepare(query) as unknown as Record<"get" | "all", (...params: unknown[]) => unknown>;
      for (const method of ["get", "all"] as const) {
        const read = statement[method].bind(statement);
        statement[method] = (...params: unknown[]) => {
          const result = read(...params);
          if (outcome === "not run" && host.inTransaction) {
            try { write(); outcome = "committed in between"; } catch { outcome = "waited"; }
          }
          return result;
        };
      }
      return statement;
    };
    return {
      outcome: () => outcome,
      settle() {
        (host as unknown as { prepare: unknown }).prepare = prepare;
        if (outcome === "waited") write();
      },
    };
  }
  /** The units as they were before: the same code in deferred transactions. */
  function deferredConnection(host: Database) {
    return { exec: (sql: string) => host.exec(sql), prepare: (sql: string) => host.prepare(sql),
      transaction: <T>(work: () => T) => {
        const transaction = host.transaction(work);
        return Object.assign(() => transaction(), { immediate: () => transaction.deferred() });
      } };
  }
  const reprioritize = (responsibilityId: string, expectedRevision: number) =>
    ({ kind: "reprioritize" as const, responsibilityId, expectedRevision, priority: 90 });
  const responsibilityInput = (requestId: string) => ({ requestId, title: "Search", instruction: input.text,
    acceptanceCriteria: ["Search works."], repositoryPath: "/tmp/tars-project", workspaceId: "source-workspace", providerId: "codex" as const });

  const units: Record<string, (f: ReturnType<typeof shared>) => () => unknown> = {
    "message create": ({ store }) => () => store.create(input, NOW),
    "planner claim": ({ store }) => { const queued = store.create(input, NOW); return () => store.claim(queued.id, queued.revision, NOW); },
    "decision answer": ({ store }) => {
      const queued = store.create(input, NOW); const claimed = store.claim(queued.id, queued.revision, NOW);
      return () => store.answer(claimed.id, claimed.revision, decision, LATER);
    },
    "interrupted reasoning recovery": ({ store }) => {
      const queued = store.create(input, NOW); store.claim(queued.id, queued.revision, NOW);
      return () => store.recover(LATER);
    },
    "receipt intent": ({ store }) => { const message = answered(store); return () => store.recordReceipt(message.id, message.revision, 0, decision.actions[0]!, NOW); },
    "receipt settlement": ({ store }) => {
      const message = answered(store); const intent = store.recordReceipt(message.id, message.revision, 0, decision.actions[0]!, NOW);
      return () => store.settleReceipt(message.id, 0, intent.revision, { status: "rejected", error: "Not admitted." }, LATER);
    },
    "unsettled action fence": ({ store }) => { const message = answered(store); return () => store.rejectUnsettledActions(message.id, message.revision, "Not admitted.", LATER); },
    "host receipt application": ({ store, responsibilities }) => {
      const row = responsibilities.create(responsibilityInput("existing"), NOW);
      const action = reprioritize(row.id, row.revision);
      const message = answered(store, { reply: "Raise priority.", actions: [action] });
      const intent = store.recordReceipt(message.id, message.revision, 0, action, NOW);
      return () => store.applyReceipt(message.id, 0, intent.revision,
        () => ({ responsibilityId: responsibilities.patch(row.id, row.revision, { priority: 90 }, LATER).id }), LATER);
    },
    "responsibility create": ({ responsibilities }) => () => responsibilities.create(responsibilityInput("new"), NOW),
    "responsibility patch": ({ responsibilities }) => {
      const row = responsibilities.create(responsibilityInput("existing"), NOW);
      return () => responsibilities.patch(row.id, row.revision, { priority: 90 }, LATER);
    },
  };

  test.each(Object.keys(units))("%s takes the write lock first, so the other process waits instead of failing it", (name) => {
    const f = shared();
    const unit = units[name]!(f);
    const mainWrite = commitAfterFirstRead(f.host, f.main);
    unit();
    mainWrite.settle();
    expect(mainWrite.outcome()).toBe("waited");
    expect(f.host.inTransaction).toBe(false);
    expect(f.main.prepare("SELECT COUNT(*) AS count FROM other_process").get()).toEqual({ count: 1 });
  });

  test("the same claim and receipt application as deferred transactions fail at once with SQLITE_BUSY_SNAPSHOT", () => {
    const f = shared();
    const deferred = new TarsConversationStore(deferredConnection(f.host));
    const queued = f.store.create(input, NOW);
    let mainWrite = commitAfterFirstRead(f.host, f.main);
    let failure: unknown = null;
    try { deferred.claim(queued.id, queued.revision, NOW); } catch (error) { failure = error; }
    mainWrite.settle();
    expect(mainWrite.outcome()).toBe("committed in between");
    expect((failure as { code?: string }).code).toBe("SQLITE_BUSY_SNAPSHOT");
    expect(isTarsStorageBusy(failure)).toBe(true);
    // The message stayed queued; the fixed unit succeeds against the same interleaving.
    expect(f.store.get(queued.id)).toEqual(queued);
    mainWrite = commitAfterFirstRead(f.host, f.main);
    expect(f.store.claim(queued.id, queued.revision, NOW).state).toBe("reasoning");
    mainWrite.settle();
    expect(mainWrite.outcome()).toBe("waited");

    const message = answered(f.store, decision, { ...input, requestId: "receipt" });
    const intent = f.store.recordReceipt(message.id, message.revision, 0, decision.actions[0]!, NOW);
    mainWrite = commitAfterFirstRead(f.host, f.main);
    expect(() => deferred.applyReceipt(message.id, 0, intent.revision, () => ({ responsibilityId: "created" }), LATER)).toThrow("database is locked");
    mainWrite.settle();
    expect(f.store.listReceipts(message.id)).toEqual([intent]);
  });

  test("a host lock wait that outlasts busy_timeout keeps the receipt pending instead of rejecting it", async () => {
    const f = shared(0);
    const registry = [{ repositoryPath: "/tmp/tars-project", workspaces: [{ id: "source-workspace" }] }] as never;
    const message = answered(f.store);
    const conversations = Object.create(f.store) as TarsConversationStore;
    // Main takes the lock after the intent is saved and releases it as soon as
    // the application fails, so a rejection could otherwise be written.
    conversations.recordReceipt = (...args) => { const receipt = f.store.recordReceipt(...args); f.main.exec("BEGIN IMMEDIATE"); return receipt; };
    conversations.applyReceipt = (...args) => { try { return f.store.applyReceipt(...args); } finally { f.main.exec("ROLLBACK"); } };
    const ports = { conversations, responsibilities: f.responsibilities, readRegistry: () => registry, requestTick() {}, now: () => LATER };
    await expect(applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, ports)).rejects.toThrow(TarsStorageBusyError);
    expect(f.store.listReceipts(message.id).map((receipt) => receipt.status)).toEqual(["pending"]);
    expect(f.responsibilities.snapshot().responsibilities).toEqual([]);
    // The retry applies the same saved intent once.
    const receipts = await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision },
      { ...ports, conversations: f.store });
    expect(receipts.map((receipt) => receipt.status)).toEqual(["applied"]);
    expect(f.responsibilities.snapshot().responsibilities).toHaveLength(1);
  });
});

describe("Tars composer draft", () => {
  test("is saved, read back after a restart, and deleted with null", () => {
    const filename = persisted();
    const first = open(filename);
    expect(first.store.getDraft()).toBeNull();
    first.store.saveDraft({ text: "Unsent words", includeWorkingChanges: true, requestId: null });
    first.database.close();
    const reopened = open(filename);
    expect(reopened.store.getDraft()).toEqual({ text: "Unsent words", includeWorkingChanges: true, requestId: null });
    reopened.store.saveDraft(null);
    expect(reopened.store.getDraft()).toBeNull();
  });

  test("is not announced as a conversation change", () => {
    const { store } = open();
    const scopes: string[] = [];
    store.onChange((scope) => scopes.push(scope));
    store.saveDraft({ text: "Typing", includeWorkingChanges: false, requestId: null });
    store.saveDraft(null);
    expect(scopes).toEqual([]);
  });

  test("is deleted in the same write that saves the message carrying its request ID, also on a retried request", () => {
    const { store } = open();
    store.saveDraft({ text: input.text, includeWorkingChanges: false, requestId: input.requestId });
    store.create(input, NOW);
    expect(store.getDraft()).toBeNull();
    // The draft was re-saved without the request ID after an edit; a retry of the old request leaves it alone.
    store.saveDraft({ text: "A newer draft", includeWorkingChanges: false, requestId: null });
    store.create(input, NOW);
    expect(store.getDraft()).toEqual({ text: "A newer draft", includeWorkingChanges: false, requestId: null });
    // A lost acknowledgement retried with the saved request ID clears the draft that carries it.
    store.saveDraft({ text: input.text, includeWorkingChanges: false, requestId: input.requestId });
    store.create(input, NOW);
    expect(store.getDraft()).toBeNull();
  });

  test("survives a send the host refused before saving it", () => {
    const { store } = open();
    store.create(input, NOW);
    const next = { requestId: "message-b", text: "Queue another change." };
    store.saveDraft({ text: next.text, includeWorkingChanges: false, requestId: next.requestId });
    // One message is still outstanding, so the host refuses this one and rolls the write back: the draft stays.
    expect(() => store.create(next, NOW, 1)).toThrow("Too many outstanding messages");
    expect(store.getDraft()).toEqual({ text: next.text, includeWorkingChanges: false, requestId: next.requestId });
  });

  test("a draft whose request is already a message is never saved again or offered", () => {
    const { database, store } = open();
    store.create(input, NOW);
    // A retry after a lost acknowledgement re-saves the draft with the sent request ID before the message call reaches the host.
    store.saveDraft({ text: input.text, includeWorkingChanges: false, requestId: input.requestId });
    expect(store.getDraft()).toBeNull();
    expect(database.prepare("SELECT COUNT(*) AS count FROM tars_composer_drafts").get()).toEqual({ count: 0 });
    // A row left by an older build is hidden the same way.
    database.prepare("INSERT INTO tars_composer_drafts (id, body_json) VALUES ('personal', ?)")
      .run(JSON.stringify({ text: input.text, includeWorkingChanges: false, requestId: input.requestId }));
    expect(store.getDraft()).toBeNull();
  });

  test("an unreadable row reads as no draft and invalid drafts are refused", () => {
    const { database, store } = open();
    database.prepare("INSERT INTO tars_composer_drafts (id, body_json) VALUES ('personal', ?)").run("{not json");
    expect(store.getDraft()).toBeNull();
    expect(() => store.saveDraft({ text: "x", includeWorkingChanges: false, requestId: null, workspaceId: "a" } as never)).toThrow();
  });

});

test("attachment snapshots survive a database reopen and reject invalid or oversized payloads", () => {
  const filename = persisted();
  const first = open(filename);
  const attachments = [{ type: "file_context" as const, filePath: "requirements.md", content: "완료 기준", language: "md" }];
  const result = first.store.create({ requestId: "attachment-restart", text: "Read this", attachments }, NOW);
  first.database.close();
  const restarted = open(filename).store;
  expect(restarted.get(result.id)?.attachments).toEqual(attachments);
  for (const invalid of [
    [{ ...attachments[0], content: "가".repeat(11_000) }],
    Array.from({ length: 9 }, () => attachments[0]),
    [{ type: "file_context", filePath: "local.png", content: "", language: "image" }],
    [{ type: "file_context", filePath: "../private.txt", content: "a", language: "text" }],
    [{ type: "image_context", label: "remote", dataUrl: "https://example.com/image.png", mimeType: "image/png" }],
    [{ type: "file_context", filePath: "secret.txt", content: "a", language: "text", rootPath: "/tmp/private" }],
  ]) expect(() => restarted.create({ requestId: "invalid-files", text: "Read", attachments: invalid } as never, NOW)).toThrow();
  expect(restarted.list()).toHaveLength(1);
});
