import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { buildFleetAttentionProjection } from "@/lib/fleet/attention-projection";
import {
  createNotification,
  deleteNotificationsForWorkspaces,
  deleteNotificationsOutsideWorkspaces,
  listNotifications,
} from "@/lib/db/notifications.db";
import {
  removeNotificationsFromList,
  selectNotificationIdsForWorkspaces,
  selectOrphanedNotificationIds,
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
    expect(projection.needsByWorkspaceId["workspace-archived"]).toBeUndefined();
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
  test("selects notifications whose workspace is not known", () => {
    const ids = selectOrphanedNotificationIds({
      notifications: [
        buildNotification({ id: "live", workspaceId: "workspace-live" }),
        buildNotification({ id: "orphan", workspaceId: "workspace-archived" }),
        buildNotification({ id: "global", workspaceId: null }),
      ],
      knownWorkspaceIds: new Set(["workspace-live"]),
    });

    expect(ids).toEqual(["orphan"]);
  });

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

  test("deletes notifications outside the known workspaces but keeps workspace-less ones", async () => {
    await seedNotifications();

    const deleted = await deleteNotificationsOutsideWorkspaces({
      workspaceIds: ["workspace-live"],
    });

    expect(deleted).toBe(1);
    const remaining = await listNotifications();
    expect(remaining.map((item) => item.id).sort()).toEqual(["global", "live"]);
  });

  function createNotificationSlice(args: {
    notifications: AppNotification[];
    workspaceIds?: string[];
    hasHydratedWorkspaces?: boolean;
  }) {
    let state = {
      notifications: args.notifications,
      hasHydratedWorkspaces: args.hasHydratedWorkspaces ?? true,
      recentProjects: [
        { workspaces: (args.workspaceIds ?? []).map((id) => ({ id })) },
      ],
      workspaces: [] as { id: string }[],
    };
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
      workspaceIds: ["workspace-live"],
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

  test("startup reconcile drops notifications left behind by removed workspaces", async () => {
    await seedNotifications();
    const slice = createNotificationSlice({
      notifications: await listNotifications(),
      workspaceIds: ["workspace-live"],
    });

    await reconcileOrphanedNotificationsAction({
      set: slice.set,
      get: slice.get,
    });

    expect(slice.current().map((item) => item.id).sort()).toEqual([
      "global",
      "live",
    ]);
    const remaining = await listNotifications();
    expect(remaining.map((item) => item.id).sort()).toEqual(["global", "live"]);
  });

  test("startup reconcile keeps everything when the workspace inventory is empty", async () => {
    await seedNotifications();
    const slice = createNotificationSlice({
      notifications: await listNotifications(),
      workspaceIds: [],
    });

    await reconcileOrphanedNotificationsAction({
      set: slice.set,
      get: slice.get,
    });

    expect(slice.current()).toHaveLength(3);
    expect(await listNotifications()).toHaveLength(3);
  });

  test("startup reconcile keeps everything until the workspace inventory is hydrated", async () => {
    await seedNotifications();
    const slice = createNotificationSlice({
      notifications: await listNotifications(),
      workspaceIds: [],
      hasHydratedWorkspaces: false,
    });

    await reconcileOrphanedNotificationsAction({
      set: slice.set,
      get: slice.get,
    });

    expect(slice.current().map((item) => item.id).sort()).toEqual([
      "global",
      "live",
      "orphan",
    ]);
    const remaining = await listNotifications();
    expect(remaining).toHaveLength(3);
  });
});
