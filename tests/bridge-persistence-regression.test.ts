import { afterEach, describe, expect, test } from "bun:test";
import { createBridgeProviderSource } from "@/lib/providers/bridge.source";
import type { ProviderSteerTurnResponse } from "@/lib/providers/provider.types";
import {
  loadWorkspaceEditorTabBodies,
  loadWorkspaceShellLite,
  loadWorkspaceShellForRestore,
  listWorkspaceSummaries,
  loadWorkspaceShellSummary,
  loadWorkspaceSnapshot,
  upsertWorkspace,
} from "@/lib/db/workspaces.db";
import { createEmptyWorkspaceInformation } from "@/lib/workspace-information";
import {
  buildWorkspaceSessionState,
  createWorkspaceSnapshot,
  flushPendingSnapshotPersists,
} from "@/store/workspace-session-state";
import { buildProjectDefaultWorkspaceId } from "@/store/project.utils";
import { resolveInitialLatestTaskMessagesPageSize } from "@/store/task-message-loading";
import {
  createNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/db/notifications.db";
import type { ChatMessage } from "@/types/chat";

const originalWindow = globalThis.window;

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    clear: () => {
      values.clear();
    },
  };
}

function setWindowApi(api: unknown) {
  (globalThis as { window: unknown }).window = { api } as unknown;
}

function setWindowContext(args: {
  api?: unknown;
  localStorage?: ReturnType<typeof createMemoryStorage>;
  innerHeight?: number;
}) {
  (globalThis as { window: unknown }).window = {
    api: args.api,
    ...(typeof args.innerHeight === "number"
      ? { innerHeight: args.innerHeight }
      : {}),
    ...(args.localStorage ? { localStorage: args.localStorage } : {}),
  } as unknown;
}

function buildManagedApprovalState(controlOwner: "stave" | "external") {
  const taskId = "task-managed";
  const messageId = "message-approval";
  const requestId = "approval-managed";
  return {
    hasHydratedWorkspaces: true,
    projectPath: "/tmp/stave-project",
    projectName: "stave-project",
    workspaces: [
      {
        id: "ws-main",
        name: "main",
        updatedAt: "2026-04-07T00:00:00.000Z",
      },
    ],
    activeWorkspaceId: "ws-main",
    activeTaskId: taskId,
    activeSurface: { kind: "task" as const, taskId },
    workspacePathById: { "ws-main": "/tmp/stave-project" },
    workspaceBranchById: { "ws-main": "main" },
    workspaceDefaultById: { "ws-main": true },
    tasks: [
      {
        id: taskId,
        title: "Managed task",
        provider: "codex" as const,
        updatedAt: "2026-04-07T00:00:00.000Z",
        unread: false,
        archivedAt: null,
        controlMode: "managed" as const,
        controlOwner,
      },
    ],
    messagesByTask: {
      [taskId]: [
        {
          id: messageId,
          role: "assistant" as const,
          model: "gpt-5.6",
          providerId: "codex" as const,
          content: "",
          isStreaming: false,
          parts: [
            {
              type: "approval" as const,
              toolName: "Bash",
              requestId,
              description: "Run focused tests",
              state: "approval-requested" as const,
            },
          ],
        },
      ],
    },
    notifications: [
      {
        id: "notification-managed",
        kind: "task.approval_requested" as const,
        title: "Managed task",
        body: "Bash: Run focused tests",
        projectPath: "/tmp/stave-project",
        projectName: "stave-project",
        workspaceId: "ws-main",
        workspaceName: "main",
        taskId,
        taskTitle: "Managed task",
        turnId: "turn-managed",
        providerId: "codex" as const,
        action: {
          type: "approval" as const,
          requestId,
          messageId,
        },
        payload: {
          controlMode: "managed",
          controlOwner,
        },
        createdAt: "2026-04-07T00:00:00.000Z",
        readAt: null,
        resolvedAt: null,
        expiresAt: null,
      },
    ],
    activeTurnIdsByTask: {},
    promptDraftByTask: {},
    nativeSessionReadyByTask: {},
    providerSessionByTask: {},
    taskWorkspaceIdById: { [taskId]: "ws-main" },
  };
}

afterEach(() => {
  (globalThis as { window: unknown }).window = originalWindow;
});

describe("push stream race handling", () => {
  test("captures done event even when emitted before startPushTurn resolves", async () => {
    let listener:
      | ((payload: { streamId: string; event: unknown; done: boolean }) => void)
      | null = null;

    setWindowApi({
      provider: {
        subscribeStreamEvents: (
          cb: (payload: {
            streamId: string;
            event: unknown;
            done: boolean;
          }) => void,
        ) => {
          listener = cb;
          return () => {
            listener = null;
          };
        },
        startPushTurn: async () => {
          listener?.({
            streamId: "stream-1",
            event: { type: "done" },
            done: true,
          });
          return { ok: true, streamId: "stream-1" };
        },
      },
    });

    const source = createBridgeProviderSource<{ type: string }>({
      providerId: "claude-code",
    });
    const out: Array<{ type: string }> = [];
    for await (const event of source.streamTurn({ prompt: "quick fail" })) {
      out.push(event);
    }

    expect(out).toEqual([{ type: "done" }]);
  });
});

