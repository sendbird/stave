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

type StreamListener = (payload: {
  streamId: string;
  event: unknown;
  sequence: number;
  done: boolean;
  taskId: string | null;
  workspaceId: string | null;
  providerId: "claude-code" | "codex";
  turnId: string | null;
}) => void;

async function setupBackgroundTurn() {
  const localStorage = createMemoryStorage();
  let streamListener: StreamListener | null = null;
  const startPushTurnCalls: Array<{ prompt?: string }> = [];
  let streamCounter = 0;

  (globalThis as { window?: unknown }).window = {
    localStorage,
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    api: {
      provider: {
        startPushTurn: async (request: { prompt?: string }) => {
          startPushTurnCalls.push(request);
          streamCounter += 1;
          return {
            ok: true,
            streamId: `stream-${streamCounter}`,
            turnId: `persisted-turn-${streamCounter}`,
          };
        },
        subscribeStreamEvents: (listener: StreamListener) => {
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
      persistence: {
        loadWorkspace: async () => ({
          ok: true,
          snapshot: {
            activeTaskId: "",
            tasks: [],
            messagesByTask: {},
            promptDraftByTask: {},
            providerSessionByTask: {},
          },
        }),
      },
      fs: {
        listFiles: async () => ({ ok: true, files: [] }),
      },
    },
  };

  const { useAppStore } = await import("../src/store/app.store");
  const initialState = useAppStore.getInitialState();

  useAppStore.setState({
    ...initialState,
    hasHydratedWorkspaces: true,
    projectPath: "/tmp/stave-project",
    projectName: "project",
    defaultBranch: "main",
    workspaces: [
      { id: "ws-a", name: "Default Workspace", updatedAt: "2026-07-20T00:00:00.000Z" },
      { id: "ws-b", name: "feature-b", updatedAt: "2026-07-20T00:00:01.000Z" },
    ],
    activeWorkspaceId: "ws-a",
    workspaceBranchById: { "ws-a": "main", "ws-b": "feature-b" },
    workspacePathById: {
      "ws-a": "/tmp/stave-project",
      "ws-b": "/tmp/stave-project/.stave/workspaces/feature-b",
    },
    workspaceDefaultById: { "ws-a": true, "ws-b": false },
    tasks: [
      {
        id: "task-a",
        title: "Task A",
        provider: "codex",
        updatedAt: "2026-07-20T00:00:00.000Z",
        unread: false,
        archivedAt: null,
      },
    ],
    activeTaskId: "task-a",
    draftProvider: "codex",
    messagesByTask: { "task-a": [] },
    activeTurnIdsByTask: {},
    nativeSessionReadyByTask: {},
    providerSessionByTask: {},
    taskWorkspaceIdById: { "task-a": "ws-a" },
  });

  void useAppStore.getState().sendUserMessage({
    taskId: "task-a",
    content: "first message",
  });
  await Bun.sleep(10);
  expect(startPushTurnCalls).toHaveLength(1);
  expect(
    useAppStore.getState().providerTurnActivityByTask["task-a"],
  ).toBeDefined();

  const emit = (event: unknown, options: { sequence: number; done: boolean }) => {
    const listener = streamListener as StreamListener | null;
    listener?.({
      streamId: "stream-1",
      event,
      sequence: options.sequence,
      done: options.done,
      taskId: "task-a",
      workspaceId: "ws-a",
      providerId: "codex",
      turnId: "persisted-turn-1",
    });
  };

  return { useAppStore, startPushTurnCalls, emit };
}

describe("background workspace turn activity tracking", () => {
  test("keeps provider turn activity updating after the workspace is backgrounded", async () => {
    const { useAppStore, emit } = await setupBackgroundTurn();

    const activityAtStart =
      useAppStore.getState().providerTurnActivityByTask["task-a"];
    expect(activityAtStart).toBeDefined();

    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-b" });
    expect(useAppStore.getState().activeWorkspaceId).toBe("ws-b");

    await Bun.sleep(20);
    emit({ type: "text", text: "still streaming" }, { sequence: 1, done: false });
    await Bun.sleep(50);

    const activityAfterEvent =
      useAppStore.getState().providerTurnActivityByTask["task-a"];
    expect(activityAfterEvent).toBeDefined();
    expect(activityAfterEvent!.lastEventAt).toBeGreaterThan(
      activityAtStart!.lastEventAt,
    );
  });

  test("clears activity on background completion and still auto-dispatches the queued turn", async () => {
    const { useAppStore, startPushTurnCalls, emit } = await setupBackgroundTurn();

    const queued = await useAppStore.getState().sendUserMessage({
      taskId: "task-a",
      content: "queued follow-up",
    });
    expect(queued).toMatchObject({ status: "queued" });

    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-b" });

    emit({ type: "text", text: "answer" }, { sequence: 1, done: false });
    emit({ type: "done" }, { sequence: 2, done: true });
    await Bun.sleep(50);

    expect(
      useAppStore.getState().providerTurnActivityByTask["task-a"]?.turnId,
    ).not.toBe("stale");
    // Completion of the first turn must clear its activity entry and hand it
    // to the auto-dispatched queued turn (a fresh entry for turn 2).
    expect(startPushTurnCalls).toHaveLength(2);
    const cached = useAppStore.getState().workspaceRuntimeCacheById["ws-a"];
    expect(cached?.promptDraftByTask["task-a"]?.queuedTurns).toBeUndefined();
    expect(cached?.activeTurnIdsByTask["task-a"]).toBeString();
  });
});
