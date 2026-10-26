import {
  createTurnReceipt,
  observeTurnEvent,
  finishTurnReceipt,
  type TurnTerminalReceipt,
} from "../electron/persistence/turn-terminal-receipt";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { getTurnModelInfoLabel } from "@/lib/providers/turn-model-info";
import {
  buildDelegatedTaskPolicy,
  buildDelegatedTaskRunId,
  buildDelegatedTaskStepId,
} from "@/lib/runs/delegated-task";
import {
  createPendingRun,
  createPendingRunStep,
  RUN_LEDGER_SCHEMA_VERSION,
  type RunRecord,
  type RunStepRecord,
} from "@/lib/runs/run-domain";
import { DEFAULT_PROVIDER_TIMEOUT_MS } from "@/lib/providers/runtime-option-contract";
import {
  emptyHandoffRecord,
  STAVE_HANDOFF_RECORD_SOURCE_ID,
  type TaskHandoffRecord,
} from "@/lib/task-context/handoff-record";
import { buildProviderTurnPrompt } from "@/lib/providers/provider-request-translators";

// Regression: the host-service local MCP `runTask` builds a pending provider
// turn via `buildPendingProviderTurnState`, which requires `messageCountByTask`
// (added together with durable message ids). When the caller omitted that map
// the helper dereferenced `undefined[taskId]`, so every MCP-initiated turn
// crashed with "Cannot read properties of undefined (reading '<taskId>')".
//
// `electron/` is not part of the `tsc` typecheck graph, so this runtime test is
// the guard that `runTask` keeps forwarding the required map.
//
// Persistence is stubbed (better-sqlite3 cannot run under Bun). The provider
// runtime is NOT module-mocked — that would leak across test files — instead its
// `startTurnStream` is patched in place and restored, so no real turn spawns.

const WORKSPACE_ID = "ws-runtask-regression";
const DEFAULT_WORKSPACE_ID = "ws-runtask-default";
const RECONCILE_WORKSPACE_ID = "ws-runtask-reconcile";
const RELEASE_WORKSPACE_ID = "ws-runtask-release";
const RELEASE_TASK_ID = "task-runtask-release";
// A renderer-owned task whose transcript the host has never loaded.
const ASYNC_WORKSPACE_ID = "ws-runtask-async";
const ASYNC_TASK_ID = "task-runtask-async";
const ASYNC_REQUEST_ID = "codex-async:call_async_1";
const ASYNC_WORKSPACE_PATH = "/tmp/stave-runtask-regression/async";
const REPOSITORY_PATH = "/tmp/stave-runtask-regression/project";
const WORKSPACE_PATH = "/tmp/stave-runtask-regression/worktree";
const RECONCILE_WORKSPACE_PATH = "/tmp/stave-runtask-regression/reconcile";
const RELEASE_WORKSPACE_PATH = "/tmp/stave-runtask-regression/release";
const USER_DATA_PATH = "/tmp/stave-runtask-regression/user-data";

type PersistedTaskRow = {
  id: string;
  title: string;
  titleManuallySet?: boolean;
  provider: string;
  updatedAt: string;
  unread: boolean;
  archivedAt: string | null;
};

type PersistedTurn = {
  id: string;
  workspaceId: string;
  taskId: string;
  providerId: "claude-code" | "codex";
  createdAt: string;
  completedAt: string | null;
  terminalReceipt?: TurnTerminalReceipt;
};

const startTurnStreamCalls: unknown[] = [];
const startTurnStreamHandlers: Array<{
  onEvent?: (event: import("../electron/providers/types").BridgeEvent) => void;
}> = [];
const persistedWorkspaceInformationById = new Map<string, unknown>();
const persistedTasksByWorkspaceId = new Map<string, PersistedTaskRow[]>();
const persistedTurnsById = new Map<string, PersistedTurn>();
const persistedTurnEventsById = new Map<
  string,
  Array<{
    sequence: number;
    eventType: string;
    event: import("../electron/providers/types").BridgeEvent;
    truncated: false;
  }>
>();
const persistedNotifications: unknown[] = [];
const delegationAggregatesByOwnedTaskId = new Map<
  string,
  Array<{ run: RunRecord; step: RunStepRecord }>
>();
const rendererSelectedTaskByWorkspaceId = new Map<string, string>();
const persistedDeltaSelections: Array<{ taskId: string; activeTaskId?: string }> = [];
let persistedProviderTimeoutMs: number | null = null;
type UpsertedMessages = Record<string, Array<{ id: string; role?: string; content?: string }>>;
// Set by a test: the next write `when` matches throws, as a write the other
// process's commit invalidates does.
let failNextWrite: { message: string; when: (messagesByTask: UpsertedMessages) => boolean } | null = null;
// Opt-in, as the real store reads the `turns` table: a refreshed session keeps
// a workspace's running turns.
let reportActiveTurns = false;
const writesUserRowOf = (taskId: string) => (messagesByTask: UpsertedMessages) =>
  (messagesByTask[taskId] ?? []).some((message) => message.role === "user");
let persistedPermissionSettings: import("@/lib/runs/delegation-policy").DelegationPermissionSettings | null = null;
let persistedHandoffRecord: TaskHandoffRecord | null = null;
const lastUpsertSnapshotByWorkspaceId = new Map<
  string,
  {
    activeTaskId?: string;
    tasks?: Array<{ id: string; archivedAt?: string | null }>;
    messagesByTask?: Record<
      string,
      Array<{
        id: string;
        role?: string;
        model?: string;
        providerId?: string;
        modelInfo?: { effort: string; fastMode?: boolean };
      }>
    >;
    providerSessionByTask?: Record<string, import("@/lib/db/workspaces.db").TaskProviderSessionState>;
  }
>();

function loadFakeWorkspaceSnapshot(workspaceId: string) {
  if (workspaceId === ASYNC_WORKSPACE_ID) {
    return {
      activeTaskId: ASYNC_TASK_ID,
      tasks: [{ id: ASYNC_TASK_ID, title: "Codex task", provider: "codex", updatedAt: "2026-01-01T00:00:00.000Z", unread: false, archivedAt: null }],
      messagesByTask: { [ASYNC_TASK_ID]: [{
        id: `${ASYNC_TASK_ID}-m-1`, role: "assistant", model: "gpt-test", providerId: "codex", content: "", turnId: "turn-async-1",
        parts: [{ type: "user_input", delivery: "async", requestId: ASYNC_REQUEST_ID, toolName: "request_user_input_async",
          state: "input-requested", questions: [{ key: "question-0", question: "Which scope?", header: "", options: [] }] }],
      }] },
      activeTurnIdsByTask: {},
      workspaceInformation: persistedWorkspaceInformationById.get(workspaceId),
    };
  }
  return workspaceId === RELEASE_WORKSPACE_ID
    ? {
        activeTaskId: rendererSelectedTaskByWorkspaceId.get(workspaceId) ?? RELEASE_TASK_ID,
        tasks: [
          {
            id: RELEASE_TASK_ID,
            title: "Completed Crane task",
            provider: "codex",
            updatedAt: "2026-01-01T00:00:00.000Z",
            unread: false,
            archivedAt: null,
            controlMode: "managed",
            controlOwner: "stave",
          },
        ],
        messagesByTask: { [RELEASE_TASK_ID]: [] },
        activeTurnIdsByTask: {},
        workspaceInformation:
          persistedWorkspaceInformationById.get(workspaceId),
      }
    : {
        activeTaskId: rendererSelectedTaskByWorkspaceId.get(workspaceId) ?? "",
        tasks: [],
        messagesByTask: {},
        workspaceInformation:
          persistedWorkspaceInformationById.get(workspaceId),
      };
}