describe("host task turn synchronization", () => {
  test("restores a host-run turn into the task window, enables steer, and settles from persistence", async () => {
    const localStorage = createMemoryStorage();
    const workspaceId = "ws-host-turn";
    const taskId = "task-host-turn";
    const turnId = "turn-host-turn";
    let turnActive = true;
    let persistedMessages: ChatMessage[] = [
      {
        id: "host-user",
        role: "user" as const,
        model: "user",
        providerId: "user" as const,
        content: "Work on ATL-2",
        parts: [{ type: "text" as const, text: "Work on ATL-2" }],
      },
      {
        id: "host-assistant",
        role: "assistant" as const,
        model: "gpt-5.6",
        providerId: "codex" as const,
        content: "Inspecting the issue",
        isStreaming: true,
        parts: [{ type: "text" as const, text: "Inspecting the issue" }],
      },
    ];
    const steerCalls: Array<{ turnId: string; text: string }> = [];
    const directUserInputCalls: Array<{ requestId: string }> = [];
    const hostUserInputCalls: Array<{ requestId: string }> = [];
    const directApprovalCalls: Array<{ requestId: string }> = [];
    const hostApprovalCalls: Array<{ requestId: string }> = [];
    const task = {
      id: taskId,
      title: "Crane ATL-2: fix peek",
      provider: "codex" as const,
      updatedAt: "2026-07-27T00:00:00.000Z",
      unread: false,
      archivedAt: null,
      controlMode: "interactive" as const,
      controlOwner: "stave" as const,
    };
    const workspaceInformation = createEmptyWorkspaceInformation();

    setWindowContext({
      localStorage,
      api: {
        provider: {
          steerTurn: async (args: { turnId: string; text: string }) => {
            steerCalls.push(args);
            return { ok: true, delivery: "delivered" };
          },
          respondUserInput: async (args: { requestId: string }) => {
            directUserInputCalls.push(args);
            return { ok: true, message: "ok" };
          },
          respondApproval: async (args: { requestId: string }) => {
            directApprovalCalls.push(args);
            return { ok: true, message: "ok" };
          },
        },
        localMcp: {
          respondUserInput: async (args: { requestId: string }) => {
            hostUserInputCalls.push(args);
            persistedMessages = persistedMessages.map((message) => ({
              ...message,
              parts: message.parts.map((part) =>
                part.type === "user_input" && part.requestId === args.requestId
                  ? { ...part, state: "input-responded" as const }
                  : part,
              ),
            }));
            return { ok: true };
          },
          respondApproval: async (args: { requestId: string }) => {
            hostApprovalCalls.push(args);
            persistedMessages = persistedMessages.map((message) => ({
              ...message,
              parts: message.parts.map((part) =>
                part.type === "approval" && part.requestId === args.requestId
                  ? {
                      ...part,
                      state: "approval-responded" as const,
                      approved: true,
                    }
                  : part,
              ),
            }));
            return { ok: true };
          },
        },
        persistence: {
          listWorkspaces: async () => ({
            ok: true,
            rows: [
              {
                id: workspaceId,
                name: "crane/atl-2",
                updatedAt: "2026-07-27T00:00:00.000Z",
              },
            ],
          }),
          loadWorkspace: async () => ({
            ok: true,
            snapshot: null,
          }),
          upsertWorkspace: async () => ({ ok: true }),
          loadProjectRegistry: async () => ({ ok: true, projects: [] }),
          saveProjectRegistry: async () => ({ ok: true }),
          closeWorkspace: async () => ({ ok: true }),
          loadWorkspaceShell: async () => ({
            ok: true,
            shell: {
              activeTaskId: taskId,
              tasks: [task],
              promptDraftByTask: {},
              providerSessionByTask: {},
              messageCountByTask: {
                [taskId]: persistedMessages.length,
              },
              workspaceInformation,
              editorTabs: [],
              activeEditorTabId: null,
            },
          }),
          loadTaskMessages: async () => ({
            ok: true,
            page: {
              messages: persistedMessages,
              totalCount: persistedMessages.length,
              limit: 120,
              offset: 0,
              hasMoreOlder: false,
            },
          }),
          listActiveWorkspaceTurns: async () => ({
            ok: true,
            turns: turnActive
              ? [
                  {
                    id: turnId,
                    workspaceId,
                    taskId,
                    providerId: "codex",
                    createdAt: "2026-07-27T00:00:00.000Z",
                    completedAt: null,
                  },
                ]
              : [],
          }),
          listNotifications: async () => ({
            ok: true,
            notifications: [],
          }),
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      projectPath: "/tmp/stave-host-turn",
      projectName: "stave-host-turn",
      workspaces: [
        {
          id: workspaceId,
          name: "crane/atl-2",
          updatedAt: "2026-07-27T00:00:00.000Z",
        },
      ],
      activeWorkspaceId: workspaceId,
      activeTaskId: taskId,
      activeSurface: { kind: "task", taskId },
      workspacePathById: {
        [workspaceId]: "/tmp/stave-host-turn",
      },
      workspaceBranchById: { [workspaceId]: "crane/atl-2" },
      workspaceDefaultById: { [workspaceId]: false },
      tasks: [task],
      messagesByTask: {
        [taskId]: [
          {
            id: "false-no-response",
            role: "assistant",
            model: "system",
            providerId: "user",
            content: "No response",
            parts: [{ type: "system_event", content: "No response" }],
          },
        ],
      },
      messageCountByTask: { [taskId]: 1 },
      activeTurnIdsByTask: {},
      taskWorkspaceIdById: { [taskId]: workspaceId },
      settings: {
        ...initialState.settings,
        midTurnSteeringEnabled: true,
      },
    });

    await useAppStore.getState().syncHostTaskTurn({
      workspaceId,
      taskId,
      turnId,
      providerId: "codex",
      model: "gpt-5.6",
      sequence: 0,
      eventType: "started",
      done: false,
    });

    expect(useAppStore.getState().activeTurnIdsByTask[taskId]).toBe(turnId);
    expect(useAppStore.getState().hostOwnedTurnIdsByTask[taskId]).toBe(turnId);
    expect(useAppStore.getState().messagesByTask[taskId]?.at(-1)?.content).toBe(
      "Inspecting the issue",
    );

    const steerResult = await useAppStore.getState().sendUserMessage({
      taskId,
      content: "Keep the change scoped to TaskPeek.",
      submitIntent: "steer",
    });
    expect(steerResult.status).toBe("steered");
    expect(steerCalls).toEqual([
      {
        turnId,
        text: "Keep the change scoped to TaskPeek.",
        enabled: true,
        clientMessageId: expect.any(String),
      },
    ]);

    persistedMessages = [
      persistedMessages[0]!,
      {
        ...persistedMessages[1]!,
        parts: [
          ...persistedMessages[1]!.parts,
          {
            type: "user_input",
            toolName: "request_user_input",
            requestId: "host-input-1",
            questions: [
              {
                id: "scope",
                header: "Scope",
                question: "Which scope should be used?",
                options: [{ label: "Focused", description: "Keep it scoped." }],
              },
            ],
            state: "input-requested",
          },
        ],
      },
    ];
    await useAppStore.getState().syncHostTaskTurn({
      workspaceId,
      taskId,
      turnId,
      providerId: "codex",
      model: "gpt-5.6",
      sequence: 1,
      eventType: "user_input",
      done: false,
    });
    expect(
      useAppStore.getState().providerTurnActivityByTask[taskId]
        ?.pendingInteraction,
    ).toBe("user_input");
    useAppStore.getState().resolveUserInput({
      taskId,
      messageId: "host-assistant",
      answers: { scope: "Focused" },
    });
    await Bun.sleep(0);

    expect(
      useAppStore.getState().providerTurnActivityByTask[taskId]
        ?.pendingInteraction,
    ).toBeNull();
    expect(hostUserInputCalls).toEqual([
      expect.objectContaining({ requestId: "host-input-1" }),
    ]);
    expect(directUserInputCalls).toEqual([]);

    await useAppStore.getState().syncHostTaskTurn({
      workspaceId,
      taskId,
      turnId,
      providerId: "codex",
      model: "gpt-5.6",
      sequence: 2,
      eventType: "text",
      done: false,
    });
    expect(
      useAppStore.getState().providerTurnActivityByTask[taskId]
        ?.pendingInteraction,
    ).toBeNull();
    expect(
      useAppStore
        .getState()
        .messagesByTask[taskId]?.at(-1)
        ?.parts.find((part) => part.type === "user_input"),
    ).toMatchObject({
      requestId: "host-input-1",
      state: "input-responded",
    });

    persistedMessages = [
      persistedMessages[0]!,
      {
        ...persistedMessages[1]!,
        parts: [
          ...persistedMessages[1]!.parts,
          {
            type: "approval",
            toolName: "Bash",
            requestId: "host-approval-1",
            description: "Run focused tests",
            state: "approval-requested",
          },
        ],
      },
    ];
    await useAppStore.getState().syncHostTaskTurn({
      workspaceId,
      taskId,
      turnId,
      providerId: "codex",
      model: "gpt-5.6",
      sequence: 3,
      eventType: "approval",
      done: false,
    });
    expect(
      useAppStore.getState().providerTurnActivityByTask[taskId]
        ?.pendingInteraction,
    ).toBe("approval");
    useAppStore.getState().resolveApproval({
      taskId,
      messageId: "host-assistant",
      approved: true,
    });
    await Bun.sleep(0);

    expect(
      useAppStore.getState().providerTurnActivityByTask[taskId]
        ?.pendingInteraction,
    ).toBeNull();
    expect(hostApprovalCalls).toEqual([
      expect.objectContaining({ requestId: "host-approval-1" }),
    ]);
    expect(directApprovalCalls).toEqual([]);

    turnActive = false;
    persistedMessages = [
      persistedMessages[0]!,
      {
        ...persistedMessages[1]!,
        content: "Updated TaskPeek and verified the build.",
        isStreaming: false,
        completedAt: "2026-07-27T00:02:00.000Z",
        parts: [
          {
            type: "text",
            text: "Updated TaskPeek and verified the build.",
          },
        ],
      },
    ];
    await useAppStore.getState().syncHostTaskTurn({
      workspaceId,
      taskId,
      turnId,
      providerId: "codex",
      model: "gpt-5.6",
      sequence: 8,
      eventType: "done",
      done: true,
    });

    expect(useAppStore.getState().activeTurnIdsByTask[taskId]).toBeUndefined();
    expect(
      useAppStore.getState().hostOwnedTurnIdsByTask[taskId],
    ).toBeUndefined();
    expect(useAppStore.getState().messagesByTask[taskId]?.at(-1)?.content).toBe(
      "Updated TaskPeek and verified the build.",
    );
  });
});

describe("push stream memory release", () => {
  test("releases push sessions after completion", async () => {
    const runtimeModule = await import("../electron/providers/runtime");
    const runtime = runtimeModule.providerRuntime;
    let doneResolver: (() => void) | null = null;
    const donePromise = new Promise<void>((resolve) => {
      doneResolver = resolve;
    });

    const started = runtime.startTurnStream(
      {
        providerId: "claude-code",
        prompt: "smoke",
        runtimeOptions: { providerTimeoutMs: 50 },
      },
      {
        onEvent: () => {},
        onDone: () => {
          doneResolver?.();
        },
      },
    );

    expect(started.ok).toBe(true);
    await donePromise;

    const page = runtime.readTurnStream({
      streamId: started.streamId,
      cursor: 0,
    });
    expect(page.ok).toBe(false);
    expect(page.done).toBe(true);
  }, 15_000);
});

describe("workspace persistence fallback", () => {
  test("supports list/load/upsert without electron persistence bridge", async () => {
    setWindowApi({});

    const snapshot = {
      activeTaskId: "task-1",
      tasks: [
        {
          id: "task-1",
          title: "Task 1",
          provider: "claude-code" as const,
          updatedAt: "2026-03-06T00:00:00.000Z",
          unread: false,
        },
      ],
      messagesByTask: {
        "task-1": [
          {
            id: "m-1",
            role: "user" as const,
            model: "user",
            providerId: "user",
            content: "hello",
            isStreaming: false,
            parts: [{ type: "text", text: "hello" }],
          },
        ],
      },
    };

    await upsertWorkspace({ id: "ws-dev", name: "Dev Workspace", snapshot });
    const rows = await listWorkspaceSummaries();
    const loaded = await loadWorkspaceSnapshot({ workspaceId: "ws-dev" });

    expect(rows.some((row) => row.id === "ws-dev")).toBe(true);
    expect(loaded?.activeTaskId).toBe("task-1");
    expect(loaded?.tasks).toHaveLength(1);
    expect(loaded?.promptDraftByTask).toEqual({});
    expect(loaded?.providerSessionByTask).toEqual({});
  });

  test("supports workspace shell summaries without electron persistence bridge", async () => {
    setWindowApi({});

    await upsertWorkspace({
      id: "ws-dev",
      name: "Dev Workspace",
      snapshot: {
        activeTaskId: "task-1",
        tasks: [
          {
            id: "task-1",
            title: "Task 1",
            provider: "claude-code",
            updatedAt: "2026-03-06T00:00:00.000Z",
            unread: false,
          },
        ],
        messagesByTask: {
          "task-1": [
            {
              id: "m-1",
              role: "user",
              model: "user",
              providerId: "user",
              content: "hello",
              isStreaming: false,
              parts: [{ type: "text", text: "hello" }],
            },
          ],
        },
        terminalTabs: [
          {
            id: "terminal-1",
            title: "project",
            linkedTaskId: null,
            backend: "ghostty",
            cwd: "/tmp/project",
            createdAt: 1,
          },
        ],
        cliSessionTabs: [
          {
            id: "cli-1",
            title: "Claude Workspace",
            provider: "claude-code",
            contextMode: "workspace",
            linkedTaskId: null,
            linkedTaskTitle: null,
            handoffSummary: "",
            cwd: "/tmp/project",
            createdAt: 2,
          },
        ],
      },
    });

    const summary = await loadWorkspaceShellSummary({ workspaceId: "ws-dev" });

    expect(summary).toMatchObject({
      activeTaskId: "task-1",
      tasks: [
        {
          id: "task-1",
          title: "Task 1",
          provider: "claude-code",
          updatedAt: "2026-03-06T00:00:00.000Z",
          unread: false,
        },
      ],
      messageCountByTask: { "task-1": 1 },
      terminalTabCount: 1,
      cliSessionTabCount: 1,
    });
  });

  test("supports workspace shell lite payloads without electron persistence bridge", async () => {
    setWindowApi({});

    await upsertWorkspace({
      id: "ws-lite",
      name: "Lite Workspace",
      snapshot: {
        activeTaskId: "task-1",
        tasks: [
          {
            id: "task-1",
            title: "Task 1",
            provider: "claude-code",
            updatedAt: "2026-03-06T00:00:00.000Z",
            unread: false,
          },
        ],
        messagesByTask: {
          "task-1": [
            {
              id: "m-1",
              role: "user",
              model: "user",
              providerId: "user",
              content: "hello",
              isStreaming: false,
              parts: [{ type: "text", text: "hello" }],
            },
          ],
        },
        promptDraftByTask: {
          "task-1": {
            text: "draft",
            attachedFilePaths: [],
            attachments: [],
          },
        },
        providerSessionByTask: {
          "task-1": {
            "claude-code": "session-claude",
          },
        },
        editorTabs: [
          {
            id: "editor-1",
            filePath: "/tmp/project/src/app.ts",
            language: "typescript",
            content: "x".repeat(20_000),
            hasConflict: false,
            isDirty: true,
          },
        ],
      },
    });

    const shellLite = await loadWorkspaceShellLite({ workspaceId: "ws-lite" });

    expect(shellLite).toMatchObject({
      activeTaskId: "task-1",
      tasks: [
        {
          id: "task-1",
          title: "Task 1",
          provider: "claude-code",
          updatedAt: "2026-03-06T00:00:00.000Z",
          unread: false,
        },
      ],
      promptDraftByTask: {
        "task-1": {
          text: "draft",
          attachedFilePaths: [],
          attachments: [],
        },
      },
      providerSessionByTask: {
        "task-1": {
          "claude-code": "session-claude",
        },
      },
      messageCountByTask: {
        "task-1": 1,
      },
    });
  });

  test("loads restore shells without a persistence bridge and marks tabs ready", async () => {
    setWindowApi({});

    await upsertWorkspace({
      id: "ws-restore",
      name: "Restore Workspace",
      snapshot: {
        activeTaskId: "task-1",
        tasks: [
          {
            id: "task-1",
            title: "Task 1",
            provider: "claude-code",
            updatedAt: "2026-03-06T00:00:00.000Z",
            unread: false,
          },
        ],
        messagesByTask: {
          "task-1": [],
        },
        promptDraftByTask: {},
        providerSessionByTask: {},
        editorTabs: [
          {
            id: "file:/tmp/project/src/app.ts",
            filePath: "/tmp/project/src/app.ts",
            language: "typescript",
            content: "export const answer = 42;\n",
            hasConflict: false,
            isDirty: false,
          },
        ],
        activeEditorTabId: "file:/tmp/project/src/app.ts",
      },
    });

    const shell = await loadWorkspaceShellForRestore({
      workspaceId: "ws-restore",
    });

    expect(shell?.editorTabs).toEqual([
      {
        id: "file:/tmp/project/src/app.ts",
        filePath: "/tmp/project/src/app.ts",
        language: "typescript",
        content: "export const answer = 42;\n",
        contentState: "ready",
        hasConflict: false,
        isDirty: false,
      },
    ]);
  });

  test("loads editor tab bodies without a persistence bridge", async () => {
    setWindowApi({});

    await upsertWorkspace({
      id: "ws-bodies",
      name: "Bodies Workspace",
      snapshot: {
        activeTaskId: "task-1",
        tasks: [
          {
            id: "task-1",
            title: "Task 1",
            provider: "claude-code",
            updatedAt: "2026-03-06T00:00:00.000Z",
            unread: false,
          },
        ],
        messagesByTask: {
          "task-1": [],
        },
        promptDraftByTask: {},
        providerSessionByTask: {},
        editorTabs: [
          {
            id: "file:/tmp/project/src/app.ts",
            filePath: "/tmp/project/src/app.ts",
            language: "typescript",
            content: "export const answer = 42;\n",
            originalContent: "export const answer = 42;\n",
            savedContent: "export const answer = 42;\n",
            hasConflict: false,
            isDirty: false,
          },
        ],
      },
    });

    const bodies = await loadWorkspaceEditorTabBodies({
      workspaceId: "ws-bodies",
      tabIds: ["file:/tmp/project/src/app.ts"],
    });

    expect(bodies).toEqual([
      {
        id: "file:/tmp/project/src/app.ts",
        content: "export const answer = 42;\n",
        originalContent: "export const answer = 42;\n",
        savedContent: "export const answer = 42;\n",
      },
    ]);
  });

  test("supports notification history without electron persistence bridge", async () => {
    const localStorage = createMemoryStorage();
    setWindowContext({
      localStorage,
      api: {},
    });

    const first = await createNotification({
      notification: {
        id: "notification-1",
        kind: "task.turn_completed",
        title: "Refactor notifications",
        body: "Latest run finished in feat/noti.",
        projectPath: "/tmp/stave-project",
        projectName: "stave",
        workspaceId: "ws-1",
        workspaceName: "feat/noti",
        taskId: "task-1",
        taskTitle: "Refactor notifications",
        turnId: "turn-1",
        providerId: "codex",
        action: null,
        payload: { stopReason: "end_turn" },
        dedupeKey: "task.turn_completed:turn-1",
        createdAt: "2026-03-06T01:10:00.000Z",
      },
    });
    const duplicate = await createNotification({
      notification: {
        id: "notification-1-duplicate",
        kind: "task.turn_completed",
        title: "Refactor notifications",
        body: "Latest run finished in feat/noti.",
        projectPath: "/tmp/stave-project",
        projectName: "stave",
        workspaceId: "ws-1",
        workspaceName: "feat/noti",
        taskId: "task-1",
        taskTitle: "Refactor notifications",
        turnId: "turn-1",
        providerId: "codex",
        action: null,
        payload: { stopReason: "end_turn" },
        dedupeKey: "task.turn_completed:turn-1",
        createdAt: "2026-03-06T01:10:01.000Z",
      },
    });

    expect(first.inserted).toBe(true);
    expect(duplicate.inserted).toBe(false);

    let notifications = await listNotifications();
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.id).toBe("notification-1");
    expect(notifications[0]?.readAt).toBeNull();

    await markNotificationRead({
      id: "notification-1",
      readAt: "2026-03-06T01:12:00.000Z",
    });
    notifications = await listNotifications();
    expect(notifications[0]?.readAt).toBe("2026-03-06T01:12:00.000Z");

    const changedCount = await markAllNotificationsRead({
      readAt: "2026-03-06T01:13:00.000Z",
    });
    expect(changedCount).toBe(0);
  });

  test("preserves each project's workspace list when switching projects", async () => {
    const localStorage = createMemoryStorage();
    const projectRoots = [
      {
        rootPath: "/tmp/stave-project-a",
        rootName: "project-a",
        files: ["package.json", "src/a.ts"],
      },
      {
        rootPath: "/tmp/stave-project-b",
        rootName: "project-b",
        files: ["package.json", "src/b.ts"],
      },
    ];
    let pickIndex = 0;
    const filesByRoot: Record<string, string[]> = {
      "/tmp/stave-project-a": ["package.json", "src/a.ts"],
      "/tmp/stave-project-a/.stave/workspaces/feature-a": [
        "package.json",
        "src/a.ts",
        "src/feature-a.ts",
      ],
      "/tmp/stave-project-b": ["package.json", "src/b.ts"],
    };

    setWindowContext({
      localStorage,
      api: {
        fs: {
          pickRoot: async () => {
            const root = projectRoots[pickIndex++];
            return root ? { ok: true, ...root } : { ok: false, files: [] };
          },
          listFiles: async ({ rootPath }: { rootPath: string }) => ({
            ok: true,
            files: filesByRoot[rootPath] ?? [],
          }),
          readFile: async () => ({ ok: false }),
          writeFile: async () => ({ ok: false }),
        },
      },
    });
    (globalThis.window as Window & typeof globalThis).setTimeout =
      globalThis.setTimeout.bind(globalThis);
    (globalThis.window as Window & typeof globalThis).clearTimeout =
      globalThis.clearTimeout.bind(globalThis);

    const { useAppStore } = await import("../src/store/app.store");
    localStorage.clear();
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      recentProjects: [],
      workspaces: [],
      activeWorkspaceId: "",
      projectPath: null,
      workspaceBranchById: {},
      workspacePathById: {},
      workspaceDefaultById: {},
      projectName: null,
      projectFiles: [],
      hasHydratedWorkspaces: false,
    });

    await useAppStore.getState().createProject({});

    const stateAfterProjectA = useAppStore.getState();
    const projectADefaultWorkspaceId = stateAfterProjectA.activeWorkspaceId;
    const extraWorkspaceId = "ws-a-extra";
    const extraWorkspacePath =
      "/tmp/stave-project-a/.stave/workspaces/feature-a";
    const emptySnapshot = {
      activeTaskId: "",
      tasks: [],
      messagesByTask: {},
      promptDraftByTask: {},
      providerSessionByTask: {},
    };
    await upsertWorkspace({
      id: extraWorkspaceId,
      name: "feature-a",
      snapshot: emptySnapshot,
    });
    useAppStore.setState({
      workspaces: [
        ...stateAfterProjectA.workspaces,
        {
          id: extraWorkspaceId,
          name: "feature-a",
          updatedAt: "2026-03-20T00:00:00.000Z",
        },
      ],
      activeWorkspaceId: extraWorkspaceId,
      workspaceBranchById: {
        ...stateAfterProjectA.workspaceBranchById,
        [extraWorkspaceId]: "feature-a",
      },
      workspacePathById: {
        ...stateAfterProjectA.workspacePathById,
        [extraWorkspaceId]: extraWorkspacePath,
      },
      workspaceDefaultById: {
        ...stateAfterProjectA.workspaceDefaultById,
        [extraWorkspaceId]: false,
      },
    });

    await useAppStore.getState().createProject({});
    const stateAfterProjectB = useAppStore.getState();
    expect(stateAfterProjectB.projectPath).toBe("/tmp/stave-project-b");
    expect(stateAfterProjectB.workspaces).toHaveLength(1);

    await useAppStore
      .getState()
      .openProject({ projectPath: "/tmp/stave-project-a" });

    const nextState = useAppStore.getState();
    expect(nextState.projectPath).toBe("/tmp/stave-project-a");
    expect(nextState.activeWorkspaceId).toBe(extraWorkspaceId);
    expect(nextState.workspaces.map((workspace) => workspace.id)).toEqual([
      projectADefaultWorkspaceId,
      extraWorkspaceId,
    ]);
    expect(
      nextState.recentProjects.map((project) => project.projectPath),
    ).toEqual(["/tmp/stave-project-a", "/tmp/stave-project-b"]);
  });

  test("preserves manual project order when opening different projects", async () => {
    const localStorage = createMemoryStorage();
    setWindowContext({
      localStorage,
      api: {
        fs: {
          listFiles: async () => ({ ok: true, files: ["package.json"] }),
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      projectPath: "/tmp/stave-project-a",
      projectName: "project-a",
      defaultBranch: "main",
      workspaces: [
        {
          id: "ws-a",
          name: "Default Workspace",
          updatedAt: "2026-03-20T00:00:00.000Z",
        },
      ],
      activeWorkspaceId: "ws-a",
      workspaceBranchById: { "ws-a": "main", "ws-b": "main" },
      workspacePathById: {
        "ws-a": "/tmp/stave-project-a",
        "ws-b": "/tmp/stave-project-b",
      },
      workspaceDefaultById: { "ws-a": true, "ws-b": true },
      recentProjects: [
        {
          projectPath: "/tmp/stave-project-a",
          projectName: "project-a",
          lastOpenedAt: "2026-03-20T00:00:00.000Z",
          defaultBranch: "main",
          workspaces: [
            {
              id: "ws-a",
              name: "Default Workspace",
              updatedAt: "2026-03-20T00:00:00.000Z",
            },
          ],
          activeWorkspaceId: "ws-a",
          workspaceBranchById: { "ws-a": "main" },
          workspacePathById: { "ws-a": "/tmp/stave-project-a" },
          workspaceDefaultById: { "ws-a": true },
        },
        {
          projectPath: "/tmp/stave-project-b",
          projectName: "project-b",
          lastOpenedAt: "2026-03-20T00:00:01.000Z",
          defaultBranch: "main",
          workspaces: [
            {
              id: "ws-b",
              name: "Default Workspace",
              updatedAt: "2026-03-20T00:00:01.000Z",
            },
          ],
          activeWorkspaceId: "ws-b",
          workspaceBranchById: { "ws-b": "main" },
          workspacePathById: { "ws-b": "/tmp/stave-project-b" },
          workspaceDefaultById: { "ws-b": true },
        },
      ],
    });

    useAppStore.getState().moveProjectInList({
      projectPath: "/tmp/stave-project-b",
      direction: "up",
    });
    expect(
      useAppStore
        .getState()
        .recentProjects.map((project) => project.projectPath),
    ).toEqual(["/tmp/stave-project-b", "/tmp/stave-project-a"]);

    await useAppStore
      .getState()
      .openProject({ projectPath: "/tmp/stave-project-b" });
    await useAppStore
      .getState()
      .openProject({ projectPath: "/tmp/stave-project-a" });

    expect(
      useAppStore
        .getState()
        .recentProjects.map((project) => project.projectPath),
    ).toEqual(["/tmp/stave-project-b", "/tmp/stave-project-a"]);
  });

  test("openProject restores cached CLI session state before workspace hydration finishes", async () => {
    const localStorage = createMemoryStorage();
    let notifyHydrateStarted = () => {};
    const hydrateStarted = new Promise<void>((resolve) => {
      notifyHydrateStarted = resolve;
    });
    let releaseHydrate = () => {};
    const hydrateGate = new Promise<void>((resolve) => {
      releaseHydrate = resolve;
    });

    setWindowContext({
      localStorage,
      api: {
        fs: {
          listFiles: async () => ({
            ok: true,
            files: ["package.json", "src/a.ts"],
          }),
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    const cachedCliTab = {
      id: "cli-a",
      title: "Codex Workspace",
      provider: "codex" as const,
      contextMode: "workspace" as const,
      linkedTaskId: null,
      linkedTaskTitle: null,
      handoffSummary: "",
      cwd: "/tmp/stave-project-a",
      createdAt: 1,
    };
    const cachedWorkspaceState = buildWorkspaceSessionState({
      snapshot: createWorkspaceSnapshot({
        activeTaskId: "",
        tasks: [],
        messagesByTask: {},
        promptDraftByTask: {},
        workspaceInformation: createEmptyWorkspaceInformation(),
        editorTabs: [],
        activeEditorTabId: null,
        terminalTabs: [],
        activeTerminalTabId: null,
        terminalDocked: false,
        cliSessionTabs: [cachedCliTab],
        activeCliSessionTabId: cachedCliTab.id,
        activeSurface: {
          kind: "cli-session",
          cliSessionTabId: cachedCliTab.id,
        },
        providerSessionByTask: {},
      }),
    });

    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      projectPath: "/tmp/stave-project-b",
      projectName: "project-b",
      defaultBranch: "main",
      workspaces: [
        {
          id: "ws-b",
          name: "Default Workspace",
          updatedAt: "2026-03-20T00:00:01.000Z",
        },
      ],
      activeWorkspaceId: "ws-b",
      workspaceBranchById: { "ws-b": "main" },
      workspacePathById: { "ws-b": "/tmp/stave-project-b" },
      workspaceDefaultById: { "ws-b": true },
      projectFiles: ["package.json", "src/b.ts"],
      recentProjects: [
        {
          projectPath: "/tmp/stave-project-a",
          projectName: "project-a",
          lastOpenedAt: "2026-03-20T00:00:00.000Z",
          defaultBranch: "main",
          workspaces: [
            {
              id: "ws-a",
              name: "Default Workspace",
              updatedAt: "2026-03-20T00:00:00.000Z",
            },
          ],
          activeWorkspaceId: "ws-a",
          workspaceBranchById: { "ws-a": "main" },
          workspacePathById: { "ws-a": "/tmp/stave-project-a" },
          workspaceDefaultById: { "ws-a": true },
        },
        {
          projectPath: "/tmp/stave-project-b",
          projectName: "project-b",
          lastOpenedAt: "2026-03-20T00:00:01.000Z",
          defaultBranch: "main",
          workspaces: [
            {
              id: "ws-b",
              name: "Default Workspace",
              updatedAt: "2026-03-20T00:00:01.000Z",
            },
          ],
          activeWorkspaceId: "ws-b",
          workspaceBranchById: { "ws-b": "main" },
          workspacePathById: { "ws-b": "/tmp/stave-project-b" },
          workspaceDefaultById: { "ws-b": true },
        },
      ],
      workspaceRuntimeCacheById: {
        "ws-a": cachedWorkspaceState,
      },
    });
    const originalHydrateWorkspaces = useAppStore.getState().hydrateWorkspaces;
    useAppStore.setState({
      hydrateWorkspaces: async () => {
        notifyHydrateStarted();
        await hydrateGate;
        await originalHydrateWorkspaces();
      },
    });

    let openProjectResolved = false;
    const openProjectPromise = useAppStore
      .getState()
      .openProject({
        projectPath: "/tmp/stave-project-a",
      })
      .then(() => {
        openProjectResolved = true;
      });

    await hydrateStarted;

    const interimState = useAppStore.getState();
    expect(openProjectResolved).toBe(false);
    expect(interimState.projectPath).toBe("/tmp/stave-project-a");
    expect(interimState.activeWorkspaceId).toBe("ws-a");
    expect(interimState.cliSessionTabs).toEqual([cachedCliTab]);
    expect(interimState.activeCliSessionTabId).toBe(cachedCliTab.id);
    expect(interimState.activeSurface).toEqual({
      kind: "cli-session",
      cliSessionTabId: cachedCliTab.id,
    });

    releaseHydrate();
    await openProjectPromise;

    const nextState = useAppStore.getState();
    expect(nextState.cliSessionTabs).toEqual([cachedCliTab]);
    expect(nextState.activeCliSessionTabId).toBe(cachedCliTab.id);
    expect(nextState.activeSurface).toEqual({
      kind: "cli-session",
      cliSessionTabId: cachedCliTab.id,
    });
  });

  test("openProject resolves before background file refresh completes", async () => {
    const localStorage = createMemoryStorage();
    let resolveListFiles:
      ((value: { ok: boolean; files: string[] }) => void) | null = null;
    const listFilesPromise = new Promise<{ ok: boolean; files: string[] }>(
      (resolve) => {
        resolveListFiles = resolve;
      },
    );

    setWindowContext({
      localStorage,
      api: {
        fs: {
          pickRoot: async () => ({ ok: false }),
          listFiles: async () => listFilesPromise,
          readFile: async () => ({ ok: false }),
          writeFile: async () => ({ ok: false }),
        },
        persistence: {
          listWorkspaces: async () => ({ ok: true, rows: [] }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          upsertWorkspace: async () => ({ ok: true }),
          loadProjectRegistry: async () => ({ ok: true, projects: [] }),
          saveProjectRegistry: async () => ({ ok: true }),
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: false,
      projectFiles: [],
    });

    let openProjectResolved = false;
    const openProjectPromise = useAppStore
      .getState()
      .openProject({
        projectPath: "/tmp/stave-project-open-fast",
      })
      .then(() => {
        openProjectResolved = true;
      });

    await Bun.sleep(0);

    expect(openProjectResolved).toBe(true);
    expect(useAppStore.getState().projectPath).toBe(
      "/tmp/stave-project-open-fast",
    );
    expect(useAppStore.getState().projectFiles).toEqual([]);

    resolveListFiles?.({
      ok: true,
      files: ["package.json", "src/open-fast.ts"],
    });
    await openProjectPromise;
    await Bun.sleep(0);

    expect(useAppStore.getState().projectFiles).toEqual([
      "package.json",
      "src/open-fast.ts",
    ]);
  });

  test("openProject eagerly restores latest messages for the active task", async () => {
    const localStorage = createMemoryStorage();
    const targetProjectPath = "/tmp/stave-project-latest";
    const targetWorkspaceId = buildProjectDefaultWorkspaceId({
      projectPath: targetProjectPath,
    });
    const viewportHeightPx = 900;
    const initialLatestCount = resolveInitialLatestTaskMessagesPageSize({
      viewportHeightPx,
    });
    const allMessages = Array.from({ length: 80 }, (_, index) => ({
      id: `m-${index + 1}`,
      role: (index % 2 === 0 ? "user" : "assistant") as const,
      model: index % 2 === 0 ? "user" : "codex",
      providerId: index % 2 === 0 ? "user" : "codex",
      content: `message ${index + 1}`,
      isStreaming: false,
      parts: [{ type: "text", text: `message ${index + 1}` }],
    }));

    setWindowContext({
      innerHeight: viewportHeightPx,
      localStorage,
      api: {
        fs: {
          pickRoot: async () => ({ ok: false }),
          listFiles: async () => ({
            ok: true,
            files: ["package.json", "src/app.ts"],
          }),
          readFile: async () => ({ ok: false }),
          writeFile: async () => ({ ok: false }),
        },
      },
    });

    await upsertWorkspace({
      id: targetWorkspaceId,
      name: "Default Workspace",
      snapshot: {
        activeTaskId: "task-latest",
        tasks: [
          {
            id: "task-latest",
            title: "Latest Task",
            provider: "codex",
            updatedAt: "2026-04-14T00:00:00.000Z",
            unread: false,
          },
        ],
        messagesByTask: {
          "task-latest": allMessages,
        },
        promptDraftByTask: {},
        providerSessionByTask: {},
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      projectPath: "/tmp/stave-current",
      projectName: "current",
      defaultBranch: "main",
      workspaces: [
        {
          id: "ws-current",
          name: "Default Workspace",
          updatedAt: "2026-04-14T00:00:00.000Z",
        },
      ],
      activeWorkspaceId: "ws-current",
      workspaceBranchById: {
        "ws-current": "main",
        [targetWorkspaceId]: "main",
      },
      workspacePathById: {
        "ws-current": "/tmp/stave-current",
        [targetWorkspaceId]: targetProjectPath,
      },
      workspaceDefaultById: {
        "ws-current": true,
        [targetWorkspaceId]: true,
      },
      projectFiles: ["package.json"],
      recentProjects: [
        {
          projectPath: targetProjectPath,
          projectName: "latest-project",
          lastOpenedAt: "2026-04-14T00:00:00.000Z",
          defaultBranch: "main",
          workspaces: [
            {
              id: targetWorkspaceId,
              name: "Default Workspace",
              updatedAt: "2026-04-14T00:00:00.000Z",
            },
          ],
          activeWorkspaceId: targetWorkspaceId,
          workspaceBranchById: { [targetWorkspaceId]: "main" },
          workspacePathById: { [targetWorkspaceId]: targetProjectPath },
          workspaceDefaultById: { [targetWorkspaceId]: true },
        },
      ],
    });

    await useAppStore
      .getState()
      .openProject({ projectPath: targetProjectPath });
    await Bun.sleep(0);

    const nextState = useAppStore.getState();
    expect(nextState.activeWorkspaceId).toBe(targetWorkspaceId);
    expect(nextState.activeTaskId).toBe("task-latest");
    expect(nextState.messageCountByTask["task-latest"]).toBe(80);
    expect(nextState.messagesByTask["task-latest"]?.length).toBe(
      initialLatestCount,
    );
    expect(nextState.messagesByTask["task-latest"]?.[0]?.id).toBe(
      `m-${allMessages.length - initialLatestCount + 1}`,
    );
    expect(nextState.messagesByTask["task-latest"]?.at(-1)?.id).toBe(
      `m-${allMessages.length}`,
    );
  });

  test("preserves manual workspace order when switching workspaces", async () => {
    const localStorage = createMemoryStorage();
    setWindowContext({
      localStorage,
      api: {
        persistence: {
          loadWorkspace: async ({ workspaceId }: { workspaceId: string }) => ({
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
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      projectPath: "/tmp/stave-project-a",
      projectName: "project-a",
      defaultBranch: "main",
      workspaces: [
        {
          id: "ws-a",
          name: "Default Workspace",
          updatedAt: "2026-03-20T00:00:00.000Z",
        },
        {
          id: "ws-b",
          name: "feature-b",
          updatedAt: "2026-03-20T00:00:01.000Z",
        },
        {
          id: "ws-c",
          name: "feature-c",
          updatedAt: "2026-03-20T00:00:02.000Z",
        },
      ],
      activeWorkspaceId: "ws-a",
      workspaceBranchById: {
        "ws-a": "main",
        "ws-b": "feature-b",
        "ws-c": "feature-c",
      },
      workspacePathById: {
        "ws-a": "/tmp/stave-project-a",
        "ws-b": "/tmp/stave-project-a/.stave/workspaces/feature-b",
        "ws-c": "/tmp/stave-project-a/.stave/workspaces/feature-c",
      },
      workspaceDefaultById: { "ws-a": true, "ws-b": false, "ws-c": false },
      recentProjects: [
        {
          projectPath: "/tmp/stave-project-a",
          projectName: "project-a",
          lastOpenedAt: "2026-03-20T00:00:00.000Z",
          defaultBranch: "main",
          workspaces: [
            {
              id: "ws-a",
              name: "Default Workspace",
              updatedAt: "2026-03-20T00:00:00.000Z",
            },
            {
              id: "ws-b",
              name: "feature-b",
              updatedAt: "2026-03-20T00:00:01.000Z",
            },
            {
              id: "ws-c",
              name: "feature-c",
              updatedAt: "2026-03-20T00:00:02.000Z",
            },
          ],
          activeWorkspaceId: "ws-a",
          workspaceBranchById: {
            "ws-a": "main",
            "ws-b": "feature-b",
            "ws-c": "feature-c",
          },
          workspacePathById: {
            "ws-a": "/tmp/stave-project-a",
            "ws-b": "/tmp/stave-project-a/.stave/workspaces/feature-b",
            "ws-c": "/tmp/stave-project-a/.stave/workspaces/feature-c",
          },
          workspaceDefaultById: { "ws-a": true, "ws-b": false, "ws-c": false },
        },
      ],
    });

    useAppStore.getState().moveWorkspaceInProjectList({
      projectPath: "/tmp/stave-project-a",
      workspaceId: "ws-c",
      direction: "up",
    });

    expect(
      useAppStore.getState().workspaces.map((workspace) => workspace.id),
    ).toEqual(["ws-a", "ws-c", "ws-b"]);

    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-c" });
    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-b" });

    expect(
      useAppStore.getState().workspaces.map((workspace) => workspace.id),
    ).toEqual(["ws-a", "ws-c", "ws-b"]);
  });

  test("activating an unloaded task pane loads its latest messages", async () => {
    const localStorage = createMemoryStorage();
    const loadCalls: Array<{
      workspaceId: string;
      taskId: string;
      limit: number;
      offset: number;
    }> = [];

    setWindowContext({
      localStorage,
      api: {
        persistence: {
          listWorkspaces: async () => ({ ok: true, rows: [] }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          upsertWorkspace: async () => ({ ok: true }),
          loadTaskMessages: async (args: {
            workspaceId: string;
            taskId: string;
            limit: number;
            offset: number;
          }) => {
            loadCalls.push(args);
            return {
              ok: true,
              page: {
                messages: [
                  {
                    id: "task-secondary-m-2",
                    role: "assistant",
                    model: "gpt-5.4",
                    providerId: "codex",
                    content: "latest pane message",
                    isStreaming: false,
                    parts: [{ type: "text", text: "latest pane message" }],
                  },
                ],
                totalCount: 2,
                limit: args.limit,
                offset: args.offset,
                hasMoreOlder: true,
              },
            };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [
        { id: "ws-main", name: "Main", updatedAt: "2026-03-20T00:00:00.000Z" },
      ],
      activeWorkspaceId: "ws-main",
      activeTaskId: "task-main",
      activeSurface: { kind: "task", taskId: "task-main" },
      openTaskTabIds: ["task-main", "task-secondary"],
      tasks: [
        {
          id: "task-main",
          title: "Main Task",
          provider: "codex",
          updatedAt: "2026-03-20T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
        {
          id: "task-secondary",
          title: "Secondary Task",
          provider: "codex",
          updatedAt: "2026-03-20T00:01:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: {
        "task-main": [],
        "task-secondary": [],
      },
      messageCountByTask: {
        "task-main": 0,
        "task-secondary": 2,
      },
      projectPath: "/tmp/stave-project",
      workspacePathById: {
        "ws-main": "/tmp/stave-project",
      },
      workspaceBranchById: {
        "ws-main": "main",
      },
      workspaceDefaultById: {
        "ws-main": true,
      },
    });

    useAppStore.getState().setActiveSurfaceFromPane({
      kind: "task",
      taskId: "task-secondary",
    });
    await Bun.sleep(0);

    expect(loadCalls).toHaveLength(1);
    expect(loadCalls[0]).toMatchObject({
      workspaceId: "ws-main",
      taskId: "task-secondary",
      offset: 0,
    });
    expect(useAppStore.getState().activeTaskId).toBe("task-secondary");
    expect(
      useAppStore.getState().messagesByTask["task-secondary"]?.at(-1)?.content,
    ).toBe("latest pane message");
    expect(
      useAppStore.getState().taskMessagesLoadingByTask["task-secondary"],
    ).toBe(false);
  });

  test("latest task message loads do not overwrite newer in-memory message versions", async () => {
    const localStorage = createMemoryStorage();
    let resolvePage:
      | ((value: {
          ok: boolean;
          page: {
            messages: Array<{
              id: string;
              role: "user" | "assistant";
              model: string;
              providerId: "user" | "codex";
              content: string;
              isStreaming: boolean;
              parts: Array<{ type: "text"; text: string }>;
            }>;
            totalCount: number;
            limit: number;
            offset: number;
            hasMoreOlder: boolean;
          };
        }) => void)
      | null = null;

    setWindowContext({
      localStorage,
      api: {
        persistence: {
          loadTaskMessages: async () =>
            new Promise((resolve) => {
              resolvePage = resolve as typeof resolvePage;
            }),
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [
        { id: "ws-main", name: "Main", updatedAt: "2026-03-20T00:00:00.000Z" },
      ],
      activeWorkspaceId: "ws-main",
      activeTaskId: "task-main",
      tasks: [
        {
          id: "task-main",
          title: "Main Task",
          provider: "codex",
          updatedAt: "2026-03-20T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: {
        "task-main": [],
      },
      messageCountByTask: {
        "task-main": 2,
      },
      projectPath: "/tmp/stave-project",
      workspacePathById: {
        "ws-main": "/tmp/stave-project",
      },
      workspaceBranchById: {
        "ws-main": "main",
      },
      workspaceDefaultById: {
        "ws-main": true,
      },
    });

    const loadingPromise = useAppStore.getState().loadTaskMessages({
      taskId: "task-main",
      mode: "latest",
    });
    await Bun.sleep(0);

    useAppStore.setState((state) => ({
      messagesByTask: {
        ...state.messagesByTask,
        "task-main": [
          {
            id: "task-main-m-1",
            role: "user",
            model: "user",
            providerId: "user",
            content: "keep going",
            isStreaming: false,
            parts: [{ type: "text", text: "keep going" }],
          },
          {
            id: "task-main-m-2",
            role: "assistant",
            model: "gpt-5.4",
            providerId: "codex",
            content: "## 변경\n\n- final summary",
            isStreaming: false,
            parts: [{ type: "text", text: "## 변경\n\n- final summary" }],
          },
        ],
      },
    }));

    resolvePage?.({
      ok: true,
      page: {
        messages: [
          {
            id: "task-main-m-1",
            role: "user",
            model: "user",
            providerId: "user",
            content: "keep going",
            isStreaming: false,
            parts: [{ type: "text", text: "keep going" }],
          },
          {
            id: "task-main-m-2",
            role: "assistant",
            model: "gpt-5.4",
            providerId: "codex",
            content: "progress only",
            isStreaming: false,
            parts: [{ type: "text", text: "progress only" }],
          },
        ],
        totalCount: 2,
        limit: 120,
        offset: 0,
        hasMoreOlder: false,
      },
    });

    await loadingPromise;

    const nextState = useAppStore.getState();
    expect(nextState.messagesByTask["task-main"]?.at(-1)?.content).toBe(
      "## 변경\n\n- final summary",
    );
  });
});

describe("workspace snapshot schema compatibility", () => {
  test("loads legacy snapshots with missing prompt draft fields and failed tool states", async () => {
    setWindowApi({
      persistence: {
        listWorkspaces: async () => ({
          ok: true,
          rows: [
            { id: "base", name: "Base", updatedAt: "2026-03-08T00:00:00.000Z" },
          ],
        }),
        loadWorkspace: async () => ({
          ok: true,
          snapshot: {
            activeTaskId: "task-1",
            tasks: [
              {
                id: "task-1",
                title: "Task 1",
                provider: "codex",
                updatedAt: "2026-03-08T00:00:00.000Z",
                unread: false,
              },
            ],
            messagesByTask: {
              "task-1": [
                {
                  id: "m-1",
                  role: "assistant",
                  model: "gpt-5",
                  providerId: "codex",
                  content: "",
                  parts: [
                    {
                      type: "tool_use",
                      toolUseId: "tool-1",
                      toolName: "apply_patch",
                      input: "patch",
                      output: "failed",
                      state: "output-error",
                    },
                    {
                      type: "code_diff",
                      filePath: "src/app.ts",
                      oldContent: "a",
                      newContent: "b",
                    },
                  ],
                },
              ],
            },
            promptDraftByTask: {
              "task-1": {
                text: "draft only",
              },
            },
          },
        }),
        upsertWorkspace: async () => ({ ok: true }),
      },
    });

    const loaded = await loadWorkspaceSnapshot({ workspaceId: "base" });

    expect(loaded).not.toBeNull();
    expect(loaded?.messagesByTask["task-1"]?.[0]?.parts[0]).toMatchObject({
      type: "tool_use",
      toolUseId: "tool-1",
      state: "output-error",
    });
    expect(loaded?.messagesByTask["task-1"]?.[0]?.parts[1]).toMatchObject({
      type: "code_diff",
      status: "accepted",
    });
    expect(loaded?.promptDraftByTask["task-1"]).toEqual({
      text: "draft only",
      attachedFilePaths: [],
      attachments: [],
    });
    expect(loaded?.workspaceInformation).toEqual({
      jiraIssues: [],
      confluencePages: [],
      figmaResources: [],
      storybookResources: [],
      linkedPullRequests: [],
      amplifyLinks: [],
      slackThreads: [],
      notes: "",
      todos: [],
      customFields: [],
    });
    expect(loaded?.providerSessionByTask).toEqual({});
    expect(loaded?.editorTabs).toEqual([]);
    expect(loaded?.activeEditorTabId).toBeNull();
  });

  test("loads snapshots that include usage and prompt suggestions", async () => {
    setWindowApi({
      persistence: {
        listWorkspaces: async () => ({
          ok: true,
          rows: [
            { id: "base", name: "Base", updatedAt: "2026-03-08T00:00:00.000Z" },
          ],
        }),
        loadWorkspace: async () => ({
          ok: true,
          snapshot: {
            activeTaskId: "task-2",
            tasks: [
              {
                id: "task-2",
                title: "Task 2",
                titleManuallySet: true,
                provider: "claude-code",
                updatedAt: "2026-03-08T00:00:00.000Z",
                unread: false,
              },
            ],
            messagesByTask: {
              "task-2": [
                {
                  id: "m-2",
                  role: "assistant",
                  model: "claude-sonnet-4-6",
                  providerId: "claude-code",
                  content: "Done",
                  usage: {
                    inputTokens: 10,
                    outputTokens: 20,
                    cacheReadTokens: 5,
                    totalCostUsd: 0.02,
                  },
                  promptSuggestions: ["Open a PR with these changes"],
                  parts: [{ type: "text", text: "Done" }],
                },
              ],
            },
            providerSessionByTask: {
              "task-2": {
                "claude-code": "session-live-2",
              },
            },
          },
        }),
        upsertWorkspace: async () => ({ ok: true }),
      },
    });

    const loaded = await loadWorkspaceSnapshot({ workspaceId: "base" });

    expect(loaded?.messagesByTask["task-2"]?.[0]?.usage).toEqual({
      inputTokens: 10,
      outputTokens: 20,
      cacheReadTokens: 5,
      totalCostUsd: 0.02,
    });
    expect(loaded?.messagesByTask["task-2"]?.[0]?.promptSuggestions).toEqual([
      "Open a PR with these changes",
    ]);
    expect(loaded?.tasks[0]?.titleManuallySet).toBe(true);
    expect(loaded?.providerSessionByTask).toEqual({
      "task-2": {
        "claude-code": "session-live-2",
      },
    });
    expect(loaded?.workspaceInformation).toEqual({
      jiraIssues: [],
      confluencePages: [],
      figmaResources: [],
      storybookResources: [],
      linkedPullRequests: [],
      amplifyLinks: [],
      slackThreads: [],
      notes: "",
      todos: [],
      customFields: [],
    });
    expect(loaded?.editorTabs).toEqual([]);
    expect(loaded?.activeEditorTabId).toBeNull();
  });
});

describe("workspace store hydration ordering", () => {
  test("hydrateWorkspaces loads the persisted DB snapshot without overwriting it from renderer defaults", async () => {
    const localStorage = createMemoryStorage();
    const upsertCalls: Array<unknown> = [];
    setWindowContext({
      localStorage,
      api: {
        persistence: {
          listWorkspaces: async () => ({
            ok: true,
            rows: [
              {
                id: "ws-main",
                name: "Main",
                updatedAt: "2026-03-10T00:00:00.000Z",
              },
            ],
          }),
          loadWorkspace: async () => ({
            ok: true,
            snapshot: {
              activeTaskId: "task-db",
              tasks: [
                {
                  id: "task-db",
                  title: "Recovered Task",
                  provider: "codex",
                  updatedAt: "2026-03-10T00:00:00.000Z",
                  unread: false,
                },
              ],
              messagesByTask: {
                "task-db": [
                  {
                    id: "task-db-m-1",
                    role: "assistant",
                    model: "gpt-5",
                    providerId: "codex",
                    content: "loaded from db",
                    parts: [{ type: "text", text: "loaded from db" }],
                  },
                ],
              },
              promptDraftByTask: {
                "task-db": {
                  text: "draft from db",
                },
              },
              providerSessionByTask: {
                "task-db": {
                  codex: "thread-db-1",
                },
              },
            },
          }),
          upsertWorkspace: async (args: unknown) => {
            upsertCalls.push(args);
            return { ok: true };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      workspaces: [
        { id: "ws-main", name: "Main", updatedAt: "2026-03-09T00:00:00.000Z" },
      ],
      activeWorkspaceId: "ws-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: { "ws-main": "/tmp/stave-project" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
      tasks: [],
      messagesByTask: {},
      promptDraftByTask: {},
      providerSessionByTask: {},
      hasHydratedWorkspaces: false,
    });

    await useAppStore.getState().hydrateWorkspaces();
    await Bun.sleep(0);

    const nextState = useAppStore.getState();
    expect(upsertCalls).toHaveLength(0);
    expect(nextState.hasHydratedWorkspaces).toBe(true);
    expect(nextState.activeTaskId).toBe("task-db");
    expect(nextState.tasks.map((task) => task.id)).toEqual(["task-db"]);
    expect(nextState.messagesByTask["task-db"]?.[0]?.content).toBe(
      "loaded from db",
    );
    expect(nextState.promptDraftByTask["task-db"]?.text).toBe("draft from db");
    expect(nextState.providerSessionByTask["task-db"]).toEqual({
      codex: "thread-db-1",
    });
  });

  test("hydrateWorkspaces recovers persisted tasks when the cached workspace session is empty", async () => {
    const localStorage = createMemoryStorage();
    setWindowContext({
      localStorage,
      api: {
        fs: {
          listFiles: async () => ({ ok: true, files: ["package.json"] }),
          readFile: async () => ({ ok: false }),
          writeFile: async () => ({ ok: false }),
        },
        persistence: {
          listWorkspaces: async () => ({
            ok: true,
            rows: [
              {
                id: "ws-main",
                name: "Default Workspace",
                updatedAt: "2026-03-10T00:00:00.000Z",
              },
            ],
          }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          loadWorkspaceShell: async () => ({
            ok: true,
            shell: {
              activeTaskId: "task-db",
              tasks: [
                {
                  id: "task-db",
                  title: "Recovered Task",
                  provider: "codex",
                  updatedAt: "2026-03-10T00:00:00.000Z",
                  unread: false,
                },
              ],
              promptDraftByTask: {},
              providerSessionByTask: {},
              messageCountByTask: { "task-db": 0 },
              workspaceInformation: {
                jiraIssues: [],
                confluencePages: [],
                figmaResources: [],
                storybookResources: [],
                linkedPullRequests: [],
                slackThreads: [],
                notes: "",
                todos: [],
                customFields: [],
              },
              editorTabs: [],
              activeEditorTabId: null,
            },
          }),
          listLatestWorkspaceTurns: async () => ({ ok: true, turns: [] }),
          upsertWorkspace: async () => ({ ok: true }),
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      workspaces: [
        {
          id: "ws-main",
          name: "Default Workspace",
          updatedAt: "2026-03-09T00:00:00.000Z",
        },
      ],
      activeWorkspaceId: "ws-main",
      projectPath: "/tmp/stave-project",
      projectName: "stave-project",
      workspacePathById: { "ws-main": "/tmp/stave-project" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
      workspaceRuntimeCacheById: {
        "ws-main": {
          activeTaskId: "",
          tasks: [],
          messagesByTask: {},
          messageCountByTask: {},
          promptDraftByTask: {},
          workspaceInformation: {
            jiraIssues: [],
            confluencePages: [],
            figmaResources: [],
            storybookResources: [],
            linkedPullRequests: [],
            slackThreads: [],
            notes: "",
            todos: [],
            customFields: [],
          },
          editorTabs: [],
          activeEditorTabId: null,
          activeTurnIdsByTask: {},
          providerSessionByTask: {},
          nativeSessionReadyByTask: {},
        },
      },
      hasHydratedWorkspaces: false,
      projectFiles: [],
    });

    await useAppStore.getState().hydrateWorkspaces();

    const nextState = useAppStore.getState();
    expect(nextState.activeTaskId).toBe("task-db");
    expect(nextState.tasks.map((task) => task.id)).toEqual(["task-db"]);
    expect(nextState.workspaceRuntimeCacheById["ws-main"]).toBeUndefined();
  });

  test("hydrateWorkspaces appends an interruption note for incomplete turns from a previous app session", async () => {
    const localStorage = createMemoryStorage();
    setWindowContext({
      localStorage,
      api: {
        persistence: {
          listWorkspaces: async () => ({
            ok: true,
            rows: [
              {
                id: "ws-main",
                name: "Main",
                updatedAt: "2026-03-10T00:00:00.000Z",
              },
            ],
          }),
          loadWorkspace: async () => ({
            ok: true,
            snapshot: {
              activeTaskId: "task-stale",
              tasks: [
                {
                  id: "task-stale",
                  title: "Interrupted Task",
                  provider: "codex",
                  updatedAt: "2026-03-10T00:00:00.000Z",
                  unread: false,
                },
              ],
              messagesByTask: {
                "task-stale": [
                  {
                    id: "task-stale-m-1",
                    role: "assistant",
                    model: "gpt-5",
                    providerId: "codex",
                    content: "partial response",
                    parts: [
                      { type: "text", text: "partial response" },
                      {
                        type: "approval",
                        toolName: "bash",
                        description: "Run npm test",
                        requestId: "approval-stale-1",
                        state: "approval-requested",
                      },
                    ],
                  },
                ],
              },
              promptDraftByTask: {},
              providerSessionByTask: {},
            },
          }),
          listLatestWorkspaceTurns: async () => ({
            ok: true,
            turns: [
              {
                id: "turn-stale-1",
                workspaceId: "ws-main",
                taskId: "task-stale",
                providerId: "codex",
                createdAt: "2026-03-10T00:00:00.000Z",
                completedAt: null,
                eventCount: 1,
              },
            ],
          }),
          upsertWorkspace: async () => ({ ok: true }),
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      workspaces: [
        { id: "ws-main", name: "Main", updatedAt: "2026-03-09T00:00:00.000Z" },
      ],
      activeWorkspaceId: "ws-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: { "ws-main": "/tmp/stave-project" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
      hasHydratedWorkspaces: false,
    });

    await useAppStore.getState().hydrateWorkspaces();
    await Bun.sleep(0);

    const nextState = useAppStore.getState();
    const messages = nextState.messagesByTask["task-stale"] ?? [];
    expect(nextState.activeTurnIdsByTask["task-stale"]).toBeUndefined();
    expect(messages).toHaveLength(2);
    expect(messages[0]?.parts[1]).toMatchObject({
      type: "approval",
      requestId: "approval-stale-1",
      state: "approval-interrupted",
    });
    expect(messages.at(-1)?.content).toBe(
      "Generation interrupted because Stave was closed before this turn completed.",
    );
    expect(messages.at(-1)?.parts).toEqual([
      {
        type: "system_event",
        content:
          "Generation interrupted because Stave was closed before this turn completed.",
      },
    ]);
  });

  test("hydrateWorkspaces eventually restores projectFiles for the explorer on boot", async () => {
    const localStorage = createMemoryStorage();
    const listedFiles = ["package.json", "src/App.tsx"];
    setWindowContext({
      localStorage,
      api: {
        fs: {
          pickRoot: async () => ({ ok: false }),
          listFiles: async () => ({ ok: true, files: listedFiles }),
          readFile: async () => ({ ok: false }),
          writeFile: async () => ({ ok: false }),
        },
        persistence: {
          listWorkspaces: async () => ({
            ok: true,
            rows: [
              {
                id: "ws-main",
                name: "default",
                updatedAt: "2026-03-10T00:00:00.000Z",
              },
            ],
          }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          listLatestWorkspaceTurns: async () => ({ ok: true, turns: [] }),
        },
      },
    });

    const [{ workspaceFsAdapter }, { useAppStore }] = await Promise.all([
      import("../src/lib/fs"),
      import("../src/store/app.store"),
    ]);
    await (
      workspaceFsAdapter as {
        setRoot?: (args: {
          rootPath: string;
          rootName: string;
          files?: string[];
        }) => Promise<void>;
      }
    ).setRoot?.({
      rootPath: "/tmp/stave-project",
      rootName: "fixture",
      files: [],
    });

    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      workspaces: [
        {
          id: "ws-main",
          name: "default",
          updatedAt: "2026-03-09T00:00:00.000Z",
        },
      ],
      activeWorkspaceId: "ws-main",
      projectPath: "/tmp/stave-project",
      projectName: "fixture",
      workspacePathById: { "ws-main": "/tmp/stave-project" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
      projectFiles: [],
      hasHydratedWorkspaces: false,
    });

    await useAppStore.getState().hydrateWorkspaces();
    await Bun.sleep(0);

    expect(useAppStore.getState().projectFiles).toEqual(listedFiles);
  });

  test("hydrateWorkspaces does not wait for file refresh on boot", async () => {
    const localStorage = createMemoryStorage();
    let resolveListFiles:
      ((value: { ok: boolean; files: string[] }) => void) | null = null;
    const listFilesPromise = new Promise<{ ok: boolean; files: string[] }>(
      (resolve) => {
        resolveListFiles = resolve;
      },
    );
    setWindowContext({
      localStorage,
      api: {
        fs: {
          pickRoot: async () => ({ ok: false }),
          listFiles: async () => listFilesPromise,
          readFile: async () => ({ ok: false }),
          writeFile: async () => ({ ok: false }),
        },
        persistence: {
          listWorkspaces: async () => ({
            ok: true,
            rows: [
              {
                id: "ws-main-fast-hydrate",
                name: "default",
                updatedAt: "2026-03-10T00:00:00.000Z",
              },
            ],
          }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          listLatestWorkspaceTurns: async () => ({ ok: true, turns: [] }),
        },
      },
    });

    const [{ workspaceFsAdapter }, { useAppStore }] = await Promise.all([
      import("../src/lib/fs"),
      import("../src/store/app.store"),
    ]);
    await (
      workspaceFsAdapter as {
        setRoot?: (args: {
          rootPath: string;
          rootName: string;
          files?: string[];
        }) => Promise<void>;
      }
    ).setRoot?.({
      rootPath: "/tmp/stave-project-fast-hydrate",
      rootName: "fixture",
      files: [],
    });

    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      workspaces: [
        {
          id: "ws-main-fast-hydrate",
          name: "default",
          updatedAt: "2026-03-09T00:00:00.000Z",
        },
      ],
      activeWorkspaceId: "ws-main-fast-hydrate",
      projectPath: "/tmp/stave-project-fast-hydrate",
      projectName: "fixture",
      workspacePathById: {
        "ws-main-fast-hydrate": "/tmp/stave-project-fast-hydrate",
      },
      workspaceBranchById: { "ws-main-fast-hydrate": "main" },
      workspaceDefaultById: { "ws-main-fast-hydrate": true },
      projectFiles: [],
      hasHydratedWorkspaces: false,
    });

    let hydrated = false;
    const hydratePromise = useAppStore
      .getState()
      .hydrateWorkspaces()
      .then(() => {
        hydrated = true;
      });

    await Bun.sleep(0);

    expect(hydrated).toBe(true);
    expect(useAppStore.getState().projectFiles).toEqual([]);

    resolveListFiles?.({
      ok: true,
      files: ["package.json", "src/boot-fast.ts"],
    });
    await hydratePromise;
    await Bun.sleep(0);

    expect(useAppStore.getState().projectFiles).toEqual([
      "package.json",
      "src/boot-fast.ts",
    ]);
  });

  test("hydrateWorkspaces resolves after shell hydrate and backfills task messages asynchronously", async () => {
    const localStorage = createMemoryStorage();
    let resolveTaskMessages:
      | ((value: {
          ok: boolean;
          page: {
            messages: Array<{
              id: string;
              role: "assistant";
              model: string;
              providerId: "codex";
              content: string;
              isStreaming: boolean;
              parts: Array<{ type: "text"; text: string }>;
            }>;
            totalCount: number;
            limit: number;
            offset: number;
            hasMoreOlder: boolean;
          };
        }) => void)
      | null = null;
    const taskMessagesPromise = new Promise<{
      ok: boolean;
      page: {
        messages: Array<{
          id: string;
          role: "assistant";
          model: string;
          providerId: "codex";
          content: string;
          isStreaming: boolean;
          parts: Array<{ type: "text"; text: string }>;
        }>;
        totalCount: number;
        limit: number;
        offset: number;
        hasMoreOlder: boolean;
      };
    }>((resolve) => {
      resolveTaskMessages = resolve;
    });
    setWindowContext({
      localStorage,
      api: {
        fs: {
          pickRoot: async () => ({ ok: false }),
          listFiles: async () => ({ ok: true, files: ["package.json"] }),
          readFile: async () => ({ ok: false }),
          writeFile: async () => ({ ok: false }),
        },
        persistence: {
          listWorkspaces: async () => ({
            ok: true,
            rows: [
              {
                id: "ws-main-hydrate",
                name: "default",
                updatedAt: "2026-03-10T00:00:00.000Z",
              },
            ],
          }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          loadWorkspaceShell: async () => ({
            ok: true,
            shell: {
              activeTaskId: "task-main-hydrate",
              tasks: [
                {
                  id: "task-main-hydrate",
                  title: "Hydrated Task",
                  provider: "codex",
                  updatedAt: "2026-03-10T00:00:00.000Z",
                  unread: false,
                },
              ],
              promptDraftByTask: {},
              providerSessionByTask: {},
              messageCountByTask: { "task-main-hydrate": 1 },
              workspaceInformation: {
                jiraIssues: [],
                confluencePages: [],
                figmaResources: [],
                storybookResources: [],
                linkedPullRequests: [],
                slackThreads: [],
                notes: "",
                todos: [],
                customFields: [],
              },
              editorTabs: [],
              activeEditorTabId: null,
            },
          }),
          loadTaskMessages: async () => taskMessagesPromise,
          listLatestWorkspaceTurns: async () => ({ ok: true, turns: [] }),
          loadProjectRegistry: async () => ({ ok: true, projects: [] }),
          saveProjectRegistry: async () => ({ ok: true }),
          upsertWorkspace: async () => ({ ok: true }),
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: false,
      workspaces: [
        {
          id: "ws-main-hydrate",
          name: "default",
          updatedAt: "2026-03-10T00:00:00.000Z",
        },
      ],
      activeWorkspaceId: "ws-main-hydrate",
      projectPath: "/tmp/stave-project-hydrate",
      projectName: "stave-project-hydrate",
      workspacePathById: { "ws-main-hydrate": "/tmp/stave-project-hydrate" },
      workspaceBranchById: { "ws-main-hydrate": "main" },
      workspaceDefaultById: { "ws-main-hydrate": true },
      projectFiles: [],
    });

    let hydrated = false;
    const hydratePromise = useAppStore
      .getState()
      .hydrateWorkspaces()
      .then(() => {
        hydrated = true;
      });

    await Bun.sleep(0);

    expect(hydrated).toBe(true);
    expect(useAppStore.getState().activeTaskId).toBe("task-main-hydrate");
    expect(useAppStore.getState().tasks.map((task) => task.id)).toEqual([
      "task-main-hydrate",
    ]);
    expect(useAppStore.getState().projectFiles).toEqual(["package.json"]);
    expect(
      useAppStore.getState().messagesByTask["task-main-hydrate"],
    ).toBeUndefined();
    expect(
      useAppStore.getState().taskMessagesLoadingByTask["task-main-hydrate"],
    ).toBe(true);

    resolveTaskMessages?.({
      ok: true,
      page: {
        messages: [
          {
            id: "task-main-hydrate-m-1",
            role: "assistant",
            model: "gpt-5.4",
            providerId: "codex",
            content: "hydrated message",
            isStreaming: false,
            parts: [{ type: "text", text: "hydrated message" }],
          },
        ],
        totalCount: 1,
        limit: 120,
        offset: 0,
        hasMoreOlder: false,
      },
    });
    await hydratePromise;
    await Bun.sleep(0);

    expect(
      useAppStore.getState().messagesByTask["task-main-hydrate"]?.at(-1)
        ?.content,
    ).toBe("hydrated message");
    expect(
      useAppStore.getState().taskMessagesLoadingByTask["task-main-hydrate"],
    ).toBe(false);
  });

  test("hydrateWorkspaces clears stale active turn state before interrupted task messages finish hydrating", async () => {
    const localStorage = createMemoryStorage();
    let resolveTaskMessages:
      | ((value: {
          ok: boolean;
          page: {
            messages: Array<{
              id: string;
              role: "assistant";
              model: string;
              providerId: "codex";
              content: string;
              isStreaming: boolean;
              parts: Array<{ type: "text"; text: string }>;
            }>;
            totalCount: number;
            limit: number;
            offset: number;
            hasMoreOlder: boolean;
          };
        }) => void)
      | null = null;
    const taskMessagesPromise = new Promise<{
      ok: boolean;
      page: {
        messages: Array<{
          id: string;
          role: "assistant";
          model: string;
          providerId: "codex";
          content: string;
          isStreaming: boolean;
          parts: Array<{ type: "text"; text: string }>;
        }>;
        totalCount: number;
        limit: number;
        offset: number;
        hasMoreOlder: boolean;
      };
    }>((resolve) => {
      resolveTaskMessages = resolve;
    });
    setWindowContext({
      localStorage,
      api: {
        fs: {
          pickRoot: async () => ({ ok: false }),
          listFiles: async () => ({ ok: true, files: ["package.json"] }),
          readFile: async () => ({ ok: false }),
          writeFile: async () => ({ ok: false }),
        },
        persistence: {
          listWorkspaces: async () => ({
            ok: true,
            rows: [
              {
                id: "ws-main-interrupted",
                name: "default",
                updatedAt: "2026-03-10T00:00:00.000Z",
              },
            ],
          }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          loadWorkspaceShell: async () => ({
            ok: true,
            shell: {
              activeTaskId: "task-main-interrupted",
              tasks: [
                {
                  id: "task-main-interrupted",
                  title: "Interrupted Hydration Task",
                  provider: "codex",
                  updatedAt: "2026-03-10T00:00:00.000Z",
                  unread: false,
                },
              ],
              promptDraftByTask: {},
              providerSessionByTask: {},
              messageCountByTask: { "task-main-interrupted": 1 },
              workspaceInformation: {
                jiraIssues: [],
                confluencePages: [],
                figmaResources: [],
                storybookResources: [],
                linkedPullRequests: [],
                slackThreads: [],
                notes: "",
                todos: [],
                customFields: [],
              },
              editorTabs: [],
              activeEditorTabId: null,
            },
          }),
          loadTaskMessages: async () => taskMessagesPromise,
          listLatestWorkspaceTurns: async () => ({
            ok: true,
            turns: [
              {
                id: "turn-main-interrupted",
                workspaceId: "ws-main-interrupted",
                taskId: "task-main-interrupted",
                providerId: "codex",
                createdAt: "2026-03-10T00:00:00.000Z",
                completedAt: null,
                eventCount: 1,
              },
            ],
          }),
          loadProjectRegistry: async () => ({ ok: true, projects: [] }),
          saveProjectRegistry: async () => ({ ok: true }),
          upsertWorkspace: async () => ({ ok: true }),
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: false,
      workspaces: [
        {
          id: "ws-main-interrupted",
          name: "default",
          updatedAt: "2026-03-10T00:00:00.000Z",
        },
      ],
      activeWorkspaceId: "ws-main-interrupted",
      projectPath: "/tmp/stave-project-interrupted",
      projectName: "stave-project-interrupted",
      workspacePathById: {
        "ws-main-interrupted": "/tmp/stave-project-interrupted",
      },
      workspaceBranchById: { "ws-main-interrupted": "main" },
      workspaceDefaultById: { "ws-main-interrupted": true },
      projectFiles: [],
    });

    let hydrated = false;
    const hydratePromise = useAppStore
      .getState()
      .hydrateWorkspaces()
      .then(() => {
        hydrated = true;
      });

    await Bun.sleep(0);

    const hydratedState = useAppStore.getState();
    expect(hydrated).toBe(true);
    expect(
      hydratedState.activeTurnIdsByTask["task-main-interrupted"],
    ).toBeUndefined();
    expect(
      hydratedState.taskMessagesLoadingByTask["task-main-interrupted"],
    ).toBe(true);

    resolveTaskMessages?.({
      ok: true,
      page: {
        messages: [
          {
            id: "task-main-interrupted-m-1",
            role: "assistant",
            model: "gpt-5.4",
            providerId: "codex",
            content: "partial response",
            isStreaming: false,
            parts: [{ type: "text", text: "partial response" }],
          },
        ],
        totalCount: 1,
        limit: 120,
        offset: 0,
        hasMoreOlder: false,
      },
    });
    await hydratePromise;
    await Bun.sleep(0);

    const finalMessages =
      useAppStore.getState().messagesByTask["task-main-interrupted"] ?? [];
    expect(finalMessages.at(-1)?.content).toBe(
      "Generation interrupted because Stave was closed before this turn completed.",
    );
  });

  test("hydrateWorkspaces auto-imports existing git worktrees missing from the DB", async () => {
    const localStorage = createMemoryStorage();
    const upsertCalls: Array<{ id: string; name: string; snapshot: unknown }> =
      [];
    setWindowContext({
      localStorage,
      api: {
        persistence: {
          listWorkspaces: async () => ({
            ok: true,
            rows: [
              {
                id: "ws-main",
                name: "Main",
                updatedAt: "2026-03-10T00:00:00.000Z",
              },
            ],
          }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          listLatestWorkspaceTurns: async () => ({ ok: true, turns: [] }),
          upsertWorkspace: async (args: {
            id: string;
            name: string;
            snapshot: unknown;
          }) => {
            upsertCalls.push(args);
            return { ok: true };
          },
        },
        terminal: {
          runCommand: async ({
            command,
          }: {
            cwd?: string;
            command: string;
          }) => {
            if (command === "git worktree prune") {
              return { ok: true, code: 0, stdout: "", stderr: "" };
            }
            if (command === "git worktree list --porcelain") {
              return {
                ok: true,
                code: 0,
                stdout: [
                  "worktree /tmp/stave-project",
                  "HEAD abc123",
                  "branch refs/heads/main",
                  "",
                  "worktree /tmp/stave-project/.stave/workspaces/feature__perf",
                  "HEAD def456",
                  "branch refs/heads/feature/perf",
                ].join("\n"),
                stderr: "",
              };
            }
            return {
              ok: false,
              code: 1,
              stdout: "",
              stderr: `Unexpected command: ${command}`,
            };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      workspaces: [
        { id: "ws-main", name: "Main", updatedAt: "2026-03-09T00:00:00.000Z" },
      ],
      activeWorkspaceId: "ws-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: { "ws-main": "/tmp/stave-project" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
      hasHydratedWorkspaces: false,
    });

    await useAppStore.getState().hydrateWorkspaces();

    const nextState = useAppStore.getState();
    const importedWorkspace = nextState.workspaces.find(
      (workspace) => workspace.name === "feature/perf",
    );

    expect(importedWorkspace).not.toBeUndefined();
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0]?.name).toBe("feature/perf");
    expect(importedWorkspace?.id).toBe(upsertCalls[0]?.id);
    expect(nextState.workspaceBranchById[importedWorkspace?.id ?? ""]).toBe(
      "feature/perf",
    );
    expect(nextState.workspacePathById[importedWorkspace?.id ?? ""]).toBe(
      "/tmp/stave-project/.stave/workspaces/feature__perf",
    );
  });

  test("hydrateWorkspaces skips worktrees archived in the project registry", async () => {
    const localStorage = createMemoryStorage();
    const upsertCalls: Array<{ id: string; name: string; snapshot: unknown }> =
      [];
    const projectPath = "/tmp/stave-project";
    const defaultWorkspaceId = buildProjectDefaultWorkspaceId({ projectPath });
    const archivedWorkspacePath =
      "/tmp/stave-project/.stave/workspaces/feature__perf";

    setWindowContext({
      localStorage,
      api: {
        persistence: {
          listWorkspaces: async () => ({
            ok: true,
            rows: [
              {
                id: defaultWorkspaceId,
                name: "Default Workspace",
                updatedAt: "2026-03-10T00:00:00.000Z",
              },
            ],
          }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          listLatestWorkspaceTurns: async () => ({ ok: true, turns: [] }),
          loadProjectRegistry: async () => ({
            ok: true,
            projects: [
              {
                projectPath,
                projectName: "stave-project",
                lastOpenedAt: "2026-03-10T00:00:00.000Z",
                defaultBranch: "main",
                workspaces: [
                  {
                    id: defaultWorkspaceId,
                    name: "Default Workspace",
                    updatedAt: "2026-03-10T00:00:00.000Z",
                  },
                ],
                activeWorkspaceId: defaultWorkspaceId,
                workspaceBranchById: { [defaultWorkspaceId]: "main" },
                workspacePathById: { [defaultWorkspaceId]: projectPath },
                workspaceDefaultById: { [defaultWorkspaceId]: true },
                archivedWorkspacePaths: [archivedWorkspacePath],
              },
            ],
          }),
          saveProjectRegistry: async () => ({ ok: true }),
          upsertWorkspace: async (args: {
            id: string;
            name: string;
            snapshot: unknown;
          }) => {
            upsertCalls.push(args);
            return { ok: true };
          },
        },
        terminal: {
          runCommand: async ({
            command,
          }: {
            cwd?: string;
            command: string;
          }) => {
            if (command === "git worktree prune") {
              return { ok: true, code: 0, stdout: "", stderr: "" };
            }
            if (command === "git worktree list --porcelain") {
              return {
                ok: true,
                code: 0,
                stdout: [
                  "worktree /tmp/stave-project",
                  "HEAD abc123",
                  "branch refs/heads/main",
                  "",
                  "worktree /tmp/stave-project/.stave/workspaces/feature__perf",
                  "HEAD def456",
                  "branch refs/heads/feature/perf",
                ].join("\n"),
                stderr: "",
              };
            }
            return {
              ok: false,
              code: 1,
              stdout: "",
              stderr: `Unexpected command: ${command}`,
            };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      projectPath,
      projectName: "stave-project",
      defaultBranch: "main",
      hasHydratedWorkspaces: false,
    });

    await useAppStore.getState().hydrateWorkspaces();

    const nextState = useAppStore.getState();
    expect(nextState.workspaces.map((workspace) => workspace.id)).toEqual([
      defaultWorkspaceId,
    ]);
    expect(
      nextState.workspaces.some(
        (workspace) => workspace.name === "feature/perf",
      ),
    ).toBe(false);
    expect(upsertCalls).toHaveLength(0);
  });

  test("hydrateWorkspaces keeps worktrees archived even when the cached project state lost the tombstone", async () => {
    const localStorage = createMemoryStorage();
    const upsertCalls: Array<{ id: string; name: string; snapshot: unknown }> =
      [];
    const projectPath = "/tmp/stave-project";
    const defaultWorkspaceId = buildProjectDefaultWorkspaceId({ projectPath });
    const archivedWorkspacePath =
      "/tmp/stave-project/.stave/workspaces/feature__perf";
    const registryProject = {
      projectPath,
      projectName: "stave-project",
      lastOpenedAt: "2026-03-10T00:00:00.000Z",
      defaultBranch: "main",
      workspaces: [
        {
          id: defaultWorkspaceId,
          name: "Default Workspace",
          updatedAt: "2026-03-10T00:00:00.000Z",
        },
      ],
      activeWorkspaceId: defaultWorkspaceId,
      workspaceBranchById: { [defaultWorkspaceId]: "main" },
      workspacePathById: { [defaultWorkspaceId]: projectPath },
      workspaceDefaultById: { [defaultWorkspaceId]: true },
    };

    setWindowContext({
      localStorage,
      api: {
        persistence: {
          listWorkspaces: async () => ({
            ok: true,
            rows: [
              {
                id: defaultWorkspaceId,
                name: "Default Workspace",
                updatedAt: "2026-03-10T00:00:00.000Z",
              },
            ],
          }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          listLatestWorkspaceTurns: async () => ({ ok: true, turns: [] }),
          // The SQLite registry mirror still remembers the tombstone.
          loadProjectRegistry: async () => ({
            ok: true,
            projects: [
              {
                ...registryProject,
                archivedWorkspacePaths: [archivedWorkspacePath],
              },
            ],
          }),
          saveProjectRegistry: async () => ({ ok: true }),
          upsertWorkspace: async (args: {
            id: string;
            name: string;
            snapshot: unknown;
          }) => {
            upsertCalls.push(args);
            return { ok: true };
          },
        },
        terminal: {
          runCommand: async ({
            command,
          }: {
            cwd?: string;
            command: string;
          }) => {
            if (command === "git worktree prune") {
              return { ok: true, code: 0, stdout: "", stderr: "" };
            }
            if (command === "git worktree list --porcelain") {
              return {
                ok: true,
                code: 0,
                stdout: [
                  "worktree /tmp/stave-project",
                  "HEAD abc123",
                  "branch refs/heads/main",
                  "",
                  "worktree /tmp/stave-project/.stave/workspaces/feature__perf",
                  "HEAD def456",
                  "branch refs/heads/feature/perf",
                ].join("\n"),
                stderr: "",
              };
            }
            return {
              ok: false,
              code: 1,
              stdout: "",
              stderr: `Unexpected command: ${command}`,
            };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      projectPath,
      projectName: "stave-project",
      defaultBranch: "main",
      hasHydratedWorkspaces: false,
      // The localStorage cache lost the tombstone AND looks newer than the
      // registry mirror — the merge must still restore the tombstone.
      recentProjects: [
        {
          ...registryProject,
          lastOpenedAt: "2026-03-11T00:00:00.000Z",
        },
      ],
    });

    await useAppStore.getState().hydrateWorkspaces();

    const nextState = useAppStore.getState();
    expect(nextState.workspaces.map((workspace) => workspace.id)).toEqual([
      defaultWorkspaceId,
    ]);
    expect(
      nextState.workspaces.some(
        (workspace) => workspace.name === "feature/perf",
      ),
    ).toBe(false);
    expect(upsertCalls).toHaveLength(0);
    expect(
      nextState.recentProjects.find(
        (project) => project.projectPath === projectPath,
      )?.archivedWorkspacePaths,
    ).toEqual([archivedWorkspacePath]);
  });

  test("refreshWorkspaces does not overwrite an already persisted imported worktree with an empty snapshot", async () => {
    const localStorage = createMemoryStorage();
    const upsertCalls: Array<{ id: string; name: string; snapshot: unknown }> =
      [];
    const { buildImportedWorktreeWorkspaceId } =
      await import("../src/store/project.utils");
    const importedWorkspaceId = buildImportedWorktreeWorkspaceId({
      projectPath: "/tmp/stave-project",
      worktreePath: "/tmp/stave-project/.stave/workspaces/feature__perf",
    });

    setWindowContext({
      localStorage,
      api: {
        persistence: {
          listWorkspaces: async () => ({
            ok: true,
            rows: [
              {
                id: "ws-main",
                name: "Main",
                updatedAt: "2026-03-10T00:00:00.000Z",
              },
              {
                id: importedWorkspaceId,
                name: "feature/perf",
                updatedAt: "2026-03-10T00:10:00.000Z",
              },
            ],
          }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          listLatestWorkspaceTurns: async () => ({ ok: true, turns: [] }),
          upsertWorkspace: async (args: {
            id: string;
            name: string;
            snapshot: unknown;
          }) => {
            upsertCalls.push(args);
            return { ok: true };
          },
        },
        terminal: {
          runCommand: async ({
            command,
          }: {
            cwd?: string;
            command: string;
          }) => {
            if (command === "git worktree prune") {
              return { ok: true, code: 0, stdout: "", stderr: "" };
            }
            if (command === "git worktree list --porcelain") {
              return {
                ok: true,
                code: 0,
                stdout: [
                  "worktree /tmp/stave-project",
                  "HEAD abc123",
                  "branch refs/heads/main",
                  "",
                  "worktree /tmp/stave-project/.stave/workspaces/feature__perf",
                  "HEAD def456",
                  "branch refs/heads/feature/perf",
                ].join("\n"),
                stderr: "",
              };
            }
            return {
              ok: false,
              code: 1,
              stdout: "",
              stderr: `Unexpected command: ${command}`,
            };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [
        { id: "ws-main", name: "Main", updatedAt: "2026-03-09T00:00:00.000Z" },
      ],
      activeWorkspaceId: "ws-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: { "ws-main": "/tmp/stave-project" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
    });

    await useAppStore.getState().refreshWorkspaces();

    const nextState = useAppStore.getState();
    const importedWorkspace = nextState.workspaces.find(
      (workspace) => workspace.id === importedWorkspaceId,
    );
    expect(upsertCalls).toHaveLength(0);
    expect(importedWorkspace).not.toBeUndefined();
    expect(importedWorkspace?.name).toBe("feature/perf");
    expect(nextState.workspaceBranchById[importedWorkspaceId]).toBe(
      "feature/perf",
    );
    expect(nextState.workspacePathById[importedWorkspaceId]).toBe(
      "/tmp/stave-project/.stave/workspaces/feature__perf",
    );
  });

  test("flushActiveWorkspaceSnapshot is blocked until workspace hydration completes", async () => {
    const localStorage = createMemoryStorage();
    const upsertCalls: Array<unknown> = [];
    setWindowContext({
      localStorage,
      api: {
        persistence: {
          listWorkspaces: async () => ({ ok: true, rows: [] }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          upsertWorkspace: async (args: unknown) => {
            upsertCalls.push(args);
            return { ok: true };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: false,
      workspaces: [
        { id: "ws-main", name: "Main", updatedAt: "2026-03-10T00:00:00.000Z" },
      ],
      activeWorkspaceId: "ws-main",
      activeTaskId: "task-1",
      tasks: [
        {
          id: "task-1",
          title: "Task 1",
          provider: "claude-code",
          updatedAt: "2026-03-10T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: {
        "task-1": [
          {
            id: "task-1-m-1",
            role: "user",
            model: "user",
            providerId: "user",
            content: "persist me",
            parts: [{ type: "text", text: "persist me" }],
          },
        ],
      },
    });

    await useAppStore.getState().flushActiveWorkspaceSnapshot();
    expect(upsertCalls).toHaveLength(0);

    useAppStore.setState({ hasHydratedWorkspaces: true });
    await useAppStore.getState().flushActiveWorkspaceSnapshot();
    expect(upsertCalls).toHaveLength(1);
  });

  test("flushActiveWorkspaceSnapshot drops inactive legacy branch messages after completion", async () => {
    const localStorage = createMemoryStorage();
    const upsertCalls: Array<unknown> = [];
    setWindowContext({
      localStorage,
      api: {
        persistence: {
          listWorkspaces: async () => ({ ok: true, rows: [] }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          upsertWorkspace: async (args: unknown) => {
            upsertCalls.push(args);
            return { ok: true };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [
        { id: "ws-main", name: "Main", updatedAt: "2026-03-10T00:00:00.000Z" },
      ],
      activeWorkspaceId: "ws-main",
      activeTaskId: "task-parent",
      tasks: [
        {
          id: "task-parent",
          title: "Parent",
          provider: "claude-code",
          updatedAt: "2026-03-10T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
        {
          id: "task-idle",
          title: "Idle",
          provider: "claude-code",
          updatedAt: "2026-03-10T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: {
        "task-parent": [
          {
            id: "task-parent-m-1",
            role: "user",
            model: "user",
            providerId: "user",
            content: "start comparison",
            parts: [{ type: "text", text: "start comparison" }],
          },
        ],
        "branch-a": [
          {
            id: "branch-a-m-1",
            role: "assistant",
            model: "claude-sonnet-4-6",
            providerId: "claude-code",
            content: "branch answer",
            parts: [{ type: "text", text: "branch answer" }],
          },
        ],
        "task-idle": [
          {
            id: "task-idle-m-1",
            role: "user",
            model: "user",
            providerId: "user",
            content: "drop me",
            parts: [{ type: "text", text: "drop me" }],
          },
        ],
      },
      activeTurnIdsByTask: {},
      workspaceInformation: createEmptyWorkspaceInformation(),
    });

    await useAppStore.getState().flushActiveWorkspaceSnapshot();

    const nextState = useAppStore.getState();
    expect(nextState.messagesByTask["task-parent"]?.at(-1)?.content).toBe(
      "start comparison",
    );
    expect(nextState.messagesByTask["branch-a"]).toBeUndefined();
    expect(nextState.messagesByTask["task-idle"]).toBeUndefined();
    expect(upsertCalls).toHaveLength(1);
  });

  test("pane focus changes keep every open task pane resident after snapshot flush", async () => {
    const localStorage = createMemoryStorage();
    setWindowContext({
      localStorage,
      api: {
        persistence: {
          listWorkspaces: async () => ({ ok: true, rows: [] }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          upsertWorkspace: async () => ({ ok: true }),
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    const createMessage = (taskId: string, content: string) => ({
      id: `${taskId}-m-1`,
      role: "user" as const,
      model: "user",
      providerId: "user" as const,
      content,
      parts: [{ type: "text" as const, text: content }],
    });
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [
        { id: "ws-main", name: "Main", updatedAt: "2026-03-10T00:00:00.000Z" },
      ],
      activeWorkspaceId: "ws-main",
      activeTaskId: "task-left",
      activeSurface: { kind: "task", taskId: "task-left" },
      openTaskTabIds: ["task-left", "task-right"],
      tasks: [
        {
          id: "task-left",
          title: "Left Pane",
          provider: "codex",
          updatedAt: "2026-03-10T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
        {
          id: "task-right",
          title: "Right Pane",
          provider: "codex",
          updatedAt: "2026-03-10T00:01:00.000Z",
          unread: false,
          archivedAt: null,
        },
        {
          id: "task-closed",
          title: "Closed Task",
          provider: "codex",
          updatedAt: "2026-03-10T00:02:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: {
        "task-left": [createMessage("task-left", "keep left pane visible")],
        "task-right": [createMessage("task-right", "keep right pane visible")],
        "task-closed": [createMessage("task-closed", "compact closed task")],
      },
      activeTurnIdsByTask: {},
      workspaceInformation: createEmptyWorkspaceInformation(),
    });

    useAppStore.getState().setActiveSurfaceFromPane({
      kind: "task",
      taskId: "task-right",
    });
    await useAppStore.getState().flushActiveWorkspaceSnapshot();

    const nextState = useAppStore.getState();
    expect(nextState.activeTaskId).toBe("task-right");
    expect(nextState.messagesByTask["task-left"]?.at(-1)?.content).toBe(
      "keep left pane visible",
    );
    expect(nextState.messagesByTask["task-right"]?.at(-1)?.content).toBe(
      "keep right pane visible",
    );
    expect(nextState.messagesByTask["task-closed"]).toBeUndefined();
  });

  test("switchWorkspace preserves inactive workspace turn state and persists it when the stream completes", async () => {
    const localStorage = createMemoryStorage();
    const upsertCalls: Array<unknown> = [];
    const abortCalls: Array<string> = [];
    const cleanupCalls: Array<string> = [];
    let streamListener:
      | ((payload: { streamId: string; event: unknown; done: boolean }) => void)
      | null = null;

    (globalThis as { window: unknown }).window = {
      localStorage,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      api: {
        provider: {
          startPushTurn: async () => ({
            ok: true,
            streamId: "stream-1",
            turnId: "turn-main-1",
          }),
          subscribeStreamEvents: (listener: typeof streamListener) => {
            streamListener = listener;
            return () => {
              if (streamListener === listener) {
                streamListener = null;
              }
            };
          },
          abortTurn: async ({ turnId }: { turnId: string }) => {
            abortCalls.push(turnId);
            return { ok: true, message: "aborted" };
          },
          cleanupTask: async ({ taskId }: { taskId: string }) => {
            cleanupCalls.push(taskId);
            return { ok: true };
          },
        },
        persistence: {
          listWorkspaces: async () => ({
            ok: true,
            rows: [
              {
                id: "ws-main",
                name: "Main",
                updatedAt: "2026-03-10T00:00:00.000Z",
              },
              {
                id: "ws-alt",
                name: "Alt",
                updatedAt: "2026-03-10T00:00:01.000Z",
              },
            ],
          }),
          loadWorkspaceShell: async ({
            workspaceId,
          }: {
            workspaceId: string;
          }) => ({
            ok: true,
            shell:
              workspaceId === "ws-main"
                ? {
                    activeTaskId: "task-main",
                    tasks: [
                      {
                        id: "task-main",
                        title: "Main Task",
                        provider: "codex",
                        updatedAt: "2026-03-10T00:00:00.000Z",
                        unread: false,
                      },
                      {
                        id: "task-keep",
                        title: "Keep Task",
                        provider: "claude-code",
                        updatedAt: "2026-03-09T23:59:00.000Z",
                        unread: false,
                      },
                    ],
                    promptDraftByTask: {},
                    providerSessionByTask: {},
                    messageCountByTask: {
                      "task-main": 0,
                      "task-keep": 1,
                    },
                  }
                : workspaceId === "ws-alt"
                  ? {
                      activeTaskId: "task-alt",
                      tasks: [
                        {
                          id: "task-alt",
                          title: "Alt Task",
                          provider: "claude-code",
                          updatedAt: "2026-03-10T00:00:01.000Z",
                          unread: false,
                        },
                      ],
                      promptDraftByTask: {},
                      providerSessionByTask: {},
                      messageCountByTask: { "task-alt": 0 },
                    }
                  : null,
          }),
          loadWorkspace: async ({ workspaceId }: { workspaceId: string }) => ({
            ok: true,
            snapshot:
              workspaceId === "ws-alt"
                ? {
                    activeTaskId: "task-alt",
                    tasks: [
                      {
                        id: "task-alt",
                        title: "Alt Task",
                        provider: "claude-code",
                        updatedAt: "2026-03-10T00:00:01.000Z",
                        unread: false,
                      },
                    ],
                    messagesByTask: { "task-alt": [] },
                    promptDraftByTask: {},
                    providerSessionByTask: {},
                  }
                : null,
          }),
          upsertWorkspace: async (args: unknown) => {
            upsertCalls.push(args);
            return { ok: true };
          },
        },
        fs: {
          listFiles: async () => ({ ok: true, files: [] }),
        },
      },
    } as unknown;

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [
        { id: "ws-main", name: "Main", updatedAt: "2026-03-10T00:00:00.000Z" },
        { id: "ws-alt", name: "Alt", updatedAt: "2026-03-10T00:00:01.000Z" },
      ],
      activeWorkspaceId: "ws-main",
      activeTaskId: "task-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: {
        "ws-main": "/tmp/stave-project",
        "ws-alt": "/tmp/stave-project-alt",
      },
      workspaceBranchById: {
        "ws-main": "main",
        "ws-alt": "alt",
      },
      workspaceDefaultById: {
        "ws-main": true,
        "ws-alt": false,
      },
      draftProvider: "codex",
      tasks: [
        {
          id: "task-main",
          title: "Main Task",
          provider: "codex",
          updatedAt: "2026-03-10T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: { "task-main": [] },
      activeTurnIdsByTask: {},
      promptDraftByTask: {},
      nativeSessionReadyByTask: {},
      providerSessionByTask: {},
    });

    useAppStore.getState().sendUserMessage({
      taskId: "task-main",
      content: "Keep streaming while I switch workspaces.",
    });

    await Bun.sleep(0);

    const startedState = useAppStore.getState();
    const activeTurnId = startedState.activeTurnIdsByTask["task-main"];
    expect(activeTurnId).toBeString();
    expect(streamListener).toBeFunction();

    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-alt" });

    const switchedState = useAppStore.getState();
    expect(abortCalls).toEqual([]);
    expect(cleanupCalls).toEqual([]);
    // Switching flushes the outgoing workspace so pending snapshot changes
    // (an archived task, a closed tab) survive a restart.
    expect(upsertCalls).toHaveLength(1);
    expect(switchedState.activeWorkspaceId).toBe("ws-alt");
    expect(switchedState.activeTaskId).toBe("task-alt");
    expect(switchedState.activeTurnIdsByTask["task-main"]).toBeUndefined();
    expect(
      switchedState.workspaceRuntimeCacheById["ws-main"]?.activeTurnIdsByTask[
        "task-main"
      ],
    ).toBe(activeTurnId);
    expect(
      switchedState.workspaceRuntimeCacheById["ws-main"]?.messagesByTask[
        "task-main"
      ],
    ).toHaveLength(2);

    streamListener?.({
      streamId: "stream-1",
      event: {
        type: "text",
        text: "Task 1 kept updating after the workspace switch.",
      },
      done: false,
    });
    streamListener?.({
      streamId: "stream-1",
      event: { type: "done" },
      done: true,
    });

    await Bun.sleep(25);

    const completedState = useAppStore.getState();
    const inactiveWorkspaceSession =
      completedState.workspaceRuntimeCacheById["ws-main"];
    const inactiveWorkspaceAssistant =
      inactiveWorkspaceSession?.messagesByTask["task-main"]?.at(-1);

    expect(
      inactiveWorkspaceSession?.activeTurnIdsByTask["task-main"],
    ).toBeUndefined();
    expect(inactiveWorkspaceAssistant?.content).toBe(
      "Task 1 kept updating after the workspace switch.",
    );
    expect(inactiveWorkspaceAssistant?.isStreaming).toBe(false);
    await flushPendingSnapshotPersists();
    // 1: the switch-time flush of the outgoing workspace, 2: the stream
    // completion write that carries the finished assistant message.
    expect(upsertCalls).toHaveLength(2);
    expect(upsertCalls.at(-1)).toMatchObject({
      id: "ws-main",
      name: "Main",
      snapshot: {
        activeTaskId: "task-main",
      },
    });
    const persistedSnapshot = (
      upsertCalls.at(-1) as {
        snapshot: {
          tasks: Array<{ id: string }>;
          messagesByTask: Record<string, Array<{ content: string }>>;
        };
      }
    ).snapshot;
    expect(persistedSnapshot.tasks.map((task) => task.id)).toEqual([
      "task-main",
      "task-keep",
    ]);
    expect(persistedSnapshot.messagesByTask["task-main"]?.at(-1)?.content).toBe(
      "Task 1 kept updating after the workspace switch.",
    );

    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-main" });

    const restoredState = useAppStore.getState();
    expect(restoredState.activeWorkspaceId).toBe("ws-main");
    expect(restoredState.activeTaskId).toBe("task-main");
    expect(restoredState.activeTurnIdsByTask["task-main"]).toBeUndefined();
    expect(restoredState.messagesByTask["task-main"]?.at(-1)?.content).toBe(
      "Task 1 kept updating after the workspace switch.",
    );
  });

  test("runs an isolated provider override without changing the task or composer draft", async () => {
    const localStorage = createMemoryStorage();
    let startedRequest:
      | {
          providerId?: string;
          prompt?: string;
          runtimeOptions?: { model?: string };
        }
      | undefined;

    (globalThis as { window: unknown }).window = {
      localStorage,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      api: {
        provider: {
          startPushTurn: async (args: typeof startedRequest) => {
            startedRequest = args;
            return {
              ok: true,
              streamId: "stream-review",
              turnId: "turn-review",
            };
          },
          subscribeStreamEvents: () => () => {},
          abortTurn: async () => ({ ok: true, message: "aborted" }),
          cleanupTask: async () => ({ ok: true }),
        },
        fs: {
          readFile: async () => ({
            ok: false,
            content: "",
            revision: "",
            stderr: "not found",
          }),
        },
      },
    } as unknown;

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    const originalDraft = {
      text: "Keep this composer draft",
      attachedFilePaths: ["src/keep.ts"],
      attachments: [{ kind: "file" as const, filePath: "src/keep.ts" }],
      runtimeOverrides: { model: "gpt-5.4" },
    };
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [
        { id: "ws-main", name: "Main", updatedAt: "2026-04-09T00:00:00.000Z" },
      ],
      activeWorkspaceId: "ws-main",
      activeTaskId: "task-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: { "ws-main": "/tmp/stave-project" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
      draftProvider: "codex",
      tasks: [
        {
          id: "task-main",
          title: "Main Task",
          provider: "codex",
          updatedAt: "2026-04-09T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: { "task-main": [] },
      activeTurnIdsByTask: {},
      promptDraftByTask: { "task-main": originalDraft },
      nativeSessionReadyByTask: {},
      providerSessionByTask: {},
    });

    const started = await useAppStore.getState().sendUserMessage({
      taskId: "task-main",
      content: "Review local changes",
      providerOverride: "claude-code",
      runtimeOverrides: {
        autoRouting: false,
        model: "claude-opus-4-6",
      },
      preservePromptDraft: true,
    });

    expect(started).toMatchObject({ status: "started" });
    expect(startedRequest).toMatchObject({
      providerId: "claude-code",
      prompt: "Review local changes",
      runtimeOptions: { model: "claude-opus-4-6" },
    });
    expect(
      useAppStore.getState().tasks.find((task) => task.id === "task-main")
        ?.provider,
    ).toBe("codex");
    expect(useAppStore.getState().promptDraftByTask["task-main"]).toEqual(
      originalDraft,
    );
  });

  test("queues multiple prompts during an active turn and auto-dispatches one on completion", async () => {
    const localStorage = createMemoryStorage();
    const startedPrompts: string[] = [];
    let streamListener:
      | ((payload: { streamId: string; event: unknown; done: boolean }) => void)
      | null = null;

    (globalThis as { window: unknown }).window = {
      localStorage,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      api: {
        provider: {
          startPushTurn: async (args: { prompt?: string }) => {
            const sequence = startedPrompts.length + 1;
            startedPrompts.push(args.prompt ?? "");
            return {
              ok: true,
              streamId: `stream-${sequence}`,
              turnId: `turn-${sequence}`,
            };
          },
          subscribeStreamEvents: (listener: typeof streamListener) => {
            streamListener = listener;
            return () => {
              if (streamListener === listener) {
                streamListener = null;
              }
            };
          },
          abortTurn: async () => ({ ok: true, message: "aborted" }),
          cleanupTask: async () => ({ ok: true }),
        },
        fs: {
          readFile: async () => ({
            ok: false,
            content: "",
            revision: "",
            stderr: "not found",
          }),
        },
      },
    } as unknown;

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [
        { id: "ws-main", name: "Main", updatedAt: "2026-04-09T00:00:00.000Z" },
      ],
      activeWorkspaceId: "ws-main",
      activeTaskId: "task-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: {
        "ws-main": "/tmp/stave-project",
      },
      workspaceBranchById: {
        "ws-main": "main",
      },
      workspaceDefaultById: {
        "ws-main": true,
      },
      draftProvider: "codex",
      tasks: [
        {
          id: "task-main",
          title: "Main Task",
          provider: "codex",
          updatedAt: "2026-04-09T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: { "task-main": [] },
      activeTurnIdsByTask: {},
      promptDraftByTask: {},
      nativeSessionReadyByTask: {},
      providerSessionByTask: {},
    });

    const started = await useAppStore.getState().sendUserMessage({
      taskId: "task-main",
      content: "First prompt",
    });

    expect(started).toMatchObject({
      status: "started",
      taskId: "task-main",
      workspaceId: "ws-main",
    });
    expect(startedPrompts).toEqual(["First prompt"]);

    const queued = await useAppStore.getState().sendUserMessage({
      taskId: "task-main",
      content: "Second prompt",
    });
    const queuedAgain = await useAppStore.getState().sendUserMessage({
      taskId: "task-main",
      content: "Third prompt",
    });

    expect(queued).toEqual({
      status: "queued",
      taskId: "task-main",
      workspaceId: "ws-main",
    });
    expect(queuedAgain).toEqual({
      status: "queued",
      taskId: "task-main",
      workspaceId: "ws-main",
    });

    const queuedState = useAppStore.getState();
    expect(queuedState.promptDraftByTask["task-main"]).toMatchObject({
      text: "",
    });
    expect(
      queuedState.promptDraftByTask["task-main"]?.queuedTurns?.map((item) => ({
        sourceTurnId: item.sourceTurnId,
        content: item.content,
      })),
    ).toEqual([
      { sourceTurnId: started.turnId, content: "Second prompt" },
      { sourceTurnId: started.turnId, content: "Third prompt" },
    ]);

    streamListener?.({
      streamId: "stream-1",
      event: { type: "text", text: "First response" },
      done: false,
    });
    streamListener?.({
      streamId: "stream-1",
      event: { type: "done" },
      done: true,
    });

    await Bun.sleep(25);

    const autoDispatchedState = useAppStore.getState();
    expect(startedPrompts).toEqual(["First prompt", "Second prompt"]);
    expect(typeof autoDispatchedState.activeTurnIdsByTask["task-main"]).toBe(
      "string",
    );
    expect(autoDispatchedState.activeTurnIdsByTask["task-main"]).not.toBe(
      started.turnId,
    );
    expect(autoDispatchedState.promptDraftByTask["task-main"]?.text ?? "").toBe(
      "",
    );
    expect(
      autoDispatchedState.promptDraftByTask["task-main"]?.queuedTurns?.map(
        (item) => item.content,
      ),
    ).toEqual(["Third prompt"]);
    expect(
      autoDispatchedState.messagesByTask["task-main"]?.map(
        (message) => message.role,
      ),
    ).toEqual(["user", "assistant", "user", "assistant"]);
  });

  test("manually dispatches a queued turn by id after an interrupt without touching the composer draft", async () => {
    const localStorage = createMemoryStorage();
    const startedPrompts: string[] = [];
    let streamListener:
      | ((payload: { streamId: string; event: unknown; done: boolean }) => void)
      | null = null;

    (globalThis as { window: unknown }).window = {
      localStorage,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      api: {
        provider: {
          startPushTurn: async (args: { prompt?: string }) => {
            const sequence = startedPrompts.length + 1;
            startedPrompts.push(args.prompt ?? "");
            return {
              ok: true,
              streamId: `stream-${sequence}`,
              turnId: `turn-${sequence}`,
            };
          },
          subscribeStreamEvents: (listener: typeof streamListener) => {
            streamListener = listener;
            return () => {
              if (streamListener === listener) {
                streamListener = null;
              }
            };
          },
          abortTurn: async () => ({ ok: true, message: "aborted" }),
          cleanupTask: async () => ({ ok: true }),
        },
        fs: {
          readFile: async () => ({
            ok: false,
            content: "",
            revision: "",
            stderr: "not found",
          }),
        },
      },
    } as unknown;

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [
        { id: "ws-main", name: "Main", updatedAt: "2026-04-09T00:00:00.000Z" },
      ],
      activeWorkspaceId: "ws-main",
      activeTaskId: "task-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: {
        "ws-main": "/tmp/stave-project",
      },
      workspaceBranchById: {
        "ws-main": "main",
      },
      workspaceDefaultById: {
        "ws-main": true,
      },
      draftProvider: "codex",
      tasks: [
        {
          id: "task-main",
          title: "Main Task",
          provider: "codex",
          updatedAt: "2026-04-09T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: { "task-main": [] },
      activeTurnIdsByTask: {},
      promptDraftByTask: {},
      nativeSessionReadyByTask: {},
      providerSessionByTask: {},
    });

    const started = await useAppStore.getState().sendUserMessage({
      taskId: "task-main",
      content: "First prompt",
    });
    expect(started.status).toBe("started");

    await useAppStore.getState().sendUserMessage({
      taskId: "task-main",
      content: "Second prompt",
    });
    await useAppStore.getState().sendUserMessage({
      taskId: "task-main",
      content: "Third prompt",
    });

    const queuedTurns =
      useAppStore.getState().promptDraftByTask["task-main"]?.queuedTurns ?? [];
    expect(queuedTurns.map((item) => item.content)).toEqual([
      "Second prompt",
      "Third prompt",
    ]);

    // Interrupt the live turn. The runtime's late "done" is dropped as a
    // late event for an inactive turn, so the queue must NOT auto-dispatch.
    useAppStore.getState().abortTaskTurn({ taskId: "task-main" });
    streamListener?.({
      streamId: "stream-1",
      event: { type: "done" },
      done: true,
    });
    await Bun.sleep(25);

    expect(startedPrompts).toEqual(["First prompt"]);
    expect(
      useAppStore.getState().activeTurnIdsByTask["task-main"],
    ).toBeUndefined();

    // Simulate composer text typed after the interrupt — a manual queued
    // dispatch must leave it alone.
    useAppStore.getState().updatePromptDraft({
      taskId: "task-main",
      patch: { text: "Composer draft in progress" },
    });

    // Unknown ids are rejected without side effects.
    const unknown = await useAppStore.getState().sendUserMessage({
      taskId: "task-main",
      content: "Second prompt",
      queuedTurnId: "missing-id",
    });
    expect(unknown).toEqual({ status: "blocked" });

    const dispatched = await useAppStore.getState().sendUserMessage({
      taskId: "task-main",
      content: queuedTurns[0]!.content,
      queuedTurnId: queuedTurns[0]!.id,
    });

    expect(dispatched).toMatchObject({
      status: "started",
      taskId: "task-main",
      workspaceId: "ws-main",
    });
    expect(startedPrompts).toEqual(["First prompt", "Second prompt"]);

    const draftAfterDispatch =
      useAppStore.getState().promptDraftByTask["task-main"];
    expect(draftAfterDispatch?.text).toBe("Composer draft in progress");
    expect(
      draftAfterDispatch?.queuedTurns?.map((item) => item.content),
    ).toEqual(["Third prompt"]);

    // With the dispatched turn now live, manual dispatch is blocked so the
    // remaining item cannot double-send; it stays queued for auto-dispatch.
    const blockedWhileActive = await useAppStore.getState().sendUserMessage({
      taskId: "task-main",
      content: "Third prompt",
      queuedTurnId: draftAfterDispatch?.queuedTurns?.[0]?.id ?? "",
    });
    expect(blockedWhileActive).toEqual({ status: "blocked" });
    expect(
      useAppStore
        .getState()
        .promptDraftByTask["task-main"]?.queuedTurns?.map(
          (item) => item.content,
        ),
    ).toEqual(["Third prompt"]);
  });

  test("keeps queued auto-dispatch scoped to its workspace when the active workspace changes", async () => {
    const localStorage = createMemoryStorage();
    const startedPrompts: string[] = [];
    const queuedPrompt =
      "There are several details in this area that need careful attention before continuing with the current work";
    let streamListener:
      | ((payload: { streamId: string; event: unknown; done: boolean }) => void)
      | null = null;
    let resolveClassification:
      | ((value: {
          ok: boolean;
          classification: {
            taskType: "implementation";
            complexity: "medium";
            recommendedTier: "standard";
            confidence: number;
          };
        }) => void)
      | null = null;
    let markClassificationStarted: (() => void) | null = null;
    const classificationStarted = new Promise<void>((resolve) => {
      markClassificationStarted = resolve;
    });
    setWindowContext({
      localStorage,
      api: {
        provider: {
          startPushTurn: async (args: { prompt?: string }) => {
            const sequence = startedPrompts.length + 1;
            startedPrompts.push(args.prompt ?? "");
            return {
              ok: true,
              streamId: `stream-${sequence}`,
              turnId: `turn-${sequence}`,
            };
          },
          subscribeStreamEvents: (listener: typeof streamListener) => {
            streamListener = listener;
            return () => {
              if (streamListener === listener) {
                streamListener = null;
              }
            };
          },
          classifyRoute: async () => {
            markClassificationStarted?.();
            return await new Promise<{
              ok: boolean;
              classification: {
                taskType: "implementation";
                complexity: "medium";
                recommendedTier: "standard";
                confidence: number;
              };
            }>((resolve) => {
              resolveClassification = resolve;
            });
          },
          abortTurn: async () => ({ ok: true, message: "aborted" }),
          cleanupTask: async () => ({ ok: true }),
        },
        fs: {
          listFiles: async () => ({ ok: true, files: [] }),
        },
      },
    });
    Object.assign(window, {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    const altTask = {
      id: "task-alt",
      title: "Alt Task",
      provider: "codex" as const,
      updatedAt: "2026-04-09T00:00:01.000Z",
      unread: false,
      archivedAt: null,
    };
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [
        { id: "ws-main", name: "Main", updatedAt: "2026-04-09T00:00:00.000Z" },
        { id: "ws-alt", name: "Alt", updatedAt: "2026-04-09T00:00:01.000Z" },
      ],
      activeWorkspaceId: "ws-main",
      activeTaskId: "task-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: {
        "ws-main": "/tmp/stave-project",
        "ws-alt": "/tmp/stave-project-alt",
      },
      workspaceBranchById: {
        "ws-main": "main",
        "ws-alt": "alt",
      },
      workspaceDefaultById: {
        "ws-main": true,
        "ws-alt": false,
      },
      draftProvider: "codex",
      settings: {
        ...initialState.settings,
        autoRoutingEnabled: true,
        autoRoutingUseClassifier: true,
      },
      tasks: [
        {
          id: "task-main",
          title: "Main Task",
          provider: "codex",
          updatedAt: "2026-04-09T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: { "task-main": [] },
      activeTurnIdsByTask: {},
      promptDraftByTask: {},
      nativeSessionReadyByTask: {},
      providerSessionByTask: {},
      taskWorkspaceIdById: {
        "task-main": "ws-main",
        "task-alt": "ws-alt",
      },
      workspaceRuntimeCacheById: {
        "ws-alt": buildWorkspaceSessionState({
          snapshot: {
            activeTaskId: altTask.id,
            tasks: [altTask],
            messagesByTask: { [altTask.id]: [] },
            promptDraftByTask: {},
            providerSessionByTask: {},
          },
        }),
      },
    });

    const started = await useAppStore.getState().sendUserMessage({
      taskId: "task-main",
      content: "First prompt",
    });
    expect(started).toMatchObject({ status: "started" });
    await Bun.sleep(0);
    expect(startedPrompts).toEqual(["First prompt"]);

    useAppStore.getState().updatePromptDraft({
      taskId: "task-main",
      patch: {
        text: queuedPrompt,
        runtimeOverrides: { autoRouting: true },
      },
    });
    const queued = await useAppStore.getState().sendUserMessage({
      taskId: "task-main",
      content: queuedPrompt,
    });
    expect(queued).toMatchObject({ status: "queued" });
    expect(
      useAppStore.getState().promptDraftByTask["task-main"]?.runtimeOverrides,
    ).toEqual({ autoRouting: true });

    streamListener?.({
      streamId: "stream-1",
      event: { type: "done" },
      done: true,
    });
    await classificationStarted;
    expect(resolveClassification).toBeFunction();

    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-alt" });
    resolveClassification?.({
      ok: true,
      classification: {
        taskType: "implementation",
        complexity: "medium",
        recommendedTier: "standard",
        confidence: 0.9,
      },
    });
    await Bun.sleep(25);

    const nextState = useAppStore.getState();
    const mainSession = nextState.workspaceRuntimeCacheById["ws-main"];
    expect(startedPrompts).toEqual(["First prompt", queuedPrompt]);
    expect(nextState.activeWorkspaceId).toBe("ws-alt");
    expect(nextState.activeTurnIdsByTask["task-main"]).toBeUndefined();
    expect(mainSession?.activeTurnIdsByTask["task-main"]).toBeString();
    expect(
      mainSession?.messagesByTask["task-main"]?.map((message) => message.role),
    ).toEqual(["user", "assistant", "user", "assistant"]);
    expect(mainSession?.promptDraftByTask["task-main"]?.text ?? "").toBe("");
    expect(
      mainSession?.promptDraftByTask["task-main"]?.queuedTurns,
    ).toBeUndefined();
  });

  test("submitIntent explicitly chooses steer vs queue during an active turn, with no auto fallback between them", async () => {
    const localStorage = createMemoryStorage();
    const startedPrompts: string[] = [];
    const steerCalls: Array<{
      turnId: string;
      text: string;
      enabled?: boolean;
      clientMessageId?: string;
    }> = [];
    let nextSteerResult: ProviderSteerTurnResponse = {
      ok: true,
      delivery: "accepted",
    };
    let pendingSteerResult: Promise<ProviderSteerTurnResponse> | undefined;

    (globalThis as { window: unknown }).window = {
      localStorage,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      api: {
        provider: {
          startPushTurn: async (args: { prompt?: string }) => {
            const sequence = startedPrompts.length + 1;
            startedPrompts.push(args.prompt ?? "");
            return {
              ok: true,
              streamId: `stream-${sequence}`,
              turnId: `turn-${sequence}`,
            };
          },
          subscribeStreamEvents: () => () => {},
          abortTurn: async () => ({ ok: true, message: "aborted" }),
          cleanupTask: async () => ({ ok: true }),
          steerTurn: async (args: {
            turnId: string;
            text: string;
            clientMessageId?: string;
          }) => {
            steerCalls.push(args);
            return pendingSteerResult ?? nextSteerResult;
          },
        },
        fs: {
          readFile: async () => ({
            ok: false,
            content: "",
            revision: "",
            stderr: "not found",
          }),
        },
      },
    } as unknown;

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [
        { id: "ws-main", name: "Main", updatedAt: "2026-04-09T00:00:00.000Z" },
      ],
      activeWorkspaceId: "ws-main",
      activeTaskId: "task-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: { "ws-main": "/tmp/stave-project" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
      draftProvider: "codex",
      tasks: [
        {
          id: "task-main",
          title: "Main Task",
          provider: "codex",
          updatedAt: "2026-04-09T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: { "task-main": [] },
      activeTurnIdsByTask: {},
      promptDraftByTask: {},
      nativeSessionReadyByTask: {},
      providerSessionByTask: {},
    });

    const started = await useAppStore.getState().sendUserMessage({
      taskId: "task-main",
      content: "First prompt",
    });
    expect(started).toMatchObject({ status: "started" });
    const activeTurnId = (started as { turnId: string }).turnId;

    // Default (no submitIntent): always queues, never attempts steer — this
    // is the exact pre-steering behavior, unaffected by the feature existing.
    const defaultResult = await useAppStore.getState().sendUserMessage({
      taskId: "task-main",
      content: "Untagged follow-up",
    });
    expect(defaultResult).toEqual({
      status: "queued",
      taskId: "task-main",
      workspaceId: "ws-main",
    });
    expect(steerCalls).toEqual([]);

    // Explicit submitIntent: "queue" behaves identically to the default.
    const explicitQueueResult = await useAppStore.getState().sendUserMessage({
      taskId: "task-main",
      content: "Explicitly queued follow-up",
      submitIntent: "queue",
    });
    expect(explicitQueueResult).toEqual({
      status: "queued",
      taskId: "task-main",
      workspaceId: "ws-main",
    });
    expect(steerCalls).toEqual([]);

    // A provider selection made during the active turn configures the next
    // turn. Steering must remain attributed to the provider that owns the
    // currently running turn.
    useAppStore
      .getState()
      .setTaskProvider({ taskId: "task-main", provider: "claude-code" });
    expect(useAppStore.getState().tasks[0]?.provider).toBe("claude-code");

    // Explicit submitIntent: "steer" delivers into the live turn as a plain
    // user message — no queuedTurns entry, no new assistant placeholder.
    const steerResult = await useAppStore.getState().sendUserMessage({
      taskId: "task-main",
      content: "Steered follow-up",
      submitIntent: "steer",
    });
    expect(steerResult).toEqual({
      status: "steered",
      taskId: "task-main",
      workspaceId: "ws-main",
      turnId: activeTurnId,
    });
    expect(steerCalls).toEqual([
      {
        turnId: activeTurnId,
        text: "Steered follow-up",
        enabled: false,
        clientMessageId: expect.any(String),
      },
    ]);
    const steeredState = useAppStore.getState();
    expect(
      steeredState.promptDraftByTask["task-main"]?.queuedTurns?.map(
        (item) => item.content,
      ),
    ).toEqual(["Untagged follow-up", "Explicitly queued follow-up"]);
    expect(steeredState.messagesByTask["task-main"]?.at(-2)).toMatchObject({
      role: "user",
      content: "Steered follow-up",
      steeredIntoTurnId: activeTurnId,
      steerDeliveryState: "accepted",
    });
    expect(steeredState.messagesByTask["task-main"]?.at(-1)).toMatchObject({
      role: "assistant",
      providerId: "codex",
      isStreaming: true,
    });
    expect(
      steeredState.providerTurnActivityByTask["task-main"]?.providerId,
    ).toBe("codex");

    // A delayed steer acknowledgement must not erase a newer draft written
    // while the request was in flight (task switches and external store
    // updates can still race even though the active composer is disabled).
    let resolveDelayedSteer:
      ((result: ProviderSteerTurnResponse) => void) | undefined;
    pendingSteerResult = new Promise((resolve) => {
      resolveDelayedSteer = resolve;
    });
    useAppStore.getState().updatePromptDraft({
      taskId: "task-main",
      patch: { text: "Delayed steer" },
    });
    const delayedSteerPromise = useAppStore.getState().sendUserMessage({
      taskId: "task-main",
      content: "Delayed steer",
      submitIntent: "steer",
    });
    useAppStore.getState().updatePromptDraft({
      taskId: "task-main",
      patch: { text: "Newer unsent draft" },
    });
    resolveDelayedSteer?.({ ok: true, delivery: "accepted" });
    const delayedSteerResult = await delayedSteerPromise;
    expect(delayedSteerResult).toMatchObject({ status: "steered" });
    expect(useAppStore.getState().promptDraftByTask["task-main"]?.text).toBe(
      "Newer unsent draft",
    );
    pendingSteerResult = undefined;

    // Explicit submitIntent: "steer" that the backend rejects surfaces
    // `steer-unavailable` and does NOT fall back to queueing the message.
    nextSteerResult = {
      ok: false,
      delivery: "rejected",
      message: "turn not steerable",
    };
    const rejectedSteerResult = await useAppStore.getState().sendUserMessage({
      taskId: "task-main",
      content: "Rejected steer",
      submitIntent: "steer",
    });
    expect(rejectedSteerResult).toEqual({
      status: "steer-unavailable",
      taskId: "task-main",
      workspaceId: "ws-main",
      message: "turn not steerable",
    });
    const afterRejectionState = useAppStore.getState();
    expect(
      afterRejectionState.promptDraftByTask["task-main"]?.queuedTurns?.map(
        (item) => item.content,
      ),
    ).toEqual(["Untagged follow-up", "Explicitly queued follow-up"]);
    expect(
      afterRejectionState.messagesByTask["task-main"]?.at(-1),
    ).toMatchObject({ role: "assistant", isStreaming: true });

    nextSteerResult = {
      ok: false,
      delivery: "unknown",
      message: "delivery acknowledgement timed out",
    };
    useAppStore.getState().updatePromptDraft({
      taskId: "task-main",
      patch: { text: "Unconfirmed steer" },
    });
    const messageCountBeforeUnknown =
      useAppStore.getState().messagesByTask["task-main"]?.length;
    const unknownResult = await useAppStore.getState().sendUserMessage({
      taskId: "task-main",
      content: "Unconfirmed steer",
      submitIntent: "steer",
    });
    expect(unknownResult).toMatchObject({
      status: "steer-delivery-unknown",
    });
    expect(useAppStore.getState().promptDraftByTask["task-main"]?.text).toBe(
      "Unconfirmed steer",
    );
    expect(useAppStore.getState().messagesByTask["task-main"]?.length).toBe(
      messageCountBeforeUnknown,
    );
  });

  test("Fleet-style steer and queue target an inactive workspace without clearing its composer", async () => {
    const localStorage = createMemoryStorage();
    const steerCalls: Array<{ turnId: string; text: string }> = [];
    (globalThis as { window: unknown }).window = {
      localStorage,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      api: {
        provider: {
          steerTurn: async (args: { turnId: string; text: string }) => {
            steerCalls.push({ turnId: args.turnId, text: args.text });
            return { ok: true, delivery: "accepted" };
          },
        },
      },
    } as unknown;

    const { useAppStore } = await import("../src/store/app.store");
    const { createWorkspaceSessionStateFromAppState } = await import(
      "../src/store/workspace-runtime-state"
    );
    const initialState = useAppStore.getInitialState();
    const inactiveTask = {
      id: "task-inactive-control",
      title: "Inactive control",
      provider: "codex" as const,
      updatedAt: "2026-07-31T00:00:00.000Z",
      unread: false,
      archivedAt: null,
      controlMode: "interactive" as const,
      controlOwner: "stave" as const,
    };
    const inactiveSession = createWorkspaceSessionStateFromAppState({
      ...initialState,
      activeTaskId: inactiveTask.id,
      tasks: [inactiveTask],
      messagesByTask: {
        [inactiveTask.id]: [
          {
            id: "assistant-inactive-control",
            role: "assistant",
            model: "gpt-5.6",
            providerId: "codex",
            content: "",
            isStreaming: true,
            parts: [],
          },
        ],
      },
      messageCountByTask: { [inactiveTask.id]: 1 },
      promptDraftByTask: {
        [inactiveTask.id]: {
          text: "Keep the task composer",
          attachedFilePaths: [],
          attachments: [],
        },
      },
      activeTurnIdsByTask: { [inactiveTask.id]: "turn-inactive-control" },
    });
    useAppStore.setState({
      ...initialState,
      projectPath: "/tmp/stave",
      activeWorkspaceId: "workspace-active",
      tasks: [],
      messagesByTask: {},
      activeTurnIdsByTask: {},
      workspacePathById: {
        "workspace-inactive": "/tmp/stave/.stave/workspaces/inactive",
      },
      workspaceRuntimeCacheById: {
        "workspace-inactive": inactiveSession,
      },
      taskWorkspaceIdById: {
        [inactiveTask.id]: "workspace-inactive",
      },
      providerTurnActivityByTask: {
        [inactiveTask.id]: {
          turnId: "turn-inactive-control",
          providerId: "codex",
          startedAt: 1,
          lastEventAt: 2,
          stalledAt: null,
          pendingInteraction: null,
          workItemsById: {},
          orderedWorkItemIds: [],
        },
      },
      settings: {
        ...initialState.settings,
        midTurnSteeringEnabled: true,
      },
    });

    const steered = await useAppStore.getState().sendUserMessage({
      taskId: inactiveTask.id,
      content: "Steer from Fleet",
      submitIntent: "steer",
      preservePromptDraft: true,
    });
    const queued = await useAppStore.getState().sendUserMessage({
      taskId: inactiveTask.id,
      content: "Queue from Fleet",
      submitIntent: "queue",
      preservePromptDraft: true,
    });

    const cached =
      useAppStore.getState().workspaceRuntimeCacheById["workspace-inactive"];
    expect(steered).toMatchObject({ status: "steered" });
    expect(queued).toMatchObject({ status: "queued" });
    expect(steerCalls).toEqual([
      {
        turnId: "turn-inactive-control",
        text: "Steer from Fleet",
      },
    ]);
    expect(cached?.promptDraftByTask[inactiveTask.id]?.text).toBe(
      "Keep the task composer",
    );
    expect(
      cached?.promptDraftByTask[inactiveTask.id]?.queuedTurns?.map(
        (item) => item.content,
      ),
    ).toEqual(["Queue from Fleet"]);
    expect(
      cached?.messagesByTask[inactiveTask.id]?.some(
        (message) =>
          message.role === "user" &&
          message.content === "Steer from Fleet" &&
          message.steeredIntoTurnId === "turn-inactive-control",
      ),
    ).toBe(true);
  });

  test("auto-dispatches Codex /goal objectives after the goal is set", async () => {
    const localStorage = createMemoryStorage();
    const startedPrompts: string[] = [];
    let streamListener:
      | ((payload: { streamId: string; event: unknown; done: boolean }) => void)
      | null = null;

    (globalThis as { window: unknown }).window = {
      localStorage,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      api: {
        provider: {
          startPushTurn: async (args: { prompt?: string }) => {
            const sequence = startedPrompts.length + 1;
            startedPrompts.push(args.prompt ?? "");
            return {
              ok: true,
              streamId: `goal-stream-${sequence}`,
              turnId: `goal-turn-${sequence}`,
            };
          },
          subscribeStreamEvents: (listener: typeof streamListener) => {
            streamListener = listener;
            return () => {
              if (streamListener === listener) {
                streamListener = null;
              }
            };
          },
          abortTurn: async () => ({ ok: true, message: "aborted" }),
          cleanupTask: async () => ({ ok: true }),
        },
        fs: {
          readFile: async () => ({
            ok: false,
            content: "",
            revision: "",
            stderr: "not found",
          }),
        },
      },
    } as unknown;

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [
        { id: "ws-main", name: "Main", updatedAt: "2026-04-09T00:00:00.000Z" },
      ],
      activeWorkspaceId: "ws-main",
      activeTaskId: "task-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: {
        "ws-main": "/tmp/stave-project",
      },
      workspaceBranchById: {
        "ws-main": "main",
      },
      workspaceDefaultById: {
        "ws-main": true,
      },
      draftProvider: "codex",
      tasks: [
        {
          id: "task-main",
          title: "Main Task",
          provider: "codex",
          updatedAt: "2026-04-09T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: { "task-main": [] },
      activeTurnIdsByTask: {},
      promptDraftByTask: {},
      nativeSessionReadyByTask: {},
      providerSessionByTask: {},
      providerGoalByTask: {},
    });

    const started = await useAppStore.getState().sendUserMessage({
      taskId: "task-main",
      content: "/goal Fix the stalled goal turn",
    });

    expect(started).toMatchObject({
      status: "started",
      taskId: "task-main",
      workspaceId: "ws-main",
    });
    expect(startedPrompts).toEqual(["/goal Fix the stalled goal turn"]);
    expect(
      useAppStore
        .getState()
        .promptDraftByTask["task-main"]?.queuedTurns?.map((item) => ({
          sourceTurnId: item.sourceTurnId,
          content: item.content,
        })),
    ).toEqual([
      { sourceTurnId: started.turnId, content: "Fix the stalled goal turn" },
    ]);

    streamListener?.({
      streamId: "goal-stream-1",
      event: { type: "text", text: "Set Codex goal." },
      done: false,
    });
    streamListener?.({
      streamId: "goal-stream-1",
      event: { type: "done" },
      done: true,
    });

    await Bun.sleep(25);

    const autoDispatchedState = useAppStore.getState();
    expect(startedPrompts).toEqual([
      "/goal Fix the stalled goal turn",
      "Fix the stalled goal turn",
    ]);
    expect(typeof autoDispatchedState.activeTurnIdsByTask["task-main"]).toBe(
      "string",
    );
    expect(autoDispatchedState.activeTurnIdsByTask["task-main"]).not.toBe(
      started.turnId,
    );
    expect(
      autoDispatchedState.promptDraftByTask["task-main"]?.queuedTurns,
    ).toBeUndefined();
    expect(
      autoDispatchedState.messagesByTask["task-main"]?.map(
        (message) => message.role,
      ),
    ).toEqual(["user", "assistant", "user", "assistant"]);
  });

  test("auto-dispatches an attachment-only queued next turn after completion", async () => {
    const localStorage = createMemoryStorage();
    const startedPrompts: string[] = [];
    const readFileCalls: string[] = [];
    let streamListener:
      | ((payload: { streamId: string; event: unknown; done: boolean }) => void)
      | null = null;

    (globalThis as { window: unknown }).window = {
      localStorage,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      api: {
        provider: {
          startPushTurn: async (args: { prompt?: string }) => {
            const sequence = startedPrompts.length + 1;
            startedPrompts.push(args.prompt ?? "");
            return {
              ok: true,
              streamId: `stream-attachment-${sequence}`,
              turnId: `turn-attachment-${sequence}`,
            };
          },
          subscribeStreamEvents: (listener: typeof streamListener) => {
            streamListener = listener;
            return () => {
              if (streamListener === listener) {
                streamListener = null;
              }
            };
          },
          abortTurn: async () => ({ ok: true, message: "aborted" }),
          cleanupTask: async () => ({ ok: true }),
        },
        fs: {
          readFile: async (args: { filePath?: string }) => {
            readFileCalls.push(args.filePath ?? "");
            return {
              ok: true,
              content: "# README",
              revision: "rev-readme",
            };
          },
        },
      },
    } as unknown;

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [
        { id: "ws-main", name: "Main", updatedAt: "2026-04-09T00:00:00.000Z" },
      ],
      activeWorkspaceId: "ws-main",
      activeTaskId: "task-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: {
        "ws-main": "/tmp/stave-project",
      },
      workspaceBranchById: {
        "ws-main": "main",
      },
      workspaceDefaultById: {
        "ws-main": true,
      },
      draftProvider: "codex",
      tasks: [
        {
          id: "task-main",
          title: "Main Task",
          provider: "codex",
          updatedAt: "2026-04-09T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: { "task-main": [] },
      activeTurnIdsByTask: {},
      promptDraftByTask: {},
      nativeSessionReadyByTask: {},
      providerSessionByTask: {},
    });

    const started = await useAppStore.getState().sendUserMessage({
      taskId: "task-main",
      content: "First prompt",
    });

    expect(started).toMatchObject({
      status: "started",
      taskId: "task-main",
      workspaceId: "ws-main",
    });

    useAppStore.getState().updatePromptDraft({
      taskId: "task-main",
      patch: {
        attachedFilePaths: ["README.md"],
      },
    });

    const queued = await useAppStore.getState().sendUserMessage({
      taskId: "task-main",
      content: "",
    });

    expect(queued).toEqual({
      status: "queued",
      taskId: "task-main",
      workspaceId: "ws-main",
    });
    expect(
      useAppStore
        .getState()
        .promptDraftByTask["task-main"]?.queuedTurns?.map((item) => ({
          sourceTurnId: item.sourceTurnId,
          content: item.content,
          attachedFilePaths: item.attachedFilePaths,
        })),
    ).toEqual([
      {
        sourceTurnId: started.turnId,
        content: "",
        attachedFilePaths: ["README.md"],
      },
    ]);

    streamListener?.({
      streamId: "stream-attachment-1",
      event: { type: "text", text: "First response" },
      done: false,
    });
    streamListener?.({
      streamId: "stream-attachment-1",
      event: { type: "done" },
      done: true,
    });

    await Bun.sleep(25);

    const autoDispatchedState = useAppStore.getState();
    expect(startedPrompts).toEqual(["First prompt", ""]);
    expect(readFileCalls).toEqual(["README.md"]);
    expect(typeof autoDispatchedState.activeTurnIdsByTask["task-main"]).toBe(
      "string",
    );
    expect(autoDispatchedState.activeTurnIdsByTask["task-main"]).not.toBe(
      started.turnId,
    );
    expect(
      autoDispatchedState.promptDraftByTask["task-main"]?.queuedTurns,
    ).toBeUndefined();
  });

  test("clears the submitted prompt draft before async context loading so workspace switches do not revive it", async () => {
    const localStorage = createMemoryStorage();
    let resolveReadFile:
      | ((value: {
          ok: boolean;
          content: string;
          revision: string;
          stderr?: string;
        }) => void)
      | null = null;

    setWindowContext({
      localStorage,
      api: {
        provider: {
          subscribeStreamEvents: () => () => {},
          startPushTurn: async () => ({
            ok: true,
            streamId: "stream-submit-clear",
          }),
        },
        fs: {
          listFiles: async () => ({ ok: true, files: [] }),
          readFile: async () =>
            await new Promise<{
              ok: boolean;
              content: string;
              revision: string;
              stderr?: string;
            }>((resolve) => {
              resolveReadFile = resolve;
            }),
        },
      },
    } as unknown);

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [
        { id: "ws-main", name: "Main", updatedAt: "2026-04-09T00:00:00.000Z" },
        { id: "ws-alt", name: "Alt", updatedAt: "2026-04-09T00:00:01.000Z" },
      ],
      activeWorkspaceId: "ws-main",
      activeTaskId: "task-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: {
        "ws-main": "/tmp/stave-project",
        "ws-alt": "/tmp/stave-project-alt",
      },
      workspaceBranchById: {
        "ws-main": "main",
        "ws-alt": "alt",
      },
      workspaceDefaultById: {
        "ws-main": true,
        "ws-alt": false,
      },
      draftProvider: "codex",
      tasks: [
        {
          id: "task-main",
          title: "Main Task",
          provider: "codex",
          updatedAt: "2026-04-09T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: { "task-main": [] },
      activeTurnIdsByTask: {},
      promptDraftByTask: {
        "task-main": {
          text: "Submitted prompt",
          attachedFilePaths: ["README.md"],
          attachments: [],
        },
      },
      nativeSessionReadyByTask: {},
      providerSessionByTask: {},
    });

    const sendPromise = useAppStore.getState().sendUserMessage({
      taskId: "task-main",
      content: "Submitted prompt",
    });

    const afterSubmit = useAppStore.getState();
    expect(afterSubmit.promptDraftByTask["task-main"]).toEqual({
      text: "",
      attachedFilePaths: [],
      attachments: [],
    });

    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-alt" });

    const switchedState = useAppStore.getState();
    expect(
      switchedState.workspaceRuntimeCacheById["ws-main"]?.promptDraftByTask[
        "task-main"
      ],
    ).toEqual({
      text: "",
      attachedFilePaths: [],
      attachments: [],
    });

    resolveReadFile?.({
      ok: true,
      content: "# README",
      revision: "rev-1",
    });

    const started = await sendPromise;
    expect(started).toMatchObject({
      status: "started",
      taskId: "task-main",
      workspaceId: "ws-main",
    });
  });

  test("switchWorkspace reloads persistence when the cached target workspace session is empty", async () => {
    const localStorage = createMemoryStorage();
    setWindowContext({
      localStorage,
      api: {
        fs: {
          listFiles: async () => ({ ok: true, files: [] }),
        },
        persistence: {
          listWorkspaces: async () => ({
            ok: true,
            rows: [
              {
                id: "ws-alpha",
                name: "Default Workspace",
                updatedAt: "2026-03-10T00:00:00.000Z",
              },
              {
                id: "ws-beta",
                name: "beta",
                updatedAt: "2026-03-10T00:01:00.000Z",
              },
            ],
          }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          loadWorkspaceShell: async ({
            workspaceId,
          }: {
            workspaceId: string;
          }) => ({
            ok: true,
            shell:
              workspaceId === "ws-beta"
                ? {
                    activeTaskId: "task-beta",
                    tasks: [
                      {
                        id: "task-beta",
                        title: "Recovered Beta Task",
                        provider: "codex",
                        updatedAt: "2026-03-10T00:01:00.000Z",
                        unread: false,
                      },
                    ],
                    promptDraftByTask: {},
                    providerSessionByTask: {},
                    messageCountByTask: { "task-beta": 0 },
                    workspaceInformation: {
                      jiraIssues: [],
                      confluencePages: [],
                      figmaResources: [],
                      storybookResources: [],
                      linkedPullRequests: [],
                      slackThreads: [],
                      notes: "",
                      todos: [],
                      customFields: [],
                    },
                    editorTabs: [],
                    activeEditorTabId: null,
                  }
                : null,
          }),
          listLatestWorkspaceTurns: async () => ({ ok: true, turns: [] }),
          upsertWorkspace: async () => ({ ok: true }),
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      projectPath: "/tmp/stave-project",
      projectName: "stave-project",
      workspaces: [
        {
          id: "ws-alpha",
          name: "Default Workspace",
          updatedAt: "2026-03-10T00:00:00.000Z",
        },
        { id: "ws-beta", name: "beta", updatedAt: "2026-03-10T00:01:00.000Z" },
      ],
      activeWorkspaceId: "ws-alpha",
      workspacePathById: {
        "ws-alpha": "/tmp/stave-project",
        "ws-beta": "/tmp/stave-project/.stave/workspaces/beta",
      },
      workspaceBranchById: {
        "ws-alpha": "main",
        "ws-beta": "beta",
      },
      workspaceDefaultById: {
        "ws-alpha": true,
        "ws-beta": false,
      },
      tasks: [
        {
          id: "task-alpha",
          title: "Alpha Task",
          provider: "claude-code",
          updatedAt: "2026-03-10T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      activeTaskId: "task-alpha",
      messagesByTask: { "task-alpha": [] },
      messageCountByTask: { "task-alpha": 0 },
      promptDraftByTask: {},
      workspaceInformation: {
        jiraIssues: [],
        confluencePages: [],
        figmaResources: [],
        storybookResources: [],
        linkedPullRequests: [],
        slackThreads: [],
        notes: "",
        todos: [],
        customFields: [],
      },
      editorTabs: [],
      activeEditorTabId: null,
      activeTurnIdsByTask: {},
      providerSessionByTask: {},
      nativeSessionReadyByTask: {},
      workspaceRuntimeCacheById: {
        "ws-beta": {
          activeTaskId: "",
          tasks: [],
          messagesByTask: {},
          messageCountByTask: {},
          promptDraftByTask: {},
          workspaceInformation: {
            jiraIssues: [],
            confluencePages: [],
            figmaResources: [],
            storybookResources: [],
            linkedPullRequests: [],
            slackThreads: [],
            notes: "",
            todos: [],
            customFields: [],
          },
          editorTabs: [],
          activeEditorTabId: null,
          activeTurnIdsByTask: {},
          providerSessionByTask: {},
          nativeSessionReadyByTask: {},
        },
      },
    });

    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-beta" });

    const nextState = useAppStore.getState();
    expect(nextState.activeWorkspaceId).toBe("ws-beta");
    expect(nextState.activeTaskId).toBe("task-beta");
    expect(nextState.tasks.map((task) => task.id)).toEqual(["task-beta"]);
    expect(nextState.workspaceRuntimeCacheById["ws-beta"]).toBeUndefined();
  });

  test("late events after an inactive workspace turn completes do not emit redundant store updates", async () => {
    const localStorage = createMemoryStorage();
    const upsertCalls: Array<unknown> = [];
    let streamListener:
      | ((payload: { streamId: string; event: unknown; done: boolean }) => void)
      | null = null;
    const originalWarn = console.warn;
    const warnCalls: unknown[][] = [];

    (globalThis as { window: unknown }).window = {
      localStorage,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      api: {
        provider: {
          startPushTurn: async () => ({
            ok: true,
            streamId: "stream-1",
            turnId: "turn-main-1",
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
          cleanupTask: async () => ({ ok: true }),
        },
        persistence: {
          listWorkspaces: async () => ({
            ok: true,
            rows: [
              {
                id: "ws-main",
                name: "Main",
                updatedAt: "2026-03-10T00:00:00.000Z",
              },
              {
                id: "ws-alt",
                name: "Alt",
                updatedAt: "2026-03-10T00:00:01.000Z",
              },
            ],
          }),
          loadWorkspace: async ({ workspaceId }: { workspaceId: string }) => ({
            ok: true,
            snapshot:
              workspaceId === "ws-alt"
                ? {
                    activeTaskId: "task-alt",
                    tasks: [
                      {
                        id: "task-alt",
                        title: "Alt Task",
                        provider: "claude-code",
                        updatedAt: "2026-03-10T00:00:01.000Z",
                        unread: false,
                      },
                    ],
                    messagesByTask: { "task-alt": [] },
                    promptDraftByTask: {},
                    providerSessionByTask: {},
                  }
                : null,
          }),
          upsertWorkspace: async (args: unknown) => {
            upsertCalls.push(args);
            return { ok: true };
          },
        },
        fs: {
          listFiles: async () => ({ ok: true, files: [] }),
        },
      },
    } as unknown;

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [
        { id: "ws-main", name: "Main", updatedAt: "2026-03-10T00:00:00.000Z" },
        { id: "ws-alt", name: "Alt", updatedAt: "2026-03-10T00:00:01.000Z" },
      ],
      activeWorkspaceId: "ws-main",
      activeTaskId: "task-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: {
        "ws-main": "/tmp/stave-project",
        "ws-alt": "/tmp/stave-project-alt",
      },
      workspaceBranchById: {
        "ws-main": "main",
        "ws-alt": "alt",
      },
      workspaceDefaultById: {
        "ws-main": true,
        "ws-alt": false,
      },
      draftProvider: "codex",
      tasks: [
        {
          id: "task-main",
          title: "Main Task",
          provider: "codex",
          updatedAt: "2026-03-10T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: { "task-main": [] },
      activeTurnIdsByTask: {},
      promptDraftByTask: {},
      nativeSessionReadyByTask: {},
      providerSessionByTask: {},
    });

    useAppStore.getState().sendUserMessage({
      taskId: "task-main",
      content: "Finish, then ignore anything late.",
    });

    await Bun.sleep(0);
    expect(streamListener).toBeFunction();

    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-alt" });
    console.warn = (...args: unknown[]) => {
      warnCalls.push(args);
    };

    try {
      streamListener?.({
        streamId: "stream-1",
        event: { type: "done" },
        done: true,
      });
      streamListener?.({
        streamId: "stream-1",
        event: { type: "text", text: "too late" },
        done: false,
      });

      await Bun.sleep(25);
    } finally {
      console.warn = originalWarn;
    }

    const state = useAppStore.getState();
    const inactiveWorkspaceSession = state.workspaceRuntimeCacheById["ws-main"];
    const inactiveWorkspaceAssistant =
      inactiveWorkspaceSession?.messagesByTask["task-main"]?.at(-1);
    const lateDropWarning = warnCalls.find(
      (call) =>
        call[0] ===
        "[provider-turn] dropped late events for inactive cached workspace turn",
    );

    expect(lateDropWarning).toBeDefined();
    expect(lateDropWarning?.[1]).toMatchObject({
      taskId: "task-main",
      workspaceId: "ws-main",
      activeTurnId: null,
      eventTypes: ["text"],
    });
    expect(
      inactiveWorkspaceSession?.activeTurnIdsByTask["task-main"],
    ).toBeUndefined();
    expect(inactiveWorkspaceAssistant?.content).toBe("No response returned.");
    expect(inactiveWorkspaceAssistant?.isStreaming).toBe(false);
    await flushPendingSnapshotPersists();
    // 1: the switch-time flush of the outgoing workspace, 2: the turn
    // completion write. The dropped late events add no further writes.
    expect(upsertCalls).toHaveLength(2);
  });

  test("switchWorkspace restores per-workspace editor tabs", async () => {
    const localStorage = createMemoryStorage();
    localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        {
          id: "ws-alpha",
          name: "alpha",
          updatedAt: "2026-03-10T00:00:00.000Z",
          snapshot: {
            activeTaskId: "",
            tasks: [],
            messagesByTask: {},
            editorTabs: [
              {
                id: "file:src/alpha.ts",
                filePath: "src/alpha.ts",
                kind: "text",
                language: "typescript",
                content: "export const alpha = 1;\n",
                originalContent: "export const alpha = 1;\n",
                savedContent: "export const alpha = 1;\n",
                baseRevision: "rev-alpha",
                hasConflict: false,
                isDirty: false,
              },
            ],
            activeEditorTabId: "file:src/alpha.ts",
          },
        },
        {
          id: "ws-beta",
          name: "beta",
          updatedAt: "2026-03-10T00:01:00.000Z",
          snapshot: {
            activeTaskId: "",
            tasks: [],
            messagesByTask: {},
            editorTabs: [
              {
                id: "file:src/beta.ts",
                filePath: "src/beta.ts",
                kind: "text",
                language: "typescript",
                content: "export const beta = 2;\n",
                originalContent: "export const beta = 2;\n",
                savedContent: "export const beta = 2;\n",
                baseRevision: "rev-beta",
                hasConflict: false,
                isDirty: false,
              },
            ],
            activeEditorTabId: "file:src/beta.ts",
          },
        },
      ]),
    );

    setWindowContext({
      localStorage,
      api: {
        fs: {
          listFiles: async () => ({ ok: true, files: ["package.json"] }),
          readFile: async () => ({ ok: false }),
          writeFile: async () => ({ ok: false }),
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      workspaces: [
        {
          id: "ws-alpha",
          name: "alpha",
          updatedAt: "2026-03-10T00:00:00.000Z",
        },
        { id: "ws-beta", name: "beta", updatedAt: "2026-03-10T00:01:00.000Z" },
      ],
      activeWorkspaceId: "ws-alpha",
      projectPath: "/tmp/stave-project",
      workspacePathById: {
        "ws-alpha": "/tmp/stave-project",
        "ws-beta": "/tmp/stave-project/.stave/workspaces/beta",
      },
      workspaceBranchById: {
        "ws-alpha": "main",
        "ws-beta": "beta",
      },
      workspaceDefaultById: {
        "ws-alpha": true,
        "ws-beta": false,
      },
      hasHydratedWorkspaces: false,
    });

    await useAppStore.getState().hydrateWorkspaces();

    let nextState = useAppStore.getState();
    expect(nextState.editorTabs.map((tab) => tab.filePath)).toEqual([
      "src/alpha.ts",
    ]);
    expect(nextState.activeEditorTabId).toBe("file:src/alpha.ts");

    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-beta" });

    nextState = useAppStore.getState();
    expect(nextState.activeWorkspaceId).toBe("ws-beta");
    expect(nextState.editorTabs.map((tab) => tab.filePath)).toEqual([
      "src/beta.ts",
    ]);
    expect(nextState.activeEditorTabId).toBe("file:src/beta.ts");

    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-alpha" });

    nextState = useAppStore.getState();
    expect(nextState.activeWorkspaceId).toBe("ws-alpha");
    expect(nextState.editorTabs.map((tab) => tab.filePath)).toEqual([
      "src/alpha.ts",
    ]);
    expect(nextState.activeEditorTabId).toBe("file:src/alpha.ts");
  });

  test("switchWorkspace restores cached CLI session surfaces for the returning workspace", async () => {
    const localStorage = createMemoryStorage();
    localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        {
          id: "ws-alpha",
          name: "alpha",
          updatedAt: "2026-03-10T00:00:00.000Z",
          snapshot: {
            activeTaskId: "alpha-task-1",
            tasks: [
              {
                id: "alpha-task-1",
                title: "Alpha Task",
                provider: "claude-code",
                updatedAt: "2026-03-10T00:00:00.000Z",
                unread: false,
              },
            ],
            messagesByTask: { "alpha-task-1": [] },
          },
        },
        {
          id: "ws-beta",
          name: "beta",
          updatedAt: "2026-03-10T00:01:00.000Z",
          snapshot: {
            activeTaskId: "beta-task-1",
            tasks: [
              {
                id: "beta-task-1",
                title: "Beta Task",
                provider: "codex",
                updatedAt: "2026-03-10T00:01:00.000Z",
                unread: false,
              },
            ],
            messagesByTask: { "beta-task-1": [] },
          },
        },
      ]),
    );

    setWindowContext({
      localStorage,
      api: {
        fs: {
          listFiles: async () => ({ ok: true, files: ["package.json"] }),
          readFile: async () => ({ ok: false }),
          writeFile: async () => ({ ok: false }),
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    const cliTab = {
      id: "cli-alpha",
      title: "Claude Workspace",
      provider: "claude-code" as const,
      contextMode: "workspace" as const,
      linkedTaskId: null,
      linkedTaskTitle: null,
      handoffSummary: "",
      cwd: "/tmp/stave-project",
      createdAt: 1,
    };

    useAppStore.setState({
      ...initialState,
      workspaces: [
        {
          id: "ws-alpha",
          name: "alpha",
          updatedAt: "2026-03-10T00:00:00.000Z",
        },
        {
          id: "ws-beta",
          name: "beta",
          updatedAt: "2026-03-10T00:01:00.000Z",
        },
      ],
      activeWorkspaceId: "ws-alpha",
      projectPath: "/tmp/stave-project",
      workspacePathById: {
        "ws-alpha": "/tmp/stave-project",
        "ws-beta": "/tmp/stave-project/.stave/workspaces/beta",
      },
      workspaceBranchById: {
        "ws-alpha": "main",
        "ws-beta": "beta",
      },
      workspaceDefaultById: {
        "ws-alpha": true,
        "ws-beta": false,
      },
      hasHydratedWorkspaces: false,
    });

    await useAppStore.getState().hydrateWorkspaces();

    useAppStore.setState((state) => ({
      ...state,
      activeTaskId: "alpha-task-1",
      tasks: [
        {
          id: "alpha-task-1",
          title: "Alpha Task",
          provider: "claude-code",
          updatedAt: "2026-03-10T00:00:00.000Z",
          unread: false,
        },
      ],
      messagesByTask: { "alpha-task-1": [] },
      workspaceInformation: createEmptyWorkspaceInformation(),
      cliSessionTabs: [cliTab],
      activeCliSessionTabId: cliTab.id,
      activeSurface: {
        kind: "cli-session",
        cliSessionTabId: cliTab.id,
      },
    }));

    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-beta" });

    let nextState = useAppStore.getState();
    expect(nextState.activeWorkspaceId).toBe("ws-beta");
    expect(nextState.activeTaskId).toBe("beta-task-1");
    expect(nextState.tasks.map((task) => task.title)).toEqual(["Beta Task"]);
    expect(nextState.cliSessionTabs).toEqual([]);
    expect(nextState.activeCliSessionTabId).toBeNull();
    expect(nextState.activeSurface).toEqual({
      kind: "task",
      taskId: "beta-task-1",
    });
    expect(
      nextState.workspaceRuntimeCacheById["ws-alpha"]?.cliSessionTabs,
    ).toEqual([cliTab]);
    expect(
      nextState.workspaceRuntimeCacheById["ws-alpha"]?.activeCliSessionTabId,
    ).toBe(cliTab.id);
    expect(
      nextState.workspaceRuntimeCacheById["ws-alpha"]?.activeSurface,
    ).toEqual({
      kind: "cli-session",
      cliSessionTabId: cliTab.id,
    });

    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-alpha" });

    nextState = useAppStore.getState();
    expect(nextState.activeWorkspaceId).toBe("ws-alpha");
    expect(nextState.activeTaskId).toBe("alpha-task-1");
    expect(nextState.tasks.map((task) => task.title)).toEqual(["Alpha Task"]);
    expect(nextState.cliSessionTabs).toEqual([cliTab]);
    expect(nextState.activeCliSessionTabId).toBe(cliTab.id);
    expect(nextState.activeSurface).toEqual({
      kind: "cli-session",
      cliSessionTabId: cliTab.id,
    });
  });

  test("switchWorkspace preserves a hidden terminal dock for the returning workspace", async () => {
    const localStorage = createMemoryStorage();
    localStorage.setItem(
      "stave:workspace-fallback:v1",
      JSON.stringify([
        {
          id: "ws-alpha",
          name: "alpha",
          updatedAt: "2026-03-10T00:00:00.000Z",
          snapshot: {
            activeTaskId: "alpha-task-1",
            tasks: [
              {
                id: "alpha-task-1",
                title: "Alpha Task",
                provider: "claude-code",
                updatedAt: "2026-03-10T00:00:00.000Z",
                unread: false,
              },
            ],
            messagesByTask: { "alpha-task-1": [] },
            terminalTabs: [
              {
                id: "terminal-alpha",
                title: "Workspace",
                linkedTaskId: null,
                backend: "ghostty",
                cwd: "/tmp/stave-project",
                createdAt: 1,
              },
            ],
            activeTerminalTabId: "terminal-alpha",
            terminalDocked: false,
          },
        },
        {
          id: "ws-beta",
          name: "beta",
          updatedAt: "2026-03-10T00:01:00.000Z",
          snapshot: {
            activeTaskId: "beta-task-1",
            tasks: [
              {
                id: "beta-task-1",
                title: "Beta Task",
                provider: "codex",
                updatedAt: "2026-03-10T00:01:00.000Z",
                unread: false,
              },
            ],
            messagesByTask: { "beta-task-1": [] },
          },
        },
      ]),
    );

    setWindowContext({
      localStorage,
      api: {
        fs: {
          listFiles: async () => ({ ok: true, files: ["package.json"] }),
          readFile: async () => ({ ok: false }),
          writeFile: async () => ({ ok: false }),
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    const terminalTab = {
      id: "terminal-alpha",
      title: "Workspace",
      linkedTaskId: null,
      backend: "ghostty" as const,
      cwd: "/tmp/stave-project",
      createdAt: 1,
    };

    useAppStore.setState({
      ...initialState,
      workspaces: [
        {
          id: "ws-alpha",
          name: "alpha",
          updatedAt: "2026-03-10T00:00:00.000Z",
        },
        {
          id: "ws-beta",
          name: "beta",
          updatedAt: "2026-03-10T00:01:00.000Z",
        },
      ],
      activeWorkspaceId: "ws-alpha",
      projectPath: "/tmp/stave-project",
      workspacePathById: {
        "ws-alpha": "/tmp/stave-project",
        "ws-beta": "/tmp/stave-project/.stave/workspaces/beta",
      },
      workspaceBranchById: {
        "ws-alpha": "main",
        "ws-beta": "beta",
      },
      workspaceDefaultById: {
        "ws-alpha": true,
        "ws-beta": false,
      },
      hasHydratedWorkspaces: false,
    });

    await useAppStore.getState().hydrateWorkspaces();

    useAppStore.setState((state) => ({
      ...state,
      activeTaskId: "alpha-task-1",
      tasks: [
        {
          id: "alpha-task-1",
          title: "Alpha Task",
          provider: "claude-code",
          updatedAt: "2026-03-10T00:00:00.000Z",
          unread: false,
        },
      ],
      messagesByTask: { "alpha-task-1": [] },
      workspaceInformation: createEmptyWorkspaceInformation(),
      terminalTabs: [terminalTab],
      activeTerminalTabId: terminalTab.id,
      layout: {
        ...state.layout,
        terminalDocked: false,
      },
    }));

    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-beta" });

    expect(
      useAppStore.getState().workspaceRuntimeCacheById["ws-alpha"]
        ?.terminalDocked,
    ).toBe(false);

    await useAppStore.getState().switchWorkspace({ workspaceId: "ws-alpha" });

    const nextState = useAppStore.getState();
    expect(nextState.layout.terminalDocked).toBe(false);
    expect(nextState.terminalTabs).toEqual([terminalTab]);
    expect(nextState.activeTerminalTabId).toBe(terminalTab.id);
  });

  test("switchWorkspace does not wait for file refresh when the target workspace is cached", async () => {
    const localStorage = createMemoryStorage();
    let resolveListFiles:
      ((value: { ok: boolean; files: string[] }) => void) | null = null;
    const listFilesPromise = new Promise<{ ok: boolean; files: string[] }>(
      (resolve) => {
        resolveListFiles = resolve;
      },
    );

    setWindowContext({
      localStorage,
      api: {
        fs: {
          pickRoot: async () => ({ ok: false }),
          listFiles: async () => listFilesPromise,
          readFile: async () => ({ ok: false }),
          writeFile: async () => ({ ok: false }),
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      workspaces: [
        {
          id: "ws-alpha-fast",
          name: "alpha",
          updatedAt: "2026-03-10T00:00:00.000Z",
        },
        {
          id: "ws-beta-fast",
          name: "beta",
          updatedAt: "2026-03-10T00:01:00.000Z",
        },
      ],
      activeWorkspaceId: "ws-alpha-fast",
      projectPath: "/tmp/stave-project-switch-fast",
      projectName: "stave-project-switch-fast",
      workspacePathById: {
        "ws-alpha-fast": "/tmp/stave-project-switch-fast",
        "ws-beta-fast": "/tmp/stave-project-switch-fast/.stave/workspaces/beta",
      },
      workspaceBranchById: {
        "ws-alpha-fast": "main",
        "ws-beta-fast": "beta",
      },
      workspaceDefaultById: {
        "ws-alpha-fast": true,
        "ws-beta-fast": false,
      },
      tasks: [
        {
          id: "task-alpha-fast",
          title: "Alpha Task",
          provider: "claude-code",
          updatedAt: "2026-03-10T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      activeTaskId: "task-alpha-fast",
      messagesByTask: { "task-alpha-fast": [] },
      messageCountByTask: { "task-alpha-fast": 0 },
      projectFiles: ["alpha-only.ts"],
      workspaceRuntimeCacheById: {
        "ws-beta-fast": {
          activeTaskId: "task-beta-fast",
          tasks: [
            {
              id: "task-beta-fast",
              title: "Beta Task",
              provider: "codex",
              updatedAt: "2026-03-10T00:01:00.000Z",
              unread: false,
              archivedAt: null,
            },
          ],
          messagesByTask: { "task-beta-fast": [] },
          messageCountByTask: { "task-beta-fast": 0 },
          promptDraftByTask: {},
          workspaceInformation: {
            jiraIssues: [],
            confluencePages: [],
            figmaResources: [],
            storybookResources: [],
            linkedPullRequests: [],
            slackThreads: [],
            notes: "",
            todos: [],
            customFields: [],
          },
          editorTabs: [],
          activeEditorTabId: null,
          activeTurnIdsByTask: {},
          providerSessionByTask: {},
          nativeSessionReadyByTask: {},
        },
      },
    });

    let switchResolved = false;
    const switchPromise = useAppStore
      .getState()
      .switchWorkspace({ workspaceId: "ws-beta-fast" })
      .then(() => {
        switchResolved = true;
      });

    await Bun.sleep(0);

    expect(switchResolved).toBe(true);
    expect(useAppStore.getState().activeWorkspaceId).toBe("ws-beta-fast");
    expect(useAppStore.getState().tasks.map((task) => task.id)).toEqual([
      "task-beta-fast",
    ]);
    expect(useAppStore.getState().projectFiles).toEqual([]);

    resolveListFiles?.({ ok: true, files: ["beta-only.ts"] });
    await switchPromise;
    await Bun.sleep(0);

    expect(useAppStore.getState().projectFiles).toEqual(["beta-only.ts"]);
  });

  test("closeWorkspace clears cached files for the closed workspace path", async () => {
    const localStorage = createMemoryStorage();
    const closedWorkspaceIds: string[] = [];
    setWindowContext({
      localStorage,
      api: {
        persistence: {
          listWorkspaces: async () => ({ ok: true, rows: [] }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          upsertWorkspace: async () => ({ ok: true }),
          closeWorkspace: async ({ workspaceId }: { workspaceId: string }) => {
            closedWorkspaceIds.push(workspaceId);
            return { ok: true };
          },
        },
        fs: {
          listFiles: async () => ({ ok: true, files: [] }),
          readFile: async () => ({ ok: false }),
          writeFile: async () => ({ ok: false }),
        },
      },
    });

    const { useAppStore, waitForPendingWorkspaceArchiveCleanups } =
      await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [
        {
          id: "ws-main-close",
          name: "Main",
          updatedAt: "2026-03-10T00:00:00.000Z",
        },
        {
          id: "ws-feature-close",
          name: "feature",
          updatedAt: "2026-03-10T00:01:00.000Z",
        },
      ],
      activeWorkspaceId: "ws-main-close",
      projectPath: "/tmp/stave-project-close",
      workspacePathById: {
        "ws-main-close": "/tmp/stave-project-close",
        "ws-feature-close":
          "/tmp/stave-project-close/.stave/workspaces/feature",
      },
      workspaceBranchById: {
        "ws-main-close": "main",
        "ws-feature-close": "feature",
      },
      workspaceDefaultById: {
        "ws-main-close": true,
        "ws-feature-close": false,
      },
      workspaceFileCacheByPath: {
        "/tmp/stave-project-close": ["root.ts"],
        "/tmp/stave-project-close/.stave/workspaces/feature": ["feature.ts"],
      },
    });

    await useAppStore
      .getState()
      .closeWorkspace({ workspaceId: "ws-feature-close" });

    // closeWorkspace now updates renderer state instantly and defers
    // persistence/git cleanup to a detached promise. Await it explicitly so
    // the persistence assertion below is deterministic.
    expect(
      useAppStore.getState().workspaces.map((workspace) => workspace.id),
    ).toEqual(["ws-main-close"]);
    expect(useAppStore.getState().workspaceFileCacheByPath).toEqual({
      "/tmp/stave-project-close": ["root.ts"],
    });

    await waitForPendingWorkspaceArchiveCleanups();

    expect(closedWorkspaceIds).toEqual(["ws-feature-close"]);
  });

  test("closeWorkspace cleanup removes clean worktrees and deletes the branch by default", async () => {
    const localStorage = createMemoryStorage();
    const runCalls: Array<{ cwd?: string; command: string }> = [];
    const workspacePath = "/tmp/stave-project-close/.stave/workspaces/feature";

    setWindowContext({
      localStorage,
      api: {
        persistence: {
          listWorkspaces: async () => ({ ok: true, rows: [] }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          upsertWorkspace: async () => ({ ok: true }),
          closeWorkspace: async () => ({ ok: true }),
        },
        fs: {
          listFiles: async () => ({ ok: true, files: [] }),
          readFile: async () => ({ ok: false }),
          writeFile: async () => ({ ok: false }),
        },
        terminal: {
          runCommand: async (call: { cwd?: string; command: string }) => {
            runCalls.push(call);
            if (
              call.cwd === workspacePath &&
              call.command === "git status --porcelain --untracked-files=all"
            ) {
              return { ok: true, code: 0, stdout: "", stderr: "" };
            }
            if (
              call.cwd === workspacePath &&
              call.command === "git symbolic-ref --quiet --short HEAD"
            ) {
              return { ok: true, code: 0, stdout: "feature\n", stderr: "" };
            }
            if (
              call.cwd === "/tmp/stave-project-close" &&
              call.command ===
                `if [ -L ${JSON.stringify(`${workspacePath}/node_modules`)} ]; then rm ${JSON.stringify(`${workspacePath}/node_modules`)}; fi`
            ) {
              return { ok: true, code: 0, stdout: "", stderr: "" };
            }
            if (
              call.cwd === "/tmp/stave-project-close" &&
              call.command ===
                `git worktree remove ${JSON.stringify(workspacePath)}`
            ) {
              return { ok: true, code: 0, stdout: "", stderr: "" };
            }
            if (
              call.cwd === "/tmp/stave-project-close" &&
              call.command === "git worktree prune"
            ) {
              return { ok: true, code: 0, stdout: "", stderr: "" };
            }
            if (
              call.cwd === "/tmp/stave-project-close" &&
              call.command === 'git branch -D "feature"'
            ) {
              return { ok: true, code: 0, stdout: "", stderr: "" };
            }
            return {
              ok: false,
              code: 1,
              stdout: "",
              stderr: `Unexpected command: ${call.command}`,
            };
          },
        },
      },
    });

    const { useAppStore, waitForPendingWorkspaceArchiveCleanups } =
      await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [
        {
          id: "ws-main-close",
          name: "Main",
          updatedAt: "2026-03-10T00:00:00.000Z",
        },
        {
          id: "ws-feature-close",
          name: "feature",
          updatedAt: "2026-03-10T00:01:00.000Z",
        },
      ],
      activeWorkspaceId: "ws-main-close",
      projectPath: "/tmp/stave-project-close",
      workspacePathById: {
        "ws-main-close": "/tmp/stave-project-close",
        "ws-feature-close": workspacePath,
      },
      workspaceBranchById: {
        "ws-main-close": "main",
        "ws-feature-close": "feature",
      },
      workspaceDefaultById: {
        "ws-main-close": true,
        "ws-feature-close": false,
      },
    });

    await useAppStore
      .getState()
      .closeWorkspace({ workspaceId: "ws-feature-close" });
    await waitForPendingWorkspaceArchiveCleanups();

    expect(runCalls.map((call) => call.command)).toEqual([
      "git status --porcelain --untracked-files=all",
      // Resolved from the worktree itself, before removal makes the path
      // unreadable: `workspaceBranchById` is a cache that an out-of-band
      // `git checkout` can leave pointing at an unrelated branch.
      "git symbolic-ref --quiet --short HEAD",
      `if [ -L ${JSON.stringify(`${workspacePath}/node_modules`)} ]; then rm ${JSON.stringify(`${workspacePath}/node_modules`)}; fi`,
      `git worktree remove ${JSON.stringify(workspacePath)}`,
      "git worktree prune",
      'git branch -D "feature"',
    ]);
    expect(runCalls.some((call) => call.command.includes("--force"))).toBe(
      false,
    );
    expect(runCalls.some((call) => call.command.includes("rm -rf"))).toBe(
      false,
    );
    // `git branch -d` refuses squash-merged branches, which is why archive used
    // to leave them behind. Deletion is opt-in via the archive dialog, so the
    // forced form is the only one that actually honors that choice.
    expect(runCalls.some((call) => call.command.includes("rev-list"))).toBe(
      false,
    );
  });

  test("closeWorkspace cleanup preserves dirty worktrees and branches", async () => {
    const localStorage = createMemoryStorage();
    const runCalls: Array<{ cwd?: string; command: string }> = [];
    const workspacePath = "/tmp/stave-project-close/.stave/workspaces/feature";
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      setWindowContext({
        localStorage,
        api: {
          persistence: {
            listWorkspaces: async () => ({ ok: true, rows: [] }),
            loadWorkspace: async () => ({ ok: true, snapshot: null }),
            upsertWorkspace: async () => ({ ok: true }),
            closeWorkspace: async () => ({ ok: true }),
          },
          fs: {
            listFiles: async () => ({ ok: true, files: [] }),
            readFile: async () => ({ ok: false }),
            writeFile: async () => ({ ok: false }),
          },
          terminal: {
            runCommand: async (call: { cwd?: string; command: string }) => {
              runCalls.push(call);
              if (
                call.cwd === workspacePath &&
                call.command === "git status --porcelain --untracked-files=all"
              ) {
                return {
                  ok: true,
                  code: 0,
                  stdout: " M src/app.ts\n?? scratch.md\n",
                  stderr: "",
                };
              }
              return {
                ok: false,
                code: 1,
                stdout: "",
                stderr: `Unexpected command: ${call.command}`,
              };
            },
          },
        },
      });

      const { useAppStore, waitForPendingWorkspaceArchiveCleanups } =
        await import("../src/store/app.store");
      const initialState = useAppStore.getInitialState();
      useAppStore.setState({
        ...initialState,
        hasHydratedWorkspaces: true,
        workspaces: [
          {
            id: "ws-main-close",
            name: "Main",
            updatedAt: "2026-03-10T00:00:00.000Z",
          },
          {
            id: "ws-feature-close",
            name: "feature",
            updatedAt: "2026-03-10T00:01:00.000Z",
          },
        ],
        activeWorkspaceId: "ws-main-close",
        projectPath: "/tmp/stave-project-close",
        workspacePathById: {
          "ws-main-close": "/tmp/stave-project-close",
          "ws-feature-close": workspacePath,
        },
        workspaceBranchById: {
          "ws-main-close": "main",
          "ws-feature-close": "feature",
        },
        workspaceDefaultById: {
          "ws-main-close": true,
          "ws-feature-close": false,
        },
      });

      await useAppStore
        .getState()
        .closeWorkspace({ workspaceId: "ws-feature-close" });
      await waitForPendingWorkspaceArchiveCleanups();
    } finally {
      console.warn = originalWarn;
    }

    expect(runCalls.map((call) => call.command)).toEqual([
      "git status --porcelain --untracked-files=all",
    ]);
  });

  test("closeWorkspace persists archived worktree tombstones", async () => {
    const localStorage = createMemoryStorage();
    const savedProjects: Array<
      Array<{
        projectPath: string;
        archivedWorkspacePaths?: string[];
      }>
    > = [];
    const workspacePath = "/tmp/stave-project-close/.stave/workspaces/feature";
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      setWindowContext({
        localStorage,
        api: {
          persistence: {
            listWorkspaces: async () => ({ ok: true, rows: [] }),
            loadWorkspace: async () => ({ ok: true, snapshot: null }),
            upsertWorkspace: async () => ({ ok: true }),
            closeWorkspace: async () => ({ ok: true }),
            saveProjectRegistry: async ({
              projects,
            }: {
              projects: unknown[];
            }) => {
              savedProjects.push(
                projects as Array<{
                  projectPath: string;
                  archivedWorkspacePaths?: string[];
                }>,
              );
              return { ok: true };
            },
          },
          fs: {
            listFiles: async () => ({ ok: true, files: [] }),
            readFile: async () => ({ ok: false }),
            writeFile: async () => ({ ok: false }),
          },
          terminal: {
            runCommand: async (call: { cwd?: string; command: string }) => {
              if (
                call.cwd === workspacePath &&
                call.command === "git status --porcelain --untracked-files=all"
              ) {
                return {
                  ok: true,
                  code: 0,
                  stdout: " M src/app.ts\n",
                  stderr: "",
                };
              }
              return {
                ok: false,
                code: 1,
                stdout: "",
                stderr: `Unexpected command: ${call.command}`,
              };
            },
          },
        },
      });

      const { useAppStore, waitForPendingWorkspaceArchiveCleanups } =
        await import("../src/store/app.store");
      const initialState = useAppStore.getInitialState();
      useAppStore.setState({
        ...initialState,
        hasHydratedWorkspaces: true,
        workspaces: [
          {
            id: "ws-main-close",
            name: "Main",
            updatedAt: "2026-03-10T00:00:00.000Z",
          },
          {
            id: "ws-feature-close",
            name: "feature",
            updatedAt: "2026-03-10T00:01:00.000Z",
          },
        ],
        activeWorkspaceId: "ws-main-close",
        projectPath: "/tmp/stave-project-close",
        projectName: "stave-project-close",
        defaultBranch: "main",
        workspacePathById: {
          "ws-main-close": "/tmp/stave-project-close",
          "ws-feature-close": workspacePath,
        },
        workspaceBranchById: {
          "ws-main-close": "main",
          "ws-feature-close": "feature",
        },
        workspaceDefaultById: {
          "ws-main-close": true,
          "ws-feature-close": false,
        },
      });

      await useAppStore
        .getState()
        .closeWorkspace({ workspaceId: "ws-feature-close" });
      await waitForPendingWorkspaceArchiveCleanups();
    } finally {
      console.warn = originalWarn;
    }

    const savedProject = savedProjects
      .at(-1)
      ?.find((project) => project.projectPath === "/tmp/stave-project-close");
    expect(savedProject?.archivedWorkspacePaths).toEqual([workspacePath]);
  });

  test("closeWorkspace cleanup keeps the branch when deleteBranch is opted out", async () => {
    const localStorage = createMemoryStorage();
    const runCalls: Array<{ cwd?: string; command: string }> = [];
    const workspacePath = "/tmp/stave-project-close/.stave/workspaces/feature";
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      setWindowContext({
        localStorage,
        api: {
          persistence: {
            listWorkspaces: async () => ({ ok: true, rows: [] }),
            loadWorkspace: async () => ({ ok: true, snapshot: null }),
            upsertWorkspace: async () => ({ ok: true }),
            closeWorkspace: async () => ({ ok: true }),
          },
          fs: {
            listFiles: async () => ({ ok: true, files: [] }),
            readFile: async () => ({ ok: false }),
            writeFile: async () => ({ ok: false }),
          },
          terminal: {
            runCommand: async (call: { cwd?: string; command: string }) => {
              runCalls.push(call);
              if (
                call.cwd === workspacePath &&
                call.command === "git status --porcelain --untracked-files=all"
              ) {
                return { ok: true, code: 0, stdout: "", stderr: "" };
              }
              if (
                call.cwd === "/tmp/stave-project-close" &&
                call.command ===
                  `if [ -L ${JSON.stringify(`${workspacePath}/node_modules`)} ]; then rm ${JSON.stringify(`${workspacePath}/node_modules`)}; fi`
              ) {
                return { ok: true, code: 0, stdout: "", stderr: "" };
              }
              if (
                call.cwd === "/tmp/stave-project-close" &&
                call.command ===
                  `git worktree remove ${JSON.stringify(workspacePath)}`
              ) {
                return { ok: true, code: 0, stdout: "", stderr: "" };
              }
              if (
                call.cwd === "/tmp/stave-project-close" &&
                call.command === "git worktree prune"
              ) {
                return { ok: true, code: 0, stdout: "", stderr: "" };
              }
              return {
                ok: false,
                code: 1,
                stdout: "",
                stderr: `Unexpected command: ${call.command}`,
              };
            },
          },
        },
      });

      const { useAppStore, waitForPendingWorkspaceArchiveCleanups } =
        await import("../src/store/app.store");
      const initialState = useAppStore.getInitialState();
      useAppStore.setState({
        ...initialState,
        hasHydratedWorkspaces: true,
        workspaces: [
          {
            id: "ws-main-close",
            name: "Main",
            updatedAt: "2026-03-10T00:00:00.000Z",
          },
          {
            id: "ws-feature-close",
            name: "feature",
            updatedAt: "2026-03-10T00:01:00.000Z",
          },
        ],
        activeWorkspaceId: "ws-main-close",
        projectPath: "/tmp/stave-project-close",
        workspacePathById: {
          "ws-main-close": "/tmp/stave-project-close",
          "ws-feature-close": workspacePath,
        },
        workspaceBranchById: {
          "ws-main-close": "main",
          "ws-feature-close": "feature",
        },
        workspaceDefaultById: {
          "ws-main-close": true,
          "ws-feature-close": false,
        },
      });

      await useAppStore
        .getState()
        .closeWorkspace({
          workspaceId: "ws-feature-close",
          deleteBranch: false,
        });
      await waitForPendingWorkspaceArchiveCleanups();
    } finally {
      console.warn = originalWarn;
    }

    expect(runCalls.map((call) => call.command)).toEqual([
      "git status --porcelain --untracked-files=all",
      `if [ -L ${JSON.stringify(`${workspacePath}/node_modules`)} ]; then rm ${JSON.stringify(`${workspacePath}/node_modules`)}; fi`,
      `git worktree remove ${JSON.stringify(workspacePath)}`,
      "git worktree prune",
    ]);
  });

  test("closeWorkspace cleanup deletes the worktree HEAD branch, not a stale cached name", async () => {
    const localStorage = createMemoryStorage();
    const runCalls: Array<{ cwd?: string; command: string }> = [];
    const workspacePath = "/tmp/stave-project-close/.stave/workspaces/feature";
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      setWindowContext({
        localStorage,
        api: {
          persistence: {
            listWorkspaces: async () => ({ ok: true, rows: [] }),
            loadWorkspace: async () => ({ ok: true, snapshot: null }),
            upsertWorkspace: async () => ({ ok: true }),
            closeWorkspace: async () => ({ ok: true }),
          },
          fs: {
            listFiles: async () => ({ ok: true, files: [] }),
            readFile: async () => ({ ok: false }),
            writeFile: async () => ({ ok: false }),
          },
          terminal: {
            runCommand: async (call: { cwd?: string; command: string }) => {
              runCalls.push(call);
              if (
                call.cwd === workspacePath &&
                call.command === "git status --porcelain --untracked-files=all"
              ) {
                return { ok: true, code: 0, stdout: "", stderr: "" };
              }
              if (
                call.cwd === workspacePath &&
                call.command === "git symbolic-ref --quiet --short HEAD"
              ) {
                // The workspace terminal switched this worktree to another
                // branch, so the store's cached "feature" is stale.
                return {
                  ok: true,
                  code: 0,
                  stdout: "feature-v2\n",
                  stderr: "",
                };
              }
              return { ok: true, code: 0, stdout: "", stderr: "" };
            },
          },
        },
      });

      const { useAppStore, waitForPendingWorkspaceArchiveCleanups } =
        await import("../src/store/app.store");
      const initialState = useAppStore.getInitialState();
      useAppStore.setState({
        ...initialState,
        hasHydratedWorkspaces: true,
        workspaces: [
          {
            id: "ws-main-close",
            name: "Main",
            updatedAt: "2026-03-10T00:00:00.000Z",
          },
          {
            id: "ws-feature-close",
            name: "feature",
            updatedAt: "2026-03-10T00:01:00.000Z",
          },
        ],
        activeWorkspaceId: "ws-main-close",
        projectPath: "/tmp/stave-project-close",
        workspacePathById: {
          "ws-main-close": "/tmp/stave-project-close",
          "ws-feature-close": workspacePath,
        },
        workspaceBranchById: {
          "ws-main-close": "main",
          "ws-feature-close": "feature",
        },
        workspaceDefaultById: {
          "ws-main-close": true,
          "ws-feature-close": false,
        },
      });

      await useAppStore
        .getState()
        .closeWorkspace({ workspaceId: "ws-feature-close" });
      await waitForPendingWorkspaceArchiveCleanups();
    } finally {
      console.warn = originalWarn;
    }

    const branchCommands = runCalls
      .map((call) => call.command)
      .filter((command) => command.startsWith("git branch"));
    expect(branchCommands).toEqual(['git branch -D "feature-v2"']);
    // Force-deleting the stale name would destroy a branch this worktree no
    // longer owns, potentially with unpushed commits behind it.
    expect(
      runCalls.some((call) => call.command === 'git branch -D "feature"'),
    ).toBe(false);
  });

  test("closeWorkspace cleanup deletes nothing when the worktree HEAD is detached", async () => {
    const localStorage = createMemoryStorage();
    const runCalls: Array<{ cwd?: string; command: string }> = [];
    const workspacePath = "/tmp/stave-project-close/.stave/workspaces/feature";
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      setWindowContext({
        localStorage,
        api: {
          persistence: {
            listWorkspaces: async () => ({ ok: true, rows: [] }),
            loadWorkspace: async () => ({ ok: true, snapshot: null }),
            upsertWorkspace: async () => ({ ok: true }),
            closeWorkspace: async () => ({ ok: true }),
          },
          fs: {
            listFiles: async () => ({ ok: true, files: [] }),
            readFile: async () => ({ ok: false }),
            writeFile: async () => ({ ok: false }),
          },
          terminal: {
            runCommand: async (call: { cwd?: string; command: string }) => {
              runCalls.push(call);
              if (
                call.cwd === workspacePath &&
                call.command === "git symbolic-ref --quiet --short HEAD"
              ) {
                // `git symbolic-ref` exits non-zero on a detached HEAD.
                return { ok: false, code: 1, stdout: "", stderr: "" };
              }
              return { ok: true, code: 0, stdout: "", stderr: "" };
            },
          },
        },
      });

      const { useAppStore, waitForPendingWorkspaceArchiveCleanups } =
        await import("../src/store/app.store");
      const initialState = useAppStore.getInitialState();
      useAppStore.setState({
        ...initialState,
        hasHydratedWorkspaces: true,
        workspaces: [
          {
            id: "ws-main-close",
            name: "Main",
            updatedAt: "2026-03-10T00:00:00.000Z",
          },
          {
            id: "ws-feature-close",
            name: "feature",
            updatedAt: "2026-03-10T00:01:00.000Z",
          },
        ],
        activeWorkspaceId: "ws-main-close",
        projectPath: "/tmp/stave-project-close",
        workspacePathById: {
          "ws-main-close": "/tmp/stave-project-close",
          "ws-feature-close": workspacePath,
        },
        workspaceBranchById: {
          "ws-main-close": "main",
          "ws-feature-close": "feature",
        },
        workspaceDefaultById: {
          "ws-main-close": true,
          "ws-feature-close": false,
        },
      });

      await useAppStore
        .getState()
        .closeWorkspace({ workspaceId: "ws-feature-close" });
      await waitForPendingWorkspaceArchiveCleanups();
    } finally {
      console.warn = originalWarn;
    }

    expect(runCalls.some((call) => call.command.startsWith("git branch"))).toBe(
      false,
    );
  });

  test("switchWorkspace resolves after shell hydrate and backfills messages asynchronously for uncached workspaces", async () => {
    const localStorage = createMemoryStorage();
    let resolveTaskMessages:
      | ((value: {
          ok: boolean;
          page: {
            messages: Array<{
              id: string;
              role: "assistant";
              model: string;
              providerId: "codex";
              content: string;
              isStreaming: boolean;
              parts: Array<{ type: "text"; text: string }>;
            }>;
            totalCount: number;
            limit: number;
            offset: number;
            hasMoreOlder: boolean;
          };
        }) => void)
      | null = null;
    const taskMessagesPromise = new Promise<{
      ok: boolean;
      page: {
        messages: Array<{
          id: string;
          role: "assistant";
          model: string;
          providerId: "codex";
          content: string;
          isStreaming: boolean;
          parts: Array<{ type: "text"; text: string }>;
        }>;
        totalCount: number;
        limit: number;
        offset: number;
        hasMoreOlder: boolean;
      };
    }>((resolve) => {
      resolveTaskMessages = resolve;
    });

    setWindowContext({
      localStorage,
      api: {
        persistence: {
          listWorkspaces: async () => ({ ok: true, rows: [] }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          upsertWorkspace: async () => ({ ok: true }),
          loadWorkspaceShell: async ({
            workspaceId,
          }: {
            workspaceId: string;
          }) => ({
            ok: true,
            shell:
              workspaceId === "ws-beta-cold"
                ? {
                    activeTaskId: "task-beta-cold",
                    tasks: [
                      {
                        id: "task-beta-cold",
                        title: "Beta Cold Task",
                        provider: "codex",
                        updatedAt: "2026-03-10T00:01:00.000Z",
                        unread: false,
                      },
                    ],
                    promptDraftByTask: {},
                    providerSessionByTask: {},
                    messageCountByTask: { "task-beta-cold": 1 },
                    workspaceInformation: {
                      jiraIssues: [],
                      confluencePages: [],
                      figmaResources: [],
                      storybookResources: [],
                      linkedPullRequests: [],
                      slackThreads: [],
                      notes: "",
                      todos: [],
                      customFields: [],
                    },
                    editorTabs: [],
                    activeEditorTabId: null,
                  }
                : null,
          }),
          listLatestWorkspaceTurns: async () => ({ ok: true, turns: [] }),
          loadTaskMessages: async () => taskMessagesPromise,
        },
        fs: {
          listFiles: async () => ({ ok: true, files: [] }),
          readFile: async () => ({ ok: false }),
          writeFile: async () => ({ ok: false }),
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      workspaces: [
        {
          id: "ws-alpha-cold",
          name: "alpha",
          updatedAt: "2026-03-10T00:00:00.000Z",
        },
        {
          id: "ws-beta-cold",
          name: "beta",
          updatedAt: "2026-03-10T00:01:00.000Z",
        },
      ],
      activeWorkspaceId: "ws-alpha-cold",
      projectPath: "/tmp/stave-project-cold",
      projectName: "stave-project-cold",
      workspacePathById: {
        "ws-alpha-cold": "/tmp/stave-project-cold",
        "ws-beta-cold": "/tmp/stave-project-cold/.stave/workspaces/beta",
      },
      workspaceBranchById: {
        "ws-alpha-cold": "main",
        "ws-beta-cold": "beta",
      },
      workspaceDefaultById: {
        "ws-alpha-cold": true,
        "ws-beta-cold": false,
      },
      tasks: [
        {
          id: "task-alpha-cold",
          title: "Alpha Task",
          provider: "claude-code",
          updatedAt: "2026-03-10T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      activeTaskId: "task-alpha-cold",
      messagesByTask: { "task-alpha-cold": [] },
      messageCountByTask: { "task-alpha-cold": 0 },
      projectFiles: ["alpha.ts"],
    });

    let switchResolved = false;
    const switchPromise = useAppStore
      .getState()
      .switchWorkspace({ workspaceId: "ws-beta-cold" })
      .then(() => {
        switchResolved = true;
      });

    await Bun.sleep(0);

    expect(switchResolved).toBe(true);
    expect(useAppStore.getState().activeWorkspaceId).toBe("ws-beta-cold");
    expect(useAppStore.getState().activeTaskId).toBe("task-beta-cold");
    expect(useAppStore.getState().tasks.map((task) => task.id)).toEqual([
      "task-beta-cold",
    ]);
    expect(useAppStore.getState().messageCountByTask["task-beta-cold"]).toBe(1);
    expect(
      useAppStore.getState().messagesByTask["task-beta-cold"],
    ).toBeUndefined();
    expect(
      useAppStore.getState().taskMessagesLoadingByTask["task-beta-cold"],
    ).toBe(true);

    resolveTaskMessages?.({
      ok: true,
      page: {
        messages: [
          {
            id: "task-beta-cold-m-1",
            role: "assistant",
            model: "gpt-5.4",
            providerId: "codex",
            content: "cold beta message",
            isStreaming: false,
            parts: [{ type: "text", text: "cold beta message" }],
          },
        ],
        totalCount: 1,
        limit: 120,
        offset: 0,
        hasMoreOlder: false,
      },
    });
    await switchPromise;
    await Bun.sleep(0);

    expect(
      useAppStore.getState().messagesByTask["task-beta-cold"]?.at(-1)?.content,
    ).toBe("cold beta message");
    expect(
      useAppStore.getState().taskMessagesLoadingByTask["task-beta-cold"],
    ).toBe(false);
  });

  test("hydrateWorkspaces only prunes stale worktrees for the active project", async () => {
    const localStorage = createMemoryStorage();
    const closedWorkspaceIds: string[] = [];
    setWindowContext({
      localStorage,
      api: {
        persistence: {
          listWorkspaces: async () => ({
            ok: true,
            rows: [
              {
                id: "ws-alpha",
                name: "Default Workspace",
                updatedAt: "2026-03-10T00:00:00.000Z",
              },
              {
                id: "ws-alpha-feature",
                name: "feature-a",
                updatedAt: "2026-03-10T00:01:00.000Z",
              },
              {
                id: "ws-beta",
                name: "Default Workspace",
                updatedAt: "2026-03-10T00:02:00.000Z",
              },
              {
                id: "ws-beta-feature",
                name: "feature-b",
                updatedAt: "2026-03-10T00:03:00.000Z",
              },
            ],
          }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          loadProjectRegistry: async () => ({
            ok: true,
            projects: [
              {
                projectPath: "/tmp/project-alpha",
                projectName: "project-alpha",
                lastOpenedAt: "2026-03-10T00:00:00.000Z",
                defaultBranch: "main",
                workspaces: [
                  {
                    id: "ws-alpha",
                    name: "Default Workspace",
                    updatedAt: "2026-03-10T00:00:00.000Z",
                  },
                  {
                    id: "ws-alpha-feature",
                    name: "feature-a",
                    updatedAt: "2026-03-10T00:01:00.000Z",
                  },
                ],
                activeWorkspaceId: "ws-alpha",
                workspaceBranchById: {
                  "ws-alpha": "main",
                  "ws-alpha-feature": "feature-a",
                },
                workspacePathById: {
                  "ws-alpha": "/tmp/project-alpha",
                  "ws-alpha-feature":
                    "/tmp/project-alpha/.stave/workspaces/feature-a",
                },
                workspaceDefaultById: { "ws-alpha": true },
              },
            ],
          }),
          saveProjectRegistry: async () => ({ ok: true }),
          listLatestWorkspaceTurns: async () => ({ ok: true, turns: [] }),
          closeWorkspace: async ({ workspaceId }: { workspaceId: string }) => {
            closedWorkspaceIds.push(workspaceId);
            return { ok: true };
          },
        },
        terminal: {
          runCommand: async ({
            command,
          }: {
            cwd?: string;
            command: string;
          }) => {
            if (command === "git worktree prune") {
              return { ok: true, code: 0, stdout: "", stderr: "" };
            }
            if (command === "git worktree list --porcelain") {
              return {
                ok: true,
                code: 0,
                stdout: [
                  "worktree /tmp/project-alpha",
                  "HEAD abc123",
                  "branch refs/heads/main",
                  "",
                  "worktree /tmp/project-alpha/.stave/workspaces/feature-a",
                  "HEAD def456",
                  "branch refs/heads/feature-a",
                ].join("\n"),
                stderr: "",
              };
            }
            return {
              ok: false,
              code: 1,
              stdout: "",
              stderr: `Unexpected command: ${command}`,
            };
          },
        },
        fs: {
          listFiles: async () => ({ ok: true, files: ["package.json"] }),
          readFile: async () => ({ ok: false }),
          writeFile: async () => ({ ok: false }),
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      projectPath: "/tmp/project-alpha",
      projectName: "project-alpha",
      workspaces: [
        {
          id: "ws-alpha",
          name: "Default Workspace",
          updatedAt: "2026-03-10T00:00:00.000Z",
        },
        {
          id: "ws-alpha-feature",
          name: "feature-a",
          updatedAt: "2026-03-10T00:01:00.000Z",
        },
      ],
      activeWorkspaceId: "ws-alpha",
      workspaceBranchById: {
        "ws-alpha": "main",
        "ws-alpha-feature": "feature-a",
      },
      workspacePathById: {
        "ws-alpha": "/tmp/project-alpha",
        "ws-alpha-feature": "/tmp/project-alpha/.stave/workspaces/feature-a",
      },
      workspaceDefaultById: { "ws-alpha": true },
      recentProjects: [],
      hasHydratedWorkspaces: false,
    });

    await useAppStore.getState().hydrateWorkspaces();

    expect(closedWorkspaceIds).toEqual([]);
    expect(
      useAppStore.getState().workspaces.map((workspace) => workspace.id),
    ).toEqual(["ws-alpha", "ws-alpha-feature"]);
  });

  test("abortTaskTurn calls cleanupTask and clears providerSessionByTask to prevent stale thread resume", async () => {
    const localStorage = createMemoryStorage();
    const abortCalls: string[] = [];
    const cleanupCalls: string[] = [];
    let streamListener:
      | ((payload: { streamId: string; event: unknown; done: boolean }) => void)
      | null = null;

    (globalThis as { window: unknown }).window = {
      localStorage,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      api: {
        provider: {
          startPushTurn: async () => ({
            ok: true,
            streamId: "stream-abort-1",
            turnId: "turn-abort-1",
          }),
          subscribeStreamEvents: (listener: typeof streamListener) => {
            streamListener = listener;
            return () => {
              if (streamListener === listener) {
                streamListener = null;
              }
            };
          },
          abortTurn: async ({ turnId }: { turnId: string }) => {
            abortCalls.push(turnId);
            return { ok: true, message: "aborted" };
          },
          cleanupTask: async ({ taskId }: { taskId: string }) => {
            cleanupCalls.push(taskId);
            return { ok: true };
          },
        },
        persistence: {
          listWorkspaces: async () => ({ ok: true, rows: [] }),
          upsertWorkspace: async () => ({ ok: true }),
        },
        fs: {
          listFiles: async () => ({ ok: true, files: [] }),
        },
      },
    } as unknown;

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      activeWorkspaceId: "ws-abort-test",
      activeTaskId: "task-abort-1",
      projectPath: "/tmp/stave-abort-test",
      draftProvider: "codex",
      tasks: [
        {
          id: "task-abort-1",
          title: "Abort Test",
          provider: "codex",
          updatedAt: "2026-04-01T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: {
        "task-abort-1": [
          {
            id: "task-abort-1-m-1",
            role: "assistant",
            model: "gpt-5.4",
            providerId: "codex",
            content: "",
            isStreaming: false,
            parts: [
              {
                type: "approval",
                toolName: "bash",
                requestId: "approval-abort-1",
                description: "Run npm test",
                state: "approval-requested",
              },
            ],
          },
        ],
      },
      activeTurnIdsByTask: {
        "task-abort-1": "turn-abort-1",
      },
      promptDraftByTask: {},
      nativeSessionReadyByTask: {},
      providerSessionByTask: {
        "task-abort-1": { codex: "thread-id-stale-abc123" },
      },
    });

    const beforeAbort = useAppStore.getState();
    const activeTurnId = beforeAbort.activeTurnIdsByTask["task-abort-1"];
    expect(activeTurnId).toBeString();

    useAppStore.getState().abortTaskTurn({ taskId: "task-abort-1" });
    await Bun.sleep(0);

    const afterAbort = useAppStore.getState();
    // Turn should be cleared
    expect(afterAbort.activeTurnIdsByTask["task-abort-1"]).toBeUndefined();
    // cleanupTask must have been called so provider thread caches are evicted
    expect(cleanupCalls).toContain("task-abort-1");
    // providerSessionByTask should no longer hold the stale thread id
    expect(afterAbort.providerSessionByTask["task-abort-1"]).toBeUndefined();
    expect(
      afterAbort.messagesByTask["task-abort-1"]?.[0]?.parts[0],
    ).toMatchObject({
      type: "approval",
      requestId: "approval-abort-1",
      state: "approval-interrupted",
    });
  });

  test("abortTaskTurn stops the exact inactive workspace turn", async () => {
    const localStorage = createMemoryStorage();
    const abortCalls: string[] = [];
    (globalThis as { window: unknown }).window = {
      localStorage,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      api: {
        provider: {
          abortTurn: async ({ turnId }: { turnId: string }) => {
            abortCalls.push(turnId);
            return { ok: true, message: "aborted" };
          },
          cleanupTask: async () => ({ ok: true }),
        },
      },
    } as unknown;

    const { useAppStore } = await import("../src/store/app.store");
    const { createWorkspaceSessionStateFromAppState } = await import(
      "../src/store/workspace-runtime-state"
    );
    const initialState = useAppStore.getInitialState();
    const inactiveTask = {
      id: "task-inactive-abort",
      title: "Inactive abort",
      provider: "codex" as const,
      updatedAt: "2026-07-31T00:00:00.000Z",
      unread: false,
      archivedAt: null,
      controlMode: "interactive" as const,
      controlOwner: "stave" as const,
    };
    const inactiveSession = createWorkspaceSessionStateFromAppState({
      ...initialState,
      activeTaskId: inactiveTask.id,
      tasks: [inactiveTask],
      messagesByTask: {
        [inactiveTask.id]: [
          {
            id: "assistant-inactive-abort",
            role: "assistant",
            model: "gpt-5.6",
            providerId: "codex",
            content: "",
            isStreaming: true,
            parts: [
              {
                type: "user_input",
                requestId: "request-inactive-abort",
                toolName: "request_user_input",
                questions: [],
                state: "input-requested",
              },
            ],
          },
        ],
      },
      messageCountByTask: { [inactiveTask.id]: 1 },
      activeTurnIdsByTask: { [inactiveTask.id]: "turn-inactive-abort" },
      providerSessionByTask: {
        [inactiveTask.id]: { codex: "thread-inactive-abort" },
      },
    });
    useAppStore.setState({
      ...initialState,
      projectPath: "/tmp/stave",
      activeWorkspaceId: "workspace-active",
      tasks: [],
      messagesByTask: {},
      activeTurnIdsByTask: {},
      workspaceRuntimeCacheById: {
        "workspace-inactive": inactiveSession,
      },
      taskWorkspaceIdById: {
        [inactiveTask.id]: "workspace-inactive",
      },
    });

    useAppStore.getState().abortTaskTurn({ taskId: inactiveTask.id });
    await Bun.sleep(0);

    const cached =
      useAppStore.getState().workspaceRuntimeCacheById["workspace-inactive"];
    expect(abortCalls).toEqual(["turn-inactive-abort"]);
    expect(cached?.activeTurnIdsByTask[inactiveTask.id]).toBeUndefined();
    expect(cached?.providerSessionByTask[inactiveTask.id]).toBeUndefined();
    expect(cached?.messagesByTask[inactiveTask.id]?.[0]).toMatchObject({
      isStreaming: false,
      parts: [
        {
          type: "user_input",
          requestId: "request-inactive-abort",
          state: "input-interrupted",
        },
        {
          type: "system_event",
        },
      ],
    });
  });

  test("rollbackTask clears provider session so the next turn replays restored history", async () => {
    const localStorage = createMemoryStorage();
    const runCalls: Array<{ cwd?: string; command: string }> = [];
    const cleanupCalls: string[] = [];
    setWindowContext({
      localStorage,
      api: {
        terminal: {
          runCommand: async (call: { cwd?: string; command: string }) => {
            runCalls.push(call);
            return { ok: true, code: 0, stdout: "", stderr: "" };
          },
        },
        fs: {
          listFiles: async () => ({ ok: true, files: ["src/app.ts"] }),
        },
        provider: {
          cleanupTask: async ({ taskId }: { taskId: string }) => {
            cleanupCalls.push(taskId);
            return { ok: true };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      activeWorkspaceId: "ws-rollback",
      activeTaskId: "task-rollback",
      projectPath: "/tmp/stave-rollback",
      workspacePathById: {
        "ws-rollback": "/tmp/stave-rollback",
      },
      workspaceDefaultById: {
        "ws-rollback": true,
      },
      tasks: [
        {
          id: "task-rollback",
          title: "Rollback Task",
          provider: "codex",
          updatedAt: "2026-04-01T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: {
        "task-rollback": [],
      },
      taskCheckpointById: {
        "task-rollback": "abc123",
      },
      providerSessionByTask: {
        "task-rollback": { codex: "thread-stale-rollback" },
      },
      nativeSessionReadyByTask: {
        "task-rollback": true,
      },
    });

    await useAppStore.getState().rollbackTask({ taskId: "task-rollback" });

    expect(runCalls).toEqual([
      {
        cwd: "/tmp/stave-rollback",
        command: 'git restore --source="abc123" --staged --worktree .',
      },
    ]);
    expect(cleanupCalls).toEqual(["task-rollback"]);
    const nextState = useAppStore.getState();
    expect(nextState.providerSessionByTask["task-rollback"]).toBeUndefined();
    expect(nextState.nativeSessionReadyByTask["task-rollback"]).toBe(false);
    expect(
      nextState.messagesByTask["task-rollback"]?.at(-1)?.content,
    ).toContain("Provider session reset");
  });

  test("rollbackToCompactBoundary clears provider session after restore", async () => {
    const localStorage = createMemoryStorage();
    const runCalls: Array<{ cwd?: string; command: string }> = [];
    const cleanupCalls: string[] = [];
    setWindowContext({
      localStorage,
      api: {
        terminal: {
          runCommand: async (call: { cwd?: string; command: string }) => {
            runCalls.push(call);
            return { ok: true, code: 0, stdout: "", stderr: "" };
          },
        },
        fs: {
          listFiles: async () => ({ ok: true, files: ["src/restored.ts"] }),
        },
        provider: {
          cleanupTask: async ({ taskId }: { taskId: string }) => {
            cleanupCalls.push(taskId);
            return { ok: true };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      activeWorkspaceId: "ws-compact",
      activeTaskId: "task-compact",
      projectPath: "/tmp/stave-compact",
      workspacePathById: {
        "ws-compact": "/tmp/stave-compact",
      },
      workspaceDefaultById: {
        "ws-compact": true,
      },
      tasks: [
        {
          id: "task-compact",
          title: "Compact Task",
          provider: "claude-code",
          updatedAt: "2026-04-01T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: {
        "task-compact": [
          {
            id: "task-compact-m-0",
            role: "user",
            model: "user",
            providerId: "user",
            content: "before restore",
            parts: [{ type: "text", text: "before restore" }],
          },
        ],
      },
      providerSessionByTask: {
        "task-compact": { "claude-code": "session-stale-compact" },
      },
      nativeSessionReadyByTask: {
        "task-compact": true,
      },
    });

    await useAppStore.getState().rollbackToCompactBoundary({
      taskId: "task-compact",
      gitRef: "def456",
      trigger: "manual",
    });

    expect(runCalls).toEqual([
      {
        cwd: "/tmp/stave-compact",
        command: 'git restore --source="def456" --staged --worktree .',
      },
    ]);
    expect(cleanupCalls).toEqual(["task-compact"]);
    const nextState = useAppStore.getState();
    expect(nextState.providerSessionByTask["task-compact"]).toBeUndefined();
    expect(nextState.nativeSessionReadyByTask["task-compact"]).toBe(false);
    expect(nextState.messagesByTask["task-compact"]?.at(-1)?.content).toContain(
      "Provider session reset",
    );
  });

  test("trusted approval events auto-approve without creating approval notifications", async () => {
    const localStorage = createMemoryStorage();
    const approvalCalls: Array<{
      turnId: string;
      requestId: string;
      approved: boolean;
    }> = [];
    let streamListener:
      | ((payload: { streamId: string; event: unknown; done: boolean }) => void)
      | null = null;

    (globalThis as { window: unknown }).window = {
      localStorage,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      api: {
        provider: {
          startPushTurn: async () => ({
            ok: true,
            streamId: "stream-trusted-approval",
            turnId: "turn-trusted-approval",
          }),
          subscribeStreamEvents: (listener: typeof streamListener) => {
            streamListener = listener;
            return () => {
              if (streamListener === listener) {
                streamListener = null;
              }
            };
          },
          respondApproval: async (args: {
            turnId: string;
            requestId: string;
            approved: boolean;
          }) => {
            approvalCalls.push(args);
            return { ok: true, message: "ok" };
          },
        },
        persistence: {
          listWorkspaces: async () => ({ ok: true, rows: [] }),
          upsertWorkspace: async () => ({ ok: true }),
        },
        fs: {
          readFile: async () => ({
            ok: false,
            content: "",
            revision: "",
            stderr: "not found",
          }),
        },
      },
    } as unknown;

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      activeWorkspaceId: "ws-trusted-approval",
      activeTaskId: "task-trusted-approval",
      projectPath: "/tmp/stave-trusted-approval",
      workspacePathById: {
        "ws-trusted-approval": "/tmp/stave-trusted-approval",
      },
      workspaceBranchById: {
        "ws-trusted-approval": "main",
      },
      workspaceDefaultById: {
        "ws-trusted-approval": true,
      },
      draftProvider: "codex",
      settings: {
        ...initialState.settings,
        trustedTools: ["bash:bun test"],
      },
      tasks: [
        {
          id: "task-trusted-approval",
          title: "Trusted Approval Task",
          provider: "codex",
          updatedAt: "2026-04-07T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: { "task-trusted-approval": [] },
      activeTurnIdsByTask: {},
      promptDraftByTask: {},
      nativeSessionReadyByTask: {},
      providerSessionByTask: {},
    });

    await useAppStore.getState().sendUserMessage({
      taskId: "task-trusted-approval",
      content: "run tests",
    });
    const activeTurnId =
      useAppStore.getState().activeTurnIdsByTask["task-trusted-approval"];
    expect(activeTurnId).toBeString();

    streamListener?.({
      streamId: "stream-trusted-approval",
      done: false,
      event: {
        type: "approval",
        toolName: "bash",
        requestId: "approval-trusted-1",
        description: "Run bun test",
        input: "bun test tests/trusted-tools.test.ts",
      },
    });

    await Bun.sleep(30);

    expect(approvalCalls).toEqual([
      {
        turnId: activeTurnId,
        requestId: "approval-trusted-1",
        approved: true,
      },
    ]);
    const message =
      useAppStore.getState().messagesByTask["task-trusted-approval"]?.[1];
    expect(message?.parts[0]).toMatchObject({
      type: "approval",
      requestId: "approval-trusted-1",
      state: "approval-responded",
    });
    expect(useAppStore.getState().notifications).toEqual([]);
  });

  test("fetchAllWorkspacePrStatuses skips fresh and active workspaces with bounded concurrency", async () => {
    const localStorage = createMemoryStorage();
    const calls: string[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    setWindowContext({
      localStorage,
      api: {
        sourceControl: {
          getPrStatus: async ({ cwd }: { cwd?: string }) => {
            calls.push(cwd ?? "");
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await Bun.sleep(5);
            inFlight -= 1;
            return { ok: true, pr: null };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      activeWorkspaceId: "ws-active",
      workspaces: [
        {
          id: "ws-default",
          name: "Default",
          updatedAt: "2026-04-07T00:00:00.000Z",
        },
        {
          id: "ws-active",
          name: "Active",
          updatedAt: "2026-04-07T00:00:00.000Z",
        },
        {
          id: "ws-fresh",
          name: "Fresh",
          updatedAt: "2026-04-07T00:00:00.000Z",
        },
        {
          id: "ws-stale-1",
          name: "Stale 1",
          updatedAt: "2026-04-07T00:00:00.000Z",
        },
        {
          id: "ws-stale-2",
          name: "Stale 2",
          updatedAt: "2026-04-07T00:00:00.000Z",
        },
        {
          id: "ws-stale-3",
          name: "Stale 3",
          updatedAt: "2026-04-07T00:00:00.000Z",
        },
        {
          id: "ws-stale-4",
          name: "Stale 4",
          updatedAt: "2026-04-07T00:00:00.000Z",
        },
      ],
      workspaceDefaultById: {
        "ws-default": true,
        "ws-active": false,
        "ws-fresh": false,
        "ws-stale-1": false,
        "ws-stale-2": false,
        "ws-stale-3": false,
        "ws-stale-4": false,
      },
      workspacePathById: {
        "ws-default": "/tmp/default",
        "ws-active": "/tmp/active",
        "ws-fresh": "/tmp/fresh",
        "ws-stale-1": "/tmp/stale-1",
        "ws-stale-2": "/tmp/stale-2",
        "ws-stale-3": "/tmp/stale-3",
        "ws-stale-4": "/tmp/stale-4",
      },
      workspacePrInfoById: {
        "ws-fresh": {
          pr: null,
          derived: "no_pr",
          lastFetched: Date.now(),
        },
      },
    });

    await useAppStore.getState().fetchAllWorkspacePrStatuses();

    expect(calls.sort()).toEqual([
      "/tmp/stale-1",
      "/tmp/stale-2",
      "/tmp/stale-3",
      "/tmp/stale-4",
    ]);
    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(
      useAppStore.getState().workspacePrInfoById["ws-stale-1"],
    ).toMatchObject({
      pr: null,
      derived: "no_pr",
    });
  });

  test("fetchWorkspacePrStatus discards stale workspace path results", async () => {
    const localStorage = createMemoryStorage();
    let releaseStatus!: () => void;
    const statusBlock = new Promise<void>((resolve) => {
      releaseStatus = resolve;
    });
    const calls: string[] = [];
    setWindowContext({
      localStorage,
      api: {
        sourceControl: {
          getPrStatus: async ({ cwd }: { cwd?: string }) => {
            calls.push(cwd ?? "");
            await statusBlock;
            return { ok: true, pr: null };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    useAppStore.setState({
      ...useAppStore.getInitialState(),
      hasHydratedWorkspaces: true,
      activeWorkspaceId: "ws-active",
      projectPath: "/tmp/stave-project",
      workspaces: [
        {
          id: "ws-active",
          name: "Active",
          updatedAt: "2026-04-07T00:00:00.000Z",
        },
        {
          id: "ws-pr",
          name: "PR",
          updatedAt: "2026-04-07T00:01:00.000Z",
        },
      ],
      workspaceDefaultById: {
        "ws-active": false,
        "ws-pr": false,
      },
      workspacePathById: {
        "ws-active": "/tmp/active",
        "ws-pr": "/tmp/pr-old",
      },
    });

    const fetchPromise = useAppStore
      .getState()
      .fetchWorkspacePrStatus({ workspaceId: "ws-pr" });
    expect(calls).toEqual(["/tmp/pr-old"]);

    useAppStore.setState((state) => ({
      workspacePathById: {
        ...state.workspacePathById,
        "ws-pr": "/tmp/pr-new",
      },
    }));

    releaseStatus();
    await fetchPromise;

    expect(useAppStore.getState().workspacePrInfoById["ws-pr"]).toBeUndefined();
  });

  test("resolveApproval keeps pending state when no active turn exists", async () => {
    setWindowContext({
      localStorage: createMemoryStorage(),
      api: {},
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      activeWorkspaceId: "ws-main",
      activeTaskId: "task-1",
      projectPath: "/tmp/stave-project",
      workspacePathById: { "ws-main": "/tmp/stave-project" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
      tasks: [
        {
          id: "task-1",
          title: "Task 1",
          provider: "codex",
          updatedAt: "2026-04-07T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: {
        "task-1": [
          {
            id: "task-1-m-1",
            role: "assistant",
            model: "gpt-5.4",
            providerId: "codex",
            content: "",
            isStreaming: false,
            parts: [
              {
                type: "approval",
                toolName: "bash",
                requestId: "approval-1",
                description: "Run npm test",
                state: "approval-requested",
              },
            ],
          },
        ],
      },
      activeTurnIdsByTask: {},
      promptDraftByTask: {},
      nativeSessionReadyByTask: {},
      providerSessionByTask: {},
    });

    useAppStore.getState().resolveApproval({
      taskId: "task-1",
      messageId: "task-1-m-1",
      approved: true,
    });

    const messages = useAppStore.getState().messagesByTask["task-1"] ?? [];
    expect(messages).toHaveLength(2);
    expect(messages[0]?.parts[0]).toMatchObject({
      type: "approval",
      requestId: "approval-1",
      state: "approval-requested",
    });
    expect(messages[1]).toMatchObject({
      role: "assistant",
      content: "Approval delivery failed: no active turn found for this task.",
    });
  });

  test("Fleet interaction actions preserve the exact request within a shared message", async () => {
    const approvalCalls: string[] = [];
    const inputCalls: string[] = [];
    setWindowContext({
      localStorage: createMemoryStorage(),
      api: {
        provider: {
          respondApproval: async (args: { requestId: string }) => {
            approvalCalls.push(args.requestId);
            return { ok: true, message: "ok" };
          },
          respondUserInput: async (args: { requestId: string }) => {
            inputCalls.push(args.requestId);
            return { ok: true, message: "ok" };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      activeWorkspaceId: "ws-main",
      activeTaskId: "task-exact-request",
      projectPath: "/tmp/stave-project",
      tasks: [
        {
          id: "task-exact-request",
          title: "Exact request",
          provider: "codex",
          updatedAt: "2026-07-31T00:00:00.000Z",
          unread: false,
          controlMode: "interactive",
          controlOwner: "stave",
        },
      ],
      messagesByTask: {
        "task-exact-request": [
          {
            id: "assistant-exact-request",
            role: "assistant",
            model: "gpt-5.6",
            providerId: "codex",
            content: "",
            isStreaming: true,
            parts: [
              {
                type: "approval",
                toolName: "bash",
                requestId: "approval-first",
                description: "Run the first command",
                state: "approval-requested",
              },
              {
                type: "approval",
                toolName: "bash",
                requestId: "approval-latest",
                description: "Run the latest command",
                state: "approval-requested",
              },
              {
                type: "user_input",
                toolName: "request_user_input",
                requestId: "input-first",
                questions: [],
                state: "input-requested",
              },
              {
                type: "user_input",
                toolName: "request_user_input",
                requestId: "input-latest",
                questions: [],
                state: "input-requested",
              },
            ],
          },
        ],
      },
      activeTurnIdsByTask: {
        "task-exact-request": "turn-exact-request",
      },
      taskWorkspaceIdById: { "task-exact-request": "ws-main" },
    });

    useAppStore.getState().resolveApproval({
      taskId: "task-exact-request",
      messageId: "assistant-exact-request",
      requestId: "approval-first",
      approved: true,
    });
    useAppStore.getState().resolveUserInput({
      taskId: "task-exact-request",
      messageId: "assistant-exact-request",
      requestId: "input-first",
      answers: {},
    });
    await Bun.sleep(0);

    expect(approvalCalls).toEqual(["approval-first"]);
    expect(inputCalls).toEqual(["input-first"]);
    expect(
      useAppStore.getState().messagesByTask["task-exact-request"]?.[0]?.parts,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requestId: "approval-first",
          state: "approval-responded",
        }),
        expect.objectContaining({
          requestId: "approval-latest",
          state: "approval-requested",
        }),
        expect.objectContaining({
          requestId: "input-first",
          state: "input-responded",
        }),
        expect.objectContaining({
          requestId: "input-latest",
          state: "input-requested",
        }),
      ]),
    );
  });

  test("notification approval delegates to a Stave-owned managed task", async () => {
    const approvalCalls: Array<{
      workspaceId: string;
      taskId: string;
      requestId: string;
      approved: boolean;
    }> = [];
    setWindowContext({
      localStorage: createMemoryStorage(),
      api: {
        localMcp: {
          respondApproval: async (args: {
            workspaceId: string;
            taskId: string;
            requestId: string;
            approved: boolean;
          }) => {
            approvalCalls.push(args);
            return { ok: true, message: "ok" };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      ...buildManagedApprovalState("stave"),
    });

    await useAppStore.getState().resolveNotificationApproval({
      notificationId: "notification-managed",
      approved: true,
    });
    for (
      let attempt = 0;
      attempt < 10 && approvalCalls.length === 0;
      attempt += 1
    ) {
      await Bun.sleep(0);
    }

    expect(approvalCalls).toEqual([
      {
        workspaceId: "ws-main",
        taskId: "task-managed",
        requestId: "approval-managed",
        approved: true,
      },
    ]);
    expect(useAppStore.getState().notifications[0]?.resolvedAt).toBeString();
  });

  test("notification approval delegates to an externally managed task through the host", async () => {
    const approvalCalls: unknown[] = [];
    setWindowContext({
      localStorage: createMemoryStorage(),
      api: {
        localMcp: {
          respondApproval: async (args: unknown) => {
            approvalCalls.push(args);
            return { ok: true, message: "ok" };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      ...buildManagedApprovalState("external"),
    });

    await useAppStore.getState().resolveNotificationApproval({
      notificationId: "notification-managed",
      approved: true,
    });
    await Bun.sleep(0);

    expect(approvalCalls).toEqual([
      {
        workspaceId: "ws-main",
        taskId: "task-managed",
        requestId: "approval-managed",
        approved: true,
      },
    ]);
    expect(useAppStore.getState().notifications[0]?.resolvedAt).toBeString();
  });

  test("resolveApproval targets the task-owned inactive workspace turn with trimmed notification task ids", async () => {
    const approvalCalls: Array<{
      turnId: string;
      requestId: string;
      approved: boolean;
    }> = [];

    setWindowContext({
      localStorage: createMemoryStorage(),
      api: {
        provider: {
          respondApproval: async (args: {
            turnId: string;
            requestId: string;
            approved: boolean;
          }) => {
            approvalCalls.push(args);
            return { ok: true, message: "ok" };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      activeWorkspaceId: "ws-main",
      activeTaskId: "task-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: {
        "ws-main": "/tmp/stave-project",
        "ws-alt": "/tmp/stave-project/.stave/workspaces/alt",
      },
      workspaceBranchById: {
        "ws-main": "main",
        "ws-alt": "alt",
      },
      workspaceDefaultById: {
        "ws-main": true,
        "ws-alt": false,
      },
      tasks: [
        {
          id: "task-main",
          title: "Task Main",
          provider: "codex",
          updatedAt: "2026-04-07T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: { "task-main": [] },
      notifications: [
        {
          id: "notification-approval-alt-1",
          kind: "task.approval_requested",
          title: "Task Alt",
          body: "Approval requested",
          projectPath: "/tmp/stave-project",
          projectName: "stave-project",
          workspaceId: "ws-alt",
          workspaceName: "Alt Workspace",
          taskId: " task-alt ",
          taskTitle: "Task Alt",
          turnId: "turn-alt-1",
          providerId: "codex",
          action: {
            type: "approval",
            requestId: "approval-alt-1",
          },
          payload: {
            toolName: "bash",
            description: "Run npm test in alt workspace",
          },
          createdAt: "2026-04-07T00:00:00.000Z",
          readAt: null,
        },
      ],
      activeTurnIdsByTask: {},
      promptDraftByTask: {},
      nativeSessionReadyByTask: {},
      providerSessionByTask: {},
      taskWorkspaceIdById: {
        "task-main": "ws-main",
        "task-alt": "ws-alt",
      },
      workspaceRuntimeCacheById: {
        "ws-alt": {
          activeTaskId: "task-alt",
          tasks: [
            {
              id: "task-alt",
              title: "Task Alt",
              provider: "codex",
              updatedAt: "2026-04-07T00:00:00.000Z",
              unread: false,
              archivedAt: null,
            },
          ],
          messagesByTask: {
            "task-alt": [
              {
                id: "task-alt-m-1",
                role: "assistant",
                model: "gpt-5.4",
                providerId: "codex",
                content: "",
                isStreaming: false,
                parts: [
                  {
                    type: "approval",
                    toolName: "bash",
                    requestId: "approval-alt-1",
                    description: "Run npm test in alt workspace",
                    state: "approval-requested",
                  },
                ],
              },
            ],
          },
          messageCountByTask: { "task-alt": 1 },
          promptDraftByTask: {},
          workspaceInformation: {
            jiraIssues: [],
            confluencePages: [],
            figmaResources: [],
            storybookResources: [],
            linkedPullRequests: [],
            slackThreads: [],
            notes: "",
            todos: [],
            customFields: [],
          },
          editorTabs: [],
          activeEditorTabId: null,
          terminalTabs: [],
          activeTerminalTabId: null,
          activeTurnIdsByTask: {
            "task-alt": "turn-alt-1",
          },
          providerSessionByTask: {},
          nativeSessionReadyByTask: {},
        },
      },
    });

    useAppStore.getState().resolveApproval({
      taskId: "task-alt",
      messageId: "task-alt-m-1",
      approved: true,
    });

    await Bun.sleep(0);

    expect(approvalCalls).toEqual([
      {
        turnId: "turn-alt-1",
        requestId: "approval-alt-1",
        approved: true,
      },
    ]);
    expect(
      useAppStore.getState().workspaceRuntimeCacheById["ws-alt"]
        ?.messagesByTask["task-alt"]?.[0]?.parts[0],
    ).toMatchObject({
      type: "approval",
      requestId: "approval-alt-1",
      state: "approval-responded",
    });
    expect(useAppStore.getState().notifications[0]?.readAt).toBeString();
    expect(useAppStore.getState().notifications[0]?.resolvedAt).toBeString();
    expect(useAppStore.getState().messagesByTask["task-main"]).toEqual([]);
  });

  test("resolveApproval only marks the matching notification when request ids collide across workspaces", async () => {
    const approvalCalls: Array<{
      turnId: string;
      requestId: string;
      approved: boolean;
    }> = [];

    setWindowContext({
      localStorage: createMemoryStorage(),
      api: {
        provider: {
          respondApproval: async (args: {
            turnId: string;
            requestId: string;
            approved: boolean;
          }) => {
            approvalCalls.push(args);
            return { ok: true, message: "ok" };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      activeWorkspaceId: "ws-main",
      activeTaskId: "task-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: {
        "ws-main": "/tmp/stave-project",
        "ws-alt": "/tmp/stave-project/.stave/workspaces/alt",
      },
      workspaceBranchById: {
        "ws-main": "main",
        "ws-alt": "alt",
      },
      workspaceDefaultById: {
        "ws-main": true,
        "ws-alt": false,
      },
      tasks: [
        {
          id: "task-main",
          title: "Task Main",
          provider: "codex",
          updatedAt: "2026-04-07T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: { "task-main": [] },
      notifications: [
        {
          id: "notification-approval-main-1",
          kind: "task.approval_requested",
          title: "Task Main",
          body: "Approval requested",
          projectPath: "/tmp/stave-project",
          projectName: "stave-project",
          workspaceId: "ws-main",
          workspaceName: "Main Workspace",
          taskId: "task-main",
          taskTitle: "Task Main",
          turnId: "turn-main-1",
          providerId: "codex",
          action: {
            type: "approval",
            requestId: "1",
            messageId: "task-main-m-1",
          },
          payload: {
            toolName: "bash",
            description: "Run npm test in main workspace",
          },
          createdAt: "2026-04-07T00:00:01.000Z",
          readAt: null,
        },
        {
          id: "notification-approval-alt-1",
          kind: "task.approval_requested",
          title: "Task Alt",
          body: "Approval requested",
          projectPath: "/tmp/stave-project",
          projectName: "stave-project",
          workspaceId: "ws-alt",
          workspaceName: "Alt Workspace",
          taskId: "task-alt",
          taskTitle: "Task Alt",
          turnId: "turn-alt-1",
          providerId: "codex",
          action: {
            type: "approval",
            requestId: "1",
            messageId: "task-alt-m-1",
          },
          payload: {
            toolName: "bash",
            description: "Run npm test in alt workspace",
          },
          createdAt: "2026-04-07T00:00:00.000Z",
          readAt: null,
        },
      ],
      activeTurnIdsByTask: {},
      promptDraftByTask: {},
      nativeSessionReadyByTask: {},
      providerSessionByTask: {},
      taskWorkspaceIdById: {
        "task-main": "ws-main",
        "task-alt": "ws-alt",
      },
      workspaceRuntimeCacheById: {
        "ws-alt": {
          activeTaskId: "task-alt",
          tasks: [
            {
              id: "task-alt",
              title: "Task Alt",
              provider: "codex",
              updatedAt: "2026-04-07T00:00:00.000Z",
              unread: false,
              archivedAt: null,
            },
          ],
          messagesByTask: {
            "task-alt": [
              {
                id: "task-alt-m-1",
                role: "assistant",
                model: "gpt-5.4",
                providerId: "codex",
                content: "",
                isStreaming: false,
                parts: [
                  {
                    type: "approval",
                    toolName: "bash",
                    requestId: "1",
                    description: "Run npm test in alt workspace",
                    state: "approval-requested",
                  },
                ],
              },
            ],
          },
          messageCountByTask: { "task-alt": 1 },
          promptDraftByTask: {},
          workspaceInformation: {
            jiraIssues: [],
            confluencePages: [],
            figmaResources: [],
            storybookResources: [],
            linkedPullRequests: [],
            slackThreads: [],
            notes: "",
            todos: [],
            customFields: [],
          },
          editorTabs: [],
          activeEditorTabId: null,
          terminalTabs: [],
          activeTerminalTabId: null,
          activeTurnIdsByTask: {
            "task-alt": "turn-alt-1",
          },
          providerSessionByTask: {},
          nativeSessionReadyByTask: {},
        },
      },
    });

    useAppStore.getState().resolveApproval({
      taskId: "task-alt",
      messageId: "task-alt-m-1",
      approved: true,
    });

    await Bun.sleep(0);

    expect(approvalCalls).toEqual([
      {
        turnId: "turn-alt-1",
        requestId: "1",
        approved: true,
      },
    ]);

    const notifications = useAppStore.getState().notifications;
    expect(
      notifications.find(
        (notification) => notification.id === "notification-approval-alt-1",
      )?.readAt,
    ).toBeString();
    expect(
      notifications.find(
        (notification) => notification.id === "notification-approval-main-1",
      )?.readAt,
    ).toBeNull();
  });

  test("resolveUserInput targets the task-owned inactive workspace turn", async () => {
    const inputCalls: Array<{
      turnId: string;
      requestId: string;
      answers?: Record<string, string>;
      denied?: boolean;
    }> = [];

    setWindowContext({
      localStorage: createMemoryStorage(),
      api: {
        provider: {
          respondUserInput: async (args: {
            turnId: string;
            requestId: string;
            answers?: Record<string, string>;
            denied?: boolean;
          }) => {
            inputCalls.push(args);
            return { ok: true, message: "ok" };
          },
        },
      },
    });

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      activeWorkspaceId: "ws-main",
      activeTaskId: "task-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: {
        "ws-main": "/tmp/stave-project",
        "ws-alt": "/tmp/stave-project/.stave/workspaces/alt",
      },
      workspaceBranchById: {
        "ws-main": "main",
        "ws-alt": "alt",
      },
      workspaceDefaultById: {
        "ws-main": true,
        "ws-alt": false,
      },
      tasks: [
        {
          id: "task-main",
          title: "Task Main",
          provider: "codex",
          updatedAt: "2026-04-07T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      messagesByTask: { "task-main": [] },
      activeTurnIdsByTask: {},
      promptDraftByTask: {},
      nativeSessionReadyByTask: {},
      providerSessionByTask: {},
      taskWorkspaceIdById: {
        "task-main": "ws-main",
        "task-alt": "ws-alt",
      },
      workspaceRuntimeCacheById: {
        "ws-alt": {
          activeTaskId: "task-alt",
          tasks: [
            {
              id: "task-alt",
              title: "Task Alt",
              provider: "codex",
              updatedAt: "2026-04-07T00:00:00.000Z",
              unread: false,
              archivedAt: null,
            },
          ],
          messagesByTask: {
            "task-alt": [
              {
                id: "task-alt-m-1",
                role: "assistant",
                model: "gpt-5.4",
                providerId: "codex",
                content: "",
                isStreaming: false,
                parts: [
                  {
                    type: "user_input",
                    toolName: "request_user_input",
                    requestId: "input-alt-1",
                    questions: [
                      {
                        id: "name",
                        header: "Name",
                        question: "What should I call the branch?",
                        options: [
                          {
                            label: "Use current",
                            description: "Keep the current branch name.",
                          },
                        ],
                      },
                    ],
                    state: "input-requested",
                  },
                ],
              },
            ],
          },
          messageCountByTask: { "task-alt": 1 },
          promptDraftByTask: {},
          workspaceInformation: {
            jiraIssues: [],
            confluencePages: [],
            figmaResources: [],
            storybookResources: [],
            linkedPullRequests: [],
            slackThreads: [],
            notes: "",
            todos: [],
            customFields: [],
          },
          editorTabs: [],
          activeEditorTabId: null,
          terminalTabs: [],
          activeTerminalTabId: null,
          activeTurnIdsByTask: {
            "task-alt": "turn-alt-1",
          },
          providerSessionByTask: {},
          nativeSessionReadyByTask: {},
        },
      },
    });

    useAppStore.getState().resolveUserInput({
      taskId: "task-alt",
      messageId: "task-alt-m-1",
      answers: { name: "feature/alt" },
    });

    await Bun.sleep(0);

    expect(inputCalls).toEqual([
      {
        turnId: "turn-alt-1",
        requestId: "input-alt-1",
        answers: { name: "feature/alt" },
        denied: undefined,
      },
    ]);
    expect(
      useAppStore.getState().workspaceRuntimeCacheById["ws-alt"]
        ?.messagesByTask["task-alt"]?.[0]?.parts[0],
    ).toMatchObject({
      type: "user_input",
      requestId: "input-alt-1",
      state: "input-responded",
    });
    expect(useAppStore.getState().messagesByTask["task-main"]).toEqual([]);
  });
});
