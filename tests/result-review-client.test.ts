import { afterEach, beforeEach, expect, test } from "bun:test";
import { captureBrowserResult, listResultReviews, setResultMarkedReviewed, setResultReviewed, setResultsReviewed, invalidateResultReviews } from "../src/lib/reviews/result-review-client";
import { pruneNotifications } from "../src/lib/db/notifications.db";
import type { AppNotification } from "../src/lib/notifications/notification.types";

const originalWindow = globalThis.window;
const notification: AppNotification = {
  id: "result", repositoryPath: "/tmp/project", repositoryName: "Project", workspaceId: "workspace",
  workspaceName: "Workspace", taskId: "task", taskTitle: "Task", turnId: "turn",
  kind: "task.turn_completed", title: "Task", body: "Result", providerId: "codex", action: null,
  payload: {}, createdAt: "2026-09-05T00:00:00Z", readAt: "2026-09-05T01:00:00Z",
  expiresAt: "2026-09-06T01:00:00Z",
};
const scope = { repositoryPath: "/tmp/project", workspaceId: "workspace", taskId: "task", turnId: "turn", reviewed: true };
beforeEach(() => {
  const values = new Map<string, string>();
  Object.assign(globalThis, { window: { api: undefined, localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  } } });
  invalidateResultReviews();
});
afterEach(() => { Object.assign(globalThis, { window: originalWindow }); invalidateResultReviews(); });

test("browser migrates read outcomes before pruning and keeps acknowledgement on replay", async () => {
  window.localStorage.setItem("stave:notifications-fallback:v1", JSON.stringify([notification]));
  await pruneNotifications({ now: "2026-09-10T00:00:00Z" });
  expect((await listResultReviews({ pendingOnly: true })).total).toBe(1);
  await setResultReviewed(scope);
  captureBrowserResult(notification);
  expect((await listResultReviews({ pendingOnly: true })).total).toBe(0);
  await setResultReviewed({ ...scope, reviewed: false });
  expect((await listResultReviews({ pendingOnly: true })).total).toBe(1);
});

test("failed desktop acknowledgement never changes browser storage or falls back", async () => {
  captureBrowserResult(notification);
  const saved = window.localStorage.getItem("stave:result-reviews:v1");
  Object.assign(window, { api: { persistence: { setResultReviewed: async () => ({ ok: false, result: null }) } } });
  await expect(setResultReviewed(scope)).rejects.toThrow("Review was not saved");
  expect(window.localStorage.getItem("stave:result-reviews:v1")).toBe(saved);
  await expect(listResultReviews()).rejects.toThrow("storage is unavailable");
});

test("explicit review refuses a missing or failing desktop writer without falling back to browser storage", async () => {
  captureBrowserResult(notification);
  const saved = window.localStorage.getItem("stave:result-reviews:v1");
  const args = { repositoryPath: scope.repositoryPath, workspaceId: scope.workspaceId, taskId: scope.taskId, turnId: scope.turnId, markedReviewed: true };
  Object.assign(window, { api: { persistence: {} } });
  await expect(setResultMarkedReviewed(args)).rejects.toThrow("storage is unavailable");
  Object.assign(window, { api: { persistence: { setResultMarkedReviewed: async () => ({ ok: false, result: null }) } } });
  await expect(setResultMarkedReviewed(args)).rejects.toThrow("review mark was not saved");
  expect(window.localStorage.getItem("stave:result-reviews:v1")).toBe(saved);
});

test("quota errors do not claim a saved review", async () => {
  captureBrowserResult(notification);
  window.localStorage.setItem = () => { throw new Error("quota exceeded"); };
  await expect(setResultReviewed(scope)).rejects.toThrow("quota exceeded");
  expect((await listResultReviews({ pendingOnly: true })).total).toBe(1);
});

