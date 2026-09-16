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

const startedTurns: Array<{ cwd?: string; workspaceId?: string }> = [];

function installWindow() {
  startedTurns.length = 0;
  (globalThis as { window?: unknown }).window = {
    localStorage: createMemoryStorage(),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    api: {
      provider: {
        startPushTurn: async (args: { cwd?: string; workspaceId?: string }) => {
          startedTurns.push({ cwd: args.cwd, workspaceId: args.workspaceId });
          return { ok: true, streamId: "stream-1", turnId: "turn-1" };
        },
        subscribeStreamEvents: () => () => {},
        abortTurn: async () => ({ ok: true, message: "aborted" }),
        cleanupTask: async () => ({ ok: true, message: "cleaned" }),
      },
    },
  };
}

function buildTask(id: string) {
  return {
    id,
    title: id,
    provider: "codex" as const,
    updatedAt: "2026-09-01T00:00:00.000Z",
    unread: false,
    archivedAt: null,
  };
}

beforeEach(() => {
  installWindow();
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("task turn workspace folder guard", () => {
  test("blocks a send whose workspace folder cannot be resolved instead of running it elsewhere", async () => {
    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [
        {
          id: "ws-orphan",
          name: "Orphan",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
      ],
      activeWorkspaceId: "ws-orphan",
      projectPath: "/tmp/stave-project",
      // A non-default workspace with no recorded path: the project root is not
      // its worktree, so the turn has nowhere legitimate to run.
      workspacePathById: {},
      workspaceBranchById: { "ws-orphan": "feature" },
      workspaceDefaultById: { "ws-orphan": false },
      taskWorkspaceIdById: { "task-orphan": "ws-orphan" },
      tasks: [buildTask("task-orphan")],
      activeTaskId: "task-orphan",
      draftProvider: "codex",
      messagesByTask: { "task-orphan": [] },
      activeTurnIdsByTask: {},
      nativeSessionReadyByTask: {},
      providerSessionByTask: {},
    });

    const result = await useAppStore.getState().sendUserMessage({
      taskId: "task-orphan",
      content: "Run something in my workspace.",
    });

    expect(result).toEqual({
      status: "blocked",
      reason: "workspace-path-missing",
      message: expect.stringContaining(
        "workspace folder could not be resolved",
      ),
    });
    await Bun.sleep(5);
    expect(startedTurns).toEqual([]);
    expect(
      useAppStore.getState().activeTurnIdsByTask["task-orphan"],
    ).toBeUndefined();
  });

  test("sends the workspace worktree path as the turn cwd when it is known", async () => {
    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [
        {
          id: "ws-feature",
          name: "Feature",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
      ],
      activeWorkspaceId: "ws-feature",
      projectPath: "/tmp/stave-project",
      workspacePathById: {
        "ws-feature": "/tmp/stave-project/.stave/workspaces/feature",
      },
      workspaceBranchById: { "ws-feature": "feature" },
      workspaceDefaultById: { "ws-feature": false },
      taskWorkspaceIdById: { "task-feature": "ws-feature" },
      tasks: [buildTask("task-feature")],
      activeTaskId: "task-feature",
      draftProvider: "codex",
      messagesByTask: { "task-feature": [] },
      activeTurnIdsByTask: {},
      nativeSessionReadyByTask: {},
      providerSessionByTask: {},
    });

    const result = await useAppStore.getState().sendUserMessage({
      taskId: "task-feature",
      content: "Run something in my workspace.",
    });

    expect(result.status).toBe("started");
    await Bun.sleep(5);
    expect(startedTurns).toEqual([
      {
        cwd: "/tmp/stave-project/.stave/workspaces/feature",
        workspaceId: "ws-feature",
      },
    ]);
  });
});
