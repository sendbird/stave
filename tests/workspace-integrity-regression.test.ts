import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createJSONStorage } from "zustand/middleware";
import { buildProjectDefaultWorkspaceId } from "@/store/project.utils";
import { createEmptyWorkspaceInformation } from "@/lib/workspace-information";

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
}

const originalWindow = (globalThis as { window?: unknown }).window;
const PROJECT_PATH = "/tmp/stave-project";
const FOREIGN_PROJECT_PATH = "/tmp/sbdashboard";
const DEFAULT_WORKSPACE_ID = buildProjectDefaultWorkspaceId({
  projectPath: PROJECT_PATH,
});

function createTask(id: string, title = id) {
  return {
    id,
    title,
    provider: "codex" as const,
    updatedAt: "2026-03-31T00:00:00.000Z",
    unread: false,
    archivedAt: null,
  };
}

function createWorkspaceShell(args: { taskId: string; taskTitle?: string }) {
  const task = createTask(args.taskId, args.taskTitle);
  return {
    activeTaskId: args.taskId,
    tasks: [task],
    promptDraftByTask: {},
    providerSessionByTask: {},
    editorTabs: [],
    activeEditorTabId: null,
    terminalTabs: [],
    activeTerminalTabId: null,
    terminalDocked: false,
    cliSessionTabs: [],
    activeCliSessionTabId: null,
    activeSurface: { kind: "task" as const, taskId: args.taskId },
    workspaceInformation: createEmptyWorkspaceInformation(),
    messageCountByTask: { [args.taskId]: 0 },
  };
}

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

