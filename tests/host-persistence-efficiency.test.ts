import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";

import {
  buildLargeTaskHistory,
  LARGE_TASK_DEFAULT_MESSAGE_COUNT,
} from "./fixtures/large-task-history";

// Persistence-efficiency guards for the host-service turn path.
//
// These are the Phase 0 guardrails of the persistence/memory plan
// (`.stave/context/plans/5c14270a_20260903T1335_final-execution-plan.md`).
// They pin three properties that the host runtime must hold on a task whose
// transcript is far larger than the resident window:
//
//   1. No code path on the turn hot path loads the whole transcript
//      (`loadAllTaskMessages`). Only export may do that.
//   2. Host-resident messages stay bounded by `MAX_LOADED_TASK_MESSAGES`.
//   3. Streaming N provider events does not perform N full-snapshot writes.
//
// Persistence is stubbed (better-sqlite3 cannot run under Bun) with an
// instrumented fake store that counts calls per method. The provider runtime is
// patched in place and restored, mirroring
// `tests/local-mcp-runtime-run-task.test.ts`, so no real turn spawns.

const WORKSPACE_ID = "ws-persistence-efficiency";
const TASK_ID = "task-persistence-efficiency";
const PROJECT_PATH = "/tmp/stave-persistence-efficiency/project";
const WORKSPACE_PATH = "/tmp/stave-persistence-efficiency/worktree";
const USER_DATA_PATH = "/tmp/stave-persistence-efficiency/user-data";

/** Mirrors `MAX_LOADED_TASK_MESSAGES` in `src/store/task-message-loading.ts`. */
const RESIDENT_MESSAGE_CAP = 400;
/** Mirrors `TASK_MESSAGES_PAGE_SIZE`. */
const PAGE_SIZE = 120;

const fullHistory = buildLargeTaskHistory({
  count: LARGE_TASK_DEFAULT_MESSAGE_COUNT,
  idPrefix: TASK_ID,
});

const storeCalls = new Map<string, number>();
function recordCall(method: string) {
  storeCalls.set(method, (storeCalls.get(method) ?? 0) + 1);
}
function callCount(method: string) {
  return storeCalls.get(method) ?? 0;
}

/** Durable message rows, keyed by task. Seeded with the large fixture. */
const persistedMessagesByTask = new Map<string, Array<{ id: string }>>([
  [TASK_ID, [...fullHistory] as Array<{ id: string }>],
]);
const persistedTurnsById = new Map<
  string,
  {
    id: string;
    workspaceId: string;
    taskId: string;
    providerId: string;
    createdAt: string;
    completedAt: string | null;
  }
>();
const persistedTurnEventsById = new Map<string, unknown[]>();
/** Every `upsertWorkspace` payload, so tests can measure write volume. */
const upsertPayloads: Array<{
  messagesByTask?: Record<string, Array<{ id: string }>>;
}> = [];

const persistedTaskRow = {
  id: TASK_ID,
  title: "Long running task",
  provider: "claude-code",
  updatedAt: "2026-01-01T00:00:00.000Z",
  unread: false,
  archivedAt: null,
  controlMode: "interactive",
  controlOwner: "stave",
};

