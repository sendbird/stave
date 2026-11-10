import { expect, test } from "bun:test";
import { manageTarsNotification } from "../electron/persistence/tars-notification-policy";
import type { PersistenceNotificationCreateInput } from "../electron/persistence/types";
import type { TarsResponsibility } from "../src/lib/tars/types";
const now = "2026-11-18T00:00:00Z";
const root = { id: "work", taskId: "root", state: "running", updatedAt: now } as TarsResponsibility;
const notification = { id: "n", kind: "task.turn_completed", taskId: "child", payload: {} } as PersistenceNotificationCreateInput;
const deps = { responsibilities: [root], now: () => now, parentTask: (id: string) => id === "child" ? "root" : null };
test("root and descendant routine updates stay in read history under Tars", () => {
  for (const taskId of ["root", "child"]) for (const kind of ["task.turn_completed", "task.turn_failed", "agent_run.completed", "agent_run.blocked", "agent_run.stuck"] as const) {
    expect(manageTarsNotification({ ...notification, taskId, kind }, deps)).toMatchObject({ readAt: now, payload: { tarsManaged: true, responsibilityId: "work" } });
  }
});
test("approvals, questions, sign-offs and Tars summaries still require the user", () => {
  for (const kind of ["task.approval_requested", "task.user_input_requested", "agent_run.sign_off_requested", "tars.result_ready", "tars.decision_requested", "tars.blocked"] as const) {
    const input = { ...notification, kind };
    expect(manageTarsNotification(input, deps)).toBe(input);
  }
});
test("ordinary tasks, taken-over work and later user activity stay normal; cycles terminate", () => {
  expect(manageTarsNotification({ ...notification, taskId: "ordinary" }, deps)).not.toHaveProperty("readAt");
  for (const state of ["takenOver", "paused", "cancelled"] as const) expect(manageTarsNotification(notification, { ...deps, responsibilities: [{ ...root, state }] })).toBe(notification);
  expect(manageTarsNotification({ ...notification, createdAt: "2026-11-18T01:00:00Z" }, { ...deps, responsibilities: [{ ...root, state: "completed" }] })).not.toHaveProperty("readAt");
  expect(manageTarsNotification(notification, { ...deps, parentTask: () => "child" })).toBe(notification);
});

test("caller-provided delivery flags cannot silence a direct approval", () => {
  expect(manageTarsNotification({ ...notification, kind: "task.approval_requested", payload: { tarsManaged: true } }, deps).payload?.tarsManaged).toBe(false);
});
