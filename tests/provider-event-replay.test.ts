import { describe, expect, test } from "bun:test";
import {
  appendProviderEventToAssistant,
  replayProviderEventsToTaskState,
} from "@/lib/session/provider-event-replay";
import {
  PROVIDER_MAX_TOKENS_TRUNCATION_NOTICE,
  PROVIDER_OUTPUT_OVERFLOW_TRUNCATION_NOTICE,
} from "@/lib/truncation-visibility";
import { NormalizedProviderEventSchema } from "@/lib/providers/schemas";
import { ChatMessageSchema } from "@/lib/task-context/schemas";
import type { ChatMessage, TextPart } from "@/types/chat";

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "task-1-m-1",
    role: "assistant",
    model: "gpt-5.4",
    providerId: "codex",
    content: "",
    isStreaming: true,
    parts: [],
    ...overrides,
  };
}

describe("appendProviderEventToAssistant", () => {
  test("persists auto-routing rationale without letting a later adapter resolution replace it", () => {
    const explicit = appendProviderEventToAssistant({
      message: createMessage(),
      event: {
        type: "model_resolved",
        resolvedProviderId: "codex",
        resolvedModel: "gpt-5.6",
      },
    });
    expect(explicit.modelResolution).toBeUndefined();

    const routedEvent = NormalizedProviderEventSchema.parse({
      type: "model_resolved",
      resolvedProviderId: "codex",
      resolvedModel: "gpt-5.6",
      modelResolution: {
        selectedProviderId: "codex",
        selectedModel: "gpt-5.6",
        source: "classifier",
        rationale: "The request needs a deeper implementation pass.",
        confidence: 0.91,
        taskType: "implementation",
      },
    });
    const routed = appendProviderEventToAssistant({
      message: createMessage(),
      event: routedEvent,
    });
    const restored = ChatMessageSchema.parse(
      JSON.parse(JSON.stringify(routed)),
    );
    const adapterResolved = appendProviderEventToAssistant({
      message: restored,
      event: {
        type: "model_resolved",
        resolvedProviderId: "cursor",
        resolvedModel: "runtime-default",
      },
    });

    expect(adapterResolved.providerId).toBe("cursor");
    expect(adapterResolved.model).toBe("runtime-default");
    expect(adapterResolved.modelResolution).toEqual({
      selectedProviderId: "codex",
      selectedModel: "gpt-5.6",
      source: "classifier",
      rationale: "The request needs a deeper implementation pass.",
      confidence: 0.91,
      taskType: "implementation",
    });
  });

  test("does not classify a recovered capacity warning as terminal failure", () => {
    const warning = appendProviderEventToAssistant({
      message: createMessage(),
      event: {
        type: "error",
        message: "Selected model is at capacity.",
        recoverable: true,
      },
    });
    const completed = appendProviderEventToAssistant({
      message: warning,
      event: { type: "done", stop_reason: "end_turn" },
    });

    expect(completed.terminalStopReason).toBe("end_turn");
  });

  test("clears a stale stop reason when a persisted row resumes streaming", () => {
    const replayed = replayProviderEventsToTaskState({
      taskId: "task-1",
      messages: [
        createMessage({
          terminalStopReason: "failed",
          turnId: "turn-1",
          isStreaming: false,
        }),
      ],
      provider: "codex",
      model: "gpt-5.6",
      turnId: "turn-1",
      events: [{ type: "text", text: "Recovered." }],
    });

    expect(replayed.messages.at(-1)?.terminalStopReason).toBeUndefined();
  });

  test("keeps one transcript row when a retrying error becomes terminal", () => {
    const recovering = appendProviderEventToAssistant({
      message: createMessage(),
      event: {
        type: "error",
        message: "Selected model is at capacity.",
        recoverable: true,
      },
    });
    const failed = appendProviderEventToAssistant({
      message: recovering,
      event: {
        type: "error",
        message: "Selected model is at capacity.",
        recoverable: false,
      },
    });

    expect(failed.parts).toEqual([
      {
        type: "system_event",
        content: "[error] Selected model is at capacity.",
      },
    ]);
  });

  test("persists ACP context usage independently from turn tokens", () => {
    const message = appendProviderEventToAssistant({
      message: createMessage(),
      event: {
        type: "context_usage",
        usedTokens: 144,
        sizeTokens: 1024,
        costAmount: 0.002,
        costCurrency: "USD",
      },
    });

    expect(message.usage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      contextUsedTokens: 144,
      contextWindowTokens: 1024,
      contextCostAmount: 0.002,
      contextCostCurrency: "USD",
    });
  });

  test("persists and incrementally enriches delegated cache usage", () => {
    let message = appendProviderEventToAssistant({
      message: createMessage(),
      event: {
        type: "delegated_usage",
        executionId: "advisor-1",
        role: "advisor",
        providerId: "claude-code",
        model: "claude-fable-5-1",
        sessionReused: true,
      },
    });

    message = appendProviderEventToAssistant({
      message,
      event: {
        type: "delegated_usage",
        executionId: "advisor-1",
        role: "advisor",
        providerId: "claude-code",
        model: "claude-fable-5-1",
        inputTokens: 80,
        outputTokens: 12,
        cacheReadTokens: 64,
        cacheCreationTokens: 8,
      },
    });

    expect(message.delegatedUsage).toEqual([
      {
        executionId: "advisor-1",
        role: "advisor",
        providerId: "claude-code",
        model: "claude-fable-5-1",
        inputTokens: 80,
        outputTokens: 12,
        cacheReadTokens: 64,
        cacheCreationTokens: 8,
        sessionReused: true,
      },
    ]);
    expect(message.parts).toEqual([]);
  });

  test("stores native provider turn metadata on the assistant message", () => {
    const message = appendProviderEventToAssistant({
      message: createMessage(),
      event: {
        type: "provider_turn",
        providerId: "codex",
        nativeSessionId: "thread-1",
        nativeTurnId: "turn-1",
      },
    });

    expect(message).toMatchObject({
      nativeProviderSessionId: "thread-1",
      nativeProviderTurnId: "turn-1",
    });
    expect(message.parts).toEqual([]);
  });

  test("deduplicates code_diff parts for the same file path", () => {
    let message = createMessage();

    // First diff for file1
    message = appendProviderEventToAssistant({
      message,
      event: {
        type: "diff",
        filePath: "src/a.ts",
        oldContent: "old-a",
        newContent: "new-a-v1",
        status: "accepted",
      },
    });
    // Diff for file2
    message = appendProviderEventToAssistant({
      message,
      event: {
        type: "diff",
        filePath: "src/b.ts",
        oldContent: "old-b",
        newContent: "new-b",
        status: "accepted",
      },
    });
    // Second diff for file1 (same file modified again)
    message = appendProviderEventToAssistant({
      message,
      event: {
        type: "diff",
        filePath: "src/a.ts",
        oldContent: "old-a",
        newContent: "new-a-v2",
        status: "accepted",
      },
    });

    // Should have exactly 2 code_diff parts (one per unique file), not 3
    const diffParts = message.parts.filter((p) => p.type === "code_diff");
    expect(diffParts).toHaveLength(2);
    expect(diffParts[0]).toMatchObject({
      filePath: "src/a.ts",
      newContent: "new-a-v2",
    });
    expect(diffParts[1]).toMatchObject({
      filePath: "src/b.ts",
      newContent: "new-b",
    });
  });

  test("keeps code_diff parts for different file paths separate", () => {
    let message = createMessage();

    message = appendProviderEventToAssistant({
      message,
      event: {
        type: "diff",
        filePath: "src/a.ts",
        oldContent: "",
        newContent: "a",
        status: "accepted",
      },
    });
    message = appendProviderEventToAssistant({
      message,
      event: {
        type: "diff",
        filePath: "src/b.ts",
        oldContent: "",
        newContent: "b",
        status: "accepted",
      },
    });
    message = appendProviderEventToAssistant({
      message,
      event: {
        type: "diff",
        filePath: "src/c.ts",
        oldContent: "",
        newContent: "c",
        status: "accepted",
      },
    });

    const diffParts = message.parts.filter((p) => p.type === "code_diff");
    expect(diffParts).toHaveLength(3);
  });

  test("stores thinking timestamps for the actual reasoning window", () => {
    let message = createMessage();

    message = appendProviderEventToAssistant({
      message,
      event: { type: "thinking", text: "Inspecting...", isStreaming: true },
    });
    message = appendProviderEventToAssistant({
      message,
      event: { type: "text", text: "Done." },
    });

    const thinkingPart = message.parts.find((part) => part.type === "thinking");
    expect(thinkingPart).toBeDefined();
    if (!thinkingPart || thinkingPart.type !== "thinking") {
      throw new Error("expected thinking part");
    }

    expect(thinkingPart.isStreaming).toBe(false);
    expect(typeof thinkingPart.startedAt).toBe("string");
    expect(typeof thinkingPart.completedAt).toBe("string");
    expect(Date.parse(thinkingPart.completedAt ?? "")).toBeGreaterThanOrEqual(
      Date.parse(thinkingPart.startedAt ?? ""),
    );
  });

  test("timestamps standalone non-streaming reasoning parts so duration chips can render", () => {
    const message = appendProviderEventToAssistant({
      message: createMessage(),
      event: {
        type: "thinking",
        text: "Final reasoning block",
        isStreaming: false,
      },
    });

    const thinkingPart = message.parts.find((part) => part.type === "thinking");
    expect(thinkingPart).toBeDefined();
    if (!thinkingPart || thinkingPart.type !== "thinking") {
      throw new Error("expected thinking part");
    }

    expect(thinkingPart.isStreaming).toBe(false);
    expect(typeof thinkingPart.startedAt).toBe("string");
    expect(typeof thinkingPart.completedAt).toBe("string");
    expect(Date.parse(thinkingPart.completedAt ?? "")).toBeGreaterThanOrEqual(
      Date.parse(thinkingPart.startedAt ?? ""),
    );
  });

  test("keeps separate text parts when provider text segment ids change", () => {
    let message = createMessage({
      parts: [
        {
          type: "tool_use",
          toolUseId: "todo-1",
          toolName: "TodoWrite",
          input: '{"todos":[]}',
          state: "input-streaming",
        },
      ],
    });

    message = appendProviderEventToAssistant({
      message,
      event: {
        type: "text",
        text: "Inspecting the layout.",
        segmentId: "msg-1",
      },
    });
    message = appendProviderEventToAssistant({
      message,
      event: {
        type: "tool",
        toolUseId: "todo-1",
        toolName: "TodoWrite",
        input:
          '{"todos":[{"content":"Inspecting layout","status":"completed"}]}',
        state: "output-available",
      },
    });
    message = appendProviderEventToAssistant({
      message,
      event: {
        type: "text",
        text: "## Result\n\nFinal answer.",
        segmentId: "msg-2",
      },
    });

    const textParts = message.parts.filter(
      (part): part is TextPart => part.type === "text",
    );
    expect(textParts).toEqual([
      { type: "text", text: "Inspecting the layout.", segmentId: "msg-1" },
      { type: "text", text: "## Result\n\nFinal answer.", segmentId: "msg-2" },
    ]);
  });

  test("surfaces max-token completion as a truncation warning", () => {
    const updated = appendProviderEventToAssistant({
      message: createMessage({
        content: "Partial answer",
        parts: [{ type: "text", text: "Partial answer" }],
      }),
      event: { type: "done", stop_reason: "max_tokens" },
    });

    expect(updated.parts.at(-1)).toEqual({
      type: "system_event",
      content: PROVIDER_MAX_TOKENS_TRUNCATION_NOTICE,
    });
    expect(updated.isStreaming).toBe(false);
  });

  test("surfaces retained-output overflow even when no text was returned", () => {
    const updated = appendProviderEventToAssistant({
      message: createMessage(),
      event: { type: "done", stop_reason: "output_overflow" },
    });

    expect(updated.content).toBe("");
    expect(updated.parts).toEqual([
      {
        type: "system_event",
        content: PROVIDER_OUTPUT_OVERFLOW_TRUNCATION_NOTICE,
      },
    ]);
    expect(updated.isStreaming).toBe(false);
  });

  test("does not duplicate provider overflow notices emitted by the runtime", () => {
    const runtimeNotice =
      "Claude turn output was truncated in non-stream replay because the retained snapshot limit was exceeded.";
    const updated = appendProviderEventToAssistant({
      message: createMessage({
        parts: [{ type: "system_event", content: runtimeNotice }],
      }),
      event: { type: "done", stop_reason: "output_overflow" },
    });

    expect(updated.parts).toEqual([
      { type: "system_event", content: runtimeNotice },
    ]);
  });

  test("marks a matching approval as responded once the tool starts", () => {
    const updated = appendProviderEventToAssistant({
      message: createMessage({
        parts: [
          {
            type: "approval",
            toolName: "Bash",
            description: "Run npm test",
            requestId: "tool-1",
            state: "approval-requested",
          },
        ],
      }),
      event: {
        type: "tool",
        toolUseId: "tool-1",
        toolName: "Bash",
        input: "npm test",
        state: "input-available",
      },
    });

    expect(updated.parts[0]).toMatchObject({
      type: "approval",
      requestId: "tool-1",
      state: "approval-responded",
    });
    expect(updated.parts[1]).toMatchObject({
      type: "tool_use",
      toolUseId: "tool-1",
      toolName: "Bash",
    });
  });

  test("marks a matching approval as responded once tool results arrive", () => {
    const updated = appendProviderEventToAssistant({
      message: createMessage({
        parts: [
          {
            type: "approval",
            toolName: "Read",
            description: "Inspect file",
            requestId: "tool-1",
            state: "approval-requested",
          },
        ],
      }),
      event: {
        type: "tool_result",
        tool_use_id: "tool-1",
        output: "ok",
      },
    });

    expect(updated.parts[0]).toMatchObject({
      type: "approval",
      requestId: "tool-1",
      state: "approval-responded",
    });
  });

  test("interrupts a dangling pending approval when done arrives and clears the turn", () => {
    // Previously replay preserved the pending approval state on `done` to
    // keep the turn active so the approval popup stayed interactive. That
    // caused a "turn finished but UI shows waiting" lock: when the stream
    // ends (natural completion, abort, or a Task-A auto-deny timeout) any
    // pending approval part kept `activeTurnIdsByTask` set, disabling the
    // chat input. The done
    // handler now interrupts orphaned pending parts so the turn clears.
    const replayed = replayProviderEventsToTaskState({
      taskId: "task-1",
      messages: [],
      events: [
        {
          type: "approval",
          toolName: "bash",
          requestId: "tool-1",
          description: "Run npm test",
        },
        { type: "done" },
      ],
      provider: "codex",
      model: "gpt-5.4",
      turnId: "turn-1",
    });

    expect(replayed.activeTurnId).toBeUndefined();
    expect(replayed.messages[0]?.parts[0]).toMatchObject({
      type: "approval",
      requestId: "tool-1",
      state: "approval-interrupted",
    });
    expect(replayed.messages[0]?.isStreaming).toBe(false);
  });

  test("interrupts a dangling user_input request when done arrives", () => {
    const replayed = replayProviderEventsToTaskState({
      taskId: "task-1",
      messages: [],
      events: [
        {
          type: "user_input",
          toolName: "AskUserQuestion",
          requestId: "q-1",
          questions: [
            {
              question: "Which mode?",
              header: "Mode",
              options: [{ label: "fast", description: "fast" }],
            },
          ],
        },
        { type: "done", stop_reason: "aborted" },
      ],
      provider: "claude-code",
      model: "claude-sonnet-4-6",
      turnId: "turn-1",
    });

    expect(replayed.activeTurnId).toBeUndefined();
    expect(replayed.messages[0]?.parts.at(-1)).toMatchObject({
      type: "user_input",
      requestId: "q-1",
      state: "input-interrupted",
    });
  });

  test("leaves already-responded approval parts untouched at done", () => {
    const replayed = replayProviderEventsToTaskState({
      taskId: "task-1",
      messages: [],
      events: [
        {
          type: "approval",
          toolName: "bash",
          requestId: "tool-1",
          description: "Run npm test",
        },
        {
          type: "tool_result",
          tool_use_id: "tool-1",
          output: "ok",
        },
        { type: "done" },
      ],
      provider: "codex",
      model: "gpt-5.4",
      turnId: "turn-1",
    });

    expect(replayed.activeTurnId).toBeUndefined();
    expect(replayed.messages[0]?.parts[0]).toMatchObject({
      type: "approval",
      requestId: "tool-1",
      state: "approval-responded",
    });
  });

});

