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

describe("automation result navigation", () => {
  test("refreshes a host-created task from persistence before selecting it", async () => {
    const localStorage = createMemoryStorage();
    const task = {
      id: "automation-task-1",
      title: "Daily review · 2026-07-23, 09:00",
      provider: "codex" as const,
      updatedAt: "2026-07-23T00:00:00.000Z",
      unread: false,
      archivedAt: null,
      controlMode: "interactive" as const,
      controlOwner: "stave" as const,
    };
    const messages = [
      {
        id: "automation-user-1",
        role: "user" as const,
        model: "user",
        providerId: "user" as const,
        content: "Review the repository.",
        parts: [],
      },
      {
        id: "automation-assistant-1",
        role: "assistant" as const,
        model: "gpt-5.4",
        providerId: "codex" as const,
        content: "The automation completed successfully.",
        parts: [],
      },
    ];

    (globalThis as { window?: unknown }).window = {
      localStorage,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      api: {
        persistence: {
          listWorkspaces: async () => ({ ok: true, rows: [] }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          upsertWorkspace: async () => ({ ok: true }),
          loadWorkspaceShellForRestore: async () => ({
            ok: true,
            shell: {
              activeTaskId: task.id,
              tasks: [task],
              promptDraftByTask: {},
              providerSessionByTask: {},
              messageCountByTask: { [task.id]: messages.length },
            },
          }),
          loadTaskMessages: async () => ({
            ok: true,
            page: {
              messages,
              totalCount: messages.length,
              limit: 48,
              offset: 0,
              hasMoreOlder: false,
            },
          }),
        },
      },
    };

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      projectPath: "/tmp/automation-project",
      projectName: "automation-project",
      workspaces: [
        {
          id: "automation-workspace",
          name: "Main",
          updatedAt: "2026-07-23T00:00:00.000Z",
        },
      ],
      activeWorkspaceId: "automation-workspace",
      workspacePathById: {
        "automation-workspace": "/tmp/automation-project",
      },
      workspaceBranchById: { "automation-workspace": "main" },
      workspaceDefaultById: { "automation-workspace": true },
      tasks: [],
      activeTaskId: "",
      messagesByTask: {},
      messageCountByTask: {},
      taskWorkspaceIdById: {},
    });

    await useAppStore.getState().focusTaskAttention({
      taskId: task.id,
      workspaceId: "automation-workspace",
      projectPath: "/tmp/automation-project",
      refreshFromPersistence: true,
    });
    await Bun.sleep(25);

    const state = useAppStore.getState();
    expect(state.tasks).toContainEqual(
      expect.objectContaining({
        id: task.id,
        title: task.title,
        provider: task.provider,
        controlMode: "interactive",
        controlOwner: "stave",
      }),
    );
    expect(state.activeTaskId).toBe(task.id);
    expect(state.taskWorkspaceIdById[task.id]).toBe("automation-workspace");
    expect(state.messagesByTask[task.id]?.map((message) => message.content)).toEqual(
      messages.map((message) => message.content),
    );
  });

  test("refreshes the workspace list before focusing a host-created workspace", async () => {
    const localStorage = createMemoryStorage();
    let refreshCount = 0;
    let switchedWorkspaceId: string | null = null;
    (globalThis as { window?: unknown }).window = {
      localStorage,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      api: {
        persistence: {
          listWorkspaces: async () => ({ ok: true, rows: [] }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          upsertWorkspace: async () => ({ ok: true }),
        },
      },
    };

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    const currentWorkspace = {
      id: "automation-workspace",
      name: "Main",
      updatedAt: "2026-07-23T00:00:00.000Z",
    };
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      projectPath: "/tmp/automation-project",
      projectName: "automation-project",
      workspaces: [currentWorkspace],
      activeWorkspaceId: "automation-workspace",
      workspacePathById: {
        "automation-workspace": "/tmp/automation-project",
      },
      workspaceBranchById: { "automation-workspace": "main" },
      workspaceDefaultById: { "automation-workspace": true },
      tasks: [],
      activeTaskId: "",
      refreshWorkspaces: async () => {
        refreshCount += 1;
        useAppStore.setState((current) => ({
          workspaces: [
            ...current.workspaces,
            {
              id: "workspace-new",
              name: "Fix the connector",
              updatedAt: "2026-07-23T00:01:00.000Z",
            },
          ],
          workspacePathById: {
            ...current.workspacePathById,
            "workspace-new": "/tmp/automation-project/.stave/workspaces/new",
          },
        }));
      },
      switchWorkspace: async ({ workspaceId }) => {
        switchedWorkspaceId = workspaceId;
        useAppStore.setState({ activeWorkspaceId: workspaceId });
      },
    });

    await useAppStore.getState().focusTaskAttention({
      taskId: "task-new",
      workspaceId: "workspace-new",
      projectPath: "/tmp/automation-project",
    });

    expect(refreshCount).toBe(1);
    expect(switchedWorkspaceId).toBe("workspace-new");
    expect(useAppStore.getState().activeWorkspaceId).toBe("workspace-new");
  });
});
