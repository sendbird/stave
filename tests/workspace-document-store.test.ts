import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { WorkspaceDocumentStore } from "../electron/persistence/workspace-document-store";
import { MAX_WORKSPACE_DOCUMENT_REVISIONS } from "@/lib/documents/workspace-document-schemas";

const PATH = ".stave/context/plans/retry-design.md";

describe("WorkspaceDocumentStore", () => {
  let db: Database;
  let store: WorkspaceDocumentStore;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(
      "CREATE TABLE workspace_meta (id TEXT PRIMARY KEY); INSERT INTO workspace_meta VALUES ('ws')",
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

  test("records nothing for an unknown workspace and forgets a deleted one", () => {
    expect(
      store.record({
        workspaceId: "missing",
        author: "agent",
        documents: [{ filePath: PATH, content: "v1" }],
      }),
    ).toEqual([]);

    store.record({
      workspaceId: "ws",
      author: "agent",
      documents: [{ filePath: PATH, content: "v1" }],
    });
    db.exec("DELETE FROM workspace_meta WHERE id = 'ws'");
    expect(store.activity("ws").documents).toEqual([]);
  });
});
