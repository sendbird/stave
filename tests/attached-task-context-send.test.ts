import { afterEach, expect, test } from "bun:test";
import { createTaskContextAttachment } from "../src/lib/task-context/attached-task-context";

const originalWindow = globalThis.window;

afterEach(() => {
  (globalThis as { window: unknown }).window = originalWindow;
});

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    clear: () => values.clear(),
  };
}

test.each([false, true])("a task attached from another workspace reaches the provider as retrieved context (streaming: %s)", async (streaming) => {
  const requests: unknown[] = [];
  const pageRequests: Array<{ workspaceId: string; taskId: string }> = [];
  (globalThis as { window: unknown }).window = {
    localStorage: createMemoryStorage(),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    api: {
      provider: {
        startPushTurn: async (args: unknown) => {
          requests.push(args);
          return { ok: true, streamId: "stream-1", turnId: "turn-1" };
        },
        subscribeStreamEvents: () => () => undefined,
        abortTurn: async () => ({ ok: true, message: "aborted" }),
        cleanupTask: async () => ({ ok: true }),
      },
      persistence: {
        // The page reader takes the persistence path only when the bridge is complete.
        listWorkspaces: async () => [],
        loadWorkspace: async () => null,
        upsertWorkspace: async () => ({ ok: true }),
        loadTaskMessages: async (args: { workspaceId: string; taskId: string }) => {
          pageRequests.push({ workspaceId: args.workspaceId, taskId: args.taskId });
          return {
            ok: true,
            page: {
              messages: [
                { id: "u1", role: "user", model: "", providerId: "codex", content: "Find the cause", parts: [] },
                {
                  id: "a1",
                  role: "assistant",
                  model: "gpt-5.5",
                  providerId: "codex",
                  content: "The cache key ignores the locale.",
                  parts: [{ type: "text", text: "The cache key ignores the locale." }],
                },
              ],
              totalCount: 2,
              limit: 40,
              offset: 0,
              hasMoreOlder: false,
            },
          };
        },
      },
      fs: {
        readFile: async () => ({ ok: false, content: "", revision: "", stderr: "not found" }),
      },
    },
  } as unknown;

  const { useAppStore } = await import("../src/store/app.store");
  const { createWorkspaceSessionStateFromAppState } = await import("../src/store/workspace-runtime-state");
  useAppStore.setState({
    ...useAppStore.getInitialState(),
    hasHydratedWorkspaces: true,
    workspaces: [{ id: "ws-main", name: "Main", updatedAt: "2026-04-09T00:00:00.000Z" }],
    activeWorkspaceId: "ws-main",
    activeTaskId: "task-main",
    repositoryPath: "/tmp/stave-project",
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
    promptDraftByTask: {
      "task-main": {
        text: "Fix it using that finding",
        attachedFilePaths: [],
        attachments: [
          createTaskContextAttachment({
            taskId: "task-research",
            workspaceId: "ws-other",
            title: "Research the cache bug",
          }),
        ],
      },
    },
  } as never);
  useAppStore.setState({ workspaceRuntimeCacheById: streaming ? {
    "ws-other": { ...createWorkspaceSessionStateFromAppState(useAppStore.getState()), messagesByTask: {
      "task-research": [{ id: "streaming-reply", role: "assistant", model: "gpt-5.5", providerId: "codex",
        content: "The cache key ignores the locale.", isStreaming: true, parts: [] }],
    } },
  } : {} });

  const result = await useAppStore.getState().sendUserMessage({
    taskId: "task-main",
    content: "Fix it using that finding",
    turnOrigin: "conversation",
  });

  expect(result.status).toBe("started");
  expect(pageRequests).toEqual(streaming ? [] : [{ workspaceId: "ws-other", taskId: "task-research" }]);
  const request = JSON.stringify(requests[0]);
  expect(request).toContain("stave:attached-task-context");
  expect(request).toContain("The cache key ignores the locale.");
  expect(request.includes("Partial reply: still streaming; this is not a final answer.")).toBe(streaming);
  const sentUserMessage = useAppStore.getState().messagesByTask["task-main"]?.find((m) => m.role === "user");
  expect(sentUserMessage?.displayParts).toContainEqual({
    type: "task_context",
    taskId: "task-research",
    workspaceId: "ws-other",
    title: "Research the cache bug",
    scope: "latest-reply",
  });
});
