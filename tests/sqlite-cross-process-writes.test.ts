import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SqliteStore } from "../electron/persistence/sqlite-store";
import { inWriteSavepoint } from "../electron/persistence/write-savepoint";
import type { PersistenceWorkspaceSnapshot } from "../electron/persistence/types";

// Main and the host-service each open their own connection to stave.sqlite.
// A deferred transaction that reads before it writes fails at once, with no
// `busy_timeout` wait, when the other connection commits after its first read.
// A host turn's first write (`persistTaskTurnDelta`) failed that way: its user
// row was saved later, after the reply's row, so the prompt showed below its
// own turn.

const WORKSPACE_ID = "workspace";
const TASK_ID = "task";
const TURN_ID = "turn-1";

let directory: string | null = null;

afterEach(() => {
  if (directory) rmSync(directory, { recursive: true, force: true });
  directory = null;
});

function open(file: string, busyTimeoutMs: number) {
  const db = new Database(file);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
  return db;
}

function storeOver(db: Database) {
  const store = Object.create(SqliteStore.prototype) as SqliteStore;
  Object.assign(store, { db, _closed: false });
  (store as unknown as { bootstrap: () => void }).bootstrap();
  return store;
}

function workspaceSnapshot(): PersistenceWorkspaceSnapshot {
  return {
    version: 1,
    activeTaskId: TASK_ID,
    tasks: [{ id: TASK_ID, title: "Task", provider: "claude-code", updatedAt: "2026-10-26T02:36:43.000Z", unread: false, archivedAt: null }],
    messagesByTask: { [TASK_ID]: [] },
    terminalTabs: [],
    activeTerminalTabId: null,
    terminalDocked: false,
    cliSessionTabs: [],
    activeCliSessionTabId: null,
    editorTabs: [],
    activeEditorTabId: null,
    promptDraftByTask: { [TASK_ID]: { text: "OLD", attachedFilePaths: [], attachments: [] } },
    providerSessionByTask: {},
  } as unknown as PersistenceWorkspaceSnapshot;
}

/**
 * Runs `write` on the other connection right after `db` first reads `sql`.
 * That connection does not wait in this single-threaded test: a write the
 * lock refuses is applied by `settle()` instead, as `busy_timeout` would
 * apply it once `db` commits.
 */
function interleaveAfterFirstRead(db: Database, sql: string, write: () => void) {
  const prepare = db.prepare.bind(db);
  let outcome: "not run" | "committed in between" | "waited" = "not run";
  (db as unknown as { prepare: typeof db.prepare }).prepare = ((query: string) => {
    const statement = prepare(query);
    if (outcome !== "not run" || !query.includes(sql)) return statement;
    const get = statement.get.bind(statement);
    (statement as unknown as { get: typeof statement.get }).get = ((...params: never[]) => {
      const row = get(...params);
      if (outcome === "not run") {
        try {
          write();
          outcome = "committed in between";
        } catch {
          outcome = "waited";
        }
      }
      return row;
    }) as typeof statement.get;
    return statement;
  }) as typeof db.prepare;
  return {
    outcome: () => outcome,
    settle: () => {
      if (outcome === "waited") write();
    },
  };
}

const turnRows = [
  { id: `m-1-${TURN_ID}`, role: "user", model: "user", providerId: "user", content: "Lead this", isStreaming: false, parts: [] },
  { id: `m-2-${TURN_ID}`, role: "assistant", model: "claude-opus-5-5", providerId: "claude-code", content: "", isStreaming: true, parts: [] },
] as never;
const turnTask = { id: TASK_ID, title: "Task", provider: "claude-code", updatedAt: "2026-10-26T02:36:44.074Z", unread: false, archivedAt: null };

function sharedFile() {
  directory = mkdtempSync(path.join(tmpdir(), "stave-cross-process-"));
  const file = path.join(directory, "stave.sqlite");
  const host = open(file, 5_000);
  const store = storeOver(host);
  store.upsertWorkspace({ id: WORKSPACE_ID, name: "Workspace", snapshot: workspaceSnapshot() });
  return { host, store, main: open(file, 0) };
}

