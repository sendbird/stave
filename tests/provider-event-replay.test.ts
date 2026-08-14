import { describe, expect, test } from "bun:test";
import {
  appendProviderEventToAssistant,
  replayProviderEventsToTaskState,
} from "@/lib/session/provider-event-replay";
import {
  PROVIDER_MAX_TOKENS_TRUNCATION_NOTICE,
  PROVIDER_OUTPUT_OVERFLOW_TRUNCATION_NOTICE,
} from "@/lib/truncation-visibility";
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
  test("persists Worker execution metadata on the spawned tool part", () => {
    const message = appendProviderEventToAssistant({
      message: createMessage(),
      event: {
        type: "tool",
        toolUseId: "worker-1",
        toolName: "collaboration:spawn_agent",
        input: '{"task_name":"review"}',
        state: "input-available",
        workerExecution: {
          providerId: "codex",
          primaryModel: "gpt-5.6-sol",
          presetId: "verified-patch",
          workerModel: "gpt-5.6-terra",
          workerEffort: "max",
        },
      },
    });

    expect(message.parts[0]).toMatchObject({
      type: "tool_use",
      workerExecution: {
        workerModel: "gpt-5.6-terra",
        workerEffort: "max",
      },
    });
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
    // caused the "Claude delivered a plan but UI shows waiting" lock: when
    // the stream ends (natural completion, abort, or a Task-A auto-deny
    // timeout) any pending approval part kept `activeTurnIdsByTask` set,
    // disabling PlanViewer's Approve/Revise and the chat input. The done
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

  test("clears the turn when a plan response finishes with a dangling approval part", () => {
    // Regression: Claude delivered an ExitPlanMode plan while an earlier
    // pending approval part was still on the assistant message (e.g. carry-
    // over from a prior tool whose approval was routed but never resolved).
    // The plan turn must still clear `activeTurnId` so PlanViewer's
    // Approve/Revise controls enable.
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
        { type: "plan_ready", planText: "1. Inspect\n2. Patch" },
        { type: "done" },
      ],
      provider: "claude-code",
      model: "claude-sonnet-4-6",
      turnId: "turn-1",
    });

    expect(replayed.activeTurnId).toBeUndefined();
    const planMessage = replayed.messages.at(-1);
    expect(planMessage?.isPlanResponse).toBe(true);
  });

  test("a turn that splits across messages leaves its usage on one of them", () => {
    // Codex reports a running token total mid-turn and the authoritative one at
    // `turn/completed`. A plan seals the message the first landed on and opens
    // another for the second, and `buildUsageMetric` sums usage across
    // messages — so both surviving would report roughly twice the real cost.
    const replayed = replayProviderEventsToTaskState({
      taskId: "task-1",
      messages: [],
      events: [
        { type: "text", text: "Looking at the callers." },
        { type: "usage", inputTokens: 900, outputTokens: 100 },
        { type: "plan_ready", planText: "1. Inspect\n2. Patch" },
        { type: "text", text: "Shall I proceed?" },
        { type: "usage", inputTokens: 1_000, outputTokens: 250 },
        { type: "done" },
      ],
      provider: "codex",
      model: "gpt-5.6",
      turnId: "turn-1",
    });

    const carriers = replayed.messages.filter((message) => message.usage);
    expect(carriers).toHaveLength(1);
    // The one left holding it is the authoritative total, not the running one.
    expect(carriers[0]?.usage).toMatchObject({
      inputTokens: 1_000,
      outputTokens: 250,
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

describe("plan response replay", () => {
  test("appends a dedicated plan message after prior assistant content", () => {
    const replayed = replayProviderEventsToTaskState({
      taskId: "task-1",
      messages: [],
      events: [
        { type: "text", text: "I have a plan ready." },
        { type: "plan_ready", planText: "1. Inspect\n2. Patch" },
        { type: "done" },
      ],
      provider: "claude-code",
      model: "claude-sonnet-4-6",
    });

    expect(replayed.messages).toHaveLength(2);
    expect(replayed.messages[0]).toMatchObject({
      content: "I have a plan ready.",
      isStreaming: false,
    });
    expect(replayed.messages[0]?.isPlanResponse).not.toBe(true);
    expect(typeof replayed.messages[0]?.completedAt).toBe("string");
    expect(replayed.messages[1]).toMatchObject({
      providerId: "claude-code",
      model: "claude-sonnet-4-6",
      content: "1. Inspect\n2. Patch",
      isPlanResponse: true,
      planText: "1. Inspect\n2. Patch",
      isStreaming: false,
    });
  });

  test("strips <proposed_plan> tags from prior streaming text when plan_ready arrives", () => {
    // Simulates the Codex plan bug: streaming deltas include raw
    // <proposed_plan> tags, then plan_ready follows.
    const replayed = replayProviderEventsToTaskState({
      taskId: "task-1",
      messages: [],
      events: [
        {
          type: "text",
          text: "Analyzing the codebase.\n\n<proposed_plan>\n## Plan\n- Step 1\n</proposed_plan>",
        },
        { type: "plan_ready", planText: "## Plan\n- Step 1" },
        { type: "done" },
      ],
      provider: "codex",
      model: "o3",
    });

    // The prior message should have its <proposed_plan> tags stripped.
    expect(replayed.messages).toHaveLength(2);
    expect(replayed.messages[0]).toMatchObject({
      content: "Analyzing the codebase.",
    });
    expect(replayed.messages[0]?.content).not.toContain("<proposed_plan>");
    // Plan message should have clean plan text.
    expect(replayed.messages[1]).toMatchObject({
      content: "## Plan\n- Step 1",
      isPlanResponse: true,
      planText: "## Plan\n- Step 1",
    });
  });

  test("replaces message entirely when only <proposed_plan> tags exist (no preamble)", () => {
    const replayed = replayProviderEventsToTaskState({
      taskId: "task-1",
      messages: [],
      events: [
        {
          type: "text",
          text: "<proposed_plan>\n## Plan\n- Fix it\n</proposed_plan>",
        },
        { type: "plan_ready", planText: "## Plan\n- Fix it" },
        { type: "done" },
      ],
      provider: "codex",
      model: "o3",
    });

    // When the streamed text is ONLY the plan block, the cleaned message
    // is empty so plan_ready replaces it instead of creating a separate one.
    expect(replayed.messages).toHaveLength(1);
    expect(replayed.messages[0]).toMatchObject({
      content: "## Plan\n- Fix it",
      isPlanResponse: true,
      planText: "## Plan\n- Fix it",
    });
  });

  test("replaces a structured Codex plan preview with the final plan response", () => {
    const replayed = replayProviderEventsToTaskState({
      taskId: "task-1",
      messages: [],
      events: [
        { type: "text", text: "## Plan\n- Step 1", segmentId: "plan-stream-1" },
        { type: "text", text: "\n- Step 2", segmentId: "plan-stream-1" },
        {
          type: "plan_ready",
          planText: "## Plan\n- Step 1\n- Step 2",
          sourceSegmentId: "plan-stream-1",
        },
        { type: "done" },
      ],
      provider: "codex",
      model: "o3",
    });

    expect(replayed.messages).toHaveLength(1);
    expect(replayed.messages[0]).toMatchObject({
      content: "## Plan\n- Step 1\n- Step 2",
      isPlanResponse: true,
      planText: "## Plan\n- Step 1\n- Step 2",
      isStreaming: false,
    });
  });

  test("keeps non-plan commentary when a structured Codex plan preview is removed", () => {
    const replayed = replayProviderEventsToTaskState({
      taskId: "task-1",
      messages: [],
      events: [
        {
          type: "text",
          text: "Analyzing the codebase.\n\n",
          segmentId: "commentary-1",
        },
        { type: "text", text: "## Plan\n- Step 1", segmentId: "plan-stream-1" },
        {
          type: "plan_ready",
          planText: "## Plan\n- Step 1\n- Step 2",
          sourceSegmentId: "plan-stream-1",
        },
        { type: "done" },
      ],
      provider: "codex",
      model: "o3",
    });

    expect(replayed.messages).toHaveLength(2);
    expect(replayed.messages[0]?.content.trim()).toBe(
      "Analyzing the codebase.",
    );
    expect(replayed.messages[0]?.isPlanResponse).not.toBe(true);
    expect(replayed.messages[1]).toMatchObject({
      content: "## Plan\n- Step 1\n- Step 2",
      isPlanResponse: true,
      planText: "## Plan\n- Step 1\n- Step 2",
    });
  });

  test("handles partial <proposed_plan> tag from streaming cut-off", () => {
    const replayed = replayProviderEventsToTaskState({
      taskId: "task-1",
      messages: [],
      events: [
        {
          type: "text",
          text: "Analysis done.\n\n<proposed_plan>\n## Plan\n- Do X",
        },
        { type: "plan_ready", planText: "## Plan\n- Do X\n- Do Y" },
        { type: "done" },
      ],
      provider: "codex",
      model: "o3",
    });

    expect(replayed.messages).toHaveLength(2);
    expect(replayed.messages[0]).toMatchObject({
      content: "Analysis done.",
    });
    expect(replayed.messages[0]?.content).not.toContain("<proposed_plan>");
  });

  test("stores a standalone plan response when plan_ready arrives first", () => {
    const replayed = replayProviderEventsToTaskState({
      taskId: "task-1",
      messages: [],
      events: [
        { type: "plan_ready", planText: "1. Reproduce\n2. Fix" },
        { type: "done" },
      ],
      provider: "claude-code",
      model: "claude-sonnet-4-6",
    });

    expect(replayed.messages).toHaveLength(1);
    expect(replayed.messages[0]).toMatchObject({
      providerId: "claude-code",
      model: "claude-sonnet-4-6",
      content: "1. Reproduce\n2. Fix",
      isPlanResponse: true,
      planText: "1. Reproduce\n2. Fix",
      isStreaming: false,
    });
  });

  test("moves post-plan assistant text into its own message", () => {
    // Regression: a plan message renders as a dedicated plan card, so anything
    // appended to it after the plan (the agent's "shall I proceed?" question,
    // follow-up tool work) used to be swallowed with the card and never
    // reached the transcript.
    const replayed = replayProviderEventsToTaskState({
      taskId: "task-1",
      messages: [],
      events: [
        { type: "plan_ready", planText: "1. Inspect\n2. Patch" },
        { type: "text", text: "Shall I proceed with the plan above?" },
        { type: "done" },
      ],
      provider: "claude-code",
      model: "claude-sonnet-4-6",
    });

    expect(replayed.messages).toHaveLength(2);
    expect(replayed.messages[0]).toMatchObject({
      content: "1. Inspect\n2. Patch",
      isPlanResponse: true,
      planText: "1. Inspect\n2. Patch",
      isStreaming: false,
    });
    expect(replayed.messages[0]?.parts).toEqual([]);
    expect(typeof replayed.messages[0]?.completedAt).toBe("string");
    expect(replayed.messages[1]?.isPlanResponse).not.toBe(true);
    expect(replayed.messages[1]).toMatchObject({
      content: "Shall I proceed with the plan above?",
      isStreaming: false,
    });
  });

  test("keeps post-plan tool work out of the plan message", () => {
    const replayed = replayProviderEventsToTaskState({
      taskId: "task-1",
      messages: [],
      events: [
        { type: "plan_ready", planText: "1. Inspect\n2. Patch" },
        {
          type: "tool",
          toolUseId: "write-1",
          toolName: "Write",
          input: '{"file_path":"a.ts"}',
          state: "input-available",
        },
        { type: "done" },
      ],
      provider: "claude-code",
      model: "claude-sonnet-4-6",
    });

    expect(replayed.messages).toHaveLength(2);
    expect(replayed.messages[0]?.parts).toEqual([]);
    expect(replayed.messages[1]?.isPlanResponse).not.toBe(true);
    expect(
      replayed.messages[1]?.parts.some((part) => part.type === "tool_use"),
    ).toBe(true);
  });

  test("keeps the plan row on its own native turn when a follow-up turn starts", () => {
    // Regression: `provider_turn` for the post-approval turn used to land on the
    // sealed plan row, so the plan row advertised the follow-up turn while the
    // follow-up row carried no native turn at all — which disables its
    // fork/rollback actions ("predates native turn tracking").
    const replayed = replayProviderEventsToTaskState({
      taskId: "task-1",
      messages: [],
      events: [
        {
          type: "provider_turn",
          providerId: "claude-code",
          nativeSessionId: "sess-1",
          nativeTurnId: "turn-a",
        },
        { type: "plan_ready", planText: "1. Inspect\n2. Patch" },
        {
          type: "provider_turn",
          providerId: "claude-code",
          nativeSessionId: "sess-1",
          nativeTurnId: "turn-b",
        },
        { type: "text", text: "Plan approved. Implementing…" },
        { type: "done" },
      ],
      provider: "claude-code",
      model: "claude-sonnet-4-6",
    });

    expect(replayed.messages).toHaveLength(2);
    expect(replayed.messages[0]).toMatchObject({
      isPlanResponse: true,
      nativeProviderSessionId: "sess-1",
      nativeProviderTurnId: "turn-a",
    });
    expect(replayed.messages[1]).toMatchObject({
      content: "Plan approved. Implementing…",
      nativeProviderSessionId: "sess-1",
      nativeProviderTurnId: "turn-b",
    });
  });

  test("routes a follow-up history boundary to the follow-up response", () => {
    // Claude emits `history_boundary` ahead of `provider_turn`; Codex emits it
    // after. Either order must leave the plan row on its own boundary.
    const claudeOrder = replayProviderEventsToTaskState({
      taskId: "task-1",
      messages: [],
      events: [
        {
          type: "history_boundary",
          providerId: "claude-code",
          boundaryKind: "message",
          nativeId: "turn-a",
          targetRole: "assistant",
        },
        {
          type: "provider_turn",
          providerId: "claude-code",
          nativeSessionId: "sess-1",
          nativeTurnId: "turn-a",
        },
        { type: "plan_ready", planText: "1. Inspect\n2. Patch" },
        {
          type: "history_boundary",
          providerId: "claude-code",
          boundaryKind: "message",
          nativeId: "turn-b",
          targetRole: "assistant",
        },
        {
          type: "provider_turn",
          providerId: "claude-code",
          nativeSessionId: "sess-1",
          nativeTurnId: "turn-b",
        },
        { type: "text", text: "Plan approved. Implementing…" },
        { type: "done" },
      ],
      provider: "claude-code",
      model: "claude-sonnet-4-6",
    });

    expect(claudeOrder.messages).toHaveLength(2);
    expect(claudeOrder.messages[0]?.providerBoundary).toMatchObject({
      nativeId: "turn-a",
    });
    expect(claudeOrder.messages[0]?.nativeProviderTurnId).toBe("turn-a");
    expect(claudeOrder.messages[1]?.providerBoundary).toMatchObject({
      nativeId: "turn-b",
    });
    expect(claudeOrder.messages[1]?.nativeProviderTurnId).toBe("turn-b");

    const codexOrder = replayProviderEventsToTaskState({
      taskId: "task-2",
      messages: [],
      events: [
        {
          type: "provider_turn",
          providerId: "codex",
          nativeSessionId: "thread-1",
          nativeTurnId: "turn-1",
        },
        {
          type: "history_boundary",
          providerId: "codex",
          boundaryKind: "turn",
          nativeId: "turn-1",
          targetRole: "assistant",
        },
        { type: "plan_ready", planText: "1. Inspect\n2. Patch" },
        {
          type: "provider_turn",
          providerId: "codex",
          nativeSessionId: "thread-1",
          nativeTurnId: "turn-2",
        },
        {
          type: "history_boundary",
          providerId: "codex",
          boundaryKind: "turn",
          nativeId: "turn-2",
          targetRole: "assistant",
        },
        { type: "text", text: "Plan approved. Implementing…" },
        { type: "done" },
      ],
      provider: "codex",
      model: "gpt-5.4",
    });

    expect(codexOrder.messages).toHaveLength(2);
    expect(codexOrder.messages[0]?.providerBoundary).toMatchObject({
      nativeId: "turn-1",
    });
    expect(codexOrder.messages[0]?.nativeProviderTurnId).toBe("turn-1");
    expect(codexOrder.messages[1]?.providerBoundary).toMatchObject({
      nativeId: "turn-2",
    });
    expect(codexOrder.messages[1]?.nativeProviderTurnId).toBe("turn-2");
  });

  test("carries the plan row's native turn onto same-turn follow-up content", () => {
    // No new `provider_turn` arrived, so the text belongs to the very turn that
    // produced the plan. The split row must inherit that turn instead of
    // reporting itself as untracked.
    const replayed = replayProviderEventsToTaskState({
      taskId: "task-1",
      messages: [],
      events: [
        {
          type: "provider_turn",
          providerId: "claude-code",
          nativeSessionId: "sess-1",
          nativeTurnId: "turn-a",
        },
        { type: "plan_ready", planText: "1. Inspect\n2. Patch" },
        { type: "text", text: "Shall I proceed?" },
        { type: "done" },
      ],
      provider: "claude-code",
      model: "claude-sonnet-4-6",
    });

    expect(replayed.messages).toHaveLength(2);
    expect(replayed.messages[0]?.nativeProviderTurnId).toBe("turn-a");
    expect(replayed.messages[1]).toMatchObject({
      content: "Shall I proceed?",
      nativeProviderSessionId: "sess-1",
      nativeProviderTurnId: "turn-a",
    });
  });

  test("carries the native turn onto a plan split off from streamed commentary", () => {
    const replayed = replayProviderEventsToTaskState({
      taskId: "task-1",
      messages: [],
      events: [
        {
          type: "provider_turn",
          providerId: "codex",
          nativeSessionId: "thread-1",
          nativeTurnId: "turn-1",
        },
        { type: "text", text: "Analyzing the codebase.\n\n" },
        { type: "plan_ready", planText: "## Plan\n- Step 1" },
        { type: "done" },
      ],
      provider: "codex",
      model: "gpt-5.4",
    });

    expect(replayed.messages).toHaveLength(2);
    expect(replayed.messages[0]?.nativeProviderTurnId).toBe("turn-1");
    expect(replayed.messages[1]).toMatchObject({
      isPlanResponse: true,
      nativeProviderSessionId: "thread-1",
      nativeProviderTurnId: "turn-1",
    });
  });

  test("updates a re-presented plan in place instead of forking a message", () => {
    const replayed = replayProviderEventsToTaskState({
      taskId: "task-1",
      messages: [],
      events: [
        { type: "plan_ready", planText: "1. Inspect" },
        { type: "plan_ready", planText: "1. Inspect\n2. Patch" },
        { type: "done" },
      ],
      provider: "claude-code",
      model: "claude-sonnet-4-6",
    });

    expect(replayed.messages).toHaveLength(1);
    expect(replayed.messages[0]).toMatchObject({
      isPlanResponse: true,
      planText: "1. Inspect\n2. Patch",
    });
  });

  test("normalizes commentary out of plan_ready content", () => {
    const replayed = replayProviderEventsToTaskState({
      taskId: "task-1",
      messages: [],
      events: [
        {
          type: "plan_ready",
          planText:
            "...\n\n## Plan\n- Strip commentary\n- Keep steps only\n\nLet me know if you want changes.",
        },
        { type: "done" },
      ],
      provider: "codex",
      model: "o3",
    });

    expect(replayed.messages).toHaveLength(1);
    expect(replayed.messages[0]).toMatchObject({
      content: "## Plan\n- Strip commentary\n- Keep steps only",
      isPlanResponse: true,
      planText: "## Plan\n- Strip commentary\n- Keep steps only",
      isStreaming: false,
    });
  });

  test("ignores punctuation-only plan_ready placeholders", () => {
    const replayed = replayProviderEventsToTaskState({
      taskId: "task-1",
      messages: [],
      events: [{ type: "plan_ready", planText: "..." }, { type: "done" }],
      provider: "codex",
      model: "o3",
    });

    expect(replayed.messages).toHaveLength(1);
    expect(replayed.messages[0]).toMatchObject({
      content: "No response returned.",
      isStreaming: false,
    });
    expect(replayed.messages[0]?.isPlanResponse).not.toBe(true);
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