describe("provider session cursor replay", () => {
  test("advances the cursor only after a completed provider turn", () => {
    const replayed = replayProviderEventsToTaskState({
      taskId: "task-1",
      messages: [
        {
          id: "task-1-m-1",
          role: "user",
          model: "user",
          providerId: "user",
          content: "Implement the change.",
          parts: [{ type: "text", text: "Implement the change." }],
        },
      ],
      events: [
        {
          type: "provider_session",
          providerId: "codex",
          nativeSessionId: "thread-1",
        },
        { type: "text", text: "Done." },
        { type: "done" },
      ],
      provider: "codex",
      model: "gpt-5.4",
      turnId: "turn-1",
    });

    expect(replayed.providerSession?.codex).toEqual({
      nativeSessionId: "thread-1",
      syncedThroughMessageId: "task-1-m-2",
    });
  });

  test("clears a stale cursor when the provider reports a new native session", () => {
    const replayed = replayProviderEventsToTaskState({
      taskId: "task-1",
      messages: [],
      events: [
        {
          type: "provider_session",
          providerId: "claude-code",
          nativeSessionId: "session-new",
        },
      ],
      provider: "claude-code",
      model: "claude-sonnet-4-6",
      turnId: "turn-1",
      providerSession: {
        "claude-code": {
          nativeSessionId: "session-old",
          syncedThroughMessageId: "task-1-m-8",
        },
      },
    });

    expect(replayed.providerSession?.["claude-code"]).toEqual({
      nativeSessionId: "session-new",
    });
  });

  test("keeps the previous cursor when a turn has not completed", () => {
    const providerSession = {
      codex: {
        nativeSessionId: "thread-1",
        syncedThroughMessageId: "task-1-m-4",
      },
    };
    const replayed = replayProviderEventsToTaskState({
      taskId: "task-1",
      messages: [],
      events: [{ type: "text", text: "Still working." }],
      provider: "codex",
      model: "gpt-5.4",
      turnId: "turn-1",
      providerSession,
    });

    expect(replayed.providerSession).toBe(providerSession);
    expect(replayed.activeTurnId).toBe("turn-1");
  });
});

