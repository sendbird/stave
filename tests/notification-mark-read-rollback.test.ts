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
let saves: Array<(saved: boolean, notification?: AppNotification) => void> = [];
/** When set, every save settles at once with this result. */
let autoSave: boolean | null = null;
/** Pending mark-all saves; when empty, a mark-all saves at once. */
let markAllSaves: Array<(saved: boolean) => void> | null = null;

beforeEach(async () => {
  saves = [];
  autoSave = null;
  markAllSaves = null;
  console.error = () => {};
  globalThis.window = {
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    api: { persistence: {
      listNotifications: async () => ({ ok: true, notifications: [] }),
      createNotification: async () => ({ ok: true, inserted: false, notification: null }),
      markAllNotificationsRead: () => new Promise((resolve) => {
        const settle = (saved: boolean) => resolve({ ok: saved, count: saved ? 1 : 0 });
        if (markAllSaves) markAllSaves.push(settle);
        else settle(true);
      }),
      markNotificationRead: () => new Promise((resolve) => {
        const settle = (saved: boolean, notification?: AppNotification) =>
          resolve({ ok: saved, notification: saved ? (notification ?? null) : null });
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

  test("two failed saves put back the record as it was before both", async () => {
    const { useAppStore } = await import("@/store/app.store");
    // Read in the inbox, then closed from the composer; neither is saved.
    const read = useAppStore.getState().markNotificationRead({ id: approval.id });
    const close = useAppStore.getState().markNotificationRead({ id: approval.id, resolvedAt: NOW });
    saves[0]!(false);
    saves[1]!(false);
    expect([await read, await close]).toEqual([false, false]);
    expect(await current()).toEqual(approval);
  });

  test("a failed close followed by a saved read keeps the read and reopens the request", async () => {
    const { useAppStore } = await import("@/store/app.store");
    const close = useAppStore.getState().markNotificationRead({ id: approval.id, resolvedAt: NOW });
    const read = useAppStore.getState().markNotificationRead({ id: approval.id });
    saves[0]!(false);
    saves[1]!(true);
    expect([await close, await read]).toEqual([false, true]);
    const after = await current();
    expect(after?.readAt).toBeTruthy();
    expect(after?.resolvedAt).toBeNull();
    expect(after?.expiresAt).toBeNull();
  });

  test("a failed close keeps a resolution the store returned from elsewhere", async () => {
    const { useAppStore } = await import("@/store/app.store");
    const close = useAppStore.getState().markNotificationRead({ id: approval.id, resolvedAt: NOW });
    const read = useAppStore.getState().markNotificationRead({ id: approval.id });
    // Meanwhile another window resolved the request; the read's save returns that record.
    const elsewhere = { ...approval, readAt: "2026-10-01T00:00:05.000Z", resolvedAt: "2026-10-01T00:00:04.000Z", expiresAt: null };
    saves[1]!(true, elsewhere);
    saves[0]!(false);
    expect([await close, await read]).toEqual([false, true]);
    expect(await current()).toEqual(elsewhere);
  });

  test("a late read response does not undo a close the store already returned", async () => {
    const { useAppStore } = await import("@/store/app.store");
    const read = useAppStore.getState().markNotificationRead({ id: approval.id });
    const close = useAppStore.getState().markNotificationRead({ id: approval.id, resolvedAt: NOW });
    const again = useAppStore.getState().markNotificationRead({ id: approval.id, resolvedAt: NOW });
    const readRecord = { ...approval, readAt: "2026-10-01T00:00:01.000Z" };
    const closedRecord = { ...readRecord, resolvedAt: NOW, expiresAt: "2026-10-31T00:00:00.000Z" };
    // The close's response arrives first, then the read's older one, then a third write fails.
    saves[1]!(true, closedRecord);
    saves[0]!(true, readRecord);
    saves[2]!(false);
    expect([await read, await close, await again]).toEqual([true, true, false]);
    expect((await current())?.resolvedAt).toBe(NOW);
    expect((await current())?.readAt).toBeTruthy();
  });

  test("a late read response does not reopen a close that both saved", async () => {
    const { useAppStore } = await import("@/store/app.store");
    const read = useAppStore.getState().markNotificationRead({ id: approval.id });
    const close = useAppStore.getState().markNotificationRead({ id: approval.id, resolvedAt: NOW });
    const readRecord = { ...approval, readAt: "2026-10-01T00:00:01.000Z" };
    const closedRecord = { ...readRecord, resolvedAt: NOW, expiresAt: "2026-10-31T00:00:00.000Z" };
    saves[1]!(true, closedRecord);
    saves[0]!(true, readRecord);
    expect([await read, await close]).toEqual([true, true]);
    // Nothing failed; the older read record arrived last and must not clear the close.
    expect(await current()).toEqual(closedRecord);
  });

  test("a resolution the store already held keeps its own time and expiry after a failure", async () => {
    const { useAppStore } = await import("@/store/app.store");
    const close = useAppStore.getState().markNotificationRead({ id: approval.id, resolvedAt: NOW });
    const read = useAppStore.getState().markNotificationRead({ id: approval.id });
    // Another window resolved it first; the close's save returns that stored record.
    const stored = { ...approval, readAt: "2026-10-01T00:00:03.000Z", resolvedAt: "2026-09-30T23:00:00.000Z",
      expiresAt: "2026-10-30T23:00:00.000Z" };
    saves[0]!(true, stored);
    saves[1]!(false);
    expect([await close, await read]).toEqual([true, false]);
    expect(await current()).toEqual(stored);
  });

  test("a mark-all that fails does not keep a failed close's read on screen", async () => {
    const { useAppStore } = await import("@/store/app.store");
    markAllSaves = [];
    const close = useAppStore.getState().markNotificationRead({ id: approval.id, resolvedAt: NOW });
    const all = useAppStore.getState().markAllNotificationsRead();
    markAllSaves[0]!(false);
    await all;
    saves[0]!(false);
    expect(await close).toBe(false);
    expect(await current()).toEqual(approval);
  });

  test("a mark-all that saves after a failed close shows the read again", async () => {
    const { useAppStore } = await import("@/store/app.store");
    markAllSaves = [];
    const close = useAppStore.getState().markNotificationRead({ id: approval.id, resolvedAt: NOW });
    const all = useAppStore.getState().markAllNotificationsRead();
    // The close fails while mark-all is still saving: nothing saved yet, so it is put back.
    saves[0]!(false);
    expect(await close).toBe(false);
    expect((await current())?.readAt).toBeNull();
    // Mark-all then saves: the notification was read on disk, so it reads as read.
    markAllSaves[0]!(true);
    await all;
    const after = await current();
    expect(after?.readAt).toBeTruthy();
    expect(after?.resolvedAt).toBeNull();
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
