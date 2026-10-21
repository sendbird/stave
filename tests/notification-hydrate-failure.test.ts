import { afterEach, describe, expect, test } from "bun:test";
import { hydrateNotificationsAction } from "@/store/notification-actions";
import type { AppNotification, NotificationsLoad } from "@/lib/notifications/notification.types";

const originalWindow = globalThis.window;

function installPersistence(listNotifications: () => Promise<unknown>) {
  (globalThis as { window?: unknown }).window = {
    api: {
      persistence: {
        listNotifications,
        createNotification: async () => ({ ok: true }),
        markNotificationRead: async () => ({ ok: true }),
        markAllNotificationsRead: async () => ({ ok: true }),
        pruneNotifications: async () => ({ ok: true, count: 0 }),
      },
    },
  };
}

function slice(notifications: AppNotification[]) {
  const state: { notifications: AppNotification[]; notificationsLoad: NotificationsLoad } = {
    notifications,
    notificationsLoad: { status: "pending" },
  };
  return {
    state,
    deps: {
      set: (updater: (current: typeof state) => Partial<typeof state>) => Object.assign(state, updater(state)),
      get: () => state,
    },
  };
}

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("notification history read", () => {
  test("a failed read keeps the list the inbox shows and records the failure", async () => {
    installPersistence(async () => {
      throw new Error("database is locked");
    });
    const kept = { id: "n-1", title: "Turn finished" } as AppNotification;
    const { state, deps } = slice([kept]);
    await hydrateNotificationsAction(deps);
    expect(state.notifications).toEqual([kept]);
    expect(state.notificationsLoad).toEqual({ status: "error", message: "database is locked" });
  });

  test("a read that answers marks the history ready", async () => {
    installPersistence(async () => ({ ok: true, notifications: [] }));
    const { state, deps } = slice([]);
    await hydrateNotificationsAction(deps);
    expect(state.notificationsLoad).toEqual({ status: "ready" });
  });
});