describe("provider goal status replay", () => {
  test("updates provider goal status without creating an assistant message", () => {
    const replayed = replayProviderEventsToTaskState({
      taskId: "task-1",
      messages: [],
      events: [
        {
          type: "goal_status",
          providerId: "codex",
          goal: {
            providerId: "codex",
            nativeSessionId: "thread-1",
            objective: "Finish the migration",
            status: "active",
            tokenBudget: 10_000,
            tokensUsed: 2500,
            timeUsedSeconds: 125,
            createdAt: 0,
            updatedAt: 1,
          },
        },
      ],
      provider: "codex",
      model: "gpt-5.4",
      turnId: "turn-1",
    });

    expect(replayed.changed).toBe(true);
    expect(replayed.messages).toEqual([]);
    expect(replayed.providerGoal).toEqual({
      providerId: "codex",
      nativeSessionId: "thread-1",
      objective: "Finish the migration",
      status: "active",
      tokenBudget: 10_000,
      tokensUsed: 2500,
      timeUsedSeconds: 125,
      createdAt: 0,
      updatedAt: 1,
    });
  });
});

describe("provider-native history metadata", () => {
  test("attaches user and assistant boundaries to their transcript messages", () => {
    const replayed = replayProviderEventsToTaskState({
      taskId: "task-1",
      messages: [
        {
          id: "task-1-m-1",
          role: "user",
          model: "user",
          providerId: "user",
          content: "Continue.",
          parts: [{ type: "text", text: "Continue." }],
        },
      ],
      events: [
        {
          type: "history_boundary",
          providerId: "claude-code",
          boundaryKind: "message",
          nativeId: "user-message-1",
          targetRole: "user",
        },
        {
          type: "history_boundary",
          providerId: "claude-code",
          boundaryKind: "message",
          nativeId: "assistant-message-1",
          targetRole: "assistant",
        },
        { type: "text", text: "Done." },
        { type: "done" },
      ],
      provider: "claude-code",
      model: "claude-sonnet-4-6",
    });

    expect(replayed.messages[0]?.providerBoundary).toEqual({
      providerId: "claude-code",
      kind: "message",
      nativeId: "user-message-1",
    });
    expect(replayed.messages[1]).toMatchObject({
      role: "assistant",
      content: "Done.",
      providerBoundary: {
        providerId: "claude-code",
        kind: "message",
        nativeId: "assistant-message-1",
      },
    });
  });

  test("keeps hook activity out of the transcript", () => {
    const replayed = replayProviderEventsToTaskState({
      taskId: "task-1",
      messages: [],
      events: [
        {
          type: "hook_activity",
          hookId: "hook-1",
          hookName: "audit-hook",
          hookEvent: "UserPromptSubmit",
          status: "completed",
        },
      ],
      provider: "claude-code",
      model: "claude-sonnet-4-6",
    });

    expect(replayed.messages).toEqual([]);
  });

  test("surfaces permission denials as concise system events", () => {
    const replayed = replayProviderEventsToTaskState({
      taskId: "task-1",
      messages: [],
      events: [
        {
          type: "permission_denial",
          toolName: "Bash",
          message: "Access denied.",
          reason: "Credential policy",
        },
      ],
      provider: "claude-code",
      model: "claude-sonnet-4-6",
    });

    expect(replayed.messages[0]?.parts).toContainEqual({
      type: "system_event",
      content: "Permission denied for Bash: Credential policy",
    });
  });
});

