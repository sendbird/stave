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

describe("task stream switching", () => {
  test("keeps streaming updates attached to the original task after selecting another task", async () => {
    const localStorage = createMemoryStorage();
    let streamListener: ((payload: {
      streamId: string;
      event: unknown;
      sequence: number;
      done: boolean;
      taskId: string | null;
      workspaceId: string | null;
      providerId: "claude-code" | "codex";
      turnId: string | null;
    }) => void) | null = null;

    (globalThis as { window?: unknown }).window = {
      localStorage,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      api: {
        provider: {
          startPushTurn: async () => ({
            ok: true,
            streamId: "stream-1",
            turnId: "persisted-turn-1",
          }),
          subscribeStreamEvents: (listener: typeof streamListener) => {
            streamListener = listener;
            return () => {
              if (streamListener === listener) {
                streamListener = null;
              }
            };
          },
          abortTurn: async () => ({ ok: true, message: "aborted" }),
          cleanupTask: async () => ({ ok: true, message: "cleaned" }),
        },
      },
    };

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();

    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [{ id: "ws-main", name: "Main", updatedAt: "2026-03-10T00:00:00.000Z" }],
      activeWorkspaceId: "ws-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: { "ws-main": "/tmp/stave-project" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
      tasks: [
        {
          id: "task-1",
          title: "Task 1",
          provider: "codex",
          updatedAt: "2026-03-10T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
        {
          id: "task-2",
          title: "Task 2",
          provider: "codex",
          updatedAt: "2026-03-10T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      activeTaskId: "task-1",
      draftProvider: "codex",
      messagesByTask: {
        "task-1": [],
        "task-2": [],
      },
      activeTurnIdsByTask: {},
      nativeSessionReadyByTask: {},
      providerSessionByTask: {},
    });

    useAppStore.getState().sendUserMessage({
      taskId: "task-1",
      content: "Keep streaming while I inspect another task.",
    });

    await Bun.sleep(0);

    const startedState = useAppStore.getState();
    expect(startedState.activeTurnIdsByTask["task-1"]).toBeString();
    expect(startedState.messagesByTask["task-1"]).toHaveLength(2);
    expect(streamListener).toBeFunction();

    useAppStore.getState().selectTask({ taskId: "task-2" });
    expect(useAppStore.getState().activeTaskId).toBe("task-2");

    streamListener?.({
      streamId: "stream-1",
      event: { type: "text", text: "Task 1 kept updating in the background." },
      sequence: 1,
      done: false,
      taskId: "task-1",
      workspaceId: "ws-main",
      providerId: "codex",
      turnId: "persisted-turn-1",
    });
    streamListener?.({
      streamId: "stream-1",
      event: { type: "done" },
      sequence: 2,
      done: true,
      taskId: "task-1",
      workspaceId: "ws-main",
      providerId: "codex",
      turnId: "persisted-turn-1",
    });

    await Bun.sleep(25);

    const nextState = useAppStore.getState();
    const taskOneMessages = nextState.messagesByTask["task-1"] ?? [];
    const taskOneAssistant = taskOneMessages.at(-1);

    expect(nextState.activeTaskId).toBe("task-2");
    expect(nextState.activeTurnIdsByTask["task-1"]).toBeUndefined();
    expect(nextState.messagesByTask["task-2"]).toEqual([]);
    expect(taskOneAssistant?.role).toBe("assistant");
    expect(taskOneAssistant?.content).toBe("Task 1 kept updating in the background.");
    expect(taskOneAssistant?.isStreaming).toBe(false);
  });
});
