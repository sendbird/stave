import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { ProviderSteerTurnResponse } from "@/lib/providers/provider.types";

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

/**
 * A task with one live turn and one item waiting in the prompt queue, plus a
 * `steerTurn` that stays pending until the test decides how the provider
 * answered.
 */
async function setupTaskWithQueuedFollowUp() {
  const localStorage = createMemoryStorage();
  let streamListener: StreamListener | null = null;
  const startPushTurnCalls: Array<{ prompt?: string }> = [];
  let streamCounter = 0;
  let settleSteer: (value: ProviderSteerTurnResponse) => void = () => {};
  const pendingSteer = new Promise<ProviderSteerTurnResponse>((resolve) => {
    settleSteer = resolve;
  });

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
        steerTurn: () => pendingSteer,
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
      {
        id: "ws-a",
        name: "Default Workspace",
        updatedAt: "2026-07-20T00:00:00.000Z",
      },
    ],
    activeWorkspaceId: "ws-a",
    workspaceBranchById: { "ws-a": "main" },
    workspacePathById: { "ws-a": "/tmp/stave-project" },
    workspaceDefaultById: { "ws-a": true },
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

  await useAppStore.getState().sendUserMessage({
    taskId: "task-a",
    content: "queued follow-up",
  });
  const queuedTurn =
    useAppStore.getState().promptDraftByTask["task-a"]?.queuedTurns?.[0];
  expect(queuedTurn?.content).toBe("queued follow-up");

  const completeRunningTurn = () => {
    const listener = streamListener as StreamListener | null;
    listener?.({
      streamId: "stream-1",
      event: { type: "done" },
      sequence: 1,
      done: true,
      taskId: "task-a",
      workspaceId: "ws-a",
      providerId: "codex",
      turnId: "persisted-turn-1",
    });
  };

  return {
    useAppStore,
    startPushTurnCalls,
    completeRunningTurn,
    settleSteer,
    queuedTurnId: queuedTurn?.id ?? "",
  };
}

describe("queued turn draining around a steer that races turn completion", () => {
  test("runs the queued item once the rejected steer releases its reservation", async () => {
    const {
      useAppStore,
      startPushTurnCalls,
      completeRunningTurn,
      settleSteer,
      queuedTurnId,
    } = await setupTaskWithQueuedFollowUp();

    const steering = useAppStore.getState().sendUserMessage({
      taskId: "task-a",
      content: "queued follow-up",
      queuedTurnId,
      submitIntent: "steer",
    });
    await Bun.sleep(5);

    // The turn finishes while the provider is still deciding on the steer.
    // Draining skips the reserved item — correctly, since the provider may be
    // about to accept it — so completion alone starts nothing.
    completeRunningTurn();
    await Bun.sleep(5);
    expect(startPushTurnCalls).toHaveLength(1);

    // The provider says no: the item is a plain queued turn again, and the
    // only completion event it could have waited for has already gone by.
    settleSteer({
      ok: false,
      delivery: "rejected",
      message: "turn is no longer steerable",
    });
    await expect(steering).resolves.toMatchObject({
      status: "steer-unavailable",
    });
    await Bun.sleep(20);

    expect(startPushTurnCalls).toHaveLength(2);
    expect(startPushTurnCalls[1]?.prompt).toContain("queued follow-up");
    expect(
      useAppStore.getState().promptDraftByTask["task-a"]?.queuedTurns ?? [],
    ).toEqual([]);
  });
});