describe("subagent progress integration", () => {
  test("appends progress to matching Agent tool_use by toolUseId", () => {
    const message = createMessage({
      parts: [
        {
          type: "tool_use",
          toolUseId: "toolu_1",
          toolName: "agent",
          input: "{}",
          state: "input-streaming",
        },
        {
          type: "tool_use",
          toolUseId: "toolu_2",
          toolName: "agent",
          input: "{}",
          state: "input-streaming",
        },
      ],
    });
    const updated = appendProviderEventToAssistant({
      message,
      event: {
        type: "subagent_progress",
        toolUseId: "toolu_1",
        content: "Reading files",
      },
    });
    const part1 = updated.parts[0] as import("@/types/chat").ToolUsePart;
    const part2 = updated.parts[1] as import("@/types/chat").ToolUsePart;
    expect(part1.progressMessages).toEqual(["Reading files"]);
    expect(part2.progressMessages).toBeUndefined();
  });

  test("appends to last active Agent when toolUseId is not provided", () => {
    const message = createMessage({
      parts: [
        {
          type: "tool_use",
          toolUseId: "toolu_1",
          toolName: "agent",
          input: "{}",
          state: "output-available",
        },
        {
          type: "tool_use",
          toolUseId: "toolu_2",
          toolName: "agent",
          input: "{}",
          state: "input-streaming",
        },
      ],
    });
    const updated = appendProviderEventToAssistant({
      message,
      event: { type: "subagent_progress", content: "Compiling" },
    });
    const part1 = updated.parts[0] as import("@/types/chat").ToolUsePart;
    const part2 = updated.parts[1] as import("@/types/chat").ToolUsePart;
    expect(part1.progressMessages).toBeUndefined();
    expect(part2.progressMessages).toEqual(["Compiling"]);
  });

  test("accumulates multiple progress messages on the same agent", () => {
    let message = createMessage({
      parts: [
        {
          type: "tool_use",
          toolUseId: "toolu_1",
          toolName: "agent",
          input: "{}",
          state: "input-streaming",
        },
      ],
    });
    message = appendProviderEventToAssistant({
      message,
      event: {
        type: "subagent_progress",
        toolUseId: "toolu_1",
        content: "Step 1",
      },
    });
    message = appendProviderEventToAssistant({
      message,
      event: {
        type: "subagent_progress",
        toolUseId: "toolu_1",
        content: "Step 2",
      },
    });
    const part = message.parts[0] as import("@/types/chat").ToolUsePart;
    expect(part.progressMessages).toEqual(["Step 1", "Step 2"]);
  });

  test("degrades to system_event when no Agent tool_use exists", () => {
    const message = createMessage({
      parts: [
        {
          type: "tool_use",
          toolUseId: "toolu_bash",
          toolName: "Bash",
          input: "ls",
          state: "input-streaming",
        },
      ],
    });
    const updated = appendProviderEventToAssistant({
      message,
      event: { type: "subagent_progress", content: "Orphan progress" },
    });
    expect(updated.parts).toHaveLength(2);
    expect(updated.parts[1]).toEqual({
      type: "system_event",
      content: "Subagent progress: Orphan progress",
    });
  });

  test("migrates legacy 'Subagent progress:' system events into Agent tool parts", () => {
    const message = createMessage({
      parts: [
        {
          type: "tool_use",
          toolUseId: "toolu_1",
          toolName: "agent",
          input: "{}",
          state: "input-streaming",
        },
      ],
    });
    const updated = appendProviderEventToAssistant({
      message,
      event: {
        type: "system",
        content: "Subagent progress: Reading CONVENTIONS.md",
      },
    });
    const part = updated.parts[0] as import("@/types/chat").ToolUsePart;
    expect(part.progressMessages).toEqual(["Reading CONVENTIONS.md"]);
  });
});

