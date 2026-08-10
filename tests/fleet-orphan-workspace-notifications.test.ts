import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { buildFleetAttentionProjection } from "@/lib/fleet/attention-projection";
import {
  createNotification,
  deleteNotificationsForWorkspaces,
  deleteOrphanedNotifications,
  listNotifications,
} from "@/lib/db/notifications.db";
import {
  removeNotificationsFromList,
  selectNotificationIdsForWorkspaces,
} from "@/lib/notifications/notification-state";
import {
  purgeWorkspaceNotificationsAction,
  reconcileOrphanedNotificationsAction,
} from "@/store/notification-actions";
import type { AppNotification } from "@/lib/notifications/notification.types";

const originalWindow = globalThis.window;
const fallbackStorageKey = "stave:notifications-fallback:v1";

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    clear: () => {
      values.clear();
    },
  };
}

function buildNotification(
  overrides: Partial<AppNotification> = {},
): AppNotification {
  return {
    id: "notification-1",
    kind: "task.user_input_requested",
    title: "Needs an answer",
    body: "Which option should I take?",
    projectPath: "/workspace/project",
    projectName: "Project",
    workspaceId: "workspace-live",
    workspaceName: "checkout",
    taskId: "task-1",
    taskTitle: "Review checkout",
    turnId: "turn-1",
    providerId: "codex",
    payload: { requestId: "request-1" },
    createdAt: "2026-07-26T00:00:00.000Z",
    readAt: null,
    resolvedAt: null,
    expiresAt: null,
    ...overrides,
  };
}

describe("fleet attention projection ignores archived workspaces", () => {
  test("drops notification needs whose workspace no longer exists", () => {
    const projection = buildFleetAttentionProjection({
      notifications: [
        buildNotification(),
        buildNotification({
          id: "notification-2",
          workspaceId: "workspace-archived",
          workspaceName: "gone",
          taskId: "task-2",
          payload: { requestId: "request-2" },
        }),
      ],
      liveWorkspaces: [],
      prWorkspaces: [],
      knownWorkspaceIds: new Set(["workspace-live"]),
    });

    expect(projection.count).toBe(1);
    expect(projection.items.map((item) => item.workspaceId)).toEqual([
      "workspace-live",
    ]);
    expect(projection.attentionItemsByWorkspaceId["workspace-archived"]).toBeUndefined();
  });

  test("keeps every notification need when the known workspace set is omitted", () => {
    const projection = buildFleetAttentionProjection({
      notifications: [
        buildNotification({
          workspaceId: "workspace-archived",
          payload: { requestId: "request-2" },
        }),
      ],
      liveWorkspaces: [],
      prWorkspaces: [],
    });

    expect(projection.count).toBe(1);
  });
});

describe("orphaned notification selection", () => {
  test("selects notifications belonging to the given workspaces", () => {
    const ids = selectNotificationIdsForWorkspaces({
      notifications: [
        buildNotification({ id: "keep", workspaceId: "workspace-live" }),
        buildNotification({ id: "drop", workspaceId: "workspace-archived" }),
      ],
      workspaceIds: ["workspace-archived"],
    });

    expect(ids).toEqual(["drop"]);
  });

  test("removes the selected notifications from the list", () => {
    const next = removeNotificationsFromList({
      notifications: [
        buildNotification({ id: "keep" }),
        buildNotification({ id: "drop" }),
      ],
      notificationIds: new Set(["drop"]),
    });

    expect(next.map((item) => item.id)).toEqual(["keep"]);
  });
});

