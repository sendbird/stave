import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { MAX_FILE_CONTEXT_CONTENT_CHARS } from "@/lib/file-context-sanitization";
import { createBridgeProviderSource } from "@/lib/providers/bridge.source";
import {
  HOST_SERVICE_PROVIDER_REQUEST_SOFT_MAX_BYTES,
  compactProviderTurnRequestForTransport,
} from "@/lib/providers/transport-bounds";
import { StreamTurnArgsSchema } from "../electron/main/ipc/schemas";

const originalWindow = (globalThis as { window?: unknown }).window;

beforeEach(() => {
  (globalThis as { window?: unknown }).window = undefined;
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("provider request sanitization", () => {
  test("sanitizes oversized file_context payloads before starting a turn", async () => {
    let startedConversation: Record<string, unknown> | undefined;

    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
      },
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      api: {
        provider: {
          startPushTurn: async (args: Record<string, unknown>) => {
            startedConversation = args.conversation as Record<string, unknown> | undefined;
            return {
              ok: true,
              streamId: "stream-oversized",
              turnId: "turn-oversized",
            };
          },
          subscribeStreamEvents: () => () => {},
          abortTurn: async () => ({ ok: true, message: "aborted" }),
          cleanupTask: async () => ({ ok: true, message: "cleaned" }),
        },
      },
    };

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();

    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [{ id: "ws-main", name: "Main", updatedAt: "2026-03-15T00:00:00.000Z" }],
      activeWorkspaceId: "ws-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: { "ws-main": "/tmp/stave-project" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
      tasks: [
        {
          id: "task-1",
          title: "Task 1",
          provider: "codex",
          updatedAt: "2026-03-15T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      activeTaskId: "task-1",
      draftProvider: "codex",
      messagesByTask: {
        "task-1": [],
      },
      activeTurnIdsByTask: {},
      nativeSessionReadyByTask: {},
      providerSessionByTask: {},
    });

    const oversizedImagePayload = `data:image/svg+xml;base64,${"z".repeat(MAX_FILE_CONTEXT_CONTENT_CHARS + 64)}`;
    useAppStore.getState().sendUserMessage({
      taskId: "task-1",
      content: "Please inspect this image.",
      fileContexts: [{
        filePath: "public/unnamed88.svg",
        content: oversizedImagePayload,
        language: "svg",
      }],
    });

    await Bun.sleep(0);

    const conversationContextParts = startedConversation?.contextParts as Array<Record<string, unknown>> | undefined;
    expect(conversationContextParts?.[0]?.type).toBe("file_context");
    expect(conversationContextParts?.[0]?.content).toBeString();
    expect(String(conversationContextParts?.[0]?.content)).toContain("image payload omitted");
    expect(String(conversationContextParts?.[0]?.content)).not.toContain("data:image/svg+xml;base64");
    expect(String(conversationContextParts?.[0]?.content).length).toBeLessThanOrEqual(MAX_FILE_CONTEXT_CONTENT_CHARS);

    const storedMessagePart = useAppStore.getState().messagesByTask["task-1"]?.[0]?.parts[0];
    expect(storedMessagePart?.type).toBe("file_context");
    if (storedMessagePart?.type !== "file_context") {
      throw new Error("expected stored file_context part");
    }
    expect(storedMessagePart.content).toContain("image payload omitted");
    expect(storedMessagePart.content).not.toContain("data:image/svg+xml;base64");
    expect(storedMessagePart.content.length).toBeLessThanOrEqual(MAX_FILE_CONTEXT_CONTENT_CHARS);
  });

  test("sanitizes oversized historical tool outputs before starting a follow-up turn", async () => {
    let startedConversation: Record<string, unknown> | undefined;

    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
      },
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      api: {
        provider: {
          startPushTurn: async (args: Record<string, unknown>) => {
            startedConversation = args.conversation as Record<string, unknown> | undefined;
            return {
              ok: true,
              streamId: "stream-history",
              turnId: "turn-history",
            };
          },
          subscribeStreamEvents: () => () => {},
          abortTurn: async () => ({ ok: true, message: "aborted" }),
          cleanupTask: async () => ({ ok: true, message: "cleaned" }),
        },
      },
    };

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();
    const oversizedToolOutput = "o".repeat(MAX_FILE_CONTEXT_CONTENT_CHARS + 256);

    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [{ id: "ws-main", name: "Main", updatedAt: "2026-03-15T00:00:00.000Z" }],
      activeWorkspaceId: "ws-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: { "ws-main": "/tmp/stave-project" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
      tasks: [
        {
          id: "task-1",
          title: "Task 1",
          provider: "codex",
          updatedAt: "2026-03-15T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      activeTaskId: "task-1",
      draftProvider: "codex",
      messagesByTask: {
        "task-1": [
          {
            id: "task-1-m-1",
            role: "assistant",
            model: "gpt-5.4",
            providerId: "codex",
            content: "",
            parts: [{
              type: "tool_use",
              toolUseId: "tool-1",
              toolName: "bash",
              input: "cat huge.log",
              output: oversizedToolOutput,
              state: "output-available",
            }],
          },
        ],
      },
      activeTurnIdsByTask: {},
      nativeSessionReadyByTask: {},
      providerSessionByTask: {},
    });

    useAppStore.getState().sendUserMessage({
      taskId: "task-1",
      content: "Please continue.",
    });

    await Bun.sleep(0);

    const history = startedConversation?.history as Array<Record<string, unknown>> | undefined;
    const historyParts = history?.[0]?.parts as Array<Record<string, unknown>> | undefined;
    expect(historyParts?.[0]?.type).toBe("tool_use");
    expect(String(historyParts?.[0]?.output)).toContain("tool output truncated");
    expect(String(historyParts?.[0]?.output).length).toBeLessThanOrEqual(MAX_FILE_CONTEXT_CONTENT_CHARS);
  });

  test("does not start a follow-up turn while an approval remains pending", async () => {
    let startTurnCallCount = 0;

    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
      },
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      api: {
        provider: {
          startPushTurn: async () => {
            startTurnCallCount += 1;
            return {
              ok: true,
              streamId: "stream-pending-approval",
              turnId: "turn-pending-approval",
            };
          },
          subscribeStreamEvents: () => () => {},
          abortTurn: async () => ({ ok: true, message: "aborted" }),
          cleanupTask: async () => ({ ok: true, message: "cleaned" }),
        },
      },
    };

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();

    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [{ id: "ws-main", name: "Main", updatedAt: "2026-03-15T00:00:00.000Z" }],
      activeWorkspaceId: "ws-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: { "ws-main": "/tmp/stave-project" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
      tasks: [
        {
          id: "task-1",
          title: "Task 1",
          provider: "codex",
          updatedAt: "2026-03-15T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      activeTaskId: "task-1",
      draftProvider: "codex",
      messagesByTask: {
        "task-1": [
          {
            id: "task-1-m-1",
            role: "assistant",
            model: "gpt-5.4",
            providerId: "codex",
            content: "",
            isStreaming: false,
            parts: [{
              type: "approval",
              toolName: "bash",
              requestId: "approval-1",
              description: "Run npm test",
              state: "approval-requested",
            }],
          },
        ],
      },
      activeTurnIdsByTask: {},
      nativeSessionReadyByTask: {},
      providerSessionByTask: {},
    });

    useAppStore.getState().sendUserMessage({
      taskId: "task-1",
      content: "Please continue anyway.",
    });

    await Bun.sleep(0);

    expect(startTurnCallCount).toBe(0);
    expect(useAppStore.getState().messagesByTask["task-1"]).toHaveLength(1);
    expect(useAppStore.getState().activeTurnIdsByTask["task-1"]).toBeUndefined();
  });

  test("strips renderer-only tool metadata from historical tool parts before follow-up turns", async () => {
    let startedConversation: Record<string, unknown> | undefined;

    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
      },
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      api: {
        provider: {
          startPushTurn: async (args: Record<string, unknown>) => {
            startedConversation = args.conversation as Record<string, unknown> | undefined;
            return {
              ok: true,
              streamId: "stream-tool-metadata",
              turnId: "turn-tool-metadata",
            };
          },
          subscribeStreamEvents: () => () => {},
          abortTurn: async () => ({ ok: true, message: "aborted" }),
          cleanupTask: async () => ({ ok: true, message: "cleaned" }),
        },
      },
    };

    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();

    useAppStore.setState({
      ...initialState,
      hasHydratedWorkspaces: true,
      workspaces: [{ id: "ws-main", name: "Main", updatedAt: "2026-03-15T00:00:00.000Z" }],
      activeWorkspaceId: "ws-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: { "ws-main": "/tmp/stave-project" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
      tasks: [
        {
          id: "task-1",
          title: "Task 1",
          provider: "codex",
          updatedAt: "2026-03-15T00:00:00.000Z",
          unread: false,
          archivedAt: null,
        },
      ],
      activeTaskId: "task-1",
      draftProvider: "codex",
      messagesByTask: {
        "task-1": [
          {
            id: "task-1-m-1",
            role: "assistant",
            model: "gpt-5.4",
            providerId: "codex",
            content: "",
            parts: [{
              type: "tool_use",
              toolUseId: "tool-agent-1",
              toolName: "agent",
              input: "{\"task\":\"inspect\"}",
              output: "done",
              state: "output-available",
              elapsedSeconds: 19,
              progressMessages: ["Reading files", "Checking IPC contract"],
            }],
          },
        ],
      },
      activeTurnIdsByTask: {},
      nativeSessionReadyByTask: {},
      providerSessionByTask: {},
    });

    useAppStore.getState().sendUserMessage({
      taskId: "task-1",
      content: "Continue.",
    });

    await Bun.sleep(0);

    const history = startedConversation?.history as Array<Record<string, unknown>> | undefined;
    const historyPart = history?.[0]?.parts as Array<Record<string, unknown>> | undefined;

    expect(historyPart?.[0]).toEqual({
      type: "tool_use",
      toolUseId: "tool-agent-1",
      toolName: "agent",
      input: "{\"task\":\"inspect\"}",
      output: "done",
      state: "output-available",
    });

    const parsed = StreamTurnArgsSchema.safeParse({
      providerId: "codex",
      prompt: "Continue.",
      conversation: startedConversation,
      taskId: "task-1",
      workspaceId: "ws-main",
    });

    expect(parsed.success).toBe(true);
  });

  test("compacts oversized provider turn requests below the host-service stdin budget", () => {
    const request = {
      providerId: "codex",
      prompt: "Continue.",
      taskId: "task-1",
      workspaceId: "ws-main",
      cwd: "/tmp/stave-project",
      conversation: {
        target: { providerId: "codex" as const, model: "gpt-5.4" },
        mode: "chat" as const,
        history: Array.from({ length: 80 }, (_, index) => ({
          role: index % 2 === 0 ? "user" as const : "assistant" as const,
          content: `history-${index} ${"h".repeat(24_000)}`,
          parts: [],
        })),
        input: {
          role: "user" as const,
          providerId: "user" as const,
          model: "user",
          content: "continue",
          parts: [{ type: "text" as const, text: "continue" }],
        },
        contextParts: [
          {
            type: "retrieved_context" as const,
            sourceId: "stave:repo-map",
            title: "Codebase Map",
            content: "r".repeat(600_000),
          },
          {
            type: "file_context" as const,
            filePath: "src/huge.ts",
            language: "ts",
            instruction: "Inspect this file",
            content: "f".repeat(400_000),
          },
        ],
      },
    };

    const bounded = compactProviderTurnRequestForTransport({
      method: "provider.start-push-turn",
      request,
    });

    const serializedBytes = new TextEncoder().encode(JSON.stringify({
      type: "request",
      id: 1,
      method: "provider.start-push-turn",
      params: bounded,
    })).length + 1;

    expect(serializedBytes).toBeLessThanOrEqual(
      HOST_SERVICE_PROVIDER_REQUEST_SOFT_MAX_BYTES,
    );
    expect(bounded.conversation?.history.length).toBeLessThan(request.conversation.history.length);
    expect(
      JSON.stringify(bounded.conversation?.contextParts ?? []),
    ).not.toContain("r".repeat(100_000));
  });

  test("keeps current task awareness and file context before lower-priority context", () => {
    const request = {
      providerId: "codex" as const,
      prompt: "Continue with the current task and referenced reply.",
      taskId: "task-1",
      workspaceId: "ws-main",
      cwd: "/tmp/stave-project",
      conversation: {
        target: { providerId: "codex" as const, model: "gpt-5.4" },
        mode: "chat" as const,
        history: Array.from({ length: 32 }, (_, index) => ({
          role: index % 2 === 0 ? "user" as const : "assistant" as const,
          content: `history-${index} ${"h".repeat(10_000)}`,
          parts: [],
        })),
        input: {
          role: "user" as const,
          providerId: "user" as const,
          model: "user",
          content: "continue",
          parts: [{ type: "text" as const, text: "continue" }],
        },
        contextParts: [
          {
            type: "retrieved_context" as const,
            sourceId: "stave:current-task-awareness",
            title: "Current Task Context",
            content: "c".repeat(120_000),
          },
          {
            type: "retrieved_context" as const,
            sourceId: "stave:referenced-task-replies",
            title: "Referenced Replies",
            content: "x".repeat(100_000),
          },
          {
            type: "retrieved_context" as const,
            sourceId: "stave:repo-map",
            title: "Codebase Map",
            content: "r".repeat(220_000),
          },
          {
            type: "file_context" as const,
            filePath: "src/current-task.ts",
            language: "ts",
            instruction: "Prefer this file if you need concrete implementation details.",
            content: "f".repeat(180_000),
          },
        ],
      },
    };

    const bounded = compactProviderTurnRequestForTransport({
      method: "provider.start-push-turn",
      request,
      maxBytes: 52 * 1024,
    });

    const sourceIds = (bounded.conversation?.contextParts ?? [])
      .filter((part) => part.type === "retrieved_context")
      .map((part) => part.sourceId);

    expect(sourceIds).toContain("stave:current-task-awareness");
    expect(sourceIds).not.toContain("stave:repo-map");
    expect(
      bounded.conversation?.contextParts.some((part) => part.type === "file_context"),
    ).toBe(true);
  });

  test("bridge retries with a stricter compacted request after protocol overflow", async () => {
    const calls: Array<Record<string, unknown>> = [];

    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
      },
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      api: {
        provider: {
          streamTurn: async (args: Record<string, unknown>) => {
            calls.push(args);
            if (calls.length === 1) {
              throw new Error("[host-service] provider.stream-turn request exceeded protocol message limit (1048577 bytes > 1048576)");
            }
            return [
              { type: "text", text: "retried" },
              { type: "done" },
            ];
          },
        },
      },
    };

    const source = createBridgeProviderSource<{
      type: string;
      text?: string;
    }>({ providerId: "codex" });

    const events: Array<{ type: string; text?: string }> = [];
    for await (const event of source.streamTurn({
      prompt: "Continue.",
      taskId: "task-1",
      workspaceId: "ws-main",
      cwd: "/tmp/stave-project",
      runtimeOptions: { chatStreamingEnabled: false },
      conversation: {
        target: { providerId: "codex", model: "gpt-5.4" },
        mode: "chat",
        history: Array.from({ length: 72 }, (_, index) => ({
          role: index % 2 === 0 ? "user" as const : "assistant" as const,
          content: `history-${index} ${"h".repeat(18_000)}`,
          parts: [],
        })),
        input: {
          role: "user",
          providerId: "user",
          model: "user",
          content: "continue",
          parts: [{ type: "text", text: "continue" }],
        },
        contextParts: [
          {
            type: "retrieved_context",
            sourceId: "stave:repo-map",
            title: "Codebase Map",
            content: "r".repeat(320_000),
          },
          ...Array.from({ length: 6 }, (_, index) => ({
            type: "file_context" as const,
            filePath: `src/huge-${index}.ts`,
            language: "ts",
            instruction: "Inspect this file",
            content: "f".repeat(260_000),
          })),
        ],
      },
    })) {
      events.push(event);
    }

    expect(calls).toHaveLength(2);
    expect(JSON.stringify(calls[1]).length).toBeLessThan(JSON.stringify(calls[0]).length);
    expect(events).toEqual([
      { type: "text", text: "retried" },
      { type: "done" },
    ]);
  });
});
