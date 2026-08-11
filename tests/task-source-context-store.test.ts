import { afterEach, beforeEach, describe, expect, test } from "bun:test";

type UseAppStore = typeof import("../src/store/app.store").useAppStore;

const originalWindow = (globalThis as { window?: unknown }).window;
let useAppStore: UseAppStore;

beforeEach(async () => {
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
    },
    api: {},
  };
  ({ useAppStore } = await import("../src/store/app.store"));
  useAppStore.setState({
    ...useAppStore.getInitialState(),
    activeTaskId: "task-1",
    tasks: [
      {
        id: "task-1",
        title: "Task with context",
        provider: "codex",
        updatedAt: "2026-08-12T00:00:00.000Z",
        unread: false,
        sourceContexts: [
          {
            type: "retrieved_context",
            sourceId: "crane:ATL-1",
            title: "Crane ATL-1",
            content: "Issue context",
          },
          {
            type: "retrieved_context",
            sourceId: "pr:sendbird/stave#1",
            title: "PR #1",
            content: "Pull request context",
          },
        ],
      },
    ],
  });
});

afterEach(() => {
  useAppStore.setState(useAppStore.getInitialState());
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("task source context store actions", () => {
  test("clears every attached context in one persisted update", () => {
    useAppStore.getState().clearTaskSourceContexts({ taskId: "task-1" });

    expect(useAppStore.getState().tasks[0]?.sourceContexts).toEqual([]);
    expect(useAppStore.getState().workspaceSnapshotVersion).toBe(1);
  });

  test("does not persist a no-op clear", () => {
    useAppStore.getState().clearTaskSourceContexts({ taskId: "missing" });

    expect(useAppStore.getState().workspaceSnapshotVersion).toBe(0);
  });
});
