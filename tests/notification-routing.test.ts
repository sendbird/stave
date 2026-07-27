import { afterEach, beforeEach, describe, expect, test } from "bun:test";

type UseAppStore = typeof import("../src/store/app.store").useAppStore;

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
}

const originalWindow = (globalThis as { window?: unknown }).window;
let useAppStore: UseAppStore;

function createMemoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => {
      values.clear();
    },
  };
}

beforeEach(async () => {
  (globalThis as { window?: unknown }).window = {
    localStorage: createMemoryStorage(),
    api: {},
  };
  ({ useAppStore } = await import("../src/store/app.store"));
  useAppStore.setState({
    ...useAppStore.getInitialState(),
    projectPath: "/tmp/project-a",
    projectName: "project-a",
    workspaces: [
      {
        id: "workspace-1",
        name: "Default Workspace",
        updatedAt: "2026-06-18T01:00:00.000Z",
      },
    ],
    activeWorkspaceId: "workspace-1",
    workspacePathById: { "workspace-1": "/tmp/project-a" },
    workspaceBranchById: { "workspace-1": "main" },
    workspaceDefaultById: { "workspace-1": true },
    activeTaskId: "task-current",
    activeSurface: { kind: "task", taskId: "task-current" },
    tasks: [
      {
        id: "task-current",
        title: "Current Task",
        provider: "codex",
        updatedAt: "2026-06-18T01:00:00.000Z",
        unread: false,
        archivedAt: null,
        controlMode: "interactive",
        controlOwner: "stave",
      },
      {
        id: "task-blocked",
        title: "Blocked Task",
        provider: "codex",
        updatedAt: "2026-06-18T01:01:00.000Z",
        unread: false,
        archivedAt: null,
        controlMode: "interactive",
        controlOwner: "stave",
      },
      {
        id: "task-completed",
        title: "Completed Task",
        provider: "codex",
        updatedAt: "2026-06-18T01:02:00.000Z",
        unread: true,
        archivedAt: null,
        controlMode: "interactive",
        controlOwner: "stave",
      },
    ],
    taskWorkspaceIdById: {
      "task-current": "workspace-1",
      "task-blocked": "workspace-1",
      "task-completed": "workspace-1",
    },
    notifications: [
      {
        id: "notification-user-input",
        kind: "task.user_input_requested",
        title: "Blocked Task",
        body: "request_user_input: Pick one",
        projectPath: "/tmp/project-a",
        projectName: "project-a",
        workspaceId: "workspace-1",
        workspaceName: "Default Workspace",
        taskId: "task-blocked",
        taskTitle: "Blocked Task",
        turnId: "turn-1",
        providerId: "codex",
        action: null,
        payload: {
          requestId: "input-1",
          question: "Pick one",
        },
        createdAt: "2026-06-18T01:02:00.000Z",
        readAt: null,
      },
      {
        id: "notification-completed",
        kind: "task.turn_completed",
        title: "Completed Task",
        body: "Latest run finished in Default Workspace.",
        projectPath: "/tmp/project-a",
        projectName: "project-a",
        workspaceId: "workspace-1",
        workspaceName: "Default Workspace",
        taskId: "task-completed",
        taskTitle: "Completed Task",
        turnId: "turn-2",
        providerId: "codex",
        action: null,
        payload: {
          stopReason: "end_turn",
        },
        createdAt: "2026-06-18T01:03:00.000Z",
        readAt: null,
      },
    ],
  });
});

afterEach(() => {
  useAppStore.setState(useAppStore.getInitialState());
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("notification routing", () => {
  test("opens Fleet View without changing the workspace active surface", () => {
    const previousWorkspaceSurface = useAppStore.getState().activeSurface;

    useAppStore.getState().openFleetView();

    expect(useAppStore.getState().activeAppSurface).toEqual({
      kind: "fleet-view",
    });
    expect(useAppStore.getState().activeSurface).toBe(previousWorkspaceSurface);
  });

  test("routes a blocked notification to its exact task attention", async () => {
    const result = await useAppStore.getState().openNotificationContext({
      notificationId: "notification-user-input",
    });

    expect(result).toEqual({ status: "opened" });
    expect(useAppStore.getState().activeAppSurface).toEqual({
      kind: "workspace",
    });
    expect(useAppStore.getState().activeSurface).toEqual({
      kind: "task",
      taskId: "task-blocked",
    });
    expect(useAppStore.getState().activeTaskId).toBe("task-blocked");
    expect(useAppStore.getState().focusPendingInteractionRequest?.taskId).toBe(
      "task-blocked",
    );
    expect(useAppStore.getState().notifications[0]?.readAt).toBeNull();
  });

  test("routes a completed notification to its exact task", async () => {
    const result = await useAppStore.getState().openNotificationContext({
      notificationId: "notification-completed",
      targetSurface: "task",
    });

    expect(result).toEqual({ status: "opened" });
    expect(useAppStore.getState().activeAppSurface).toEqual({
      kind: "workspace",
    });
    expect(useAppStore.getState().activeSurface).toEqual({
      kind: "task",
      taskId: "task-completed",
    });
    expect(useAppStore.getState().activeTaskId).toBe("task-completed");
    expect(
      useAppStore
        .getState()
        .notifications.find(
          (notification) => notification.id === "notification-completed",
        )?.readAt,
    ).toBeString();
  });
});
