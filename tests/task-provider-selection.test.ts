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

describe("task provider selection", () => {
  test("keeps an active turn running while model, effort, or provider selection changes", async () => {
    const cleanupCalls: string[] = [];
    (globalThis as { window?: unknown }).window = {
      localStorage: createMemoryStorage(),
      api: {
        provider: {
          cleanupTask: async ({ taskId }: { taskId: string }) => {
            cleanupCalls.push(taskId);
            return { ok: true, message: "cleaned" };
          },
        },
      },
    };

    const { useAppStore } = await import("../src/store/app.store");
    useAppStore.setState({
      ...useAppStore.getInitialState(),
      activeTaskId: "task-1",
      draftProvider: "codex",
      tasks: [
        {
          id: "task-1",
          title: "Task 1",
          provider: "codex",
          updatedAt: "2026-07-30T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      activeTurnIdsByTask: {
        "task-1": "turn-1",
      },
    });

    // The model/effort selector always re-selects its provider.
    useAppStore
      .getState()
      .setTaskProvider({ taskId: "task-1", provider: "codex" });
    useAppStore
      .getState()
      .setTaskProvider({ taskId: "task-1", provider: "claude-code" });

    const state = useAppStore.getState();
    expect(state.tasks[0]?.provider).toBe("claude-code");
    expect(state.activeTurnIdsByTask["task-1"]).toBe("turn-1");
    expect(cleanupCalls).toEqual([]);
  });

  test("still cleans idle runtime state when the provider actually changes", async () => {
    const cleanupCalls: string[] = [];
    (globalThis as { window?: unknown }).window = {
      localStorage: createMemoryStorage(),
      api: {
        provider: {
          cleanupTask: async ({ taskId }: { taskId: string }) => {
            cleanupCalls.push(taskId);
            return { ok: true, message: "cleaned" };
          },
        },
      },
    };

    const { useAppStore } = await import("../src/store/app.store");
    useAppStore.setState({
      ...useAppStore.getInitialState(),
      activeTaskId: "task-1",
      draftProvider: "codex",
      tasks: [
        {
          id: "task-1",
          title: "Task 1",
          provider: "codex",
          updatedAt: "2026-07-30T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      activeTurnIdsByTask: {},
    });

    useAppStore
      .getState()
      .setTaskProvider({ taskId: "task-1", provider: "claude-code" });

    expect(cleanupCalls).toEqual(["task-1"]);
  });
});
