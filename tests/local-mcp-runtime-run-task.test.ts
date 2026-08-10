import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  mock,
  test,
} from "bun:test";

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
const PROJECT_PATH = "/tmp/stave-runtask-regression/project";
const WORKSPACE_PATH = "/tmp/stave-runtask-regression/worktree";
const RECONCILE_WORKSPACE_PATH = "/tmp/stave-runtask-regression/reconcile";
const RELEASE_WORKSPACE_PATH = "/tmp/stave-runtask-regression/release";
const USER_DATA_PATH = "/tmp/stave-runtask-regression/user-data";

type PersistedTaskRow = {
  id: string;
  title: string;
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
const lastUpsertSnapshotByWorkspaceId = new Map<
  string,
  {
    tasks?: Array<{ id: string; archivedAt?: string | null }>;
    messagesByTask?: Record<string, Array<{ id: string }>>;
  }
>();

function loadFakeWorkspaceSnapshot(workspaceId: string) {
  return workspaceId === RELEASE_WORKSPACE_ID
    ? {
        activeTaskId: RELEASE_TASK_ID,
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
        activeTaskId: "",
        tasks: [],
        messagesByTask: {},
        workspaceInformation:
          persistedWorkspaceInformationById.get(workspaceId),
      };
}

const fakeStore = {
  loadProjectRegistry: () => [
    {
      projectPath: PROJECT_PATH,
      projectName: "proj",
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
      ],
      activeWorkspaceId: WORKSPACE_ID,
      workspaceBranchById: {
        [WORKSPACE_ID]: "feature",
        [RECONCILE_WORKSPACE_ID]: "reconcile",
        [RELEASE_WORKSPACE_ID]: "release",
      },
      workspacePathById: {
        [DEFAULT_WORKSPACE_ID]: PROJECT_PATH,
        [WORKSPACE_ID]: WORKSPACE_PATH,
        [RECONCILE_WORKSPACE_ID]: RECONCILE_WORKSPACE_PATH,
        [RELEASE_WORKSPACE_ID]: RELEASE_WORKSPACE_PATH,
      },
      workspaceDefaultById: { [DEFAULT_WORKSPACE_ID]: true },
    },
  ],
  loadWorkspaceSnapshot: ({ workspaceId }: { workspaceId: string }) =>
    loadFakeWorkspaceSnapshot(workspaceId),
  loadWorkspaceShell: ({ workspaceId }: { workspaceId: string }) => {
    const snapshot = loadFakeWorkspaceSnapshot(workspaceId);
    return {
      ...snapshot,
      promptDraftByTask: {},
      providerSessionByTask: {},
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
    ] ?? loadFakeWorkspaceSnapshot(workspaceId).messagesByTask[taskId] ?? [],
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
      ] ?? loadFakeWorkspaceSnapshot(workspaceId).messagesByTask[taskId] ?? [];
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
  listActiveTurnsForWorkspace: () => [],
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
  upsertWorkspace: ({
    id,
    snapshot,
  }: {
    id: string;
    snapshot: {
      workspaceInformation?: unknown;
      tasks?: Array<Partial<PersistedTaskRow> & { id: string }>;
      messagesByTask?: Record<string, Array<{ id: string }>>;
    };
  }) => {
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
  saveProjectRegistry: () => {},
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
});

afterEach(() => {
  providerRuntime.abortTurn = originalAbortTurn;
  providerRuntime.cleanupTask = originalCleanupTask;
  providerRuntime.respondApproval = originalRespondApproval;
  providerRuntime.respondUserInput = originalRespondUserInput;
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

  test("runs an externally managed task without interactive approvals", async () => {
    await runtime.runTask({
      workspaceId: WORKSPACE_ID,
      prompt: "Run this unattended",
      runtimeOptions: { claudePermissionMode: "auto" },
    });

    expect(startTurnStreamCalls.at(-1)).toMatchObject({
      runtimeOptions: {
        claudePermissionMode: "bypassPermissions",
        claudeAllowDangerouslySkipPermissions: true,
      },
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
        type: "advisor_activity",
        phase: "started",
        primaryProviderId: "codex",
        advisorProviderId: "claude-code",
        at: 1_700_000_000_000,
      });
      for (let attempt = 0; attempt < 20 && updates.length < 3; attempt += 1) {
        await Bun.sleep(0);
      }
      expect(updates.at(-1)).toMatchObject({
        sequence: 2,
        eventType: "advisor_activity",
        activityEvents: [{ type: "advisor_activity", phase: "started" }],
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

  test("injects explicitly attached Information references into routine turns", async () => {
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
      (part) => part.sourceId === "stave:routine-information-references",
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
      (part) => part.sourceId === "stave:routine-information-references",
    );
    expect(informationPart?.content).toContain(
      "Use the renderer's newest persisted instructions.",
    );
  });
});

describe("local MCP runtime Information panel auto-fill and dedup", () => {
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
});

describe("local MCP runtime archived-task persistence", () => {
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
