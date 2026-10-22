import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, mkdtempSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { decodeLensReviewPng, LensReviewRecordStore, type NewLensReviewRecord } from "../electron/persistence/lens-review-record-store";
import { MAX_LENS_REVIEW_RECORDS_PER_TASK, SaveLensReviewRecordArgsSchema } from "../src/lib/lens/lens-review-record";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const T0 = new Date("2026-10-22T09:00:00.000Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

let db: Database;
let root: string;
let store: LensReviewRecordStore;

function input(overrides: Partial<NewLensReviewRecord> = {}): NewLensReviewRecord {
  return {
    taskId: "task-1",
    workspaceId: "workspace-1",
    lensSessionId: "lens-1",
    annotationId: "annotation-1",
    pageUrl: "http://localhost:5173/settings",
    viewport: { width: 1280, height: 800, devicePixelRatio: 2 },
    before: { imageId: "lens-comment-image:workspace-1:lens-1:annotation-1" },
    documentId: "document-1",
    verdict: "confirmed",
    ...overrides,
  };
}

function captures(): string[] {
  const dir = path.join(root, "lens-reviews");
  return existsSync(dir) ? readdirSync(dir, { recursive: true }).map(String).filter((name) => name.endsWith(".png")) : [];
}

beforeEach(() => {
  db = new Database(":memory:");
  root = mkdtempSync(path.join(tmpdir(), "stave-lens-review-"));
  store = new LensReviewRecordStore(db, root);
});
afterEach(() => {
  db.close();
  rmSync(root, { recursive: true, force: true });
});

describe("lens review record store", () => {
  test("a saved record reads back with its capture, and a confirmation records when", async () => {
    const saved = await store.save({ ...input(), afterPng: PNG, now: T0 });
    expect(saved).toMatchObject({ ...input(), confirmedAt: T0.toISOString(), capturedAt: T0.toISOString() });
    expect(saved.afterImagePath.startsWith("lens-reviews/")).toBe(true);
    expect(store.list({ taskId: "task-1" })).toEqual([saved]);
    expect(store.list({ taskId: "task-1", annotationId: "annotation-2" })).toEqual([]);
    expect(await store.readAfterImage(saved.id)).toEqual(PNG);
  });

  test("a re-check keeps when it was confirmed; confirming again clears the reason", async () => {
    const saved = await store.save({ ...input(), afterPng: PNG, now: T0 });
    const recheck = store.setVerdict({ id: saved.id, verdict: "needs-recheck", reason: "page-changed", now: at(5) })!;
    expect(recheck).toMatchObject({ verdict: "needs-recheck", recheckReason: "page-changed", confirmedAt: T0.toISOString(), updatedAt: at(5).toISOString() });
    expect(store.get(saved.id)).toEqual(recheck);
    const confirmed = store.setVerdict({ id: saved.id, verdict: "confirmed", now: at(9) })!;
    expect(confirmed.recheckReason).toBeUndefined();
    expect(confirmed.confirmedAt).toBe(at(9).toISOString());
    expect(store.setVerdict({ id: "missing", verdict: "confirmed" })).toBeNull();
  });

  test("a new page is never shown as confirmed by an old record", async () => {
    const saved = await store.save({ ...input(), afterPng: PNG, now: T0 });
    expect(store.reconcileDocument(saved, "document-1")).toEqual(saved);
    // Another document in the session (navigation, reload), or no session at all (a restart).
    for (const current of ["document-2", undefined]) {
      const reconciled = store.reconcileDocument(store.get(saved.id)!, current, at(1));
      expect(reconciled).toMatchObject({ verdict: "needs-recheck", recheckReason: "page-changed", confirmedAt: T0.toISOString() });
      expect(store.list({ taskId: "task-1" })[0]?.verdict).toBe("needs-recheck");
    }
    const recheck = await store.save({ ...input({ verdict: "needs-recheck" }), afterPng: PNG, now: at(2) });
    expect(store.reconcileDocument(recheck, "document-9")).toEqual(recheck);
    expect(recheck.recheckReason).toBe("reviewer");
  });

  test("a task keeps its newest records up to the cap; the oldest go with their captures", async () => {
    const capped = new LensReviewRecordStore(db, root, { cap: 3 });
    const saved = [];
    for (let index = 0; index < 4; index++) saved.push(await capped.save({ ...input(), afterPng: PNG, now: at(index) }));
    await capped.save({ ...input({ taskId: "task-2" }), afterPng: PNG, now: at(0) });
    expect(capped.list({ taskId: "task-1" }).map((record) => record.id)).toEqual(saved.slice(1).reverse().map((record) => record.id));
    expect(await capped.readAfterImage(saved[0]!.id)).toBeNull();
    expect(captures()).toHaveLength(4);
    expect(MAX_LENS_REVIEW_RECORDS_PER_TASK).toBe(20);
  });

  test("records and captures are deleted with their task, and with their workspace", async () => {
    await store.save({ ...input(), afterPng: PNG });
    await store.save({ ...input({ taskId: "task-2" }), afterPng: PNG });
    await store.save({ ...input({ taskId: "task-3", workspaceId: "workspace-2" }), afterPng: PNG });
    await store.deleteTask("task-1");
    expect(store.list({ taskId: "task-1" })).toEqual([]);
    expect(store.list({ taskId: "task-2" })).toHaveLength(1);
    expect(captures()).toHaveLength(2);
    await store.deleteWorkspace("workspace-1");
    expect(store.list({ taskId: "task-2" })).toEqual([]);
    expect(store.list({ taskId: "task-3" })).toHaveLength(1);
    expect(captures()).toHaveLength(1);
  });

  test("a database from before Lens review records gains the table once and keeps its data", () => {
    const old = new Database(":memory:");
    old.exec("CREATE TABLE workspaces (id TEXT PRIMARY KEY); INSERT INTO workspaces VALUES ('workspace-1');");
    new LensReviewRecordStore(old, root);
    new LensReviewRecordStore(old, root);
    expect(old.prepare("SELECT id FROM workspaces").all()).toEqual([{ id: "workspace-1" }]);
    // An older record shape (no optional fields) still loads; an unreadable row is skipped.
    const minimal = { ...input({ verdict: "needs-recheck" }), id: "old-1", afterImagePath: "lens-reviews/x/old-1.png", capturedAt: T0.toISOString(), updatedAt: T0.toISOString() };
    const insert = old.prepare("INSERT INTO lens_review_records (id, task_id, workspace_id, annotation_id, captured_at, record_json) VALUES (?, ?, ?, ?, ?, ?)");
    insert.run("old-1", "task-1", "workspace-1", "annotation-1", T0.toISOString(), JSON.stringify(minimal));
    insert.run("broken", "task-1", "workspace-1", "annotation-1", T0.toISOString(), "{not json");
    expect(new LensReviewRecordStore(old, root).list({ taskId: "task-1" })).toEqual([minimal]);
    old.close();
  });

  test("a capture path outside the captures folder is never read", async () => {
    const record = { ...input(), id: "escape", afterImagePath: "../../etc/passwd", capturedAt: T0.toISOString(), updatedAt: T0.toISOString() };
    db.prepare("INSERT INTO lens_review_records (id, task_id, workspace_id, annotation_id, captured_at, record_json) VALUES (?, ?, ?, ?, ?, ?)")
      .run("escape", "task-1", "workspace-1", "annotation-1", T0.toISOString(), JSON.stringify(record));
    expect(await store.readAfterImage("escape")).toBeNull();
  });

  test("only a PNG within the size bound is accepted as a capture", () => {
    const png = `data:image/png;base64,${Buffer.from(PNG).toString("base64")}`;
    expect(decodeLensReviewPng(png)).toEqual(PNG);
    expect(decodeLensReviewPng(`data:image/png;base64,${Buffer.from("GIF89a").toString("base64")}`)).toBeNull();
    expect(decodeLensReviewPng("data:image/jpeg;base64,AAAA")).toBeNull();
    expect(SaveLensReviewRecordArgsSchema.shape.afterDataUrl.safeParse(png).success).toBe(true);
    expect(SaveLensReviewRecordArgsSchema.shape.afterDataUrl.safeParse("data:image/png;base64," + "A".repeat(12_000_000)).success).toBe(false);
  });

  test("a capture replaced by a link to a file outside the captures folder is never read", async () => {
    const saved = await store.save({ ...input(), afterPng: PNG, now: T0 });
    const outsideDir = mkdtempSync(path.join(tmpdir(), "stave-lens-outside-"));
    const secret = path.join(outsideDir, "secret.png");
    writeFileSync(secret, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9]));
    const file = path.join(root, saved.afterImagePath);
    unlinkSync(file);
    symlinkSync(secret, file);
    try {
      expect(await store.readAfterImage(saved.id)).toBeNull();
    } finally {
      rmSync(outsideDir, { recursive: true, force: true });
    }
  });
});