describe("replayProviderEventsToTaskState — partial-window message IDs", () => {
  // A 2-message tail window over a task whose durable history is 10 messages.
  function partialWindow(): ChatMessage[] {
    return [
      {
        id: "task-1-m-9",
        role: "assistant",
        model: "gpt-5.4",
        providerId: "codex",
        content: "older",
        isStreaming: false,
        parts: [],
      },
      {
        id: "task-1-m-10",
        role: "user",
        model: "user",
        providerId: "user",
        content: "latest prompt",
        parts: [],
      },
    ];
  }

  test("anchors a new streaming message ID to the durable total, not window length", () => {
    const result = replayProviderEventsToTaskState({
      taskId: "task-1",
      messages: partialWindow(),
      messageCount: 10, // true on-disk total; only the last 2 are resident
      events: [{ type: "text", text: "hello" }],
      provider: "codex",
      model: "gpt-5.4",
    });

    const created = result.messages[result.messages.length - 1];
    // Window length is 2, so the pre-fix scheme would mint task-1-m-3 and collide
    // with the real on-disk m-3 (silently overwritten by the additive upsert).
    expect(created?.id).toBe("task-1-m-11");
  });

  test("falls back to window length when the durable total is unknown", () => {
    const result = replayProviderEventsToTaskState({
      taskId: "task-1",
      messages: partialWindow(),
      events: [{ type: "text", text: "hello" }],
      provider: "codex",
      model: "gpt-5.4",
    });

    const created = result.messages[result.messages.length - 1];
    // messageCount omitted -> offset 0 -> positional over the resident window
    // (preserves legacy behavior for full-history sessions).
    expect(created?.id).toBe("task-1-m-3");
  });
});
