import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { ResultReviewStore } from "../electron/persistence/result-review-store";
import { ResultReviewSchema, SetResultMarkedReviewedArgsSchema } from "../src/lib/reviews/result-review";
import { applyFleetBulkPlan, revertFleetBulkOutcome, type FleetBulkOperations } from "../src/lib/fleet/attention-bulk";

let db: Database;
const scope = { repositoryPath: "/tmp/project", workspaceId: "workspace", taskId: "task", turnId: "turn" };

function insertNotification(id = "result") {
  db.prepare(
    `INSERT INTO notifications VALUES (?, 'task.turn_completed', 'Result', 'Summary',
    '/tmp/project', 'Project', 'workspace', 'Workspace', 'task', 'Task', 'turn', '2026-09-05T00:00:00Z', NULL, NULL)`,
  ).run(id);
}

beforeEach(() => {
  db = new Database(":memory:");
  db.exec(`CREATE TABLE notifications (id TEXT PRIMARY KEY, kind TEXT, title TEXT, body TEXT,
    project_path TEXT, project_name TEXT, workspace_id TEXT, workspace_name TEXT,
    task_id TEXT, task_title TEXT, turn_id TEXT, created_at TEXT, read_at TEXT, payload_json TEXT)`);
});
afterEach(() => db.close());

describe("an explicit reviewed mark apart from read", () => {
  test("Fleet bulk review saves explicit marks in SQLite and individual unmarking keeps the read mark", async () => {
    const store = new ResultReviewStore(db);
    insertNotification();
    const unexpected = async () => { throw new Error("The explicit review must not use a read or snooze operation."); };
    const operations: FleetBulkOperations = {
      listPendingResults: async () => [scope],
      setResultMarkedReviewed: async (args) => store.setMarkedReviewed(args)!,
      setResultsReviewed: unexpected,
      markNotificationRead: unexpected,
      snoozeFleetAttention: unexpected,
      clearFleetAttentionSnoozes: unexpected,
    };
    const outcome = await applyFleetBulkPlan({
      plan: { results: [scope], notificationIds: [], snoozes: [], markedReviewed: true },
      operations, resolvedAt: "2026-09-06T00:00:00Z", snoozedUntil: "2026-09-07T00:00:00Z",
    });
    expect(outcome.markedReviewed).toBe(1);
    const [saved] = store.list().results;
    expect(saved?.markedReviewedAt).toEqual(expect.any(String));
    expect(saved?.reviewedAt).toEqual(expect.any(String));
    // Bulk cannot prove which concurrent writer owned an idempotent mark.
    expect(await revertFleetBulkOutcome(outcome, operations)).toBe(true);
    expect(store.list().results[0]?.markedReviewedAt).toBe(saved?.markedReviewedAt);
    const unmarked = store.setMarkedReviewed({ ...scope, markedReviewed: false });
    expect(unmarked).toMatchObject({ markedReviewedAt: null, reviewedAt: saved?.reviewedAt });
  });

  test("a result table from before the mark gains it once, and old rows load unmarked", () => {
    // The table as an earlier version created it, with a row in it.
    db.exec(`CREATE TABLE result_reviews (
      id TEXT NOT NULL PRIMARY KEY, project_path TEXT NOT NULL, project_name TEXT NOT NULL,
      workspace_id TEXT NOT NULL, workspace_name TEXT NOT NULL, task_id TEXT NOT NULL, task_title TEXT NOT NULL, turn_id TEXT NOT NULL,
      outcome TEXT NOT NULL CHECK(outcome IN ('completed', 'failed')), summary TEXT NOT NULL, created_at TEXT NOT NULL, reviewed_at TEXT,
      UNIQUE(project_path, workspace_id, task_id, turn_id))`);
    db.prepare(`INSERT INTO result_reviews VALUES ('old', '/tmp/project', 'Project', 'workspace', 'Workspace', 'task', 'Task', 'turn', 'completed', 'Summary', '2026-09-01T00:00:00Z', '2026-09-01T00:10:00Z')`).run();
    new ResultReviewStore(db);
    const store = new ResultReviewStore(db);
    const [row] = store.list({ taskId: "task" }).results;
    expect(row).toMatchObject({ id: "old", reviewedAt: "2026-09-01T00:10:00Z", markedReviewedAt: null });
    expect(ResultReviewSchema.safeParse(row).success).toBe(true);
  });

  test("marking reviewed also counts as read; unmarking keeps it read", () => {
    const store = new ResultReviewStore(db);
    insertNotification();
    const marked = store.setMarkedReviewed({ ...scope, markedReviewed: true });
    expect(marked?.markedReviewedAt).toEqual(expect.any(String));
    expect(marked?.reviewedAt).toEqual(expect.any(String));
    const unmarked = store.setMarkedReviewed({ ...scope, markedReviewed: false });
    expect(unmarked).toMatchObject({ markedReviewedAt: null, reviewedAt: marked?.reviewedAt });
    expect(store.setMarkedReviewed({ ...scope, turnId: "missing", markedReviewed: true })).toBeNull();
  });

  test("reading a result (the automatic read mark) never marks it reviewed", () => {
    const store = new ResultReviewStore(db);
    insertNotification();
    expect(store.setReviewed({ ...scope, reviewed: true })?.markedReviewedAt).toBeNull();
    expect(SetResultMarkedReviewedArgsSchema.safeParse({ ...scope, markedReviewed: "yes" }).success).toBe(false);
  });
});
