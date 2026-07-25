import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  clearNotificationHistory,
  createNotification,
  listNotifications,
  markNotificationRead,
  pruneNotifications,
} from "@/lib/db/notifications.db";
import {
  ClearNotificationHistoryArgsSchema,
  MarkNotificationReadArgsSchema,
  PruneNotificationsArgsSchema,
} from "../electron/main/ipc/schemas";
import {
  clearNotificationHistoryInList,
  findPendingUserInputNotificationIds,
  getNotificationHistoryClearableIds,
} from "@/lib/notifications/notification-state";
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

beforeEach(() => {
  const localStorage = createMemoryStorage();
  localStorage.setItem(fallbackStorageKey, "[]");
  (globalThis as { window?: unknown }).window = {
    localStorage,
    api: {},
  };
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("notification retention", () => {
  test("prunes read history after seven days but preserves unresolved attention", async () => {
    await createNotification({
      notification: {
        id: "completed",
        kind: "task.turn_completed",
        title: "Completed",
        body: "Done",
        projectPath: null,
        projectName: null,
        workspaceId: "workspace-1",
        workspaceName: "Main",
        taskId: "task-1",
        taskTitle: "Task",
        turnId: "turn-1",
        providerId: "codex",
        action: null,
        payload: {},
        createdAt: "2026-07-01T00:00:00.000Z",
      },
    });
    await createNotification({
      notification: {
        id: "approval",
        kind: "task.approval_requested",
        title: "Approval",
        body: "Allow command",
        projectPath: null,
        projectName: null,
        workspaceId: "workspace-1",
        workspaceName: "Main",
        taskId: "task-1",
        taskTitle: "Task",
        turnId: "turn-1",
        providerId: "codex",
        action: {
          type: "approval",
          requestId: "approval-1",
          messageId: "message-1",
        },
        payload: {},
        createdAt: "2026-07-01T00:01:00.000Z",
      },
    });

    const completed = await markNotificationRead({
      id: "completed",
      readAt: "2026-07-02T00:00:00.000Z",
    });
    expect(completed?.expiresAt).toBe("2026-07-09T00:00:00.000Z");

    const pendingApproval = await markNotificationRead({
      id: "approval",
      readAt: "2026-07-02T00:00:00.000Z",
    });
    expect(pendingApproval?.expiresAt).toBeNull();

    expect(await pruneNotifications({ now: "2026-07-10T00:00:00.000Z" })).toBe(
      1,
    );
    expect((await listNotifications()).map((item) => item.id)).toEqual([
      "approval",
    ]);

    const resolved = await markNotificationRead({
      id: "approval",
      readAt: "2026-07-10T00:00:00.000Z",
      resolvedAt: "2026-07-10T00:00:00.000Z",
    });
    expect(resolved?.resolvedAt).toBe("2026-07-10T00:00:00.000Z");
    expect(resolved?.expiresAt).toBe("2026-07-17T00:00:00.000Z");
  });

  test("manual cleanup removes all read history including unresolved attention", async () => {
    await createNotification({
      notification: {
        id: "completed",
        kind: "task.turn_completed",
        title: "Completed",
        body: "Done",
        projectPath: null,
        projectName: null,
        workspaceId: "workspace-1",
        workspaceName: "Main",
        taskId: "task-1",
        taskTitle: "Task",
        turnId: "turn-1",
        providerId: "codex",
        action: null,
        payload: {},
        createdAt: "2026-07-01T00:00:00.000Z",
        readAt: "2026-07-02T00:00:00.000Z",
      },
    });
    await createNotification({
      notification: {
        id: "input",
        kind: "task.user_input_requested",
        title: "Input",
        body: "Choose a target",
        projectPath: null,
        projectName: null,
        workspaceId: "workspace-1",
        workspaceName: "Main",
        taskId: "task-1",
        taskTitle: "Task",
        turnId: "turn-2",
        providerId: "codex",
        action: null,
        payload: { requestId: "input-1" },
        createdAt: "2026-07-01T00:01:00.000Z",
        readAt: "2026-07-02T00:01:00.000Z",
        expiresAt: "2026-07-03T00:01:00.000Z",
      },
    });

    expect(await clearNotificationHistory()).toBe(2);
    expect(await listNotifications()).toEqual([]);
  });

  test("manual cleanup preserves clearable notifications that arrive after cleanup starts", () => {
    const existing = {
      id: "existing",
      kind: "task.turn_completed",
      title: "Existing",
      body: "Already in history",
      projectPath: null,
      projectName: null,
      workspaceId: "workspace-1",
      workspaceName: "Main",
      taskId: "task-1",
      taskTitle: "Task",
      turnId: "turn-1",
      providerId: "codex",
      action: null,
      payload: {},
      createdAt: "2026-07-01T00:00:00.000Z",
      readAt: "2026-07-01T00:01:00.000Z",
    } satisfies AppNotification;
    const arriving = {
      ...existing,
      id: "arriving",
      title: "Arriving",
      createdAt: "2026-07-01T00:02:00.000Z",
      readAt: "2026-07-01T00:03:00.000Z",
    } satisfies AppNotification;
    const notificationIds = getNotificationHistoryClearableIds([existing]);

    expect(
      clearNotificationHistoryInList({
        notifications: [arriving, existing],
        notificationIds,
      }).map((notification) => notification.id),
    ).toEqual(["arriving"]);
  });

  test("validates resolution and prune fields at the IPC boundary", () => {
    expect(
      MarkNotificationReadArgsSchema.parse({
        id: "notification-1",
        readAt: "2026-07-10T00:00:00.000Z",
        resolvedAt: "2026-07-10T00:00:00.000Z",
      }),
    ).toEqual({
      id: "notification-1",
      readAt: "2026-07-10T00:00:00.000Z",
      resolvedAt: "2026-07-10T00:00:00.000Z",
    });
    expect(
      PruneNotificationsArgsSchema.parse({
        now: "2026-07-18T00:00:00.000Z",
      }),
    ).toEqual({ now: "2026-07-18T00:00:00.000Z" });
    expect(ClearNotificationHistoryArgsSchema.parse({})).toEqual({});
  });

  test("matches a user-input resolution to its task, request, and message", () => {
    const notification = {
      id: "input-notification",
      kind: "task.user_input_requested",
      title: "Input",
      body: "Pick one",
      projectPath: null,
      projectName: null,
      workspaceId: "workspace-1",
      workspaceName: "Main",
      taskId: "task-1",
      taskTitle: "Task",
      turnId: "turn-1",
      providerId: "codex",
      action: null,
      payload: {
        requestId: "input-1",
        messageId: "message-1",
      },
      createdAt: "2026-07-01T00:00:00.000Z",
      readAt: null,
    } satisfies AppNotification;

    expect(
      findPendingUserInputNotificationIds({
        notifications: [notification],
        taskId: "task-1",
        requestId: "input-1",
        messageId: "message-1",
      }),
    ).toEqual(["input-notification"]);
    expect(
      findPendingUserInputNotificationIds({
        notifications: [notification],
        taskId: "task-1",
        requestId: "input-1",
        messageId: "another-message",
      }),
    ).toEqual([]);
  });
});
