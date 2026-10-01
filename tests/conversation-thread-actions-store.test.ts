import { getProviderSessionCursor, setProviderSessionEntry } from "../src/lib/providers/provider-sessions";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
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
  };
}

beforeEach(() => {
  (globalThis as { window?: unknown }).window = undefined;
});

afterEach(async () => {
  const { useAppStore } = await import("../src/store/app.store");
  useAppStore.setState(useAppStore.getInitialState());
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("conversation thread store actions", () => {
  test.each(["system-default", "11111111-1111-4111-8111-111111111111"])("forks a Claude task at the selected native assistant message (%s)", async (accountProfileId) => {
    const forkCalls: unknown[] = [];
    (globalThis as { window?: unknown }).window = {
      localStorage: createMemoryStorage(),
      api: {
        provider: {
          forkClaudeSession: async (args: unknown) => {
            forkCalls.push(args);
            return {
              ok: true,
              detail: "forked",
              sessionId: "session-fork",
              lastAssistantMessageId: "assistant-fork-2",
              messageIdMap: {
                "assistant-source-1": "assistant-fork-1",
                "assistant-source-2": "assistant-fork-2",
              },
            };
          },
        },
      },
    };

    const { useAppStore } = await import("../src/store/app.store");
    useAppStore.setState({
      ...useAppStore.getInitialState(),
      settings: { ...useAppStore.getInitialState().settings, claudeAccountProfileId: "22222222-2222-4222-8222-222222222222", codexAccountProfileId: "22222222-2222-4222-8222-222222222222" },
      workspaces: [
        {
          id: "ws-1",
          name: "Workspace",
          updatedAt: "2026-07-31T00:00:00.000Z",
        },
      ],
      activeWorkspaceId: "ws-1",
      workspacePathById: { "ws-1": "/tmp/workspace" },
      activeTaskId: "task-1",
      tasks: [
        {
          id: "task-1",
          title: "Source task",
          provider: "codex",
          updatedAt: "2026-07-31T00:00:00.000Z",
          unread: false,
          archivedAt: null,
          controlMode: "interactive",
          controlOwner: "stave",
        },
      ],
      messagesByTask: {
        "task-1": [
          {
            id: "m-old",
            role: "assistant",
            model: "claude-sonnet-5",
            providerId: "claude-code",
            nativeAccountProfileId: accountProfileId,
            nativeProviderSessionId: "session-old",
            nativeProviderTurnId: "assistant-old",
            content: "Earlier session",
            parts: [{ type: "text", text: "Earlier session" }],
          },
          {
            id: "m-1",
            role: "assistant",
            model: "claude-sonnet-5",
            providerId: "claude-code",
            nativeAccountProfileId: accountProfileId,
            nativeProviderSessionId: "session-source",
            nativeProviderTurnId: "assistant-source-1",
            content: "First",
            parts: [{ type: "text", text: "First" }],
          },
          {
            id: "m-2",
            role: "assistant",
            model: "claude-sonnet-5",
            providerId: "claude-code",
            nativeAccountProfileId: accountProfileId,
            nativeProviderSessionId: "session-source",
            nativeProviderTurnId: "assistant-source-2",
            content: "Second",
            parts: [{ type: "text", text: "Second" }],
          },
          {
            id: "m-3",
            role: "assistant",
            model: "claude-sonnet-5",
            providerId: "claude-code",
            nativeAccountProfileId: accountProfileId,
            nativeProviderSessionId: "session-source",
            nativeProviderTurnId: "assistant-source-3",
            content: "Later",
            parts: [{ type: "text", text: "Later" }],
          },
        ],
      },
      messageCountByTask: { "task-1": 4 },
      providerSessionByTask: {
        "task-1": setProviderSessionEntry({ providerId: "claude-code", accountProfileId, entry: { nativeSessionId: "session-source" } }),
      },
      taskWorkspaceIdById: { "task-1": "ws-1" },
      flushActiveWorkspaceSnapshot: async () => {},
    });

    const result = await useAppStore
      .getState()
      .forkConversationFromMessage({ taskId: "task-1", messageId: "m-2" });

    expect(result.ok).toBe(true);
    expect(forkCalls).toEqual([
      {
        runtimeOptions: { claudeAccountProfileId: accountProfileId, claudeBinaryPath: undefined, codexBinaryPath: undefined },
        sessionId: "session-source",
        upToMessageId: "assistant-source-2",
        title: "Source task (fork)",
        cwd: "/tmp/workspace",
      },
    ]);
    const forkedTaskId = result.ok ? result.taskId : undefined;
    const state = useAppStore.getState();
    expect(forkedTaskId).toBeString();
    expect(state.activeTaskId).toBe(forkedTaskId);
    expect(
      state.tasks.find((task) => task.id === forkedTaskId)?.provider,
    ).toBe("claude-code");
    expect(state.messagesByTask[forkedTaskId ?? ""]).toHaveLength(3);
    expect(
      state.messagesByTask[forkedTaskId ?? ""]?.map((message) => ({
        session: message.nativeProviderSessionId,
        turn: message.nativeProviderTurnId,
      })),
    ).toEqual([
      { session: "session-old", turn: "assistant-old" },
      { session: "session-fork", turn: "assistant-fork-1" },
      { session: "session-fork", turn: "assistant-fork-2" },
    ]);
    expect(
      getProviderSessionCursor({ sessions: state.providerSessionByTask[forkedTaskId ?? ""], providerId: "claude-code", accountProfileId }),
    ).toMatchObject({
      nativeSessionId: "session-fork",
    });
  });

  test.each(["system-default", "11111111-1111-4111-8111-111111111111"])("forks only the selected Codex session and selects Codex for the new task (%s)", async (accountProfileId) => {
    const forkCalls: unknown[] = [];
    const renameCalls: unknown[] = [];
    (globalThis as { window?: unknown }).window = {
      localStorage: createMemoryStorage(),
      api: {
        provider: {
          forkCodexThread: async (args: unknown) => {
            forkCalls.push(args);
            return {
              ok: true,
              detail: "forked",
              threadId: "thread-fork",
              turnIds: ["turn-fork-1", "turn-fork-2"],
            };
          },
          renameCodexThread: async (args: unknown) => {
            renameCalls.push(args);
            return { ok: true, detail: "renamed" };
          },
        },
      },
    };

    const { useAppStore } = await import("../src/store/app.store");
    const makeMessage = (args: {
      id: string;
      sessionId: string;
      turnId: string;
    }) => ({
      id: args.id,
      role: "assistant" as const,
      model: "gpt-5.6-terra",
      providerId: "codex" as const,
      nativeAccountProfileId: accountProfileId,
            nativeProviderSessionId: args.sessionId,
      nativeProviderTurnId: args.turnId,
      content: args.id,
      parts: [{ type: "text" as const, text: args.id }],
    });
    useAppStore.setState({
      ...useAppStore.getInitialState(),
      settings: { ...useAppStore.getInitialState().settings, claudeAccountProfileId: "22222222-2222-4222-8222-222222222222", codexAccountProfileId: "22222222-2222-4222-8222-222222222222" },
      activeWorkspaceId: "ws-1",
      activeTaskId: "task-1",
      tasks: [
        {
          id: "task-1",
          title: "Mixed task",
          provider: "claude-code",
          updatedAt: "2026-07-31T00:00:00.000Z",
          unread: false,
          archivedAt: null,
          controlMode: "interactive",
          controlOwner: "stave",
        },
      ],
      messagesByTask: {
        "task-1": [
          makeMessage({
            id: "m-old",
            sessionId: "thread-old",
            turnId: "turn-old",
          }),
          makeMessage({
            id: "m-1",
            sessionId: "thread-source",
            turnId: "turn-source-1",
          }),
          makeMessage({
            id: "m-2",
            sessionId: "thread-source",
            turnId: "turn-source-2",
          }),
          makeMessage({
            id: "m-3",
            sessionId: "thread-source",
            turnId: "turn-source-3",
          }),
        ],
      },
      messageCountByTask: { "task-1": 4 },
      providerSessionByTask: {
        "task-1": setProviderSessionEntry({ providerId: "codex", accountProfileId, entry: { nativeSessionId: "thread-source" } }),
      },
      taskWorkspaceIdById: { "task-1": "ws-1" },
      flushActiveWorkspaceSnapshot: async () => {},
    });

    const result = await useAppStore
      .getState()
      .forkConversationFromMessage({ taskId: "task-1", messageId: "m-2" });

    expect(result.ok).toBe(true);
    expect(forkCalls).toEqual([
      { threadId: "thread-source", lastTurnId: "turn-source-2", runtimeOptions: { codexAccountProfileId: accountProfileId, claudeBinaryPath: undefined, codexBinaryPath: undefined } },
    ]);
    const forkedTaskId = result.ok ? result.taskId : undefined;
    const state = useAppStore.getState();
    expect(
      state.tasks.find((task) => task.id === forkedTaskId)?.provider,
    ).toBe("codex");
    expect(
      state.messagesByTask[forkedTaskId ?? ""]?.map((message) => ({
        session: message.nativeProviderSessionId,
        turn: message.nativeProviderTurnId,
      })),
    ).toEqual([
      { session: "thread-old", turn: "turn-old" },
      { session: "thread-fork", turn: "turn-fork-1" },
      { session: "thread-fork", turn: "turn-fork-2" },
    ]);
    expect(renameCalls).toEqual([
      { threadId: "thread-fork", name: "Mixed task (fork)", runtimeOptions: { codexAccountProfileId: accountProfileId, claudeBinaryPath: undefined, codexBinaryPath: undefined } },
    ]);
  });

  test.each(["system-default", "11111111-1111-4111-8111-111111111111"])("rolls Codex back and truncates the local task at the same response (%s)", async (accountProfileId) => {
    const rollbackCalls: unknown[] = [];
    const truncateCalls: unknown[] = [];
    const cleanupCalls: unknown[] = [];
    (globalThis as { window?: unknown }).window = {
      localStorage: createMemoryStorage(),
      api: {
        provider: {
          rollbackCodexThread: async (args: unknown) => {
            rollbackCalls.push(args);
            return { ok: true, detail: "rolled back" };
          },
          cleanupTask: (args: unknown) => {
            cleanupCalls.push(args);
            return { ok: true, message: "cleaned" };
          },
        },
        persistence: {
          listWorkspaces: async () => ({ ok: true, rows: [] }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          upsertWorkspace: async () => ({ ok: true }),
          truncateTaskMessagesAfter: async (args: unknown) => {
            truncateCalls.push(args);
            return { ok: true, removedCount: 1 };
          },
        },
      },
    };

    const { useAppStore } = await import("../src/store/app.store");
    const makeMessage = (id: string, turnId: string) => ({
      id,
      role: "assistant" as const,
      model: "gpt-5.6-terra",
      providerId: "codex" as const,
      nativeAccountProfileId: accountProfileId,
            nativeProviderSessionId: "thread-1",
      nativeProviderTurnId: turnId,
      content: id,
      parts: [{ type: "text" as const, text: id }],
    });
    useAppStore.setState({
      ...useAppStore.getInitialState(),
      settings: { ...useAppStore.getInitialState().settings, claudeAccountProfileId: "22222222-2222-4222-8222-222222222222", codexAccountProfileId: "22222222-2222-4222-8222-222222222222" },
      activeWorkspaceId: "ws-1",
      activeTaskId: "task-1",
      tasks: [
        {
          id: "task-1",
          title: "Codex task",
          provider: "codex",
          updatedAt: "2026-07-31T00:00:00.000Z",
          unread: false,
          archivedAt: null,
          controlMode: "interactive",
          controlOwner: "stave",
        },
      ],
      messagesByTask: {
        "task-1": [
          makeMessage("m-1", "turn-1"),
          makeMessage("m-2", "turn-2"),
          makeMessage("m-3", "turn-3"),
        ],
      },
      messageCountByTask: { "task-1": 3 },
      providerSessionByTask: {
        "task-1": setProviderSessionEntry({ sessions: { "claude-code": { nativeSessionId: "session-later" } }, providerId: "codex", accountProfileId, entry: { nativeSessionId: "thread-1" } }),
      },
      taskWorkspaceIdById: { "task-1": "ws-1" },
      flushActiveWorkspaceSnapshot: async () => {},
    });

    const result = await useAppStore
      .getState()
      .rollbackConversationToMessage({ taskId: "task-1", messageId: "m-2" });

    expect(result.ok).toBe(true);
    expect(rollbackCalls).toEqual([{ threadId: "thread-1", numTurns: 1, runtimeOptions: { codexAccountProfileId: accountProfileId, claudeBinaryPath: undefined, codexBinaryPath: undefined } }]);
    expect(truncateCalls).toEqual([
      { workspaceId: "ws-1", taskId: "task-1", messageId: "m-2" },
    ]);
    expect(cleanupCalls).toEqual([{ taskId: "task-1" }]);
    const state = useAppStore.getState();
    expect(
      state.messagesByTask["task-1"]?.map((message) => message.id),
    ).toEqual(["m-1", "m-2"]);
    expect(state.messageCountByTask["task-1"]).toBe(2);
    expect(state.providerSessionByTask["task-1"]).toEqual(setProviderSessionEntry({ providerId: "codex", accountProfileId, entry: {
        nativeSessionId: "thread-1",
        syncedThroughMessageId: "m-2",
      },
    }));
  });

  test("truncates later Claude messages when Codex is already at the selected turn", async () => {
    const truncateCalls: unknown[] = [];
    (globalThis as { window?: unknown }).window = {
      localStorage: createMemoryStorage(),
      api: {
        provider: {
          cleanupTask: async () => ({ ok: true, message: "cleaned" }),
        },
        persistence: {
          listWorkspaces: async () => ({ ok: true, rows: [] }),
          loadWorkspace: async () => ({ ok: true, snapshot: null }),
          upsertWorkspace: async () => ({ ok: true }),
          truncateTaskMessagesAfter: async (args: unknown) => {
            truncateCalls.push(args);
            return { ok: true, removedCount: 1 };
          },
        },
      },
    };

    const { useAppStore } = await import("../src/store/app.store");
    useAppStore.setState({
      ...useAppStore.getInitialState(),
      activeWorkspaceId: "ws-1",
      activeTaskId: "task-1",
      tasks: [
        {
          id: "task-1",
          title: "Mixed task",
          provider: "claude-code",
          updatedAt: "2026-07-31T00:00:00.000Z",
          unread: false,
          archivedAt: null,
          controlMode: "interactive",
          controlOwner: "stave",
        },
      ],
      messagesByTask: {
        "task-1": [
          {
            id: "codex-target",
            role: "assistant",
            model: "gpt-5.6-terra",
            providerId: "codex",
            nativeProviderSessionId: "thread-1",
            nativeProviderTurnId: "turn-1",
            content: "Codex target",
            parts: [{ type: "text", text: "Codex target" }],
          },
          {
            id: "claude-later",
            role: "assistant",
            model: "claude-sonnet-5",
            providerId: "claude-code",
            nativeProviderSessionId: "session-1",
            nativeProviderTurnId: "message-1",
            content: "Claude later",
            parts: [{ type: "text", text: "Claude later" }],
          },
        ],
      },
      messageCountByTask: { "task-1": 2 },
      providerSessionByTask: {
        "task-1": {
          codex: { nativeSessionId: "thread-1" },
          "claude-code": { nativeSessionId: "session-1" },
        },
      },
      taskWorkspaceIdById: { "task-1": "ws-1" },
      flushActiveWorkspaceSnapshot: async () => {},
    });

    const result = await useAppStore
      .getState()
      .rollbackConversationToMessage({
        taskId: "task-1",
        messageId: "codex-target",
      });

    expect(result.ok).toBe(true);
    expect(truncateCalls).toEqual([
      {
        workspaceId: "ws-1",
        taskId: "task-1",
        messageId: "codex-target",
      },
    ]);
    expect(useAppStore.getState().messagesByTask["task-1"]).toHaveLength(1);
    expect(useAppStore.getState().tasks[0]?.provider).toBe("codex");
    expect(useAppStore.getState().providerSessionByTask["task-1"]).toEqual({
      codex: {
        nativeSessionId: "thread-1",
        syncedThroughMessageId: "codex-target",
      },
    });
  });

  test("syncs manual task rename to both linked native providers", async () => {
    const claudeCalls: unknown[] = [];
    const codexCalls: unknown[] = [];
    (globalThis as { window?: unknown }).window = {
      localStorage: createMemoryStorage(),
      api: {
        provider: {
          renameClaudeSession: async (args: unknown) => {
            claudeCalls.push(args);
            return { ok: true, detail: "renamed" };
          },
          renameCodexThread: async (args: unknown) => {
            codexCalls.push(args);
            return { ok: true, detail: "renamed" };
          },
        },
      },
    };

    const { useAppStore } = await import("../src/store/app.store");
    useAppStore.setState({
      ...useAppStore.getInitialState(),
      activeWorkspaceId: "ws-1",
      workspacePathById: { "ws-1": "/tmp/workspace" },
      tasks: [
        {
          id: "task-1",
          title: "Before",
          provider: "codex",
          updatedAt: "2026-07-31T00:00:00.000Z",
          unread: false,
          archivedAt: null,
          controlMode: "interactive",
          controlOwner: "stave",
        },
      ],
      providerSessionByTask: {
        "task-1": {
          codex: { nativeSessionId: "thread-1" },
          "claude-code": { nativeSessionId: "session-1" },
        },
      },
      taskWorkspaceIdById: { "task-1": "ws-1" },
    });

    useAppStore.getState().renameTask({ taskId: "task-1", title: "After" });
    await Bun.sleep(0);

    expect(useAppStore.getState().tasks[0]?.title).toBe("After");
    expect(claudeCalls).toEqual([
      {
        runtimeOptions: { claudeAccountProfileId: "system-default", codexAccountProfileId: "system-default", claudeBinaryPath: undefined, codexBinaryPath: undefined },
        sessionId: "session-1",
        title: "After",
        cwd: "/tmp/workspace",
      },
    ]);
    expect(codexCalls).toEqual([
      {
        runtimeOptions: { claudeAccountProfileId: "system-default", codexAccountProfileId: "system-default", claudeBinaryPath: undefined, codexBinaryPath: undefined },
        threadId: "thread-1",
        name: "After",
      },
    ]);
  });
});
