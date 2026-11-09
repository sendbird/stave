import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { TarsStore } from "../electron/persistence/tars-store";
import { TarsConversationStore, isTarsStorageBusy } from "../electron/persistence/tars-conversation-store";
import { TarsEventInbox } from "../electron/persistence/tars-event-inbox";
import { admitTarsFollowUps } from "../electron/main/tars-follow-up";
import { classifyTarsTransition, tarsEventKey } from "../src/lib/tars/events";
import { SETTINGS } from "./tars-test-context";

const NOW = "2026-11-05T00:00:00.000Z";
const databases: Database[] = [];
const directories: string[] = [];
afterEach(() => {
  for (const database of databases.splice(0)) { try { database.close(); } catch { /* already closed */ } }
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

/** Main and the host-service each hold a connection to stave.sqlite in WAL mode. */
function connect(filename: string, busyTimeoutMs: number) {
  const database = new Database(filename);
  databases.push(database);
  database.exec("PRAGMA journal_mode = WAL");
  database.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
  return database;
}
function shared() {
  const directory = mkdtempSync(path.join(tmpdir(), "tars-inbox-"));
  directories.push(directory);
  const filename = path.join(directory, "stave.sqlite");
  const main = connect(filename, 5_000);
  const conversations = new TarsConversationStore(main);
  conversations.configure(SETTINGS);
  const store = new TarsStore(main, { now: () => NOW });
  // The host never waits here, so this single-threaded test cannot block.
  const hostDatabase = connect(filename, 0);
  const host = new TarsStore(hostDatabase, { now: () => NOW });
  new TarsConversationStore(hostDatabase);
  return { main, conversations, store, hostDatabase, host };
}
function blockedResponsibility(store: TarsStore, requestId = "work") {
  const row = store.create({ requestId, title: "Release check", instruction: "Verify the release.", acceptanceCriteria: ["Checks pass"],
    workspaceId: "source", repositoryPath: "/tmp/project", providerId: "codex" }, NOW);
  return store.patch(row.id, row.revision, { state: "blocked", detail: "Stuck.", taskId: `tars-${row.id}`, executionWorkspaceId: "execution",
    agentRunId: `run-${row.id}` }, NOW);
}
const admit = (f: ReturnType<typeof shared>) => admitTarsFollowUps({ events: f.store.events, conversations: f.conversations,
  responsibilities: f.store, reaskable: () => null, now: () => NOW });

test("transitions, not observations, are events: the same state with new words is the same episode", () => {
  expect(classifyTarsTransition({ state: "running", detailCode: null }, { state: "blocked", detailCode: null })).toBe("blocked");
  expect(classifyTarsTransition({ state: "blocked", detailCode: null }, { state: "blocked", detailCode: null })).toBeNull();
  expect(classifyTarsTransition({ state: "blocked", detailCode: null }, { state: "blocked", detailCode: "unverifiedCompletion" })).toBe("unverifiedCompletion");
  expect(classifyTarsTransition({ state: "running", detailCode: null }, { state: "blocked", detailCode: "incompleteReport" })).toBe("verificationFailed");
  expect(classifyTarsTransition({ state: "running", detailCode: null }, { state: "completed", detailCode: null })).toBe("completed");
  for (const state of ["waiting", "paused", "takenOver", "cancelled", "running"] as const)
    expect(classifyTarsTransition({ state: "blocked", detailCode: null }, { state, detailCode: null })).toBeNull();
});

test("two connections in WAL: the host records events while main processes them, each exactly once", () => {
  const f = shared();
  const row = blockedResponsibility(f.host);
  const [event] = f.store.events.listPending();
  expect(event).toMatchObject({ key: tarsEventKey({ kind: "blocked", responsibilityId: row.id, episode: String(row.revision) }), status: "pending" });
  // The host is mid-write: main's processing waits, fails as a retryable lock wait and changes nothing.
  f.hostDatabase.exec("BEGIN IMMEDIATE");
  const fast = new TarsEventInbox(f.main);
  f.main.exec("PRAGMA busy_timeout = 0");
  let failure: unknown = null;
  try { admit(f); } catch (error) { failure = error; }
  expect(isTarsStorageBusy(failure)).toBe(true);
  // The host records a second change of other work in the same write, then commits.
  blockedResponsibility(f.host, "other");
  f.hostDatabase.exec("COMMIT");
  f.main.exec("PRAGMA busy_timeout = 5000");
  expect(f.conversations.list(10)).toEqual([]);
  expect(fast.listPending().map((entry) => entry.status)).toEqual(["pending", "pending"]);
  expect(admit(f)).toEqual({ created: 2, nextWindowAt: null });
  expect(admit(f)).toEqual({ created: 0, nextWindowAt: null });
  // The host sees main's outcome; a late duplicate delivery from the host returns it unchanged.
  const processed = f.host.events.get(event!.key)!;
  expect(processed).toMatchObject({ status: "followedUp", messageId: f.conversations.list(10)[0]!.id });
  expect(f.host.recordEvent({ responsibilityId: row.id, kind: "blocked", episode: event!.episode, observedRevision: event!.observedRevision,
    observedState: "blocked", attempt: event!.attempt }, NOW)).toEqual(processed);
  expect(f.conversations.list(10).map((message) => message.origin?.kind)).toEqual(["followUp", "followUp"]);
});

test("the inbox takes the write lock before it reads, so a commit from the other process never fails it midway", () => {
  const f = shared();
  blockedResponsibility(f.host);
  f.hostDatabase.exec("CREATE TABLE IF NOT EXISTS other_process (id INTEGER PRIMARY KEY)");
  // Commit from the host right after main's first read inside its transaction, as busy_timeout would order it.
  const prepare = f.main.prepare.bind(f.main);
  let outcome: "not run" | "committed in between" | "waited" = "not run";
  (f.main as unknown as { prepare: unknown }).prepare = (query: string) => {
    const statement = prepare(query) as unknown as Record<"get" | "all", (...params: unknown[]) => unknown>;
    for (const method of ["get", "all"] as const) {
      const read = statement[method].bind(statement);
      statement[method] = (...params: unknown[]) => {
        const result = read(...params);
        if (outcome === "not run" && f.main.inTransaction) {
          try { f.hostDatabase.exec("INSERT INTO other_process DEFAULT VALUES"); outcome = "committed in between"; } catch { outcome = "waited"; }
        }
        return result;
      };
    }
    return statement;
  };
  expect(admit(f).created).toBe(1);
  (f.main as unknown as { prepare: unknown }).prepare = prepare;
  // Main held the lock from its first read, so the host waited instead of invalidating main's snapshot.
  expect(outcome).toBe("waited");
  expect(f.store.events.listRecent(5).map((event) => event.status)).toEqual(["followedUp"]);
});

test("the decisions projection is read once, outside the write lock; the lock covers only the minimal reads and writes", () => {
  const f = shared();
  const row = blockedResponsibility(f.store);
  f.store.recordEvent({ responsibilityId: row.id, kind: "decisionInvalidated", episode: `ask:message-${row.id.slice(0, 8)}:0`,
    observedRevision: row.revision, observedState: "blocked", attempt: null }, NOW);
  const locked: boolean[] = [];
  const result = admitTarsFollowUps({ events: f.store.events, conversations: f.conversations, responsibilities: f.store, now: () => NOW,
    reaskable: () => { locked.push(f.main.inTransaction); return new Map(); } });
  expect(locked).toEqual([false]);
  // The block itself is followed up; the decision nobody can ask about again is superseded.
  expect(result.created).toBe(1);
  expect(f.store.events.listRecent(5).map((event) => [event.kind, event.status])).toEqual([["blocked", "followedUp"], ["decisionInvalidated", "superseded"]]);
});
