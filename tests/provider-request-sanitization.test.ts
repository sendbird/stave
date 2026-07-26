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

  test("reattaches task-scoped Crane context after managed takeover", async () => {
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
              streamId: "stream-crane-follow-up",
              turnId: "turn-crane-follow-up",
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
      workspaces: [{
        id: "ws-main",
        name: "Main",
        updatedAt: "2026-07-26T00:00:00.000Z",
      }],
      activeWorkspaceId: "ws-main",
      projectPath: "/tmp/stave-project",
      workspacePathById: { "ws-main": "/tmp/stave-project" },
      workspaceBranchById: { "ws-main": "main" },
      workspaceDefaultById: { "ws-main": true },
      tasks: [{
        id: "task-crane",
        title: "Crane ATL-1",
        provider: "codex",
        updatedAt: "2026-07-26T00:00:00.000Z",
        unread: false,
        archivedAt: null,
        controlMode: "interactive",
        controlOwner: "stave",
        sourceContexts: [{
          type: "retrieved_context",
          sourceId: "crane:ATL-1",
          title: "Crane ATL-1",
          content: "Untrusted issue material.",
        }],
      }],
      activeTaskId: "task-crane",
      draftProvider: "codex",
      messagesByTask: {
        "task-crane": [{
          id: "task-crane-m-1",
          role: "assistant",
          model: "gpt-5.6",
          providerId: "codex",
          content: "Initial managed run ended.",
          parts: [{ type: "text", text: "Initial managed run ended." }],
        }],
      },
      activeTurnIdsByTask: {},
      nativeSessionReadyByTask: {},
      providerSessionByTask: {},
    });

    await useAppStore.getState().sendUserMessage({
      taskId: "task-crane",
      content: "Continue after takeover.",
    });
    await Bun.sleep(0);

    const contextParts = startedConversation?.contextParts as Array<{
      type?: string;
      sourceId?: string;
      content?: string;
    }> | undefined;
    expect(contextParts).toContainEqual({
      type: "retrieved_context",
      sourceId: "crane:ATL-1",
      title: "Crane ATL-1",
      content: "Untrusted issue material.",
    });
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

  test("includes pasted image attachments with prompt text in provider requests", async () => {
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
              streamId: "stream-pasted-image",
              turnId: "turn-pasted-image",
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
      promptDraftByTask: {
        "task-1": {
          text: "Describe this image.",
          attachedFilePaths: [],
          attachments: [
            {
              kind: "image",
              id: "pasted-image-1",
              dataUrl: "data:image/jpeg;base64,abc123",
              label: "Pasted screenshot",
              mimeType: "image/jpeg",
            },
          ],
        },
      },
    });

    await useAppStore.getState().sendUserMessage({
      taskId: "task-1",
      content: "Describe this image.",
    });

    await Bun.sleep(0);

    const contextParts = startedConversation?.contextParts as Array<Record<string, unknown>> | undefined;
    expect(contextParts).toContainEqual({
      type: "image_context",
      dataUrl: "data:image/jpeg;base64,abc123",
      label: "Pasted screenshot",
      mimeType: "image/jpeg",
    });

    const userMessage = useAppStore.getState().messagesByTask["task-1"]?.[0];
    expect(userMessage?.parts).toContainEqual({
      type: "image_context",
      dataUrl: "data:image/jpeg;base64,abc123",
      label: "Pasted screenshot",
      mimeType: "image/jpeg",
    });
    expect(userMessage?.parts).toContainEqual({
      type: "text",
      text: "Describe this image.",
    });
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

  test("keeps resume history until the runtime confirms the native session", () => {
    const request = {
      providerId: "claude-code" as const,
      prompt: "Continue.",
      taskId: "task-1",
      workspaceId: "ws-main",
      cwd: "/tmp/stave-project",
      conversation: {
        target: { providerId: "claude-code" as const, model: "claude" },
        mode: "chat" as const,
        history: Array.from({ length: 5 }, (_, index) => ({
          role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
          content: `history-${index}`,
          parts: [],
        })),
        input: {
          role: "user" as const,
          providerId: "user" as const,
          model: "user",
          content: "continue",
          parts: [{ type: "text" as const, text: "continue" }],
        },
        contextParts: [],
        resume: {
          nativeSessionId: "session-abc",
          syncedThroughMessageId: "history-4",
        },
      },
    };

    const bounded = compactProviderTurnRequestForTransport({
      method: "provider.start-push-turn",
      request,
    });
    expect(bounded.conversation?.history).toHaveLength(5);
    expect(bounded.conversation?.resume?.nativeSessionId).toBe("session-abc");
    expect(
      bounded.conversation?.resume?.syncedThroughMessageId,
    ).toBe("history-4");
    expect(bounded.conversation?.input.content).toBe("continue");
    expect(StreamTurnArgsSchema.safeParse(bounded).success).toBe(true);
  });

  test("preserves image payloads while compacting lower-priority context", () => {
    const imageDataUrl = `data:image/png;base64,${"a".repeat(32_000)}`;
    const request = {
      providerId: "codex" as const,
      prompt: "What is in this image?",
      taskId: "task-1",
      workspaceId: "ws-main",
      cwd: "/tmp/stave-project",
      conversation: {
        target: { providerId: "codex" as const, model: "gpt-5.4" },
        mode: "chat" as const,
        history: Array.from({ length: 12 }, (_, index) => ({
          role: index % 2 === 0 ? "user" as const : "assistant" as const,
          content: `history-${index} ${"h".repeat(18_000)}`,
          parts: [],
        })),
        input: {
          role: "user" as const,
          providerId: "user" as const,
          model: "user",
          content: "What is in this image?",
          parts: [{ type: "text" as const, text: "What is in this image?" }],
        },
        contextParts: [
          {
            type: "retrieved_context" as const,
            sourceId: "stave:repo-map",
            title: "Codebase Map",
            content: "r".repeat(280_000),
          },
          {
            type: "image_context" as const,
            dataUrl: imageDataUrl,
            label: "image.png",
            mimeType: "image/png",
          },
          {
            type: "file_context" as const,
            filePath: "src/huge.ts",
            language: "ts",
            instruction: "Inspect this file after the image.",
            content: "f".repeat(240_000),
          },
        ],
      },
    };

    const bounded = compactProviderTurnRequestForTransport({
      method: "provider.start-push-turn",
      request,
      maxBytes: 160 * 1024,
    });

    expect(bounded.conversation?.contextParts).toContainEqual({
      type: "image_context",
      dataUrl: imageDataUrl,
      label: "image.png",
      mimeType: "image/png",
    });
  });

  test("drops image context instead of sending empty image payload metadata", () => {
    const request = {
      providerId: "codex" as const,
      prompt: "What is in this image?",
      taskId: "task-1",
      workspaceId: "ws-main",
      cwd: "/tmp/stave-project",
      conversation: {
        target: { providerId: "codex" as const, model: "gpt-5.4" },
        mode: "chat" as const,
        history: [],
        input: {
          role: "user" as const,
          providerId: "user" as const,
          model: "user",
          content: "What is in this image?",
          parts: [{ type: "text" as const, text: "What is in this image?" }],
        },
        contextParts: [
          {
            type: "image_context" as const,
            dataUrl: `data:image/png;base64,${"a".repeat(220_000)}`,
            label: "image.png",
            mimeType: "image/png",
          },
        ],
      },
    };

    const bounded = compactProviderTurnRequestForTransport({
      method: "provider.start-push-turn",
      request,
      maxBytes: 48 * 1024,
    });

    expect(
      bounded.conversation?.contextParts.some(
        (part) => part.type === "image_context" && part.dataUrl === "",
      ),
    ).toBe(false);
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
