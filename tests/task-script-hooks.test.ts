import { afterEach, beforeEach, describe, expect, test } from "bun:test";

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
}

const originalWindow = (globalThis as { window?: unknown }).window;

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

describe("task script hooks", () => {
  test("fires task.created for the seeded workspace task", async () => {
    const localStorage = createMemoryStorage();
    const hookCalls: Array<Record<string, unknown>> = [];

    (globalThis as { window?: unknown }).window = {
      localStorage,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      api: {
        scripts: {
          runHook: async (args: Record<string, unknown>) => {
            hookCalls.push(args);
            return {
              ok: true,
              summary: {
                trigger: args.trigger,
                totalEntries: 0,
                executedEntries: 0,
                failures: [],
              },
            };
          },
        },
        terminal: {
          runCommand: async () => ({
            ok: true,
            code: 0,
            stdout: "",
            stderr: "",
          }),
        },
      },
    };

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();

    useAppStore.setState({
      ...initialState,
      projectPath: "/tmp/stave-project",
      projectName: "stave-project",
      defaultBranch: "main",
      recentProjects: [
        {
          projectPath: "/tmp/stave-project",
          projectName: "stave-project",
          lastOpenedAt: "2026-04-06T00:00:00.000Z",
          defaultBranch: "main",
          workspaces: [],
          activeWorkspaceId: "",
          workspaceBranchById: {},
          workspacePathById: {},
          workspaceDefaultById: {},
        },
      ],
      workspaces: [],
      activeWorkspaceId: "",
      workspaceBranchById: {},
      workspacePathById: {},
      workspaceDefaultById: {},
      projectFiles: [],
    });

    await useAppStore.getState().createWorkspace({
      name: "feature/seeded-task",
      mode: "branch",
      fromBranch: "main",
    });
    await Bun.sleep(0);

    const nextState = useAppStore.getState();
    expect(nextState.tasks).toHaveLength(1);
    expect(hookCalls).toHaveLength(1);
    const workspacePath =
      nextState.workspacePathById[nextState.activeWorkspaceId];
    expect(hookCalls[0]).toMatchObject({
      workspaceId: nextState.activeWorkspaceId,
      trigger: "task.created",
      projectPath: "/tmp/stave-project",
      workspacePath,
      workspaceName: "feature/seeded-task",
      branch: "feature/seeded-task",
      taskTitle: "New Task",
    });
    expect(hookCalls[0]?.taskId).toBe(nextState.tasks[0]?.id);
  });

  test("fires task.created with task context", async () => {
    const localStorage = createMemoryStorage();
    const hookCalls: Array<Record<string, unknown>> = [];

    (globalThis as { window?: unknown }).window = {
      localStorage,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      api: {
        scripts: {
          runHook: async (args: Record<string, unknown>) => {
            hookCalls.push(args);
            return {
              ok: true,
              summary: {
                trigger: args.trigger,
                totalEntries: 0,
                executedEntries: 0,
                failures: [],
              },
            };
          },
        },
      },
    };

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();

    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [
        { id: "ws-main", name: "Main", updatedAt: "2026-04-04T00:00:00.000Z" },
      ],
      activeWorkspaceId: "ws-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: { "ws-main": "/tmp/stave-project" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
      tasks: [],
      activeTaskId: "",
      messagesByTask: {},
      promptDraftByTask: {},
      messageCountByTask: {},
      nativeSessionReadyByTask: {},
      providerSessionByTask: {},
      taskWorkspaceIdById: {},
    });

    useAppStore.getState().createTask({ title: "Plan Task" });
    await Bun.sleep(0);

    expect(hookCalls).toHaveLength(1);
    expect(hookCalls[0]).toMatchObject({
      workspaceId: "ws-main",
      trigger: "task.created",
      projectPath: "/tmp/stave-project",
      workspacePath: "/tmp/stave-project",
      workspaceName: "Main",
      branch: "main",
      taskTitle: "Plan Task",
    });
    expect(hookCalls[0]?.taskId).toBeString();
  });

  test("fires task.archiving with task context", async () => {
    const localStorage = createMemoryStorage();
    const hookCalls: Array<Record<string, unknown>> = [];

    (globalThis as { window?: unknown }).window = {
      localStorage,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      api: {
        scripts: {
          runHook: async (args: Record<string, unknown>) => {
            hookCalls.push(args);
            return {
              ok: true,
              summary: {
                trigger: args.trigger,
                totalEntries: 0,
                executedEntries: 0,
                failures: [],
              },
            };
          },
        },
        provider: {
          cleanupTask: async () => ({ ok: true, message: "cleaned" }),
        },
      },
    };

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();

    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [
        { id: "ws-main", name: "Main", updatedAt: "2026-04-04T00:00:00.000Z" },
      ],
      activeWorkspaceId: "ws-main",
      activeTaskId: "task-1",
      projectPath: "/tmp/stave-project",
      workspacePathById: { "ws-main": "/tmp/stave-project" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
      tasks: [
        {
          id: "task-1",
          title: "Plan Task",
          provider: "codex",
          updatedAt: "2026-04-04T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: { "task-1": [] },
      promptDraftByTask: {},
      messageCountByTask: { "task-1": 0 },
      nativeSessionReadyByTask: {},
      providerSessionByTask: {},
      taskWorkspaceIdById: { "task-1": "ws-main" },
    });

    useAppStore.getState().archiveTask({ taskId: "task-1" });
    await Bun.sleep(0);

    expect(hookCalls).toHaveLength(1);
    expect(hookCalls[0]).toMatchObject({
      workspaceId: "ws-main",
      trigger: "task.archiving",
      projectPath: "/tmp/stave-project",
      workspacePath: "/tmp/stave-project",
      workspaceName: "Main",
      branch: "main",
      taskId: "task-1",
      taskTitle: "Plan Task",
    });
  });
});