const fakeStore = {
  delegationPolicies: { loadSettings: () => persistedPermissionSettings, loadTaskAccounts: () => undefined },
  taskHandoffs: { read: () => persistedHandoffRecord ?? emptyHandoffRecord() },
  loadRepositoryRegistry: () => [
    {
      repositoryPath: REPOSITORY_PATH,
      repositoryName: "proj",
      lastOpenedAt: "2026-01-01T00:00:00.000Z",
      defaultBranch: "main",
      workspaces: [
        {
          id: DEFAULT_WORKSPACE_ID,
          name: "Default Workspace",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: WORKSPACE_ID,
          name: "feature",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: RECONCILE_WORKSPACE_ID,
          name: "reconcile",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: RELEASE_WORKSPACE_ID,
          name: "release",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: ASYNC_WORKSPACE_ID,
          name: "async",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      activeWorkspaceId: WORKSPACE_ID,
      workspaceBranchById: {
        [WORKSPACE_ID]: "feature",
        [RECONCILE_WORKSPACE_ID]: "reconcile",
        [RELEASE_WORKSPACE_ID]: "release",
        [ASYNC_WORKSPACE_ID]: "async",
      },
      workspacePathById: {
        [DEFAULT_WORKSPACE_ID]: REPOSITORY_PATH,
        [WORKSPACE_ID]: WORKSPACE_PATH,
        [RECONCILE_WORKSPACE_ID]: RECONCILE_WORKSPACE_PATH,
        [RELEASE_WORKSPACE_ID]: RELEASE_WORKSPACE_PATH,
        [ASYNC_WORKSPACE_ID]: ASYNC_WORKSPACE_PATH,
      },
      workspaceDefaultById: { [DEFAULT_WORKSPACE_ID]: true },
    },
  ],
  loadWorkspaceSnapshot: ({ workspaceId }: { workspaceId: string }) =>
    loadFakeWorkspaceSnapshot(workspaceId),
  // `runTask` injects delegated-task receipts into every managed turn. These tests
  // delegate nothing, so an empty ledger is the honest answer; without it the
  // runtime falls back and logs a read failure on each run.
  listRunAggregatesByOrigin: () => [],
  // The ledger rows that own a task, which is how a delegated child's request
  // is traced back to the task the person is working in.
  listRunAggregatesByOwnedTask: ({ taskId }: { taskId: string }) =>
    delegationAggregatesByOwnedTaskId.get(taskId) ?? [],
  loadWorkspaceShell: ({ workspaceId }: { workspaceId: string }) => {
    const snapshot = loadFakeWorkspaceSnapshot(workspaceId);
    return {
      ...snapshot,
      ...lastUpsertSnapshotByWorkspaceId.get(workspaceId),
      activeTaskId: rendererSelectedTaskByWorkspaceId.get(workspaceId) ??
        lastUpsertSnapshotByWorkspaceId.get(workspaceId)?.activeTaskId ?? snapshot.activeTaskId,
      workspaceInformation: snapshot.workspaceInformation,
      tasks: (lastUpsertSnapshotByWorkspaceId.get(workspaceId)?.tasks ?? snapshot.tasks).map((task) => ({
        ...task,
        archivedAt: persistedTasksByWorkspaceId.get(workspaceId)?.find((row) => row.id === task.id)?.archivedAt ?? task.archivedAt,
      })),
      promptDraftByTask: {},
      // What the last write stored, as the real store reloads it.
      providerSessionByTask: lastUpsertSnapshotByWorkspaceId.get(workspaceId)?.providerSessionByTask ?? {},
      messageCountByTask: Object.fromEntries(
        Object.entries(snapshot.messagesByTask).map(([taskId, messages]) => [
          taskId,
          messages.length,
        ]),
      ),
    };
  },
  loadAllTaskMessages: ({
    workspaceId,
    taskId,
  }: {
    workspaceId: string;
    taskId: string;
  }) =>
    lastUpsertSnapshotByWorkspaceId.get(workspaceId)?.messagesByTask?.[
      taskId
    ] ??
    loadFakeWorkspaceSnapshot(workspaceId).messagesByTask[taskId] ??
    [],
  loadTaskMessagesPage: ({
    workspaceId,
    taskId,
  }: {
    workspaceId: string;
    taskId: string;
  }) => {
    const messages =
      lastUpsertSnapshotByWorkspaceId.get(workspaceId)?.messagesByTask?.[
        taskId
      ] ??
      loadFakeWorkspaceSnapshot(workspaceId).messagesByTask[taskId] ??
      [];
    return {
      messages,
      totalCount: messages.length,
      limit: 120,
      offset: 0,
      hasMoreOlder: false,
    };
  },
  // Mirrors the real store's `tasks` table: the authoritative task lifecycle
  // (archived_at) written by the renderer. persistWorkspaceSession re-reads this
  // before writing so a stale host session cannot revive an archived task.
  listWorkspaceTasks: ({ workspaceId }: { workspaceId: string }) =>
    persistedTasksByWorkspaceId.get(workspaceId) ?? [],
  listActiveTurnsForWorkspace: ({ workspaceId }: { workspaceId: string }) => reportActiveTurns
    ? [...persistedTurnsById.values()].filter((turn) => turn.workspaceId === workspaceId && !turn.completedAt)
    : [],
  listTurns: ({
    workspaceId,
    taskId,
    limit,
    turnId,
  }: {
    workspaceId: string;
    taskId: string;
    limit?: number;
    turnId?: string;
  }) =>
    [...persistedTurnsById.values()]
      .filter(
        (turn) =>
          turn.workspaceId === workspaceId &&
          turn.taskId === taskId &&
          (!turnId || turn.id === turnId),
      )
      .reverse()
      .slice(0, limit ?? 5),
  getTurnReceipt: (id: string) => persistedTurnsById.get(id)?.terminalReceipt ?? null,
  beginTurn: (turn: Omit<PersistedTurn, "createdAt" | "completedAt">) => {
    persistedTurnsById.set(turn.id, {
      ...turn,
      createdAt: new Date().toISOString(),
      completedAt: null,
    });
  },
  completeTurn: ({ id }: { id: string }) => {
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
    events: Array<{
      sequence: number;
      event: import("../electron/providers/types").BridgeEvent;
    }>;
  }) => {
    const current = persistedTurnEventsById.get(turnId) ?? [];
    for (const entry of events) {
      if (current.some((item) => item.sequence === entry.sequence)) {
        continue;
      }
      current.push({
        ...entry,
        eventType: entry.event.type,
        truncated: false,
      });
    }
    persistedTurnEventsById.set(turnId, current);
  },
  getStreamEvents: ({ turnId }: { turnId: string }) =>
    persistedTurnEventsById.get(turnId) ?? [],
  createNotification: ({ notification }: { notification: unknown }) => {
    persistedNotifications.push(notification);
    return {
      inserted: true,
      notification,
    };
  },
  // This fake models the legacy inline-message payload (its
  // `loadWorkspaceSnapshot` returns `messagesByTask`), for which
  // `persistTaskTurnDelta` declines so the caller migrates via the
  // whole-snapshot write below.
  persistTaskTurnDelta: (args: { taskId: string; activeTaskId?: string }) => {
    persistedDeltaSelections.push(args);
    return { ok: false, messageCount: 0 };
  },
  loadAutomationProviderTimeoutMs: () => persistedProviderTimeoutMs,
  upsertWorkspace: ({
    id,
    snapshot,
  }: {
    id: string;
    snapshot: {
      activeTaskId?: string;
      workspaceInformation?: unknown;
      tasks?: Array<Partial<PersistedTaskRow> & { id: string }>;
      messagesByTask?: Record<
        string,
        Array<{
          id: string;
          role?: string;
          model?: string;
          providerId?: string;
          modelInfo?: { effort: string; fastMode?: boolean };
        }>
      >;
    };
  }) => {
    if (failNextWrite?.when((snapshot.messagesByTask ?? {}) as UpsertedMessages)) {
      const { message } = failNextWrite;
      failNextWrite = null;
      throw new Error(message);
    }
    if (snapshot.workspaceInformation) {
      persistedWorkspaceInformationById.set(id, snapshot.workspaceInformation);
    }
    if (Array.isArray(snapshot.tasks)) {
      persistedTasksByWorkspaceId.set(
        id,
        snapshot.tasks.map((task) => ({
          id: task.id,
          title: task.title ?? "",
          provider: task.provider ?? "claude-code",
          updatedAt: task.updatedAt ?? "2026-01-01T00:00:00.000Z",
          unread: Boolean(task.unread),
          archivedAt: task.archivedAt ?? null,
        })),
      );
    }
    lastUpsertSnapshotByWorkspaceId.set(id, snapshot);
  },
  saveRepositoryRegistry: () => {},
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
const originalAbortTurn = providerRuntime.abortTurn;
const originalCleanupTask = providerRuntime.cleanupTask;
const originalRespondApproval = providerRuntime.respondApproval;
const originalRespondUserInput = providerRuntime.respondUserInput;
const originalSteerTurn = providerRuntime.steerTurn;

beforeAll(() => {
  providerRuntime.startTurnStream = ((
    params: unknown,
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
  providerRuntime.abortTurn = originalAbortTurn;
  providerRuntime.cleanupTask = originalCleanupTask;
  providerRuntime.respondApproval = originalRespondApproval;
  providerRuntime.respondUserInput = originalRespondUserInput;
  providerRuntime.steerTurn = originalSteerTurn;
});

afterEach(() => {
  failNextWrite = null;
  reportActiveTurns = false;
  persistedProviderTimeoutMs = null;
  persistedPermissionSettings = null;
  persistedHandoffRecord = null;
  providerRuntime.abortTurn = originalAbortTurn;
  providerRuntime.cleanupTask = originalCleanupTask;
  providerRuntime.respondApproval = originalRespondApproval;
  providerRuntime.respondUserInput = originalRespondUserInput;
  providerRuntime.steerTurn = originalSteerTurn;
});

describe("local MCP runtime runTask", () => {
  test("creates a new task turn without crashing on messageCountByTask", async () => {
    const result = await runtime.runTask({
      workspaceId: WORKSPACE_ID,
      prompt: "Investigate the bug",
    });

    expect(result.workspaceId).toBe(WORKSPACE_ID);
    expect(result.taskId).toBeTruthy();
    expect(result.turnId).toBeTruthy();
    expect(startTurnStreamCalls).toHaveLength(1);
  });

  test("does not start a turn whose prompt row could not be saved", async () => {
    // Starting anyway left the prompt to a later full write, which stored it
    // below the reply the turn had already streamed.
    const { taskId } = await runtime.createIdleTask({ workspaceId: WORKSPACE_ID, title: "Prompt save", provider: "claude-code" });
    const startsBefore = startTurnStreamCalls.length;
    failNextWrite = { message: "database is locked", when: writesUserRowOf(taskId) };

    await expect(runtime.runTask({ workspaceId: WORKSPACE_ID, taskId, prompt: "Lead this" }))
      .rejects.toThrow("The prompt could not be saved, so the turn did not start: database is locked");
    expect(startTurnStreamCalls).toHaveLength(startsBefore);

    // Nothing of the failed turn stays behind: no active turn, no unsaved rows.
    const retried = await runtime.runTask({ workspaceId: WORKSPACE_ID, taskId, prompt: "Lead this" });
    expect(startTurnStreamCalls).toHaveLength(startsBefore + 1);
    const saved = lastUpsertSnapshotByWorkspaceId.get(WORKSPACE_ID)?.messagesByTask?.[taskId] ?? [];
    expect(saved.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(saved.every((message) => message.id.endsWith(retried.turnId))).toBe(true);
  });

  test("a prompt that could not be saved leaves another running turn's unsaved output in place", async () => {
    reportActiveTurns = true;
    const savedReply = (taskId: string) =>
      (lastUpsertSnapshotByWorkspaceId.get(WORKSPACE_ID)?.messagesByTask?.[taskId] as Array<{ role?: string; content?: string }> | undefined)
        ?.find((message) => message.role === "assistant")?.content;
    const until = async (done: () => boolean) => {
      for (let attempt = 0; attempt < 200 && !done(); attempt += 1) await Bun.sleep(1);
      expect(done()).toBe(true);
    };
    const running = await runtime.runTask({ workspaceId: WORKSPACE_ID, prompt: "Turn A" });
    const handler = startTurnStreamHandlers.at(-1);
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      // Turn A's output is in the host cache only: its write failed.
      failNextWrite = { message: "database is locked", when: (messages) =>
        (messages[running.taskId] ?? []).some((message) => message.role === "assistant" && message.content === "PREFIX") };
      handler?.onEvent?.({ type: "text", text: "PREFIX" });
      await until(() => failNextWrite === null);

      failNextWrite = { message: "database is locked", when: (messages) =>
        Object.values(messages).some((rows) => rows.some((message) => message.role === "user" && message.content === "Turn B")) };
      await expect(runtime.runTask({ workspaceId: WORKSPACE_ID, prompt: "Turn B" }))
        .rejects.toThrow("The prompt could not be saved");

      handler?.onEvent?.({ type: "text", text: "SUFFIX" });
      await until(() => savedReply(running.taskId)?.endsWith("SUFFIX") === true);
      expect(savedReply(running.taskId)).toBe("PREFIXSUFFIX");
    } finally {
      console.error = originalConsoleError;
    }
  });

  test("an accepted host steer persists the split before events emitted during acknowledgement", async () => {
    const result = await runtime.runTask({ workspaceId: WORKSPACE_ID, prompt: "Inspect the workspace", provider: "codex" });
    const handler = startTurnStreamHandlers.at(-1);
    let textPersisted: () => void = () => {};
    let donePersisted: () => void = () => {};
    const textReady = new Promise<void>((resolve) => { textPersisted = resolve; });
    const doneReady = new Promise<void>((resolve) => { donePersisted = resolve; });
    runtime.setLocalMcpEventListener((event) => {
      if (event.type !== "task-turn-updated" || event.payload.turnId !== result.turnId) return;
      if (event.payload.eventType === "text") textPersisted();
      if (event.payload.done) donePersisted();
    });
    providerRuntime.steerTurn = async () => {
      handler?.onEvent?.({ type: "tool", toolName: "Bash", toolUseId: "steer-tool", input: "bun test", state: "input-available" });
      handler?.onEvent?.({ type: "text", text: "Steered work", segmentId: "steer-after" });
      return { ok: true, delivery: "accepted" };
    };
    const request = { turnId: result.turnId, text: "Include the tests", enabled: true, clientMessageId: "host-steer-client" };
    expect(await runtime.steerTaskTurn(request)).toMatchObject({ ok: true, delivery: "accepted" });
    await textReady;
    const rows = lastUpsertSnapshotByWorkspaceId.get(WORKSPACE_ID)?.messagesByTask?.[result.taskId];
    expect(rows?.at(-1)).toMatchObject({ id: "host-steer-client-assistant", turnId: result.turnId, content: "Steered work", parts: expect.arrayContaining([expect.objectContaining({ type: "tool_use", toolUseId: "steer-tool" })]) });
    const beforeDuplicate = rows;
    await runtime.steerTaskTurn(request);
    expect(lastUpsertSnapshotByWorkspaceId.get(WORKSPACE_ID)?.messagesByTask?.[result.taskId]).toBe(beforeDuplicate);
    handler?.onEvent?.({ type: "done", stop_reason: "end_turn" });
    await doneReady;
    runtime.setLocalMcpEventListener(null);
    const { ChatMessageSchema } = await import("../src/lib/task-context/schemas");
    for (const row of lastUpsertSnapshotByWorkspaceId.get(WORKSPACE_ID)?.messagesByTask?.[result.taskId] ?? []) {
      expect(ChatMessageSchema.safeParse(row).success).toBe(true);
    }
    expect((await runtime.getTaskStatus({ workspaceId: WORKSPACE_ID, taskId: result.taskId })).latestTurnCompletedAt).toBeTruthy();
    expect(lastUpsertSnapshotByWorkspaceId.get(WORKSPACE_ID)?.messagesByTask?.[result.taskId]?.at(-1)).toMatchObject({ id: "host-steer-client-assistant", isStreaming: false, content: "Steered work" });
  }, 5000);

  test("a done event that fails to apply still releases the host steer route", async () => {
    const result = await runtime.runTask({ workspaceId: WORKSPACE_ID, prompt: "Fail while finishing", provider: "codex" });
    const handler = startTurnStreamHandlers.at(-1);
    const originalCompleteTurn = fakeStore.completeTurn;
    const originalConsoleError = console.error;
    let doneAttempted: () => void = () => {};
    const attempted = new Promise<void>((resolve) => { doneAttempted = resolve; });
    fakeStore.completeTurn = () => {
      doneAttempted();
      throw new Error("disk unavailable");
    };
    console.error = () => {};
    try {
      handler?.onEvent?.({ type: "done", stop_reason: "end_turn" });
      await attempted;
      await Bun.sleep(0);
    } finally {
      fakeStore.completeTurn = originalCompleteTurn;
      console.error = originalConsoleError;
    }
    let directSends = 0;
    providerRuntime.steerTurn = async () => {
      directSends += 1;
      return { ok: true, delivery: "accepted" };
    };
    const before = lastUpsertSnapshotByWorkspaceId.get(WORKSPACE_ID);
    await runtime.steerTaskTurn({ turnId: result.turnId, text: "Too late", enabled: true, clientMessageId: "late-steer-client" });
    expect(directSends).toBe(1);
    // A still-registered route would have persisted the steer into the transcript.
    expect(lastUpsertSnapshotByWorkspaceId.get(WORKSPACE_ID)).toBe(before);
  });

  test("delegated creation, start and completion preserve the parent's selected task", async () => {
    const result = await runtime.runTask({ workspaceId: RELEASE_WORKSPACE_ID, parentTaskId: RELEASE_TASK_ID,
      taskId: "child-foreground-regression", prompt: "Read the fixture", provider: "codex" });
    expect(lastUpsertSnapshotByWorkspaceId.get(RELEASE_WORKSPACE_ID)?.activeTaskId).toBe(RELEASE_TASK_ID);
    const handler = startTurnStreamHandlers.at(-1);
    handler?.onEvent?.({ type: "text", text: "Read the fixture" });
    handler?.onEvent?.({ type: "done" });
    for (let i = 0; i < 20 && !(await runtime.getTaskStatus({ workspaceId: RELEASE_WORKSPACE_ID, taskId: result.taskId })).latestTurnCompletedAt; i += 1) await Bun.sleep(0);
    expect((await runtime.getTaskStatus({ workspaceId: RELEASE_WORKSPACE_ID, taskId: result.taskId })).latestTurnCompletedAt).toBeTruthy();
    expect(lastUpsertSnapshotByWorkspaceId.get(RELEASE_WORKSPACE_ID)?.activeTaskId).toBe(RELEASE_TASK_ID);
    expect(persistedDeltaSelections.filter(delta => delta.taskId === result.taskId).every(delta => delta.activeTaskId === undefined)).toBe(true);
  });

  test("delegated progress retains a child the user explicitly opened and a later parent selection", async () => {
    const result = await runtime.runTask({ workspaceId: RELEASE_WORKSPACE_ID, parentTaskId: RELEASE_TASK_ID,
      taskId: "child-explicit-open-regression", prompt: "Read the fixture", provider: "codex" });
    const handler = startTurnStreamHandlers.at(-1);
    try {
      rendererSelectedTaskByWorkspaceId.set(RELEASE_WORKSPACE_ID, result.taskId);
      handler?.onEvent?.({ type: "text", text: "First output" });
      for (let i = 0; i < 20 && lastUpsertSnapshotByWorkspaceId.get(RELEASE_WORKSPACE_ID)?.activeTaskId !== result.taskId; i += 1) await Bun.sleep(0);
      expect(lastUpsertSnapshotByWorkspaceId.get(RELEASE_WORKSPACE_ID)?.activeTaskId).toBe(result.taskId);
      rendererSelectedTaskByWorkspaceId.set(RELEASE_WORKSPACE_ID, "");
      handler?.onEvent?.({ type: "text", text: "After closing all task tabs" });
      for (let i = 0; i < 20 && lastUpsertSnapshotByWorkspaceId.get(RELEASE_WORKSPACE_ID)?.activeTaskId !== ""; i += 1) await Bun.sleep(0);
      expect(lastUpsertSnapshotByWorkspaceId.get(RELEASE_WORKSPACE_ID)?.activeTaskId).toBe("");
      rendererSelectedTaskByWorkspaceId.set(RELEASE_WORKSPACE_ID, RELEASE_TASK_ID);
      handler?.onEvent?.({ type: "done" });
      for (let i = 0; i < 20 && !(await runtime.getTaskStatus({ workspaceId: RELEASE_WORKSPACE_ID, taskId: result.taskId })).latestTurnCompletedAt; i += 1) await Bun.sleep(0);
    expect((await runtime.getTaskStatus({ workspaceId: RELEASE_WORKSPACE_ID, taskId: result.taskId })).latestTurnCompletedAt).toBeTruthy();
      expect(lastUpsertSnapshotByWorkspaceId.get(RELEASE_WORKSPACE_ID)?.activeTaskId).toBe(RELEASE_TASK_ID);
    } finally { rendererSelectedTaskByWorkspaceId.delete(RELEASE_WORKSPACE_ID); }
  });



  test("supervised turns send frozen attachments and record them without persisting run context on the task", async () => {
    const { runSupervisedTurn } = await import("../electron/host-service/supervised-turn");
    for (const providerId of ["claude-code", "codex"] as const) {
      const initialContext = {
        fileContexts: [{ filePath: "brief.md", content: "Original brief", language: "markdown" }],
        imageContexts: [{ dataUrl: "data:image/png;base64,AA==", label: "mock", mimeType: "image/png" }],
        retrievedContextParts: [{ type: "retrieved_context" as const, sourceId: "task:frozen-reference", content: "Original answer" }],
      };
      const created = await runtime.runTask({ workspaceId: WORKSPACE_ID, prompt: "Create task", provider: providerId });
      startTurnStreamHandlers.at(-1)?.onEvent?.({ type: "text", text: "Completed." });
      startTurnStreamHandlers.at(-1)?.onEvent?.({ type: "done" });
      for (let i = 0; i < 20 && !persistedTurnsById.get(created.turnId)?.completedAt; i += 1) await Bun.sleep(0);
      expect((await runtime.getTaskStatus({ workspaceId: WORKSPACE_ID, taskId: created.taskId })).latestTurnCompletedAt).toBeTruthy();
      const result = await runSupervisedTurn({
        workspaceId: WORKSPACE_ID,
        taskId: created.taskId,
        prompt: "Implement the attached brief",
        fingerprint: { providerId, model: providerId === "codex" ? "gpt-5" : "sonnet" },
        initialContext,
      });
      const call = startTurnStreamCalls.at(-1) as { conversation: import("../src/lib/providers/provider.types").CanonicalConversationRequest };
      expect(call.conversation.contextParts).toContainEqual(initialContext.retrievedContextParts[0]);
      expect(call.conversation.contextParts).toContainEqual({ type: "image_context", ...initialContext.imageContexts[0] });
      expect(call.conversation.contextParts).toContainEqual({ type: "file_context", ...initialContext.fileContexts[0] });
      const snapshot = lastUpsertSnapshotByWorkspaceId.get(WORKSPACE_ID);
      const row = snapshot?.messagesByTask?.[result.taskId]?.findLast((message) => message.role === "user");
      const parsedRow = (await import("../src/lib/task-context/schemas")).ChatMessageSchema.safeParse(row);
      expect(parsedRow.success).toBe(true);
      expect(row).toMatchObject({ parts: expect.arrayContaining([
        { type: "image_context", ...initialContext.imageContexts[0] },
        { type: "file_context", ...initialContext.fileContexts[0] },
      ]) });
      expect(snapshot?.tasks?.find((task) => task.id === result.taskId)).not.toHaveProperty("sourceContexts");
      startTurnStreamHandlers.at(-1)?.onEvent?.({ type: "text", text: "Completed." });
      startTurnStreamHandlers.at(-1)?.onEvent?.({ type: "done" });
      for (let i = 0; i < 20 && !persistedTurnsById.get(result.turnId)?.completedAt; i += 1) await Bun.sleep(0);
      expect((await runtime.getTaskStatus({ workspaceId: WORKSPACE_ID, taskId: result.taskId })).latestTurnCompletedAt).toBeTruthy();
    }
  });

  test("records effort, Fast, and 1M on the pending assistant message", async () => {
    const result = await runtime.runTask({
      workspaceId: WORKSPACE_ID,
      prompt: "Investigate the bug",
      provider: "claude-code",
      runtimeOptions: {
        model: "claude-sonnet-5[1m]",
        claudeEffort: "xhigh",
        claudeFastMode: true,
      },
    });

    const assistant = lastUpsertSnapshotByWorkspaceId
      .get(WORKSPACE_ID)
      ?.messagesByTask?.[result.taskId]?.find(
        (message) => message.role === "assistant",
      );

    expect(assistant).toMatchObject({
      model: "claude-sonnet-5[1m]",
      providerId: "claude-code",
      modelInfo: { effort: "xhigh", fastMode: true },
    });
    expect(
      getTurnModelInfoLabel({
        providerId: "claude-code",
        model: assistant?.model ?? "",
        modelInfo: assistant?.modelInfo,
      }),
    ).toBe("Claude Sonnet 5 · 1M · X-High · Fast");
  });

  test("creates a delegated task with the ledger's pre-minted id", async () => {
    // The delegated-task coordinator claims the ledger row with a derived task id
    // before the task exists, then starts the first turn with that id. The
    // delegation path (parentTaskId set) must create the task under that
    // exact id instead of rejecting it as an unknown task.
    const premintedTaskId = "child-preminted-task-id";
    const result = await runtime.runTask({
      workspaceId: WORKSPACE_ID,
      taskId: premintedTaskId,
      parentTaskId: "parent-task-id",
      prompt: "Delegated child turn",
    });

    expect(result.taskId).toBe(premintedTaskId);
    expect(
      lastUpsertSnapshotByWorkspaceId
        .get(WORKSPACE_ID)
        ?.tasks?.find((task) => task.id === premintedTaskId)?.parentTaskId,
    ).toBe("parent-task-id");
  });

  test("still rejects an unknown taskId without a delegation link", async () => {
    await expect(
      runtime.runTask({
        workspaceId: WORKSPACE_ID,
        taskId: "no-such-task",
        prompt: "Continue a task that does not exist",
      }),
    ).rejects.toThrow("Task not found in this workspace: no-such-task");
  });

  test("preserves native Auto for an externally managed task", async () => {
    await runtime.runTask({
      workspaceId: WORKSPACE_ID,
      prompt: "Run this unattended",
      runtimeOptions: { claudePermissionMode: "auto" },
    });

    expect(startTurnStreamCalls.at(-1)).toMatchObject({
      runtimeOptions: {
        claudePermissionMode: "auto",
        providerTimeoutMs: DEFAULT_PROVIDER_TIMEOUT_MS,
      },
    });
  });

  test("raw managed calls fill omitted permission fields from target user settings", async () => {
    persistedPermissionSettings = { "claude-code": { claudePermissionMode: "auto" }, codex: { codexApprovalPolicy: "never", codexFileAccess: "workspace-write" } };
    for (const providerId of ["claude-code", "codex"] as const) {
      for (const runtimeOptions of [undefined, { model: "chosen-model" }]) {
        await runtime.runTask({ workspaceId: WORKSPACE_ID, provider: providerId, prompt: "Use configured user permissions", runtimeOptions });
        expect(startTurnStreamCalls.at(-1)).toMatchObject({ runtimeOptions: providerId === "claude-code" ? { claudePermissionMode: "auto", claudeAllowDangerouslySkipPermissions: false } : { codexApprovalPolicy: "never", codexFileAccess: "workspace-write" } });
      }
    }
  });

  test("explicit trusted managed options override synced user permission defaults", async () => {
    persistedPermissionSettings = { "claude-code": { claudePermissionMode: "default" }, codex: { codexApprovalPolicy: "untrusted", codexFileAccess: "read-only" } };
    await runtime.runTask({ workspaceId: WORKSPACE_ID, provider: "claude-code", prompt: "Use explicitly consented runtime options", runtimeOptions: { claudePermissionMode: "bypassPermissions", claudeAllowDangerouslySkipPermissions: true } });
    expect(startTurnStreamCalls.at(-1)).toMatchObject({ runtimeOptions: { claudePermissionMode: "bypassPermissions", claudeAllowDangerouslySkipPermissions: true } });
    await runtime.runTask({ workspaceId: WORKSPACE_ID, provider: "codex", prompt: "Use explicitly consented runtime options", runtimeOptions: { codexApprovalPolicy: "never", codexFileAccess: "workspace-write" } });
    expect(startTurnStreamCalls.at(-1)).toMatchObject({ runtimeOptions: { codexApprovalPolicy: "never", codexFileAccess: "workspace-write" } });
  });

  test("applies the Settings-synced provider timeout to a managed task", async () => {
    persistedProviderTimeoutMs = 86_400_000;
    await runtime.runTask({
      workspaceId: WORKSPACE_ID,
      prompt: "Run this with the Settings timeout",
    });

    expect(startTurnStreamCalls.at(-1)).toMatchObject({
      runtimeOptions: { providerTimeoutMs: 86_400_000 },
    });
  });

  test("keeps an explicit managed-task timeout over the Settings value", async () => {
    persistedProviderTimeoutMs = 86_400_000;
    await runtime.runTask({
      workspaceId: WORKSPACE_ID,
      prompt: "Run this with a caller timeout",
      runtimeOptions: { providerTimeoutMs: 3_600_000 },
    });

    expect(startTurnStreamCalls.at(-1)).toMatchObject({
      runtimeOptions: { providerTimeoutMs: 3_600_000 },
    });
  });

  test("leaves interactive task runtime options untouched", async () => {
    await runtime.runTask({
      workspaceId: WORKSPACE_ID,
      prompt: "Run this with me watching",
      controlMode: "interactive",
      controlOwner: "stave",
      runtimeOptions: { claudePermissionMode: "auto" },
    });

    expect(startTurnStreamCalls.at(-1)).toMatchObject({
      runtimeOptions: { claudePermissionMode: "auto" },
    });
  });

  test("signals renderer sync only after host task state is persisted", async () => {
    const updates: Array<{
      workspaceId: string;
      taskId: string;
      turnId: string;
      sequence: number;
      eventType: string;
      done: boolean;
      activityEvents?: Array<{ type: string }>;
    }> = [];
    runtime.setLocalMcpEventListener((event) => {
      if (event.type === "task-turn-updated") {
        updates.push(event.payload);
      }
    });

    try {
      const result = await runtime.runTask({
        workspaceId: WORKSPACE_ID,
        prompt: "Stream this task into its Stave window",
      });
      expect(updates).toMatchObject([
        {
          workspaceId: WORKSPACE_ID,
          taskId: result.taskId,
          turnId: result.turnId,
          sequence: 0,
          eventType: "started",
          done: false,
        },
      ]);

      startTurnStreamHandlers.at(-1)?.onEvent?.({
        type: "text",
        text: "Persisted provider response",
      });
      for (let attempt = 0; attempt < 20 && updates.length < 2; attempt += 1) {
        await Bun.sleep(0);
      }

      expect(updates.at(-1)).toMatchObject({
        workspaceId: WORKSPACE_ID,
        taskId: result.taskId,
        turnId: result.turnId,
        sequence: 1,
        eventType: "text",
        done: false,
      });

      startTurnStreamHandlers.at(-1)?.onEvent?.({
        type: "hook_activity",
        hookId: "hook-1",
        hookName: "lint",
        hookEvent: "PostToolUse",
        status: "running",
      });
      for (let attempt = 0; attempt < 20 && updates.length < 3; attempt += 1) {
        await Bun.sleep(0);
      }
      expect(updates.at(-1)).toMatchObject({
        sequence: 2,
        eventType: "hook_activity",
        activityEvents: [{ type: "hook_activity", status: "running" }],
      });
      expect(
        lastUpsertSnapshotByWorkspaceId
          .get(WORKSPACE_ID)
          ?.tasks?.some((task) => task.id === result.taskId),
      ).toBe(true);
    } finally {
      runtime.setLocalMcpEventListener(null);
    }
  });

  test("injects explicitly attached Information references into automation turns", async () => {
    await runtime.replaceWorkspaceNotes({
      workspaceId: WORKSPACE_ID,
      notes: "Treat the release branch as read-only.",
    });

    await runtime.runTask({
      workspaceId: WORKSPACE_ID,
      prompt: "Review the workspace",
      informationReferences: [
        {
          section: "notes",
          scope: "section",
          label: "Notes",
          token: "@info:notes",
        },
      ],
      controlMode: "interactive",
      controlOwner: "stave",
    });

    const call = startTurnStreamCalls.at(-1) as {
      conversation?: {
        contextParts?: Array<{
          type?: string;
          sourceId?: string;
          content?: string;
        }>;
      };
    };
    const informationPart = call.conversation?.contextParts?.find(
      (part) => part.sourceId === "stave:automation-information-references",
    );

    expect(informationPart?.content).toContain(
      "Treat the release branch as read-only.",
    );
  });

  test("starts locally approved Crane work as an interactive kickoff", async () => {
    const result = await runtime.runLocallyApprovedCraneKickoff({
      workspaceId: WORKSPACE_ID,
      prompt: "Work on the approved issue",
      retrievedContextParts: [
        {
          type: "retrieved_context",
          sourceId: "crane:CRANE-42",
          title: "Crane CRANE-42",
          content: "Untrusted remote issue context.",
        },
      ],
    });

    const snapshot = lastUpsertSnapshotByWorkspaceId.get(WORKSPACE_ID);
    const task = snapshot?.tasks?.find(
      (candidate) => candidate.id === result.taskId,
    ) as
      | {
          controlMode?: string;
          controlOwner?: string;
          sourceContexts?: Array<{
            sourceId?: string;
            content?: string;
          }>;
        }
      | undefined;
    expect(task?.controlMode).toBe("interactive");
    expect(task?.controlOwner).toBe("stave");
    expect(task?.sourceContexts).toEqual([
      {
        type: "retrieved_context",
        sourceId: "crane:CRANE-42",
        title: "Crane CRANE-42",
        content: "Untrusted remote issue context.",
      },
    ]);

    const call = startTurnStreamCalls.at(-1) as {
      conversation?: {
        contextParts?: Array<{ sourceId?: string; content?: string }>;
      };
    };
    expect(
      call.conversation?.contextParts?.find(
        (part) => part.sourceId === "crane:CRANE-42",
      )?.content,
    ).toBe("Untrusted remote issue context.");
  });

  test("a turn-scoped context reaches its own turn but is never saved on the task", async () => {
    const result = await runtime.runLocallyApprovedCraneKickoff({
      workspaceId: WORKSPACE_ID,
      prompt: "Work on the approved issue",
      retrievedContextParts: [
        {
          type: "retrieved_context",
          sourceId: "crane:CRANE-43",
          title: "Crane CRANE-43",
          content: "Durable issue context.",
        },
        {
          type: "retrieved_context",
          sourceId: "stave:agent-run",
          title: "Agent Run Stage",
          content: "A Stave run started this turn.",
        },
      ],
    });

    const snapshot = lastUpsertSnapshotByWorkspaceId.get(WORKSPACE_ID);
    const task = snapshot?.tasks?.find((candidate) => candidate.id === result.taskId) as
      | { sourceContexts?: Array<{ sourceId?: string }> }
      | undefined;
    expect(task?.sourceContexts?.map((part) => part.sourceId)).toEqual(["crane:CRANE-43"]);

    const call = startTurnStreamCalls.at(-1) as {
      conversation?: { contextParts?: Array<{ sourceId?: string }> };
    };
    const sent = call.conversation?.contextParts?.map((part) => part.sourceId) ?? [];
    expect(sent).toContain("crane:CRANE-43");
    expect(sent).toContain("stave:agent-run");
  });

  test("a host-started turn sends the task's handoff record ahead of the conversation", async () => {
    persistedHandoffRecord = {
      version: 1,
      revision: 1,
      updatedAt: "2026-01-02T00:00:00.000Z",
      sections: {
        decisions: { text: "- Keep the public API stable", updatedAt: "2026-01-02T00:00:00.000Z", updatedBy: "user" },
      },
    };
    await runtime.runTask({ workspaceId: WORKSPACE_ID, prompt: "Start on the search feature" });

    const call = startTurnStreamCalls.at(-1) as {
      conversation?: { contextParts?: Array<{ sourceId?: string; content?: string }> };
    };
    const record = call.conversation?.contextParts?.find((part) => part.sourceId === STAVE_HANDOFF_RECORD_SOURCE_ID);
    expect(record?.content).toContain("- Keep the public API stable");
  });

  test("a host-continued task's up-to-date session gets a saved revision of the record once", async () => {
    const section = (text: string) => ({ text, updatedAt: "2026-01-03T00:00:00.000Z", updatedBy: "user" as const });
    persistedHandoffRecord = { version: 1, revision: 1, updatedAt: "2026-01-03T00:00:00.000Z", sections: { goal: section("Ship the export") } };
    const finish = async (turnId: string) => {
      startTurnStreamHandlers.at(-1)?.onEvent?.({ type: "provider_session", providerId: "codex", nativeSessionId: "host-handoff-thread" });
      startTurnStreamHandlers.at(-1)?.onEvent?.({ type: "text", text: "Done." });
      startTurnStreamHandlers.at(-1)?.onEvent?.({ type: "done" });
      for (let i = 0; i < 20 && !persistedTurnsById.get(turnId)?.completedAt; i += 1) await Bun.sleep(0);
    };
    const lastPrompt = () => {
      const call = startTurnStreamCalls.at(-1) as { conversation: import("../src/lib/providers/provider.types").CanonicalConversationRequest };
      return buildProviderTurnPrompt({ providerId: "codex", prompt: "", conversation: call.conversation });
    };
    const created = await runtime.runTask({ workspaceId: WORKSPACE_ID, prompt: "Start the export", provider: "codex" });
    expect(lastPrompt().split("[Task Handoff Record]").length - 1).toBe(1);
    await finish(created.turnId);

    const second = await runtime.runTask({ workspaceId: WORKSPACE_ID, taskId: created.taskId, prompt: "Continue", provider: "codex" });
    expect(lastPrompt()).not.toContain("[Task Handoff Record]");
    await finish(second.turnId);

    persistedHandoffRecord = { version: 1, revision: 2, updatedAt: "2026-01-03T00:00:00.000Z", sections: { goal: section("Ship the export"), decisions: section("- Keep the public API stable") } };
    const third = await runtime.runTask({ workspaceId: WORKSPACE_ID, taskId: created.taskId, prompt: "Next step", provider: "codex" });
    const thirdPrompt = lastPrompt();
    expect(thirdPrompt.split("[Task Handoff Record]").length - 1).toBe(1);
    expect(thirdPrompt).toContain("- Keep the public API stable");
    expect(thirdPrompt).not.toContain("[Task Shared Context]");
    await finish(third.turnId);

    await runtime.runTask({ workspaceId: WORKSPACE_ID, taskId: created.taskId, prompt: "And then", provider: "codex" });
    expect(lastPrompt()).not.toContain("[Task Handoff Record]");
  });

  test("persists interactive host responses before provider continuation events", async () => {
    const result = await runtime.runLocallyApprovedCraneKickoff({
      workspaceId: WORKSPACE_ID,
      prompt: "Ask before continuing",
    });
    const handler = startTurnStreamHandlers.at(-1);
    handler?.onEvent?.({
      type: "user_input",
      toolName: "request_user_input",
      requestId: "interactive-input-1",
      questions: [
        {
          key: "scope",
          question: "Which scope should be used?",
          header: "Scope",
          options: [],
        },
      ],
    });

    let status = await runtime.getTaskStatus({
      workspaceId: WORKSPACE_ID,
      taskId: result.taskId,
      turnId: result.turnId,
    });
    for (
      let attempt = 0;
      attempt < 20 && status.pendingUserInputs.length === 0;
      attempt += 1
    ) {
      await Bun.sleep(0);
      status = await runtime.getTaskStatus({
        workspaceId: WORKSPACE_ID,
        taskId: result.taskId,
        turnId: result.turnId,
      });
    }
    expect(status.pendingUserInputs).toHaveLength(1);

    providerRuntime.respondUserInput = (async () => {
      handler?.onEvent?.({
        type: "approval",
        toolName: "Bash",
        requestId: "interactive-approval-1",
        description: "Run focused tests",
      });
      return { ok: true, message: "ok" };
    }) as typeof providerRuntime.respondUserInput;

    await runtime.respondUserInput({
      workspaceId: WORKSPACE_ID,
      taskId: result.taskId,
      requestId: "interactive-input-1",
      answers: { scope: "focused" },
    });

    for (
      let attempt = 0;
      attempt < 20 && status.pendingApprovals.length === 0;
      attempt += 1
    ) {
      await Bun.sleep(0);
      status = await runtime.getTaskStatus({
        workspaceId: WORKSPACE_ID,
        taskId: result.taskId,
        turnId: result.turnId,
      });
    }
    expect(status.pendingUserInputs).toEqual([]);
    expect(status.pendingApprovals).toHaveLength(1);

    providerRuntime.respondApproval = (async () => {
      handler?.onEvent?.({
        type: "text",
        text: "Continued after approval.",
      });
      return { ok: true, message: "ok" };
    }) as typeof providerRuntime.respondApproval;

    await runtime.respondApproval({
      workspaceId: WORKSPACE_ID,
      taskId: result.taskId,
      requestId: "interactive-approval-1",
      approved: true,
    });

    for (
      let attempt = 0;
      attempt < 20 &&
      status.latestAssistantText !== "Continued after approval.";
      attempt += 1
    ) {
      await Bun.sleep(0);
      status = await runtime.getTaskStatus({
        workspaceId: WORKSPACE_ID,
        taskId: result.taskId,
        turnId: result.turnId,
      });
    }
    expect(status.pendingUserInputs).toEqual([]);
    expect(status.pendingApprovals).toEqual([]);
    expect(status.latestAssistantText).toBe("Continued after approval.");
  });

  test("an async question answered over MCP is rejected instead of being dropped", async () => {
    let providerCalls = 0;
    providerRuntime.respondUserInput = (async () => {
      providerCalls += 1;
      return { ok: true, message: "ok" };
    }) as typeof providerRuntime.respondUserInput;
    await expect(runtime.respondUserInput({
      workspaceId: ASYNC_WORKSPACE_ID,
      taskId: ASYNC_TASK_ID,
      requestId: ASYNC_REQUEST_ID,
      answers: { "question-0": "Focused" },
    })).rejects.toThrow(/did not pause the task/);
    expect(providerCalls).toBe(0);
    const status = await runtime.getTaskStatus({ workspaceId: ASYNC_WORKSPACE_ID, taskId: ASYNC_TASK_ID });
    expect(status.pendingUserInputs.map((item) => item.requestId)).toEqual([ASYNC_REQUEST_ID]);
  });

  test("records a delivered async answer on a transcript the host has not loaded", async () => {
    let providerCalls = 0;
    providerRuntime.respondUserInput = (async () => {
      providerCalls += 1;
      return { ok: true, message: "ok" };
    }) as typeof providerRuntime.respondUserInput;
    await expect(runtime.respondUserInput({
      workspaceId: ASYNC_WORKSPACE_ID,
      taskId: ASYNC_TASK_ID,
      requestId: ASYNC_REQUEST_ID,
      answers: { "question-0": "Focused" },
      answerDelivered: true,
    })).resolves.toMatchObject({ ok: true, requestId: ASYNC_REQUEST_ID });
    // No provider request exists for an async question.
    expect(providerCalls).toBe(0);
    let status = await runtime.getTaskStatus({ workspaceId: ASYNC_WORKSPACE_ID, taskId: ASYNC_TASK_ID });
    for (let attempt = 0; attempt < 20 && status.pendingUserInputs.length > 0; attempt += 1) {
      await Bun.sleep(0);
      status = await runtime.getTaskStatus({ workspaceId: ASYNC_WORKSPACE_ID, taskId: ASYNC_TASK_ID });
    }
    expect(status.pendingUserInputs).toEqual([]);
  });

  test("publishes Stave-owned managed approval and user-input needs", async () => {
    const notificationOffset = persistedNotifications.length;
    const result = await runtime.runTask({
      workspaceId: WORKSPACE_ID,
      prompt: "Start a locally owned managed run",
      controlMode: "managed",
      controlOwner: "stave",
    });
    const handler = startTurnStreamHandlers.at(-1);
    handler?.onEvent?.({
      type: "approval",
      toolName: "Bash",
      requestId: "approval-local-1",
      description: "Run focused tests",
    });
    handler?.onEvent?.({
      type: "user_input",
      toolName: "request_user_input",
      requestId: "input-local-1",
      questions: [
        {
          key: "scope",
          question: "Which scope should be used?",
          header: "Scope",
          options: [],
        },
      ],
    });

    for (
      let attempt = 0;
      attempt < 20 && persistedNotifications.length < notificationOffset + 2;
      attempt += 1
    ) {
      await Bun.sleep(0);
    }

    expect(result.taskId).toBeTruthy();
    expect(persistedNotifications.slice(notificationOffset)).toMatchObject([
      {
        kind: "task.approval_requested",
        payload: {
          controlMode: "managed",
          controlOwner: "stave",
        },
      },
      {
        kind: "task.user_input_requested",
        payload: {
          controlMode: "managed",
          controlOwner: "stave",
          requestId: "input-local-1",
        },
      },
    ]);
  });

  test("does not publish Stave actions for externally managed requests", async () => {
    const notificationOffset = persistedNotifications.length;
    const result = await runtime.runTask({
      workspaceId: WORKSPACE_ID,
      prompt: "Start an externally owned managed run",
      controlMode: "managed",
      controlOwner: "external",
    });
    const handler = startTurnStreamHandlers.at(-1);
    handler?.onEvent?.({
      type: "approval",
      toolName: "Bash",
      requestId: "approval-external-1",
      description: "Run external command",
    });
    handler?.onEvent?.({
      type: "user_input",
      toolName: "request_user_input",
      requestId: "input-external-1",
      questions: [
        {
          key: "scope",
          question: "Which scope should be used?",
          header: "Scope",
          options: [],
        },
      ],
    });
    handler?.onEvent?.({ type: "done" });
    let status = await runtime.getTaskStatus({
      workspaceId: WORKSPACE_ID,
      taskId: result.taskId,
      turnId: result.turnId,
    });
    for (
      let attempt = 0;
      attempt < 20 && !status.latestTurnCompletedAt;
      attempt += 1
    ) {
      await Bun.sleep(0);
      status = await runtime.getTaskStatus({
        workspaceId: WORKSPACE_ID,
        taskId: result.taskId,
        turnId: result.turnId,
      });
    }

    expect(
      persistedNotifications
        .slice(notificationOffset)
        .filter((notification) => {
          const kind = (notification as { kind?: string }).kind;
          return (
            kind === "task.approval_requested" ||
            kind === "task.user_input_requested"
          );
        }),
    ).toEqual([]);
  });

  test("publishes a delegated child's approval and question once, attributed to the root task", async () => {
    // root (another worktree) → middle (delegated) → child (this request).
    const now = "2026-01-01T00:00:00.000Z";
    const runId = buildDelegatedTaskRunId({ parentTaskId: "delegation-root", delegationKey: "consult" });
    delegationAggregatesByOwnedTaskId.set("delegation-middle", [{
      run: createPendingRun({ id: runId, kind: "delegated-task", origin: { kind: "task", id: "delegation-root" },
        ownership: { repositoryPath: REPOSITORY_PATH, workspaceId: WORKSPACE_ID, taskId: "delegation-middle" },
        policy: buildDelegatedTaskPolicy("one-turn"),
        provenance: { createdBy: "delegated-task-coordinator", schemaVersion: RUN_LEDGER_SCHEMA_VERSION }, now }),
      step: createPendingRunStep({ id: buildDelegatedTaskStepId(runId), runId, kind: "delegated-task-turn",
        target: { taskId: "delegation-middle", workspaceId: WORKSPACE_ID, turnId: null, providerId: "codex" },
        dependencyIds: [], inputHash: "c".repeat(64), now }),
    }]);
    const previousRootRows = persistedTasksByWorkspaceId.get(RECONCILE_WORKSPACE_ID);
    persistedTasksByWorkspaceId.set(RECONCILE_WORKSPACE_ID, [{ id: "delegation-root", title: "Consult two models",
      provider: "codex", updatedAt: now, unread: false, archivedAt: null }]);
    try {
      const offset = persistedNotifications.length;
      const result = await runtime.runTask({ workspaceId: WORKSPACE_ID, parentTaskId: "delegation-middle",
        prompt: "Review the cache layer", provider: "claude-code" });
      const handler = startTurnStreamHandlers.at(-1);
      handler?.onEvent?.({ type: "approval", toolName: "Bash", requestId: "child-approval-1", description: "rg cache src" });
      handler?.onEvent?.({ type: "user_input", toolName: "AskUserQuestion", requestId: "child-input-1",
        questions: [{ key: "scope", question: "Which layer?", header: "Scope", options: [] }] });
      for (let attempt = 0; attempt < 40 && persistedNotifications.length < offset + 2; attempt += 1) {
        await Bun.sleep(0);
      }
      const root = { parentTaskId: "delegation-middle", ancestorTaskIds: ["delegation-middle", "delegation-root"],
        rootTaskId: "delegation-root", rootWorkspaceId: RECONCILE_WORKSPACE_ID,
        rootWorkspaceName: "reconcile", rootTaskTitle: "Consult two models", controlMode: "managed", controlOwner: "external" };
      // The child keeps the request identity; only the attribution names the root.
      const child = { repositoryPath: REPOSITORY_PATH, workspaceId: WORKSPACE_ID, taskId: result.taskId, turnId: result.turnId,
        title: "Consult two models", taskTitle: "Review the cache layer" };
      expect(persistedNotifications.slice(offset)).toMatchObject([
        { ...child, kind: "task.approval_requested", action: { type: "approval", requestId: "child-approval-1" },
          payload: root, dedupeKey: `task.approval_requested:${result.turnId}:child-approval-1` },
        { ...child, kind: "task.user_input_requested", payload: { ...root, requestId: "child-input-1" },
          dedupeKey: `task.user_input_requested:${result.turnId}:child-input-1` },
      ]);
      handler?.onEvent?.({ type: "done" });
    } finally {
      delegationAggregatesByOwnedTaskId.clear();
      if (previousRootRows) persistedTasksByWorkspaceId.set(RECONCILE_WORKSPACE_ID, previousRootRows);
      else persistedTasksByWorkspaceId.delete(RECONCILE_WORKSPACE_ID);
    }
  });

  test("persists terminal events and reports a targeted no-response failure", async () => {
    const result = await runtime.runTask({
      workspaceId: WORKSPACE_ID,
      prompt: "Start the approved managed run",
      controlMode: "managed",
      controlOwner: "stave",
    });
    const handler = startTurnStreamHandlers.at(-1);
    handler?.onEvent?.({
      type: "error",
      message: "Provider runtime timed out before responding.",
      recoverable: true,
    });
    handler?.onEvent?.({
      type: "done",
      stop_reason: "runtime_failure",
    });

    let status = await runtime.getTaskStatus({
      workspaceId: WORKSPACE_ID,
      taskId: result.taskId,
      turnId: result.turnId,
    });
    for (
      let attempt = 0;
      attempt < 20 && !status.latestTurnCompletedAt;
      attempt += 1
    ) {
      await Bun.sleep(0);
      status = await runtime.getTaskStatus({
        workspaceId: WORKSPACE_ID,
        taskId: result.taskId,
        turnId: result.turnId,
      });
    }

    expect(status.latestTurnId).toBe(result.turnId);
    expect(status.latestTurnCompletedAt).toBeTruthy();
    expect(status.latestTurnError).toBe(
      "Provider runtime timed out before responding.",
    );
    expect(
      persistedTurnEventsById
        .get(result.turnId)
        ?.map((entry) => entry.eventType),
    ).toEqual(["error", "done"]);
  });

  test("empty durable receipt publishes Fleet failure and matches task status", async () => {
    const offset = persistedNotifications.length;
    const result = await runtime.runTask({
      workspaceId: WORKSPACE_ID,
      prompt: "empty result",
    });
    const turn = persistedTurnsById.get(result.turnId)!;
    turn.terminalReceipt = finishTurnReceipt(
      observeTurnEvent(createTurnReceipt(), { type: "done" }),
      new Date().toISOString(),
    );
    startTurnStreamHandlers.at(-1)?.onEvent?.({ type: "done" });
    for (
      let attempt = 0;
      attempt < 30 && persistedNotifications.length === offset;
      attempt += 1
    )
      await Bun.sleep(0);
    expect(persistedNotifications.slice(offset)).toMatchObject([
      { kind: "task.turn_failed", turnId: result.turnId },
    ]);
    const status = await runtime.getTaskStatus({
      workspaceId: WORKSPACE_ID,
      taskId: result.taskId,
    });
    expect(status.latestTurnOutcome).toBe("failed");
    expect(status.latestTurnError).toBe(
      "Provider turn ended without a response.",
    );
  });

  test("releases completed locally managed task control", async () => {
    const result = await runtime.releaseLocallyManagedTaskControl({
      workspaceId: RELEASE_WORKSPACE_ID,
      taskId: RELEASE_TASK_ID,
      sourceContexts: [
        {
          type: "retrieved_context",
          sourceId: "crane:ATL-1",
          title: "Crane ATL-1",
          content: "Recovered from the local Crane binding.",
        },
      ],
    });

    expect(result.released).toBe(true);
    const task = lastUpsertSnapshotByWorkspaceId
      .get(RELEASE_WORKSPACE_ID)
      ?.tasks?.find((candidate) => candidate.id === RELEASE_TASK_ID) as
      | {
          controlMode?: string;
          controlOwner?: string;
          sourceContexts?: unknown[];
        }
      | undefined;
    expect(task).toMatchObject({
      controlMode: "interactive",
      controlOwner: "stave",
      sourceContexts: [
        {
          type: "retrieved_context",
          sourceId: "crane:ATL-1",
          title: "Crane ATL-1",
          content: "Recovered from the local Crane binding.",
        },
      ],
    });
  });

  test("takeover invalidates a concurrently prepared delegated follow-up", async () => {
    const first = await runtime.runTask({ workspaceId: WORKSPACE_ID, parentTaskId: "parent-control-race", taskId: "child-control-race", prompt: "Delegated first turn" });
    startTurnStreamHandlers.at(-1)?.onEvent?.({ type: "done" });
    await Bun.sleep(0);
    const startsBefore = startTurnStreamCalls.length;
    const followUp = runtime.runTask({ workspaceId: WORKSPACE_ID, parentTaskId: "parent-control-race", taskId: first.taskId, prompt: "Late controller follow-up" });
    const takeover = runtime.takeOverManagedTaskControl({ workspaceId: WORKSPACE_ID, taskId: first.taskId });
    const results = await Promise.allSettled([followUp, takeover]);
    expect(results[0]!.status).toBe("rejected");
    expect(results[1]!.status).toBe("fulfilled");
    expect(startTurnStreamCalls.length).toBe(startsBefore);
    await expect(runtime.runTask({ workspaceId: WORKSPACE_ID, parentTaskId: "parent-control-race", taskId: first.taskId, prompt: "Attempt to reclaim after takeover" })).rejects.toThrow("cannot reclaim");
  });

  test("takeover settles the delegated supervisor only after task release and keeps the start gate held", async () => {
    const first = await runtime.runTask({ workspaceId: WORKSPACE_ID, parentTaskId: "parent-finalize", taskId: "child-finalize", prompt: "Wait for user takeover." });
    startTurnStreamHandlers.at(-1)?.onEvent?.({ type: "done" }); await Bun.sleep(0);
    let settled = false;
    const result = await runtime.takeOverManagedTaskControl({ workspaceId: WORKSPACE_ID, taskId: first.taskId }, async () => {
      expect(lastUpsertSnapshotByWorkspaceId.get(WORKSPACE_ID)?.tasks?.find(task => task.id === first.taskId)?.controlMode).toBe("interactive");
      await expect(runtime.runTask({ workspaceId: WORKSPACE_ID, parentTaskId: "parent-finalize", taskId: first.taskId, prompt: "Late continuation" })).rejects.toThrow();
      settled = true;
    });
    expect(result.released).toBe(true); expect(settled).toBe(true);
    let cancelled = false;
    await expect(runtime.takeOverManagedTaskControl({ workspaceId: "missing-workspace", taskId: "missing-task" }, async () => { cancelled = true; })).rejects.toThrow();
    expect(cancelled).toBe(false);
  });

  test("competing user and controller approval responses deliver exactly once", async () => {
    const first = await runtime.runTask({ workspaceId: WORKSPACE_ID, prompt: "Wait for a decision" });
    const handler = startTurnStreamHandlers.at(-1);
    handler?.onEvent?.({ type: "approval", requestId: "approval-race", toolName: "Bash", description: "Run check" });
    for (let i = 0; i < 20; i += 1) {
      const status = await runtime.getTaskStatus({ workspaceId: WORKSPACE_ID, taskId: first.taskId });
      if (status.pendingApprovals.length) break;
      await Bun.sleep(0);
    }
    let delivered = 0;
    providerRuntime.respondApproval = (async () => { delivered += 1; return { ok: true, message: "ok" }; }) as typeof providerRuntime.respondApproval;
    const request = { workspaceId: WORKSPACE_ID, taskId: first.taskId, requestId: "approval-race" };
    const results = await Promise.allSettled([runtime.respondApproval({ ...request, approved: true }), runtime.respondApproval({ ...request, approved: false })]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(delivered).toBe(1);
    handler?.onEvent?.({ type: "done" });
  });

  test("the host records who answered each approval: a person, or the Stave rule that did", async () => {
    const first = await runtime.runTask({ workspaceId: WORKSPACE_ID, prompt: "Wait for two decisions" });
    const handler = startTurnStreamHandlers.at(-1);
    handler?.onEvent?.({ type: "approval", requestId: "approval-person", toolName: "Bash", description: "Run check" });
    handler?.onEvent?.({ type: "approval", requestId: "approval-rule", toolName: "Bash", description: "Remove build" });
    for (let i = 0; i < 20; i += 1) {
      const status = await runtime.getTaskStatus({ workspaceId: WORKSPACE_ID, taskId: first.taskId });
      if (status.pendingApprovals.length === 2) break;
      await Bun.sleep(0);
    }
    providerRuntime.respondApproval = (async () => ({ ok: true, message: "ok" })) as typeof providerRuntime.respondApproval;
    const request = { workspaceId: WORKSPACE_ID, taskId: first.taskId };
    await runtime.respondApproval({ ...request, requestId: "approval-person", approved: true });
    await runtime.respondApproval({ ...request, requestId: "approval-rule", approved: false, decidedBy: { source: "rule", reason: "timeout" } });
    const parts = (lastUpsertSnapshotByWorkspaceId.get(WORKSPACE_ID)?.messagesByTask?.[first.taskId] ?? [])
      .flatMap((message) => (message as { parts?: Array<{ type: string }> }).parts ?? [])
      .filter((part) => part.type === "approval");
    expect(parts).toEqual([
      expect.objectContaining({ requestId: "approval-person", state: "approval-responded", resolution: expect.objectContaining({ decision: "allowed", source: "user", scope: "once" }) }),
      expect.objectContaining({ requestId: "approval-rule", state: "output-denied", resolution: expect.objectContaining({ decision: "denied", source: "rule", reason: "timeout" }) }),
    ]);
    handler?.onEvent?.({ type: "done" });
  });

  test("takes over an inactive externally managed task through host ownership", async () => {
    const result = await runtime.runTask({
      workspaceId: WORKSPACE_ID,
      prompt: "Run under external management",
      controlMode: "managed",
      controlOwner: "external",
    });
    const handler = startTurnStreamHandlers.at(-1);
    handler?.onEvent?.({ type: "done" });
    await Bun.sleep(0);

    const takenOver = await runtime.takeOverManagedTaskControl({
      workspaceId: WORKSPACE_ID,
      taskId: result.taskId,
    });

    expect(takenOver.released).toBe(true);
    const task = lastUpsertSnapshotByWorkspaceId
      .get(WORKSPACE_ID)
      ?.tasks?.find((candidate) => candidate.id === result.taskId) as
      | {
          controlMode?: string;
          controlOwner?: string;
        }
      | undefined;
    expect(task).toMatchObject({
      controlMode: "interactive",
      controlOwner: "stave",
    });
  });

  test("stops an active approval turn before taking over host ownership", async () => {
    const abortedTurnIds: string[] = [];
    const cleanedTaskIds: string[] = [];
    providerRuntime.abortTurn = (({ turnId }) => {
      abortedTurnIds.push(turnId);
      return { ok: true, message: "aborted" };
    }) as typeof providerRuntime.abortTurn;
    providerRuntime.cleanupTask = (({ taskId }) => {
      cleanedTaskIds.push(taskId);
      return { ok: true, message: "cleaned" };
    }) as typeof providerRuntime.cleanupTask;

    const result = await runtime.runTask({
      workspaceId: WORKSPACE_ID,
      prompt: "Wait for approval under external management",
      controlMode: "managed",
      controlOwner: "external",
    });
    const handler = startTurnStreamHandlers.at(-1);
    handler?.onEvent?.({
      type: "approval",
      toolName: "Bash",
      requestId: "approval-takeover-1",
      description: "Run focused tests",
    });

    let status = await runtime.getTaskStatus({
      workspaceId: WORKSPACE_ID,
      taskId: result.taskId,
      turnId: result.turnId,
    });
    for (
      let attempt = 0;
      attempt < 20 && status.pendingApprovals.length === 0;
      attempt += 1
    ) {
      await Bun.sleep(0);
      status = await runtime.getTaskStatus({
        workspaceId: WORKSPACE_ID,
        taskId: result.taskId,
        turnId: result.turnId,
      });
    }

    const takenOver = await runtime.takeOverManagedTaskControl({
      workspaceId: WORKSPACE_ID,
      taskId: result.taskId,
    });
    status = await runtime.getTaskStatus({
      workspaceId: WORKSPACE_ID,
      taskId: result.taskId,
      turnId: result.turnId,
    });

    expect(takenOver.released).toBe(true);
    expect(abortedTurnIds).toEqual([result.turnId]);
    expect(cleanedTaskIds).toEqual([result.taskId]);
    expect(status.activeTurnId).toBeNull();
    expect(status.latestTurnCompletedAt).toBeTruthy();
    expect(status.latestTurnError).toBe(
      "Managed run stopped from Stave before completion.",
    );
    expect(status.pendingApprovals).toEqual([]);
    const task = lastUpsertSnapshotByWorkspaceId
      .get(WORKSPACE_ID)
      ?.tasks?.find((candidate) => candidate.id === result.taskId) as
      | {
          controlMode?: string;
          controlOwner?: string;
        }
      | undefined;
    expect(task).toMatchObject({
      controlMode: "interactive",
      controlOwner: "stave",
    });
  });

  test("refreshes attached Information values persisted by the renderer", async () => {
    const current = await runtime.getWorkspaceInformation({
      workspaceId: WORKSPACE_ID,
    });
    persistedWorkspaceInformationById.set(WORKSPACE_ID, {
      ...current.workspaceInformation,
      notes: "Use the renderer's newest persisted instructions.",
    });

    await runtime.runTask({
      workspaceId: WORKSPACE_ID,
      prompt: "Review the workspace again",
      informationReferences: [
        {
          section: "notes",
          scope: "section",
          label: "Notes",
          token: "@info:notes",
        },
      ],
    });

    const call = startTurnStreamCalls.at(-1) as {
      conversation?: {
        contextParts?: Array<{
          sourceId?: string;
          content?: string;
        }>;
      };
    };
    const informationPart = call.conversation?.contextParts?.find(
      (part) => part.sourceId === "stave:automation-information-references",
    );
    expect(informationPart?.content).toContain(
      "Use the renderer's newest persisted instructions.",
    );
  });
});

describe("local MCP runtime Information panel auto-fill and dedup", () => {
  test("Information mutation persists before publishing its update", async () => {
    const observed: Array<{ workspaceId: string; notes: string; persistedNotes: string | undefined }> = [];
    runtime.setLocalMcpEventListener((event) => {
      if (event.type !== "workspace-information-updated") return;
      observed.push({
        workspaceId: event.payload.workspaceId,
        notes: event.payload.workspaceInformation.notes,
        persistedNotes: (persistedWorkspaceInformationById.get(event.payload.workspaceId) as { notes?: string } | undefined)?.notes,
      });
    });
    try {
      const result = await runtime.replaceWorkspaceNotes({
        workspaceId: WORKSPACE_ID,
        notes: "Persist before notifying",
      });
      expect(result.workspaceInformation.notes).toBe(
        "Persist before notifying",
      );
      expect(observed.at(-1)).toEqual({
        workspaceId: WORKSPACE_ID,
        notes: "Persist before notifying",
        persistedNotes: "Persist before notifying",
      });
    } finally {
      runtime.setLocalMcpEventListener(null);
    }
  });

  test("runTask auto-registers resources detected in the prompt", async () => {
    const result = await runtime.runTask({
      workspaceId: WORKSPACE_ID,
      prompt:
        "Fix https://acme.atlassian.net/browse/ABC-123 and review https://github.com/sendbird/stave/pull/27",
    });
    expect(result.workspaceId).toBe(WORKSPACE_ID);

    const info = await runtime.getWorkspaceInformation({
      workspaceId: WORKSPACE_ID,
    });
    expect(
      info.workspaceInformation.jiraIssues.map((issue) => issue.issueKey),
    ).toContain("ABC-123");
    expect(
      info.workspaceInformation.linkedPullRequests.map((pr) => pr.url),
    ).toContain("https://github.com/sendbird/stave/pull/27");
  });

  test("runTask skips prompt resource auto-fill for the default workspace", async () => {
    const result = await runtime.runTask({
      workspaceId: DEFAULT_WORKSPACE_ID,
      prompt:
        "Review https://acme.atlassian.net/browse/DEFAULT-1 and https://github.com/sendbird/stave/pull/99",
    });
    expect(result.workspaceId).toBe(DEFAULT_WORKSPACE_ID);

    const info = await runtime.getWorkspaceInformation({
      workspaceId: DEFAULT_WORKSPACE_ID,
    });
    expect(info.workspaceInformation.jiraIssues).toHaveLength(0);
    expect(info.workspaceInformation.linkedPullRequests).toHaveLength(0);
  });

  test("addWorkspaceJiraIssue dedupes by issue key across URL variants", async () => {
    const first = await runtime.addWorkspaceJiraIssue({
      workspaceId: WORKSPACE_ID,
      url: "https://acme.atlassian.net/browse/XYZ-9",
    });
    expect(first.deduplicated).toBe(false);

    const second = await runtime.addWorkspaceJiraIssue({
      workspaceId: WORKSPACE_ID,
      url: "https://acme.atlassian.net/browse/XYZ-9?focusedCommentId=1",
      status: "In Progress",
    });
    expect(second.deduplicated).toBe(true);

    const matches = second.workspaceInformation.jiraIssues.filter(
      (issue) => issue.issueKey === "XYZ-9",
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]?.status).toBe("In Progress");
    expect(matches[0]?.id).toBe(first.added.id);
  });

  // Crane issue keys (`TFE-94`) are shaped exactly like Jira keys, so agents
  // routinely file a Crane task link through the Jira tool. It must land in the
  // Crane section instead, leaving the Jira section to the product's own issue.
  test("addWorkspaceJiraIssue reroutes a Crane task URL to the Crane section", async () => {
    const craneUrl =
      "https://atelier.delight-tools.ai/apps/crane/w/FRONTEND/task/TFE-94";
    const result = await runtime.addWorkspaceJiraIssue({
      workspaceId: WORKSPACE_ID,
      url: craneUrl,
      title: "Hide region information",
    });

    expect(result.reroutedTo).toBe("crane");
    expect(
      result.workspaceInformation.jiraIssues.map((issue) => issue.url),
    ).not.toContain(craneUrl);
    const crane = (result.workspaceInformation.craneIssues ?? []).find(
      (issue) => issue.url === craneUrl,
    );
    expect(crane?.issueKey).toBe("TFE-94");

    // The generic resource tool takes the same guard.
    const generic = await runtime.addWorkspaceResource({
      workspaceId: WORKSPACE_ID,
      kind: "jira",
      url: `${craneUrl}?from=list`,
      status: "in_review",
    });
    expect(generic.kind).toBe("crane");
    expect(generic.reroutedFrom).toBe("jira");
    expect(generic.deduplicated).toBe(true);
    expect(
      (generic.workspaceInformation.craneIssues ?? []).filter(
        (issue) => issue.issueKey === "TFE-94",
      ),
    ).toHaveLength(1);
  });

  test("a real Jira issue still lands in the Jira section", async () => {
    const result = await runtime.addWorkspaceJiraIssue({
      workspaceId: WORKSPACE_ID,
      url: "https://acme.atlassian.net/browse/DESK-4821",
    });
    expect(result.reroutedTo).toBeUndefined();
    expect(
      result.workspaceInformation.jiraIssues.map((issue) => issue.issueKey),
    ).toContain("DESK-4821");
  });
});

describe("local MCP runtime archived-task persistence", () => {
  test("a host snapshot write keeps a renderer rename and manual-name protection", async () => {
    const created = await runtime.runTask({ workspaceId: RECONCILE_WORKSPACE_ID, prompt: "Investigate task naming", title: "New Task" });
    const persisted = lastUpsertSnapshotByWorkspaceId.get(RECONCILE_WORKSPACE_ID)!;
    lastUpsertSnapshotByWorkspaceId.set(RECONCILE_WORKSPACE_ID, {
      ...persisted,
      tasks: persisted.tasks?.map((task) => task.id === created.taskId
        ? { ...task, title: "My chosen name", titleManuallySet: true }
        : task),
    });
    await runtime.replaceWorkspaceNotes({ workspaceId: RECONCILE_WORKSPACE_ID, notes: "A later host write" });
    expect(lastUpsertSnapshotByWorkspaceId.get(RECONCILE_WORKSPACE_ID)?.tasks?.find((task) => task.id === created.taskId)).toMatchObject({ title: "My chosen name", titleManuallySet: true });
  });

  test("host persist does not revive a task the renderer archived", async () => {
    // 1. The host creates + caches a live task and persists it.
    const created = await runtime.runTask({
      workspaceId: RECONCILE_WORKSPACE_ID,
      prompt: "Investigate the archive bug",
    });
    const taskId = created.taskId;
    expect(
      persistedTasksByWorkspaceId
        .get(RECONCILE_WORKSPACE_ID)
        ?.find((task) => task.id === taskId)?.archivedAt,
    ).toBeNull();

    // 2. The renderer archives that task out-of-band. The host's in-memory
    //    session cache still holds it as live (this is the bug's precondition).
    const archivedAt = "2026-07-25T00:00:00.000Z";
    persistedTasksByWorkspaceId.set(
      RECONCILE_WORKSPACE_ID,
      (persistedTasksByWorkspaceId.get(RECONCILE_WORKSPACE_ID) ?? []).map(
        (task) => (task.id === taskId ? { ...task, archivedAt } : task),
      ),
    );

    // 3. A later host-side workspace write re-persists the stale cached session.
    await runtime.replaceWorkspaceNotes({
      workspaceId: RECONCILE_WORKSPACE_ID,
      notes: "later host-side write",
    });

    // The re-persisted snapshot must keep the task archived, not revive it.
    const lastSnapshot = lastUpsertSnapshotByWorkspaceId.get(
      RECONCILE_WORKSPACE_ID,
    );
    const persistedTask = lastSnapshot?.tasks?.find(
      (task) => task.id === taskId,
    );
    expect(persistedTask?.archivedAt).toBe(archivedAt);
  });
});

describe("local MCP project memory curation", () => {
  test("search and same-id curation stay scoped to the workspace project", async () => {
    const { Database } = await import("bun:sqlite");
    const { RepositoryMemoryStore } = await import("../electron/persistence/repository-memory-store");
    const store = new RepositoryMemoryStore(new Database(":memory:"));
    for (const repositoryPath of [REPOSITORY_PATH, "/tmp/other-project"]) {
      store.settings.save({ repositoryPath, expectedRevision: 0, patch: { collectAutomatically: true } });
    }
    const methods = {
      rememberRepositoryMemory: store.remember.bind(store),
      updateRepositoryMemory: store.update.bind(store),
      getRepositoryMemory: store.get.bind(store),
      searchRepositoryMemories: store.search.bind(store),
      deleteRepositoryMemory: (id: string) => store.softDelete({ id }),
    };
    Object.assign(fakeStore, methods);
    try {
      const first = await runtime.rememberRepositoryMemory({ workspaceId: WORKSPACE_ID, kind: "decision", content: "Terminal snapshots use stable keys." });
      const revised = await runtime.rememberRepositoryMemory({ workspaceId: WORKSPACE_ID, memoryId: first.memory!.id, kind: "decision", content: "Terminal snapshots use shared slot keys.", recallMode: "core" });
      expect(revised.outcome).toBe("updated");
      expect(revised.memory?.id).toBe(first.memory!.id);
      expect(revised.memory?.recallMode).toBe("core");
      const page = await runtime.listRepositoryMemories({ workspaceId: WORKSPACE_ID, query: "terminal" });
      expect(page.memories).toHaveLength(1);
      expect(page.nextOffset).toBeNull();
      const foreign = store.remember({
        repositoryPath: "/tmp/other-project",
        kind: "fact",
        content: "Foreign memory.",
        confidence: 0.9,
      })!;
      await expect(
        runtime.rememberRepositoryMemory({
          workspaceId: WORKSPACE_ID,
          memoryId: foreign.memory.id,
          kind: "fact",
          content: "Overwrite attempt.",
        }),
      ).rejects.toThrow(/not found/);
      expect(store.get(foreign.memory.id)?.content).toBe("Foreign memory.");
      await runtime.forgetRepositoryMemory({
        workspaceId: WORKSPACE_ID,
        memoryId: first.memory!.id,
      });
      expect(
        (await runtime.listRepositoryMemories({ workspaceId: WORKSPACE_ID }))
          .memories,
      ).toEqual([]);
    } finally {
      for (const key of Object.keys(methods)) Reflect.deleteProperty(fakeStore, key);
    }
  });
});

describe("local MCP runtime runTask: an Agent run's account-pool switch", () => {
  test("starts a new conversation on the account switched to; that account's ordinary turns resume its stored one", async () => {
    const { runSupervisedTurn } = await import("../electron/host-service/supervised-turn");
    const ACCOUNT = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
    const lastCall = () => startTurnStreamCalls.at(-1) as {
      freshSession?: boolean;
      conversation: import("../src/lib/providers/provider.types").CanonicalConversationRequest;
    };
    const finish = async (turnId: string, nativeSessionId?: string) => {
      const handler = startTurnStreamHandlers.at(-1);
      if (nativeSessionId) handler?.onEvent?.({ type: "provider_session", providerId: "claude-code", accountProfileId: ACCOUNT, nativeSessionId });
      handler?.onEvent?.({ type: "done" });
      for (let i = 0; i < 20 && !persistedTurnsById.get(turnId)?.completedAt; i += 1) await Bun.sleep(0);
      expect(persistedTurnsById.get(turnId)?.completedAt).toBeTruthy();
    };
    // The account's first turn on the task stores that account's conversation.
    const created = await runtime.runTask({ workspaceId: WORKSPACE_ID, prompt: "Start the export", provider: "claude-code",
      runtimeOptions: { claudeAccountProfileId: ACCOUNT } });
    expect(lastCall().conversation.resume).toBeUndefined();
    await finish(created.turnId, "session-account-old");
    const turn = (freshSession?: boolean) => runSupervisedTurn({ workspaceId: WORKSPACE_ID, taskId: created.taskId, prompt: "Continue the export",
      fingerprint: { providerId: "claude-code", model: "sonnet" }, runtimeOptions: { claudeAccountProfileId: ACCOUNT },
      ...(freshSession ? { freshSession } : {}) });

    // An ordinary turn on that account resumes the stored conversation.
    const ordinary = await turn();
    expect(lastCall().conversation.resume?.nativeSessionId).toBe("session-account-old");
    expect(lastCall().freshSession).toBeUndefined();
    await finish(ordinary.turnId);

    // The switch turn: the slot is still stored, yet nothing is resumed and the
    // provider is told to start fresh instead of using its cached session.
    const switched = await turn(true);
    expect(lastCall().conversation.resume).toBeUndefined();
    expect(lastCall().freshSession).toBe(true);
    await finish(switched.turnId, "session-account-new");

    // The new conversation is stored for the account as usual and resumed next.
    const next = await turn();
    expect(lastCall().conversation.resume?.nativeSessionId).toBe("session-account-new");
    expect(lastCall().freshSession).toBeUndefined();
    await finish(next.turnId);
  });
});
