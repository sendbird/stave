import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { ResultReviewStore } from "../electron/persistence/result-review-store";
import { SetResultReviewedArgsSchema } from "../src/lib/reviews/result-review";

let db: Database;
const scope = {
  projectPath: "/tmp/project",
  workspaceId: "workspace",
  taskId: "task",
  turnId: "turn",
};
function insert(id = "result", turn = "turn", readAt: string | null = null) {
  db.prepare(
    `INSERT INTO notifications VALUES (?, 'task.turn_completed', 'Result', 'Summary',
    '/tmp/project', 'Project', 'workspace', 'Workspace', 'task', 'Task', ?, '2026-09-05T00:00:00Z', ?, NULL)`,
  ).run(id, turn, readAt);
}
beforeEach(() => {
  db = new Database(":memory:");
  db.exec(`CREATE TABLE notifications (id TEXT PRIMARY KEY, kind TEXT, title TEXT, body TEXT,
    project_path TEXT, project_name TEXT, workspace_id TEXT, workspace_name TEXT,
    task_id TEXT, task_title TEXT, turn_id TEXT, created_at TEXT, read_at TEXT, payload_json TEXT)`);
});
afterEach(() => db.close());

describe("durable result review", () => {
  test("keeps captured evidence immutable through replay, cleanup and restart", () => {
    const store = new ResultReviewStore(db);
    const evidence = {
      messageId: "answer-1",
      providerId: "codex",
      model: "model",
      answer: "The original result",
      answerTruncated: false,
      files: ["src/result.ts"],
      filesTruncated: false,
      snapshots: [
        {
          filePath: "src/result.ts",
          oldContent: "Before",
          newContent: "Captured output",
          status: "accepted",
          truncated: false,
        },
      ],
      snapshotsTruncated: false,
    };
    const write = (id: string, answer: string) =>
      db
        .prepare(
          `INSERT INTO notifications
      (id, kind, title, body, project_path, workspace_id, task_id, turn_id, created_at, payload_json)
      VALUES (?, 'task.turn_completed', 'Result', 'Finished', '/tmp/project', 'workspace', 'task', 'turn', '2026-09-05T00:00:00Z', ?)`,
        )
        .run(id, JSON.stringify({ resultEvidence: { ...evidence, answer } }));
    write("original", evidence.answer);
    expect(
      store.list({ includeEvidence: false }).results[0]?.evidence,
    ).toBeUndefined();
    expect(store.list({ includeEvidence: false }).total).toBe(1);
    expect(store.list().results[0]?.evidence).toEqual(evidence);
    store.setReviewed({ ...scope, reviewed: true });
    write("replayed", "A different answer must not replace this result");
    db.exec("DELETE FROM notifications");
    const reopened = new ResultReviewStore(db);
    expect(reopened.list().results[0]?.evidence).toEqual(evidence);
    expect(reopened.list().results[0]?.reviewedAt).toBeTruthy();
  });

  test("migrates read outcomes as unreviewed and survives notification cleanup and restart", () => {
    insert("result", "turn", "2026-09-05T01:00:00Z");
    const store = new ResultReviewStore(db);
    expect(store.list({ pendingOnly: true }).total).toBe(1);
    db.exec("DELETE FROM notifications");
    const reopened = new ResultReviewStore(db);
    expect(reopened.list().results[0]?.reviewedAt).toBeNull();
    expect(reopened.list().results[0]?.summary).toBe("Summary");
  });

  test("captures future outcomes in the same transaction and rolls back a failed write", () => {
    const store = new ResultReviewStore(db);
    expect(() =>
      db.transaction(() => {
        insert();
        throw new Error("write aborted");
      })(),
    ).toThrow("write aborted");
    expect(store.list().total).toBe(0);
    insert();
    db.exec("UPDATE notifications SET read_at = '2026-09-05T01:00:00Z'");
    expect(store.list({ pendingOnly: true }).total).toBe(1);
  });

  test("acknowledges exactly one result, keeps retries idempotent and allows undo", () => {
    const store = new ResultReviewStore(db);
    insert();
    const first = store.setReviewed({ ...scope, reviewed: true });
    expect(first?.reviewedAt).toBeTruthy();
    expect(store.setReviewed({ ...scope, reviewed: true })).toEqual(first);
    insert("later", "turn-2");
    expect(
      store.list({ pendingOnly: true }).results.map((r) => r.turnId),
    ).toEqual(["turn-2"]);
    db.exec("DELETE FROM notifications");
    insert("replayed", "turn");
    expect(store.list().total).toBe(2);
    expect(store.list({ pendingOnly: true }).total).toBe(1);
    expect(
      store.setReviewed({ ...scope, reviewed: false })?.reviewedAt,
    ).toBeNull();
    expect(store.list({ pendingOnly: true }).total).toBe(2);
  });

  test("rejects wrong ownership, missing results and renderer supplied review timestamps", () => {
    const store = new ResultReviewStore(db);
    insert();
    for (const key of [
      "projectPath",
      "workspaceId",
      "taskId",
      "turnId",
    ] as const) {
      expect(
        store.setReviewed({ ...scope, [key]: "wrong", reviewed: true }),
      ).toBeNull();
    }
    expect(store.list({ pendingOnly: true }).total).toBe(1);
    expect(
      SetResultReviewedArgsSchema.safeParse({
        ...scope,
        reviewed: true,
        reviewedAt: "forged",
      }).success,
    ).toBe(false);
  });

  test("pages bounded summaries without losing the count or including interactions", () => {
    const store = new ResultReviewStore(db);
    for (let i = 0; i < 205; i++) insert(`result-${i}`, `turn-${i}`);
    db.prepare(
      `INSERT INTO notifications VALUES ('question','task.user_input_requested','Question','?',
      '/tmp/project','Project','workspace','Workspace','task','Task','question-turn','2026-09-05',NULL,NULL)`,
    ).run();
    const page = store.list({ limit: 200 });
    expect(page.results).toHaveLength(200);
    expect(page.total).toBe(205);
    expect(page.hasMore).toBe(true);
    expect(store.list({ offset: 200 }).results).toHaveLength(5);
    expect(store.list({ workspaceId: "elsewhere" }).total).toBe(0);
  });
});
