import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { AppNotification } from "@/lib/notifications/notification.types";

// A mark-read updates the list at once and is then saved. When the save fails
// the change is taken back, but never over a write that came after it.
const NOW = "2026-10-01T00:00:00.000Z";
const approval: AppNotification = { id: "notification-approval", kind: "task.approval_requested", title: "Task", body: "",
  repositoryPath: "/tmp/project", repositoryName: "project", workspaceId: "workspace", workspaceName: "Workspace",
  taskId: "task", taskTitle: "Task", turnId: "turn", providerId: "codex",
  action: { type: "approval", requestId: "approval-1", messageId: "message-1" }, payload: {}, createdAt: NOW,
  readAt: null, resolvedAt: null };

const originalWindow = globalThis.window;
const originalError = console.error;
/** Pending saves, settled by the test in any order. */
let saves: Array<(saved: boolean) => void> = [];
/** When set, every save settles at once with this result. */
let autoSave: boolean | null = null;

beforeEach(async () => {
  saves = [];
  autoSave = null;
  console.error = () => {};
  globalThis.window = {
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    api: { persistence: {
      listNotifications: async () => ({ ok: true, notifications: [] }),
      createNotification: async () => ({ ok: true, inserted: false, notification: null }),
      markAllNotificationsRead: async () => ({ ok: true, count: 1 }),
      markNotificationRead: () => new Promise((resolve) => {
        const settle = (saved: boolean) => resolve({ ok: saved, notification: null });
        if (autoSave !== null) settle(autoSave);
        else saves.push(settle);
      }),
    } },
  } as unknown as Window & typeof globalThis;
  const { useAppStore } = await import("@/store/app.store");
  useAppStore.setState({ ...useAppStore.getInitialState(), notifications: [approval] });
});

afterEach(async () => {
  const { useAppStore } = await import("@/store/app.store");
  useAppStore.setState(useAppStore.getInitialState(), true);
  globalThis.window = originalWindow;
  console.error = originalError;
});

async function current() {
  const { useAppStore } = await import("@/store/app.store");
  return useAppStore.getState().notifications.find((item) => item.id === approval.id);
}

describe("mark-read rollback", () => {
  test("a failed save puts the notification back", async () => {
    const { useAppStore } = await import("@/store/app.store");
    const write = useAppStore.getState().markNotificationRead({ id: approval.id, resolvedAt: NOW });
    expect((await current())?.resolvedAt).toBe(NOW);
    saves[0]!(false);
    expect(await write).toBe(false);
    expect(await current()).toEqual(approval);
  });

  test("a failed save after mark-all keeps the read and takes back only the resolution", async () => {
    const { useAppStore } = await import("@/store/app.store");
    const write = useAppStore.getState().markNotificationRead({ id: approval.id, resolvedAt: NOW });
    await useAppStore.getState().markAllNotificationsRead();
    saves[0]!(false);
    expect(await write).toBe(false);
    const after = await current();
    // Mark-all saved the read, so the list keeps it.
    expect(after?.readAt).toBeTruthy();
    // The resolution was not saved: the request is open again and not set to expire.
    expect(after?.resolvedAt).toBeNull();
    expect(after?.expiresAt).toBeNull();
  });

  test("a failed save does not undo a later one that succeeded", async () => {
    const { useAppStore } = await import("@/store/app.store");
    const first = useAppStore.getState().markNotificationRead({ id: approval.id, resolvedAt: NOW });
    const second = useAppStore.getState().markNotificationRead({ id: approval.id, resolvedAt: NOW });
    saves[1]!(true);
    expect(await second).toBe(true);
    saves[0]!(false);
    expect(await first).toBe(false);
    expect((await current())?.resolvedAt).toBe(NOW);
  });

  test("Fleet's bulk read counts a failed save as failed, not as read", async () => {
    const { fleetBulkOperations } = await import("@/components/layout/useFleetBulkActions");
    const { applyFleetBulkPlan } = await import("@/lib/fleet/attention-bulk");
    autoSave = false;
    const outcome = await applyFleetBulkPlan({ plan: { results: [], notificationIds: [approval.id], snoozes: [] },
      operations: fleetBulkOperations(), resolvedAt: NOW, snoozedUntil: NOW });
    expect(outcome.read).toEqual([]);
    expect(outcome.failed).toBe(1);
    expect(await current()).toEqual(approval);

    autoSave = true;
    const saved = await applyFleetBulkPlan({ plan: { results: [], notificationIds: [approval.id], snoozes: [] },
      operations: fleetBulkOperations(), resolvedAt: NOW, snoozedUntil: NOW });
    expect(saved.read).toEqual([approval.id]);
    expect(saved.failed).toBe(0);
  });
});
