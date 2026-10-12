import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { WorkspaceDocumentStore } from "../electron/persistence/workspace-document-store";
import {
  MAX_ARCHIVED_WORKSPACE_DOCUMENTS,
  MAX_WORKSPACE_DOCUMENT_REVISIONS,
} from "@/lib/documents/workspace-document-schemas";

const PATH = ".stave/context/plans/retry-design.md";

describe("WorkspaceDocumentStore", () => {
  let db: Database;
  let store: WorkspaceDocumentStore;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(
      "CREATE TABLE workspace_meta (id TEXT PRIMARY KEY, name TEXT NOT NULL); INSERT INTO workspace_meta VALUES ('ws', 'feature/retry'), ('other', 'main')",
    );
    store = new WorkspaceDocumentStore(db);
  });

  afterEach(() => {
    db.close();
  });

  test("records a revision only when the content changed", () => {
    const first = store.record({
      workspaceId: "ws",
      author: "agent",
      taskId: "task-1",
      turnId: "turn-1",
      documents: [{ filePath: PATH, content: "# Retry\n\n- one\n" }],
    });
    expect(first).toEqual([
      {
        filePath: PATH,
        revision: 1,
        previousRevision: null,
        previousContent: null,
        content: "# Retry\n\n- one\n",
        touchedByTask: false,
      },
    ]);

    expect(
      store.record({
        workspaceId: "ws",
        author: "external",
        documents: [{ filePath: PATH, content: "# Retry\n\n- one\n" }],
      }),
    ).toEqual([]);

    const edited = store.record({
      workspaceId: "ws",
      author: "external",
      relevantTaskId: "task-1",
      documents: [{ filePath: PATH, content: "# Retry\n\n- one\n- two\n" }],
    });
    expect(edited).toMatchObject([
      {
        revision: 2,
        previousRevision: 1,
        previousContent: "# Retry\n\n- one\n",
        touchedByTask: true,
      },
    ]);
    expect(
      store.record({
        workspaceId: "ws",
        author: "external",
        relevantTaskId: "task-2",
        documents: [{ filePath: PATH, content: "changed again" }],
      })[0]?.touchedByTask,
    ).toBe(false);
  });

  test("lists activity, revisions, and the content of each revision", () => {
    store.record({
      workspaceId: "ws",
      author: "agent",
      taskId: "task-1",
      turnId: "turn-1",
      documents: [{ filePath: PATH, content: "v1" }],
    });
    store.record({
      workspaceId: "ws",
      author: "external",
      documents: [{ filePath: PATH, content: "v2" }],
    });

    const activity = store.activity("ws");
    expect(activity.documents).toEqual([
      expect.objectContaining({
        filePath: PATH,
        latestRevision: 2,
        latestAuthor: "external",
        revisionCount: 2,
      }),
    ]);
    expect(activity.turnLinks).toEqual([
      { turnId: "turn-1", taskId: "task-1", filePath: PATH, revision: 1 },
    ]);
    expect(store.revisions("ws", PATH).map((row) => row.revision)).toEqual([
      2, 1,
    ]);
    expect(store.content("ws", PATH, 1)).toBe("v1");
    expect(store.content("ws", PATH, 3)).toBeNull();
  });

  test("keeps a bounded history per document", () => {
    for (let index = 0; index < MAX_WORKSPACE_DOCUMENT_REVISIONS + 5; index += 1) {
      store.record({
        workspaceId: "ws",
        author: "agent",
        documents: [{ filePath: PATH, content: `v${index}` }],
      });
    }
    const revisions = store.revisions("ws", PATH);
    expect(revisions).toHaveLength(MAX_WORKSPACE_DOCUMENT_REVISIONS);
    expect(revisions[0]?.revision).toBe(MAX_WORKSPACE_DOCUMENT_REVISIONS + 5);
  });

  test("records nothing for an unknown workspace", () => {
    expect(
      store.record({
        workspaceId: "missing",
        author: "agent",
        documents: [{ filePath: PATH, content: "v1" }],
      }),
    ).toEqual([]);
  });

  test("keeps only the newest revision of a deleted workspace's documents", () => {
    for (const content of ["v1", "v2", "v3"]) {
      store.record({
        workspaceId: "ws",
        author: "agent",
        documents: [{ filePath: PATH, content }],
      });
    }
    db.exec("DELETE FROM workspace_meta WHERE id = 'ws'");

    expect(store.revisions("ws", PATH).map((row) => row.revision)).toEqual([3]);
    expect(store.content("ws", PATH, 3)).toBe("v3");
    expect(store.catalog("other")).toEqual([
      expect.objectContaining({
        workspaceId: "ws",
        workspaceName: "feature/retry",
        workspaceDeleted: true,
        filePath: PATH,
        revision: 3,
      }),
    ]);
  });

  test("forgets a deleted workspace that recorded no documents", () => {
    db.exec("DELETE FROM workspace_meta WHERE id = 'ws'");
    expect(
      db.prepare("SELECT COUNT(*) AS total FROM workspace_document_archived_workspaces").get(),
    ).toEqual({ total: 0 });
  });

  test("bounds the documents kept from deleted workspaces", () => {
    const documents = Array.from(
      { length: MAX_ARCHIVED_WORKSPACE_DOCUMENTS + 3 },
      (_, index) => ({
        filePath: `.stave/context/plans/doc-${String(index).padStart(4, "0")}.md`,
        content: `# ${index}`,
      }),
    );
    for (let start = 0; start < documents.length; start += 100) {
      store.record({
        workspaceId: "ws",
        author: "agent",
        documents: documents.slice(start, start + 100),
      });
    }
    db.exec("DELETE FROM workspace_meta WHERE id = 'ws'");

    expect(
      db.prepare("SELECT COUNT(*) AS total FROM workspace_document_revisions").get(),
    ).toEqual({ total: MAX_ARCHIVED_WORKSPACE_DOCUMENTS });
  });

  test("catalogs other live workspaces' newest revisions and skips the excluded one", () => {
    store.record({
      workspaceId: "ws",
      author: "agent",
      documents: [{ filePath: PATH, content: "v1" }],
    });
    store.record({
      workspaceId: "ws",
      author: "external",
      documents: [{ filePath: PATH, content: "v2" }],
    });
    store.record({
      workspaceId: "other",
      author: "agent",
      documents: [{ filePath: ".stave/context/plans/main.md", content: "m" }],
    });

    expect(store.catalog("other")).toEqual([
      expect.objectContaining({
        workspaceId: "ws",
        workspaceName: "feature/retry",
        workspaceDeleted: false,
        revision: 2,
      }),
    ]);
    expect(store.catalog("ws").map((entry) => entry.workspaceId)).toEqual(["other"]);
  });

  test("replaces an older delete trigger that dropped every revision", () => {
    const legacyDb = new Database(":memory:");
    legacyDb.exec(`
      CREATE TABLE workspace_meta (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      INSERT INTO workspace_meta VALUES ('ws', 'feature/retry');
      CREATE TABLE workspace_document_revisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, workspace_id TEXT NOT NULL,
        file_path TEXT NOT NULL, revision INTEGER NOT NULL,
        author TEXT NOT NULL CHECK(author IN ('agent', 'external')),
        task_id TEXT, turn_id TEXT, content_hash TEXT NOT NULL,
        content TEXT NOT NULL, created_at TEXT NOT NULL,
        UNIQUE(workspace_id, file_path, revision)
      );
      CREATE TRIGGER clear_workspace_document_revisions
      AFTER DELETE ON workspace_meta BEGIN
        DELETE FROM workspace_document_revisions WHERE workspace_id = OLD.id;
      END;`);
    const legacyStore = new WorkspaceDocumentStore(legacyDb);
    legacyStore.record({
      workspaceId: "ws",
      author: "agent",
      documents: [{ filePath: PATH, content: "kept" }],
    });
    legacyDb.exec("DELETE FROM workspace_meta WHERE id = 'ws'");

    expect(legacyStore.content("ws", PATH, 1)).toBe("kept");
    legacyDb.close();
  });
});