const fakeStore = {
  loadProjectRegistry: () => {
    recordCall("loadProjectRegistry");
    return [
      {
        projectPath: PROJECT_PATH,
        projectName: "proj",
        lastOpenedAt: "2026-01-01T00:00:00.000Z",
        defaultBranch: "main",
        workspaces: [
          {
            id: WORKSPACE_ID,
            name: "efficiency",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        activeWorkspaceId: WORKSPACE_ID,
        workspaceBranchById: { [WORKSPACE_ID]: "efficiency" },
        workspacePathById: { [WORKSPACE_ID]: WORKSPACE_PATH },
        workspaceDefaultById: {},
      },
    ];
  },
  saveProjectRegistry: () => {
    recordCall("saveProjectRegistry");
  },
  listRunAggregatesByOrigin: () => [],
  loadWorkspaceSnapshot: () => {
    recordCall("loadWorkspaceSnapshot");
    return {
      activeTaskId: TASK_ID,
      tasks: [persistedTaskRow],
      messagesByTask: {
        [TASK_ID]: persistedMessagesByTask.get(TASK_ID) ?? [],
      },
      activeTurnIdsByTask: {},
    };
  },
  // The real shell carries counts, never message bodies.
  loadWorkspaceShell: () => {
    recordCall("loadWorkspaceShell");
    return {
      activeTaskId: TASK_ID,
      tasks: [persistedTaskRow],
      promptDraftByTask: {},
      providerSessionByTask: {},
      messageCountByTask: {
        [TASK_ID]: (persistedMessagesByTask.get(TASK_ID) ?? []).length,
      },
    };
  },
  loadAllTaskMessages: ({ taskId }: { taskId: string }) => {
    recordCall("loadAllTaskMessages");
    return persistedMessagesByTask.get(taskId) ?? [];
  },
  loadTaskMessagesPage: ({
    taskId,
    limit,
  }: {
    taskId: string;
    limit?: number;
  }) => {
    recordCall("loadTaskMessagesPage");
    const all = persistedMessagesByTask.get(taskId) ?? [];
    const effectiveLimit = limit ?? PAGE_SIZE;
    const messages = all.slice(Math.max(0, all.length - effectiveLimit));
    return {
      messages,
      totalCount: all.length,
      limit: effectiveLimit,
      offset: Math.max(0, all.length - messages.length),
      hasMoreOlder: messages.length < all.length,
    };
  },
  listWorkspaceTasks: () => {
    recordCall("listWorkspaceTasks");
    return [persistedTaskRow];
  },
  listActiveTurnsForWorkspace: () => {
    recordCall("listActiveTurnsForWorkspace");
    return [];
  },
  listTurns: ({ taskId, limit }: { taskId: string; limit?: number }) => {
    recordCall("listTurns");
    return [...persistedTurnsById.values()]
      .filter((turn) => turn.taskId === taskId)
      .reverse()
      .slice(0, limit ?? 5);
  },
  beginTurn: (turn: {
    id: string;
    workspaceId: string;
    taskId: string;
    providerId: string;
  }) => {
    recordCall("beginTurn");
    persistedTurnsById.set(turn.id, {
      ...turn,
      createdAt: new Date().toISOString(),
      completedAt: null,
    });
  },
  completeTurn: ({ id }: { id: string }) => {
    recordCall("completeTurn");
    const turn = persistedTurnsById.get(id);
    if (turn) {
      persistedTurnsById.set(id, {
        ...turn,
        completedAt: new Date().toISOString(),
      });
    }
  },
  saveStreamEvents: ({
    turnId,
    events,
  }: {
    turnId: string;
    events: unknown[];
  }) => {
    recordCall("saveStreamEvents");
    persistedTurnEventsById.set(turnId, [
      ...(persistedTurnEventsById.get(turnId) ?? []),
      ...events,
    ]);
  },
  getStreamEvents: ({ turnId }: { turnId: string }) => {
    recordCall("getStreamEvents");
    return persistedTurnEventsById.get(turnId) ?? [];
  },
  createNotification: ({ notification }: { notification: unknown }) => {
    recordCall("createNotification");
    return { inserted: true, notification };
  },
  loadRoutineProviderTimeoutMs: () => null,
  // Field-scoped turn write. Records the same shape the tests measure, so
  // write volume assertions cover both persistence routes.
  persistTaskTurnDelta: ({
    taskId,
    messages,
  }: {
    workspaceId: string;
    taskId: string;
    messages?: Array<{ id: string }>;
  }) => {
    recordCall("persistTaskTurnDelta");
    const changed = messages ?? [];
    upsertPayloads.push({ messagesByTask: { [taskId]: changed } });
    const existing = persistedMessagesByTask.get(taskId) ?? [];
    const byId = new Map(existing.map((item) => [item.id, item] as const));
    for (const message of changed) {
      byId.set(message.id, message);
    }
    persistedMessagesByTask.set(taskId, [...byId.values()]);
    return { ok: true, messageCount: byId.size };
  },
  upsertWorkspace: ({
    snapshot,
  }: {
    id: string;
    snapshot: { messagesByTask?: Record<string, Array<{ id: string }>> };
  }) => {
    recordCall("upsertWorkspace");
    upsertPayloads.push(snapshot);
    for (const [taskId, messages] of Object.entries(
      snapshot.messagesByTask ?? {},
    )) {
      const existing = persistedMessagesByTask.get(taskId) ?? [];
      const byId = new Map(existing.map((item) => [item.id, item] as const));
      for (const message of messages) {
        byId.set(message.id, message);
      }
      persistedMessagesByTask.set(taskId, [...byId.values()]);
    }
  },
};

mock.module("electron", () => ({
  app: { getPath: () => USER_DATA_PATH },
}));

mock.module("../electron/host-service/persistence", () => ({
  ensureHostServicePersistenceReady: () => fakeStore,
  resetHostServicePersistence: () => {},
  resolveHostServiceUserDataPath: () => USER_DATA_PATH,
}));

const { providerRuntime } = await import("../electron/providers/runtime");
const runtime = await import("../electron/host-service/local-mcp-runtime");

const originalStartTurnStream = providerRuntime.startTurnStream;
const startTurnStreamCalls: Array<{
  conversation?: { history?: unknown[] };
}> = [];
const startTurnStreamHandlers: Array<{
  onEvent?: (event: import("../electron/providers/types").BridgeEvent) => void;
}> = [];

beforeAll(() => {
  providerRuntime.startTurnStream = ((
    params: { conversation?: { history?: unknown[] } },
    handlers: {
      onEvent?: (
        event: import("../electron/providers/types").BridgeEvent,
      ) => void;
    },
  ) => {
    startTurnStreamCalls.push(params);
    startTurnStreamHandlers.push(handlers);
    return { ok: true, streamId: `stream-${startTurnStreamCalls.length}` };
  }) as typeof providerRuntime.startTurnStream;
});

afterAll(() => {
  providerRuntime.startTurnStream = originalStartTurnStream;
});

beforeEach(() => {
  storeCalls.clear();
  upsertPayloads.length = 0;
  startTurnStreamCalls.length = 0;
  startTurnStreamHandlers.length = 0;
  persistedMessagesByTask.set(TASK_ID, [...fullHistory] as Array<{
    id: string;
  }>);
  persistedTurnsById.clear();
  persistedTurnEventsById.clear();
});

afterEach(async () => {
  await runtime.cleanupLocalMcpRuntime();
});

async function drainMicrotasks(iterations = 50) {
  for (let attempt = 0; attempt < iterations; attempt += 1) {
    await Bun.sleep(0);
  }
}

describe("host-service turn path on a very large task", () => {
  test("a byte-bounded tail keeps originals durable and does not reload them per event", async () => {
    const history = buildLargeTaskHistory({
      count: 100,
      largePartEveryNth: 2,
      largePartBytes: 128 * 1024,
      idPrefix: TASK_ID,
    });
    persistedMessagesByTask.set(TASK_ID, history);
    await runtime.runTask({
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
      prompt: "Continue the large output task",
    });
    const historyCount =
      startTurnStreamCalls.at(-1)?.conversation?.history?.length ?? 0;
    expect(historyCount).toBeGreaterThan(0);
    expect(historyCount).toBeLessThan(100);
    storeCalls.clear();
    const handlers = startTurnStreamHandlers.at(-1);
    for (let index = 0; index < 30; index += 1)
      handlers?.onEvent?.({ type: "text", text: `update ${index}` });
    await drainMicrotasks(100);
    expect(callCount("loadTaskMessagesPage")).toBe(0);
    expect(callCount("loadAllTaskMessages")).toBe(0);
    const saved = persistedMessagesByTask.get(TASK_ID)!;
    for (const original of history)
      expect(saved.find((row) => row.id === original.id)).toEqual(original);
  });

  test("run_task does not load the entire transcript", async () => {
    await runtime.runTask({
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
      prompt: "Continue the long task",
    });

    expect(callCount("loadAllTaskMessages")).toBe(0);
  });

  test("run_task hands the provider a bounded history window", async () => {
    await runtime.runTask({
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
      prompt: "Continue the long task",
    });

    const conversation = startTurnStreamCalls.at(-1)?.conversation;
    const historyCount = conversation?.history?.length ?? 0;
    expect(historyCount).toBeGreaterThan(0);
    // +2 slack for any injected notice alongside the resident tail.
    expect(historyCount).toBeLessThanOrEqual(RESIDENT_MESSAGE_CAP + 2);
  });

  test("streaming provider events never loads the entire transcript", async () => {
    await runtime.runTask({
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
      prompt: "Continue the long task",
    });
    const handlers = startTurnStreamHandlers.at(-1);
    storeCalls.clear();

    for (let index = 0; index < 50; index += 1) {
      handlers?.onEvent?.({ type: "text", text: `chunk ${index}` });
    }
    await drainMicrotasks();

    expect(callCount("loadAllTaskMessages")).toBe(0);
  });

  test("streaming N events writes deltas, not the whole window each time", async () => {
    await runtime.runTask({
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
      prompt: "Continue the long task",
    });
    const handlers = startTurnStreamHandlers.at(-1);
    storeCalls.clear();
    upsertPayloads.length = 0;

    const eventCount = 200;
    for (let index = 0; index < eventCount; index += 1) {
      handlers?.onEvent?.({ type: "text", text: `chunk ${index}` });
    }
    await drainMicrotasks(200);

    // Write *volume* is the memory/IO property that matters and the one the
    // host controls on its own: each streamed event may still cause one write
    // (the renderer re-reads the durable page when it sees
    // `local-mcp.task-turn-updated`, so the write has to land first), but a
    // write must carry only the messages that event touched rather than
    // re-serializing the whole resident window.
    //
    // Coalescing the write *count* additionally requires coalescing those
    // emits, which would change per-event renderer sync semantics; that is
    // tracked separately in the plan rather than asserted here.
    const totalMessageRowsWritten = upsertPayloads.reduce(
      (total, snapshot) =>
        total +
        Object.values(snapshot.messagesByTask ?? {}).reduce(
          (sum, messages) => sum + messages.length,
          0,
        ),
      0,
    );
    expect(totalMessageRowsWritten).toBeGreaterThan(0);
    expect(totalMessageRowsWritten).toBeLessThanOrEqual(eventCount * 3);
  });

  test("streaming takes the field-scoped write, not a whole-workspace one", async () => {
    await runtime.runTask({
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
      prompt: "Continue the long task",
    });
    const handlers = startTurnStreamHandlers.at(-1);
    storeCalls.clear();

    for (let index = 0; index < 20; index += 1) {
      handlers?.onEvent?.({ type: "text", text: `chunk ${index}` });
    }
    await drainMicrotasks();

    expect(callCount("persistTaskTurnDelta")).toBeGreaterThan(0);
    // A whole-workspace snapshot write would rewrite renderer-owned fields
    // (drafts, tabs, layout, information) from the host's stale cached copy.
    expect(callCount("upsertWorkspace")).toBe(0);
    // And it would re-list every task in the workspace just to reconcile
    // archival; the delta path reads one task row instead.
    expect(callCount("listWorkspaceTasks")).toBe(0);
  });

  test("a persisted write never carries the whole transcript", async () => {
    await runtime.runTask({
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
      prompt: "Continue the long task",
    });
    const handlers = startTurnStreamHandlers.at(-1);
    handlers?.onEvent?.({ type: "text", text: "streamed" });
    await drainMicrotasks();

    const largestWrite = upsertPayloads.reduce((max, snapshot) => {
      const count = Object.values(snapshot.messagesByTask ?? {}).reduce(
        (total, messages) => total + messages.length,
        0,
      );
      return Math.max(max, count);
    }, 0);

    expect(largestWrite).toBeGreaterThan(0);
    expect(largestWrite).toBeLessThanOrEqual(RESIDENT_MESSAGE_CAP + 2);
  });
});
