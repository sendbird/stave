import { afterEach, beforeEach, expect, test } from "bun:test";
import { captureBrowserResult, listResultReviews, setResultReviewed, invalidateResultReviews } from "../src/lib/reviews/result-review-client";
import { pruneNotifications } from "../src/lib/db/notifications.db";
import type { AppNotification } from "../src/lib/notifications/notification.types";

const originalWindow = globalThis.window;
const notification: AppNotification = {
  id: "result", projectPath: "/tmp/project", projectName: "Project", workspaceId: "workspace",
  workspaceName: "Workspace", taskId: "task", taskTitle: "Task", turnId: "turn",
  kind: "task.turn_completed", title: "Task", body: "Result", providerId: "codex", action: null,
  payload: {}, createdAt: "2026-09-05T00:00:00Z", readAt: "2026-09-05T01:00:00Z",
  expiresAt: "2026-09-06T01:00:00Z",
};
const scope = { projectPath: "/tmp/project", workspaceId: "workspace", taskId: "task", turnId: "turn", reviewed: true };
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

test("quota errors do not claim a saved review", async () => {
  captureBrowserResult(notification);
  window.localStorage.setItem = () => { throw new Error("quota exceeded"); };
  await expect(setResultReviewed(scope)).rejects.toThrow("quota exceeded");
  expect((await listResultReviews({ pendingOnly: true })).total).toBe(1);
});