describe("notification deletion persistence", () => {
  beforeEach(() => {
    const localStorage = createMemoryStorage();
    localStorage.setItem(fallbackStorageKey, "[]");
    (globalThis as { window?: unknown }).window = {
      localStorage,
      api: {},
    };
  });

  afterEach(async () => {
    // notifications.db keeps a module-level fallback cache. Reload it from an
    // empty store so leftovers cannot leak into other test files.
    (
      globalThis as { window?: { localStorage: ReturnType<typeof createMemoryStorage> } }
    ).window?.localStorage.setItem(fallbackStorageKey, "[]");
    await listNotifications();
    (globalThis as { window?: unknown }).window = originalWindow;
  });

  async function seedNotifications() {
    await createNotification({
      notification: {
        id: "orphan",
        kind: "task.user_input_requested",
        title: "Needs an answer",
        body: "Which option should I take?",
        workspaceId: "workspace-archived",
        taskId: "task-1",
        payload: { requestId: "request-1" },
      },
    });
    await createNotification({
      notification: {
        id: "live",
        kind: "task.user_input_requested",
        title: "Needs an answer",
        body: "Which option should I take?",
        workspaceId: "workspace-live",
        taskId: "task-2",
        payload: { requestId: "request-2" },
      },
    });
    await createNotification({
      notification: {
        id: "global",
        kind: "task.turn_completed",
        title: "Turn completed",
        body: "No workspace scope",
        payload: {},
      },
    });
  }

  test("deletes unresolved attention notifications for archived workspaces", async () => {
    await seedNotifications();

    const deleted = await deleteNotificationsForWorkspaces({
      workspaceIds: ["workspace-archived"],
    });

    expect(deleted).toBe(1);
    const remaining = await listNotifications();
    expect(remaining.map((item) => item.id).sort()).toEqual(["global", "live"]);
  });

  test("keeps everything when no persistence bridge can judge orphans", async () => {
    await seedNotifications();

    // The localStorage fallback has no workspace inventory, so it must not
    // guess which rows are orphaned.
    const result = await deleteOrphanedNotifications();

    expect(result).toEqual({ count: 0, workspaceIds: [] });
    expect(await listNotifications()).toHaveLength(3);
  });

  function createNotificationSlice(args: {
    notifications: AppNotification[];
  }) {
    let state = { notifications: args.notifications };
    return {
      set: (updater: (current: typeof state) => Partial<typeof state>) => {
        state = { ...state, ...updater(state) };
      },
      get: () => state,
      current: () => state.notifications,
    };
  }

  test("archiving a workspace drops its notifications from the list and storage", async () => {
    await seedNotifications();
    const slice = createNotificationSlice({
      notifications: await listNotifications(),
    });

    await purgeWorkspaceNotificationsAction({
      set: slice.set,
      get: slice.get,
      workspaceIds: ["workspace-archived"],
    });

    expect(slice.current().map((item) => item.id).sort()).toEqual([
      "global",
      "live",
    ]);
    const remaining = await listNotifications();
    expect(remaining.map((item) => item.id).sort()).toEqual(["global", "live"]);
  });

  test("reconcile leaves the list alone when no bridge can judge orphans", async () => {
    await seedNotifications();
    const slice = createNotificationSlice({
      notifications: await listNotifications(),
    });

    await reconcileOrphanedNotificationsAction({
      set: slice.set,
      get: slice.get,
    });

    expect(slice.current()).toHaveLength(3);
    expect(await listNotifications()).toHaveLength(3);
  });
});

describe("reconcile applies the main process verdict", () => {
  function installPersistenceStub(args: { orphanWorkspaceIds: string[] }) {
    const calls: number[] = [];
    (globalThis as { window?: unknown }).window = {
      localStorage: createMemoryStorage(),
      api: {
        persistence: {
          // getPersistenceApi() only hands back an api that can serve the whole
          // notification surface, so the stub has to cover the core four.
          listNotifications: async () => ({ ok: true, notifications: [] }),
          createNotification: async () => ({
            ok: true,
            inserted: false,
            notification: null,
          }),
          markNotificationRead: async () => ({ ok: true, notification: null }),
          markAllNotificationsRead: async () => ({ ok: true, count: 0 }),
          deleteOrphanedNotifications: async () => {
            calls.push(1);
            return {
              ok: true,
              count: args.orphanWorkspaceIds.length,
              workspaceIds: args.orphanWorkspaceIds,
            };
          },
        },
      },
    };
    return calls;
  }

  afterEach(() => {
    (globalThis as { window?: unknown }).window = originalWindow;
  });

  function createSlice(notifications: AppNotification[]) {
    let state = { notifications };
    return {
      set: (updater: (current: typeof state) => Partial<typeof state>) => {
        state = { ...state, ...updater(state) };
      },
      get: () => state,
      current: () => state.notifications,
    };
  }

  test("drops exactly the workspaces the main process purged", async () => {
    const calls = installPersistenceStub({
      orphanWorkspaceIds: ["workspace-archived"],
    });
    const slice = createSlice([
      buildNotification({ id: "live", workspaceId: "workspace-live" }),
      buildNotification({ id: "orphan", workspaceId: "workspace-archived" }),
      buildNotification({ id: "global", workspaceId: null }),
    ]);

    const deleted = await reconcileOrphanedNotificationsAction({
      set: slice.set,
      get: slice.get,
    });

    expect(calls).toHaveLength(1);
    expect(deleted).toBe(1);
    expect(slice.current().map((item) => item.id).sort()).toEqual([
      "global",
      "live",
    ]);
  });

  test("keeps a workspace the renderer has never seen but the host owns", async () => {
    // The renderer inventory is a capped, per-project snapshot, so a
    // host-created workspace is unknown to it. The main process knows better
    // and reports no orphan, and the notification must survive.
    installPersistenceStub({ orphanWorkspaceIds: [] });
    const slice = createSlice([
      buildNotification({ id: "host", workspaceId: "workspace-host-created" }),
    ]);

    const deleted = await reconcileOrphanedNotificationsAction({
      set: slice.set,
      get: slice.get,
    });

    expect(deleted).toBe(0);
    expect(slice.current().map((item) => item.id)).toEqual(["host"]);
  });
});