test("bulk review clears the browser mirror and refuses a failed desktop write", async () => {
  captureBrowserResult(notification);
  const bulk = {
    scopes: [{ repositoryPath: "/tmp/project", workspaceId: "workspace", taskId: "task", turnId: "turn" }],
    reviewed: true,
  };
  expect(await setResultsReviewed(bulk)).toBe(1);
  expect((await listResultReviews({ pendingOnly: true })).total).toBe(0);
  // Already reviewed rows are not re-counted as cleared.
  expect(await setResultsReviewed(bulk)).toBe(0);

  const saved = window.localStorage.getItem("stave:result-reviews:v1");
  Object.assign(window, { api: { persistence: { setResultsReviewed: async () => ({ ok: false, updated: 0 }) } } });
  await expect(setResultsReviewed({ ...bulk, reviewed: false })).rejects.toThrow("Reviews were not saved");
  expect(window.localStorage.getItem("stave:result-reviews:v1")).toBe(saved);
});

test("browser latest selection hides old failures after reading a successor, keeps history, and supports Undo", async () => {
  captureBrowserResult({ ...notification, id: "failed", turnId: "old", kind: "task.turn_failed" });
  captureBrowserResult({ ...notification, id: "completed", turnId: "new", createdAt: "2026-09-06T00:00:00Z" });
  expect((await listResultReviews({ latestPerTask: true, pendingOnly: true })).results.map((row) => row.turnId)).toEqual(["new"]);
  await setResultReviewed({ ...scope, turnId: "new" });
  invalidateResultReviews();
  expect(await listResultReviews({ latestPerTask: true, pendingOnly: true })).toEqual({ results: [], total: 0, hasMore: false });
  expect((await listResultReviews({ pendingOnly: true })).results.map((row) => row.turnId)).toEqual(["old"]);
  expect((await listResultReviews()).total).toBe(2);
  await setResultReviewed({ ...scope, turnId: "new", reviewed: false });
  expect((await listResultReviews({ latestPerTask: true, pendingOnly: true })).results.map((row) => row.turnId)).toEqual(["new"]);
  expect((await listResultReviews({ latestPerTask: true, turnId: "old" })).total).toBe(0);
});

test("browser latest grouping uses full ownership, SQL-compatible id ordering, and pages after grouping", async () => {
  captureBrowserResult({ ...notification, id: "tie-Z", turnId: "tie-Z" });
  captureBrowserResult({ ...notification, id: "tie-a", turnId: "tie-a" });
  captureBrowserResult({ ...notification, id: "other-project", repositoryPath: "/tmp/other-project" });
  captureBrowserResult({ ...notification, id: "other-workspace", workspaceId: "other-workspace" });
  captureBrowserResult({ ...notification, id: "other-task", taskId: "other-task" });
  const first = await listResultReviews({ latestPerTask: true, limit: 2 });
  expect(first.results.map((row) => row.id)).toEqual(["tie-a", "other-workspace"]);
  expect(first.total).toBe(4);
  expect(first.hasMore).toBe(true);
  const second = await listResultReviews({ latestPerTask: true, limit: 2, offset: 2 });
  expect(second.results.map((row) => row.id)).toEqual(["other-task", "other-project"]);
  expect(second.total).toBe(4);
  expect(second.hasMore).toBe(false);
  expect((await listResultReviews({ latestPerTask: true, workspaceId: "workspace", taskId: "task" })).results.map((row) => row.id)).toEqual(["tie-a", "other-project"]);
  await setResultReviewed({ ...scope, turnId: "tie-a" });
  expect((await listResultReviews({ latestPerTask: true, pendingOnly: true })).total).toBe(3);
  expect((await listResultReviews()).total).toBe(5);
});

test("latest-per-task reaches the desktop bridge unchanged and rejects a nonboolean option before dispatch", async () => {
  const calls: unknown[] = [];
  Object.assign(window, { api: { persistence: { listResultReviews: async (args: unknown) => {
    calls.push(args);
    return { ok: true, results: [], total: 0, hasMore: false };
  } } } });
  await listResultReviews({ latestPerTask: true, pendingOnly: true, limit: 1 });
  expect(calls).toEqual([{ latestPerTask: true, pendingOnly: true, limit: 1 }]);
  expect(() => listResultReviews({ latestPerTask: "true" } as never)).toThrow();
  expect(calls).toHaveLength(1);
});