beforeEach(() => {
  (globalThis as { window?: unknown }).window = undefined;
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("workspace integrity regressions", () => {
  test("notification deep-links do not silently reopen archived tasks", async () => {
    const localStorage = createMemoryStorage();
    (globalThis as { window?: unknown }).window = {
      localStorage,
      api: {
        fs: {
          listFiles: async () => ({ ok: true, files: [] }),
        },
      },
    };

    const { useAppStore } = await import("../src/store/app.store");
    useAppStore.setState({
      ...useAppStore.getInitialState(),
      projectPath: "/tmp/project-a",
      projectName: "project-a",
      workspaces: [{ id: "ws-main", name: "Default Workspace", updatedAt: "2026-03-31T00:00:00.000Z" }],
      activeWorkspaceId: "ws-main",
      workspacePathById: { "ws-main": "/tmp/project-a" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
      activeTaskId: "task-active",
      tasks: [
        {
          id: "task-active",
          title: "Active Task",
          provider: "codex",
          updatedAt: "2026-03-31T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
        {
          id: "task-archived",
          title: "Archived Task",
          provider: "codex",
          updatedAt: "2026-03-31T00:01:00.000Z",
          unread: false,
          archivedAt: "2026-03-30T23:59:00.000Z",
        },
      ],
      notifications: [{
        id: "notification-archived-task",
        kind: "task.turn_completed",
        title: "Archived Task",
        body: "Latest run finished in Default Workspace.",
        projectPath: "/tmp/project-a",
        projectName: "project-a",
        workspaceId: "ws-main",
        workspaceName: "Default Workspace",
        taskId: "task-archived",
        taskTitle: "Archived Task",
        turnId: "turn-1",
        providerId: "codex",
        action: null,
        payload: {},
        createdAt: "2026-03-31T00:02:00.000Z",
        readAt: null,
      }],
      messagesByTask: {
        "task-active": [],
        "task-archived": [],
      },
      taskWorkspaceIdById: {
        "task-active": "ws-main",
        "task-archived": "ws-main",
      },
    });

    const result = await useAppStore.getState().openNotificationContext({ notificationId: "notification-archived-task" });

    expect(result).toEqual({
      status: "archived-task",
      taskId: "task-archived",
      taskTitle: "Archived Task",
    });
    expect(useAppStore.getState().activeTaskId).toBe("task-active");
    expect(useAppStore.getState().tasks.find((task) => task.id === "task-archived")?.archivedAt).toBe("2026-03-30T23:59:00.000Z");
    expect(useAppStore.getState().notifications[0]?.readAt).toBeString();

    useAppStore.getState().restoreTask({ taskId: "task-archived" });

    expect(useAppStore.getState().activeTaskId).toBe("task-archived");
    expect(useAppStore.getState().tasks.find((task) => task.id === "task-archived")?.archivedAt).toBeNull();
  });

  test("switchWorkspace ignores workspace ids that are not owned by the active project", async () => {
    const localStorage = createMemoryStorage();
    (globalThis as { window?: unknown }).window = {
      localStorage,
      api: {
        fs: {
          listFiles: async () => ({ ok: true, files: [] }),
        },
      },
    };

    const { useAppStore } = await import("../src/store/app.store");
    useAppStore.setState({
      ...useAppStore.getInitialState(),
      projectPath: "/tmp/project-a",
      projectName: "project-a",
      workspaces: [{ id: "ws-main", name: "Default Workspace", updatedAt: "2026-03-31T00:00:00.000Z" }],
      activeWorkspaceId: "ws-main",
      workspacePathById: { "ws-main": "/tmp/project-a" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
    });

    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-foreign" });

    expect(useAppStore.getState().activeWorkspaceId).toBe("ws-main");
  });

  test("task-scoped git commands run in the task-owned workspace even when another workspace is active", async () => {
    const localStorage = createMemoryStorage();
    const commandCalls: Array<{ cwd?: string; command: string }> = [];
    (globalThis as { window?: unknown }).window = {
      localStorage,
      api: {
        terminal: {
          runCommand: async ({ cwd, command }: { cwd?: string; command: string }) => {
            commandCalls.push({ cwd, command });
            return { ok: true, code: 0, stdout: "", stderr: "" };
          },
        },
      },
    };

    const { useAppStore } = await import("../src/store/app.store");
    useAppStore.setState({
      ...useAppStore.getInitialState(),
      projectPath: "/tmp/project-a",
      projectName: "project-a",
      workspaces: [
        { id: "ws-owned", name: "feature-a", updatedAt: "2026-03-31T00:00:00.000Z" },
        { id: "ws-active", name: "feature-b", updatedAt: "2026-03-31T00:01:00.000Z" },
      ],
      activeWorkspaceId: "ws-active",
      workspacePathById: {
        "ws-owned": "/tmp/project-a/.stave/workspaces/feature-a",
        "ws-active": "/tmp/project-a/.stave/workspaces/feature-b",
      },
      workspaceBranchById: { "ws-owned": "feature-a", "ws-active": "feature-b" },
      workspaceDefaultById: { "ws-owned": false, "ws-active": false },
      tasks: [{
        id: "task-1",
        title: "Task 1",
        provider: "codex",
        updatedAt: "2026-03-31T00:00:00.000Z",
        unread: false,
        archivedAt: null,
      }],
      messagesByTask: { "task-1": [] },
      taskWorkspaceIdById: { "task-1": "ws-owned" },
    });

    await useAppStore.getState().viewTaskChanges({ taskId: "task-1" });

    expect(commandCalls[0]).toEqual({
      cwd: "/tmp/project-a/.stave/workspaces/feature-a",
      command: "git status --porcelain",
    });
  });

  test("stale switchWorkspace results cannot overwrite a newer workspace switch", async () => {
    const localStorage = createMemoryStorage();
    let releaseSlowShell!: () => void;
    const slowShellStarted = new Promise<void>((resolve) => {
      releaseSlowShell = resolve;
    });
    let unblockSlowShell!: () => void;
    const slowShellBlock = new Promise<void>((resolve) => {
      unblockSlowShell = resolve;
    });
    (globalThis as { window?: unknown }).window = {
      localStorage,
      api: {
        fs: {
          listFiles: async () => ({ ok: true, files: [] }),
        },
        persistence: {
          listWorkspaces: async () => ({ ok: true, rows: [] }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          upsertWorkspace: async () => ({ ok: true }),
          loadWorkspaceShellForRestore: async ({
            workspaceId,
          }: {
            workspaceId: string;
          }) => {
            if (workspaceId === "ws-slow") {
              releaseSlowShell();
              await slowShellBlock;
            }
            return {
              ok: true,
              shell: createWorkspaceShell({
                taskId:
                  workspaceId === "ws-fast" ? "task-fast" : "task-slow",
              }),
            };
          },
          listActiveWorkspaceTurns: async () => ({ ok: true, turns: [] }),
        },
      },
    };

    const { useAppStore } = await import("../src/store/app.store");
    useAppStore.setState({
      ...useAppStore.getInitialState(),
      projectPath: "/tmp/project-a",
      projectName: "project-a",
      workspaces: [
        {
          id: "ws-main",
          name: "Default Workspace",
          updatedAt: "2026-03-31T00:00:00.000Z",
        },
        {
          id: "ws-slow",
          name: "slow",
          updatedAt: "2026-03-31T00:01:00.000Z",
        },
        {
          id: "ws-fast",
          name: "fast",
          updatedAt: "2026-03-31T00:02:00.000Z",
        },
      ],
      activeWorkspaceId: "ws-main",
      workspacePathById: {
        "ws-main": "/tmp/project-a",
        "ws-slow": "/tmp/project-a/.stave/workspaces/slow",
        "ws-fast": "/tmp/project-a/.stave/workspaces/fast",
      },
      workspaceBranchById: {
        "ws-main": "main",
        "ws-slow": "slow",
        "ws-fast": "fast",
      },
      workspaceDefaultById: {
        "ws-main": true,
        "ws-slow": false,
        "ws-fast": false,
      },
    });

    const slowSwitch = useAppStore
      .getState()
      .switchWorkspace({ workspaceId: "ws-slow" });
    await slowShellStarted;
    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-fast" });

    expect(useAppStore.getState().activeWorkspaceId).toBe("ws-fast");
    expect(useAppStore.getState().activeTaskId).toBe("task-fast");

    unblockSlowShell();
    await slowSwitch;

    expect(useAppStore.getState().activeWorkspaceId).toBe("ws-fast");
    expect(useAppStore.getState().activeTaskId).toBe("task-fast");
  });

  test("notification contexts ignore workspace ids outside the active project", async () => {
    const localStorage = createMemoryStorage();
    (globalThis as { window?: unknown }).window = {
      localStorage,
      api: {
        fs: {
          listFiles: async () => ({ ok: true, files: [] }),
        },
      },
    };

    const { useAppStore } = await import("../src/store/app.store");
    useAppStore.setState({
      ...useAppStore.getInitialState(),
      projectPath: "/tmp/project-a",
      projectName: "project-a",
      workspaces: [
        {
          id: "ws-main",
          name: "Default Workspace",
          updatedAt: "2026-03-31T00:00:00.000Z",
        },
      ],
      activeWorkspaceId: "ws-main",
      workspacePathById: { "ws-main": "/tmp/project-a" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
      activeTaskId: "task-active",
      tasks: [createTask("task-active"), createTask("task-collision")],
      notifications: [
        {
          id: "notification-foreign-workspace",
          kind: "task.turn_completed",
          title: "Foreign Task",
          body: "Latest run finished elsewhere.",
          projectPath: "/tmp/project-a",
          projectName: "project-a",
          workspaceId: "ws-foreign",
          workspaceName: "Foreign Workspace",
          taskId: "task-collision",
          taskTitle: "Collision Task",
          turnId: "turn-1",
          providerId: "codex",
          action: null,
          payload: {},
          createdAt: "2026-03-31T00:02:00.000Z",
          readAt: null,
        },
      ],
      messagesByTask: {
        "task-active": [],
        "task-collision": [],
      },
      taskWorkspaceIdById: {
        "task-active": "ws-main",
        "task-collision": "ws-main",
      },
    });

    const result = await useAppStore
      .getState()
      .openNotificationContext({
        notificationId: "notification-foreign-workspace",
      });

    expect(result).toEqual({ status: "opened" });
    expect(useAppStore.getState().activeTaskId).toBe("task-active");
    expect(useAppStore.getState().notifications[0]?.readAt).toBeString();
  });

  test("rehydration realigns the current workspace state with the normalized current project", async () => {
    const localStorage = createMemoryStorage();
    (globalThis as { window?: unknown }).window = { localStorage };

    const { useAppStore } = await import("../src/store/app.store");
    useAppStore.setState(useAppStore.getInitialState());

    localStorage.setItem("stave-store", JSON.stringify({
      state: {
        projectPath: PROJECT_PATH,
        projectName: "stave",
        defaultBranch: "main",
        workspaces: [{
          id: "base:1i2znya",
          name: "Default Workspace",
          updatedAt: "2026-03-31T13:36:19.071Z",
        }],
        activeWorkspaceId: "base:1i2znya",
        recentProjects: [{
          projectPath: PROJECT_PATH,
          projectName: "stave",
          lastOpenedAt: "2026-03-31T13:36:33.211Z",
          defaultBranch: "main",
          workspaces: [{
            id: "base:1i2znya",
            name: "Default Workspace",
            updatedAt: "2026-03-31T13:36:19.071Z",
          }],
          activeWorkspaceId: "base:1i2znya",
          workspaceBranchById: { "base:1i2znya": "master" },
          workspacePathById: { "base:1i2znya": FOREIGN_PROJECT_PATH },
          workspaceDefaultById: { "base:1i2znya": true },
        }],
        workspaceBranchById: { "base:1i2znya": "master" },
        workspacePathById: { "base:1i2znya": FOREIGN_PROJECT_PATH },
        workspaceDefaultById: { "base:1i2znya": true },
      },
      version: 0,
    }));

    const persistedStore = useAppStore as typeof useAppStore & {
      persist: {
        rehydrate: () => Promise<void>;
        setOptions: (options: { storage: ReturnType<typeof createJSONStorage> }) => void;
      };
    };
    persistedStore.persist.setOptions({
      storage: createJSONStorage(() => localStorage as Storage),
    });
    await persistedStore.persist.rehydrate();

    expect(useAppStore.getState().activeWorkspaceId).toBe(DEFAULT_WORKSPACE_ID);
    expect(useAppStore.getState().workspacePathById).toEqual({
      [DEFAULT_WORKSPACE_ID]: PROJECT_PATH,
    });
    expect(useAppStore.getState().workspaceDefaultById).toEqual({
      [DEFAULT_WORKSPACE_ID]: true,
    });
  });
});
