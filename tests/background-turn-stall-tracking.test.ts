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

/**
 * Compress the multi-minute stall-mark / auto-abort-grace timers
 * (`PROVIDER_TURN_STALL_THRESHOLD_MS`, `PROVIDER_TURN_AUTO_ABORT_GRACE_MS` in
 * src/lib/providers/turn-status.ts) down to near-instant so these tests do not
 * need to wait 20 real minutes. Anything scheduled with a much shorter delay
 * (debounces, etc.) is left untouched. Callers restore `globalThis.setTimeout`.
 */
function installCompressedStallTimers() {
  const originalSetTimeout = globalThis.setTimeout;
  (globalThis as { setTimeout: typeof setTimeout }).setTimeout = ((
    fn: (...callbackArgs: unknown[]) => void,
    delay?: number,
    ...rest: unknown[]
  ) => {
    const compressed =
      typeof delay === "number" && delay >= 60_000 ? 30 : delay;
    return originalSetTimeout(fn as never, compressed, ...rest);
  }) as typeof setTimeout;
}

function stubTurnTeardown(args: {
  abortTurnCalls: Array<{ turnId: string }>;
  cleanupTaskCalls?: Array<{ taskId: string }>;
}) {
  const api = (
    globalThis as {
      window: { api: { provider: Record<string, unknown> } };
    }
  ).window.api;
  api.provider.abortTurn = async (target: { turnId: string }) => {
    args.abortTurnCalls.push(target);
    return { ok: true, message: "aborted" };
  };
  api.provider.cleanupTask = async (target: { taskId: string }) => {
    args.cleanupTaskCalls?.push(target);
    return { ok: true, message: "cleaned" };
  };
}

/**
 * Mark every waiting approval part as answered *without* going through
 * `respondToApproval`, mimicking the resolution paths that bypass the store:
 * a managed host answering for the agent, a runtime auto-decline, or a replay
 * that rewrites the message parts.
 */
function resolvePendingApprovalPartsOutsideStore(args: {
  useAppStore: {
    getState: () => {
      messagesByTask: Record<string, Array<{ parts: Array<{ type: string }> }>>;
    };
    setState: (patch: Record<string, unknown>) => void;
  };
}) {
  const { messagesByTask } = args.useAppStore.getState();
  args.useAppStore.setState({
    messagesByTask: {
      ...messagesByTask,
      "task-a": (messagesByTask["task-a"] ?? []).map((message) => ({
        ...message,
        parts: message.parts.map((part) =>
          part.type === "approval"
            ? { ...part, state: "approval-responded" }
            : part,
        ),
      })),
    },
  });
}