describe("writes shared by main and the host-service", () => {
  test("a host turn's first write survives a commit from the other process after its first read", () => {
    const { host, store, main } = sharedFile();
    const mainWrite = interleaveAfterFirstRead(host, "SELECT archived_at FROM tasks", () => {
      main.exec(`INSERT INTO app_state (key, value_json, updated_at) VALUES ('renderer', '{}', '2026-10-26T02:36:44.070Z')
        ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json`);
    });

    const result = store.persistTaskTurnDelta({ workspaceId: WORKSPACE_ID, taskId: TASK_ID, task: turnTask, messages: turnRows });
    mainWrite.settle();

    expect(result).toEqual({ ok: true, messageCount: 2 });
    // The host held the write lock from its first statement, so the other
    // process waited instead of invalidating the host's write.
    expect(mainWrite.outcome()).toBe("waited");
    const page = store.loadTaskMessagesPage({ workspaceId: WORKSPACE_ID, taskId: TASK_ID });
    expect(page?.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(host.prepare("SELECT key FROM app_state WHERE key = 'renderer'").get()).toEqual({ key: "renderer" });
    main.close();
    host.close();
  });

  test("a host turn's write keeps a draft main saved after the host started", () => {
    const { host, store, main } = sharedFile();
    const mainWrite = interleaveAfterFirstRead(host, "SELECT snapshot_json FROM workspaces", () => {
      main.exec(`UPDATE workspaces SET snapshot_json = json_set(snapshot_json, '$.promptDraftByTask.${TASK_ID}',
        json('{"text":"LATEST","attachedFilePaths":[],"attachments":[]}')) WHERE id = '${WORKSPACE_ID}'`);
    });

    store.persistTaskTurnDelta({ workspaceId: WORKSPACE_ID, taskId: TASK_ID, task: turnTask, messages: turnRows });
    mainWrite.settle();

    // Read outside the write lock, the host wrote back the shell it had read
    // first and reverted the draft.
    expect(store.loadWorkspaceShell({ workspaceId: WORKSPACE_ID })?.promptDraftByTask?.[TASK_ID]?.text).toBe("LATEST");
    expect(store.loadTaskMessagesPage({ workspaceId: WORKSPACE_ID, taskId: TASK_ID })?.messages).toHaveLength(2);
    main.close();
    host.close();
  });

  test("a store unit that reads first takes the write lock at the top level and nests as a savepoint", () => {
    directory = mkdtempSync(path.join(tmpdir(), "stave-cross-process-"));
    const file = path.join(directory, "stave.sqlite");
    const host = open(file, 5_000);
    const main = open(file, 0);
    host.exec("CREATE TABLE rows (id TEXT PRIMARY KEY)");
    let other: "committed" | "waited" | null = null;
    inWriteSavepoint(host, "unit", () => {
      host.prepare("SELECT id FROM rows WHERE id = ?").get("revision");
      try {
        main.exec("INSERT INTO rows VALUES ('other process')");
        other = "committed";
      } catch {
        other = "waited";
      }
      host.prepare("INSERT INTO rows VALUES (?)").run("revision");
    });
    expect(other).toBe("waited");
    expect(host.inTransaction).toBe(false);

    // Inside a caller's transaction a failure undoes only the nested unit.
    host.transaction(() => {
      host.prepare("INSERT INTO rows VALUES (?)").run("outer");
      expect(() => inWriteSavepoint(host, "unit", () => {
        host.prepare("INSERT INTO rows VALUES (?)").run("inner");
        throw new Error("refused");
      })).toThrow("refused");
    }).immediate();
    expect(host.prepare("SELECT id FROM rows ORDER BY rowid").all()).toEqual([{ id: "revision" }, { id: "outer" }]);
    main.close();
    host.close();
  });

  test("a deferred read-then-write loses to that commit, which is why these writes take the lock first", () => {
    directory = mkdtempSync(path.join(tmpdir(), "stave-cross-process-"));
    const file = path.join(directory, "stave.sqlite");
    const host = open(file, 5_000);
    const main = open(file, 5_000);
    host.exec("CREATE TABLE rows (id TEXT PRIMARY KEY)");
    const deferred = host.transaction(() => {
      host.prepare("SELECT id FROM rows WHERE id = ?").get("prompt");
      main.exec("INSERT INTO rows VALUES ('other process')");
      host.prepare("INSERT INTO rows VALUES (?)").run("prompt");
    });
    expect(() => deferred()).toThrow("database is locked");
    expect(host.prepare("SELECT id FROM rows ORDER BY rowid").all()).toEqual([{ id: "other process" }]);
    main.close();
    host.close();
  });
});