describe("background workspace turn activity tracking", () => {
  test("auto-aborts a background task turn that never resumes after the stall grace window", async () => {
    const originalSetTimeout = globalThis.setTimeout;
    const abortTurnCalls: Array<{ turnId: string }> = [];
    const cleanupTaskCalls: Array<{ taskId: string }> = [];

    installCompressedStallTimers();

    try {
      const { useAppStore, emit } = await setupBackgroundTurn();
      stubTurnTeardown({ abortTurnCalls, cleanupTaskCalls });

      await useAppStore.getState().switchWorkspace({ workspaceId: "ws-b" });
      // One more event to anchor `lastEventAt`, then go silent — the
      // compressed stall + auto-abort timers should fire on their own.
      emit({ type: "text", text: "still going" }, { sequence: 1, done: false });
      await Bun.sleep(20);
      const activeTurnIdBeforeSilence =
        useAppStore.getState().workspaceRuntimeCacheById["ws-a"]
          ?.activeTurnIdsByTask["task-a"];
      expect(activeTurnIdBeforeSilence).toBeString();

      // Stay silent through the compressed stall-mark (~30ms) and auto-abort
      // grace (~30ms) timers.
      await Bun.sleep(200);

      expect(abortTurnCalls).toEqual([{ turnId: activeTurnIdBeforeSilence }]);
      expect(cleanupTaskCalls).toEqual([{ taskId: "task-a" }]);
      const cached = useAppStore.getState().workspaceRuntimeCacheById["ws-a"];
      expect(cached?.activeTurnIdsByTask["task-a"]).toBeUndefined();
      expect(
        useAppStore.getState().providerTurnActivityByTask["task-a"],
      ).toBeUndefined();
      const notice = cached?.messagesByTask["task-a"]?.at(-1);
      expect(notice?.parts.some((part) => part.type === "system_event")).toBe(
        true,
      );
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  test("reclaims a silent turn whose prompt was resolved without clearing the interaction hint", async () => {
    // Regression: `providerTurnActivityByTask.pendingInteraction` exempts a turn
    // from the stall net, and it is only cleared when the user answers through
    // the store. A prompt resolved any other way (the managed host answering for
    // the agent, a runtime auto-decline, a replay rewriting the parts) left the
    // hint set forever, so a turn that then went silent had nothing left to
    // reclaim it and the task stayed "active" for good.
    const originalSetTimeout = globalThis.setTimeout;
    const abortTurnCalls: Array<{ turnId: string }> = [];
    installCompressedStallTimers();

    try {
      const { useAppStore, emit } = await setupBackgroundTurn();
      stubTurnTeardown({ abortTurnCalls });

      emit(
        {
          type: "approval",
          toolName: "bash",
          requestId: "req-1",
          description: "Run command",
        },
        { sequence: 1, done: false },
      );
      await Bun.sleep(20);
      const activeTurnId =
        useAppStore.getState().activeTurnIdsByTask["task-a"];
      expect(activeTurnId).toBeString();
      expect(
        useAppStore.getState().providerTurnActivityByTask["task-a"]
          ?.pendingInteraction,
      ).toBe("approval");

      // The prompt gets resolved behind the store's back: the transcript no
      // longer shows it waiting, but the cached hint still says it does.
      resolvePendingApprovalPartsOutsideStore({ useAppStore });
      expect(
        useAppStore.getState().providerTurnActivityByTask["task-a"]
          ?.pendingInteraction,
      ).toBe("approval");

      // Stay silent through the compressed stall-mark and auto-abort grace.
      await Bun.sleep(200);

      expect(abortTurnCalls).toEqual([{ turnId: activeTurnId }]);
      expect(
        useAppStore.getState().activeTurnIdsByTask["task-a"],
      ).toBeUndefined();
      expect(
        useAppStore.getState().providerTurnActivityByTask["task-a"],
      ).toBeUndefined();
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  test("never auto-aborts a silent turn whose approval is still unanswered", async () => {
    const originalSetTimeout = globalThis.setTimeout;
    const abortTurnCalls: Array<{ turnId: string }> = [];
    installCompressedStallTimers();

    try {
      const { useAppStore, emit } = await setupBackgroundTurn();
      stubTurnTeardown({ abortTurnCalls });

      emit(
        {
          type: "approval",
          toolName: "bash",
          requestId: "req-1",
          description: "Run command",
        },
        { sequence: 1, done: false },
      );
      await Bun.sleep(20);
      const activeTurnId =
        useAppStore.getState().activeTurnIdsByTask["task-a"];
      expect(activeTurnId).toBeString();

      // The user is simply still deciding — silence here is expected and must
      // never cost them the turn.
      await Bun.sleep(200);

      expect(abortTurnCalls).toEqual([]);
      expect(useAppStore.getState().activeTurnIdsByTask["task-a"]).toBe(
        activeTurnId,
      );
      expect(
        useAppStore.getState().providerTurnActivityByTask["task-a"]
          ?.pendingInteraction,
      ).toBe("approval");
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  test("keeps provider turn activity updating after the workspace is backgrounded", async () => {
    const { useAppStore, emit } = await setupBackgroundTurn();

    const activityAtStart =
      useAppStore.getState().providerTurnActivityByTask["task-a"];
    expect(activityAtStart).toBeDefined();

    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-b" });
    expect(useAppStore.getState().activeWorkspaceId).toBe("ws-b");

    await Bun.sleep(20);
    emit({ type: "text", text: "still streaming" }, { sequence: 1, done: false });
    // Outlast the 50 ms prose batching interval; liveness itself remains
    // arrival-driven, while the diagnostic timestamp follows the visual fold.
    await Bun.sleep(70);

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

  test("retains the finished turn's work so the activity panel can replay it", async () => {
    const { useAppStore, emit } = await setupBackgroundTurn();

    emit(
      {
        type: "tool",
        toolUseId: "tool-1",
        toolName: "Bash",
        input: JSON.stringify({ command: "bun test" }),
        state: "input-available",
      },
      { sequence: 1, done: false },
    );
    emit(
      {
        type: "tool_result",
        tool_use_id: "tool-1",
        output: "ok",
      },
      { sequence: 2, done: false },
    );
    await Bun.sleep(50);
    expect(
      useAppStore.getState().providerTurnActivityByTask["task-a"]
        ?.orderedWorkItemIds,
    ).toEqual(["tool-1"]);

    // `done` follows the tool events immediately. The synchronous lifecycle
    // flush must retain their final shape before it clears the live activity.
    emit(
      {
        type: "tool",
        toolUseId: "tool-2",
        toolName: "Read",
        input: JSON.stringify({ file_path: "README.md" }),
        state: "input-available",
      },
      { sequence: 3, done: false },
    );
    emit(
      { type: "tool_result", tool_use_id: "tool-2", output: "read" },
      { sequence: 4, done: false },
    );
    emit({ type: "done" }, { sequence: 5, done: true });
    await Bun.sleep(50);

    // The live entry still has to go: its presence is what Fleet, the tab
    // chips, and the attention projection read as "this task is working".
    expect(
      useAppStore.getState().providerTurnActivityByTask["task-a"],
    ).toBeUndefined();
    // The replay copy is taken from the turn's last frame, which is the only
    // one that still holds the work items.
    const retained =
      useAppStore.getState().retainedTurnActivityByTask["task-a"];
    expect(retained?.outcome).toBe("completed");
    expect(retained?.snapshot.orderedWorkItemIds).toEqual(["tool-1", "tool-2"]);
    expect(retained?.snapshot.completedAt).toBeNumber();
    expect(retained?.snapshot.workItemsById["tool-1"]?.status).toBe(
      "completed",
    );
    expect(retained?.snapshot.workItemsById["tool-2"]?.status).toBe(
      "completed",
    );
  });
});
