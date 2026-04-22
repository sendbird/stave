import { describe, expect, test } from "bun:test";
import {
  appendProviderEventToAssistant,
  replayProviderEventsToTaskState,
} from "@/lib/session/provider-event-replay";
import type { ChatMessage, OrchestrationProgressPart, StaveProcessingPart, TextPart } from "@/types/chat";

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "task-1-m-1",
    role: "assistant",
    model: "stave",
    providerId: "stave",
    content: "",
    isStreaming: true,
    parts: [],
    ...overrides,
  };
}

function createStaveProcessingPart(overrides: Partial<StaveProcessingPart> = {}): StaveProcessingPart {
  return {
    type: "stave_processing",
    strategy: "direct",
    model: "claude-sonnet-4-6",
    reason: "General coding task",
    ...overrides,
  };
}

function createOrchestrationProgressPart(): OrchestrationProgressPart {
  return {
    type: "orchestration_progress",
    supervisorModel: "claude-opus-4-6",
    subtasks: [
      {
        id: "st-1",
        title: "Analyze code",
        model: "claude-haiku-4-5",
        status: "running",
      },
    ],
    status: "executing",
  };
}

describe("appendProviderEventToAssistant", () => {
  test("suppresses streamed Stave routing JSON once the payload is complete", () => {
    const initial = createMessage();

    const partial = appendProviderEventToAssistant({
      message: initial,
      event: {
        type: "text",
        text: "{\"strategy\":\"direct\",\"model\":\"claude-sonnet-4-6\",",
      },
    });

    expect(partial.content).toContain("\"strategy\":\"direct\"");
    expect(partial.parts).toEqual([
      {
        type: "text",
        text: "{\"strategy\":\"direct\",\"model\":\"claude-sonnet-4-6\",",
      },
    ]);

    const finalized = appendProviderEventToAssistant({
      message: partial,
      event: {
        type: "text",
        text: "\"reason\":\"General coding task\"}",
      },
    });

    expect(finalized.content).toBe("");
    expect(finalized.parts).toEqual([]);
  });

  test("suppresses orchestration breakdown JSON while Stave is still in routing mode", () => {
    const message = createMessage({
      parts: [
        createStaveProcessingPart({
          strategy: "orchestrate",
          model: undefined,
          supervisorModel: "claude-opus-4-6",
          reason: "Needs multiple specialists",
        }),
      ],
    });

    const updated = appendProviderEventToAssistant({
      message,
      event: {
        type: "text",
        text: "[{\"id\":\"st-1\",\"title\":\"Analyze code\",\"model\":\"claude-haiku-4-5\",\"prompt\":\"Inspect auth flow\",\"dependsOn\":[]}]",
      },
    });

    expect(updated.content).toBe("");
    expect(updated.parts).toEqual(message.parts);
  });

  test("keeps JSON text after orchestration progress is already visible", () => {
    const message = createMessage({
      parts: [
        createStaveProcessingPart({
          strategy: "orchestrate",
          model: undefined,
          supervisorModel: "claude-opus-4-6",
          reason: "Needs multiple specialists",
        }),
        createOrchestrationProgressPart(),
      ],
    });

    const updated = appendProviderEventToAssistant({
      message,
      event: {
        type: "text",
        text: "[{\"id\":\"result\",\"title\":\"Final JSON\",\"model\":\"gpt-5.4\",\"prompt\":\"Summarize output\",\"dependsOn\":[]}]",
      },
    });

    expect(updated.content).toBe("[{\"id\":\"result\",\"title\":\"Final JSON\",\"model\":\"gpt-5.4\",\"prompt\":\"Summarize output\",\"dependsOn\":[]}]");
    expect(updated.parts.at(-1)).toEqual({
      type: "text",
      text: "[{\"id\":\"result\",\"title\":\"Final JSON\",\"model\":\"gpt-5.4\",\"prompt\":\"Summarize output\",\"dependsOn\":[]}]",
    });
  });

  test("keeps JSON text after the turn resolves to a real provider", () => {
    const resolved = appendProviderEventToAssistant({
      message: createMessage({
        parts: [createStaveProcessingPart()],
      }),
      event: {
        type: "model_resolved",
        resolvedProviderId: "codex",
        resolvedModel: "gpt-5.4",
      },
    });

    const updated = appendProviderEventToAssistant({
      message: resolved,
      event: {
        type: "text",
        text: "{\"strategy\":\"direct\",\"model\":\"gpt-5.4\",\"reason\":\"return as data\"}",
      },
    });

    expect(updated.providerId).toBe("codex");
    expect(updated.content).toBe("{\"strategy\":\"direct\",\"model\":\"gpt-5.4\",\"reason\":\"return as data\"}");
    expect(updated.parts.at(-1)).toEqual({
      type: "text",
      text: "{\"strategy\":\"direct\",\"model\":\"gpt-5.4\",\"reason\":\"return as data\"}",
    });
  });

  test("deduplicates code_diff parts for the same file path", () => {
    let message = createMessage();

    // First diff for file1
    message = appendProviderEventToAssistant({
      message,
      event: { type: "diff", filePath: "src/a.ts", oldContent: "old-a", newContent: "new-a-v1", status: "accepted" },
    });
    // Diff for file2
    message = appendProviderEventToAssistant({
      message,
      event: { type: "diff", filePath: "src/b.ts", oldContent: "old-b", newContent: "new-b", status: "accepted" },
    });
    // Second diff for file1 (same file modified again)
    message = appendProviderEventToAssistant({
      message,
      event: { type: "diff", filePath: "src/a.ts", oldContent: "old-a", newContent: "new-a-v2", status: "accepted" },
    });

    // Should have exactly 2 code_diff parts (one per unique file), not 3
    const diffParts = message.parts.filter((p) => p.type === "code_diff");
    expect(diffParts).toHaveLength(2);
    expect(diffParts[0]).toMatchObject({ filePath: "src/a.ts", newContent: "new-a-v2" });
    expect(diffParts[1]).toMatchObject({ filePath: "src/b.ts", newContent: "new-b" });
  });

  test("keeps code_diff parts for different file paths separate", () => {
    let message = createMessage();

    message = appendProviderEventToAssistant({
      message,
      event: { type: "diff", filePath: "src/a.ts", oldContent: "", newContent: "a", status: "accepted" },
    });
    message = appendProviderEventToAssistant({
      message,
      event: { type: "diff", filePath: "src/b.ts", oldContent: "", newContent: "b", status: "accepted" },
    });
    message = appendProviderEventToAssistant({
      message,
      event: { type: "diff", filePath: "src/c.ts", oldContent: "", newContent: "c", status: "accepted" },
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
    expect(Date.parse(thinkingPart.completedAt ?? "")).toBeGreaterThanOrEqual(Date.parse(thinkingPart.startedAt ?? ""));
  });

  test("timestamps standalone non-streaming reasoning parts so duration chips can render", () => {
    const message = appendProviderEventToAssistant({
      message: createMessage(),
      event: { type: "thinking", text: "Final reasoning block", isStreaming: false },
    });

    const thinkingPart = message.parts.find((part) => part.type === "thinking");
    expect(thinkingPart).toBeDefined();
    if (!thinkingPart || thinkingPart.type !== "thinking") {
      throw new Error("expected thinking part");
    }

    expect(thinkingPart.isStreaming).toBe(false);
    expect(typeof thinkingPart.startedAt).toBe("string");
    expect(typeof thinkingPart.completedAt).toBe("string");
    expect(Date.parse(thinkingPart.completedAt ?? "")).toBeGreaterThanOrEqual(Date.parse(thinkingPart.startedAt ?? ""));
  });

  test("keeps separate text parts when provider text segment ids change", () => {
    let message = createMessage({
      parts: [
        { type: "tool_use", toolUseId: "todo-1", toolName: "TodoWrite", input: "{\"todos\":[]}", state: "input-streaming" },
      ],
    });

    message = appendProviderEventToAssistant({
      message,
      event: { type: "text", text: "Inspecting the layout.", segmentId: "msg-1" },
    });
    message = appendProviderEventToAssistant({
      message,
      event: {
        type: "tool",
        toolUseId: "todo-1",
        toolName: "TodoWrite",
        input: "{\"todos\":[{\"content\":\"Inspecting layout\",\"status\":\"completed\"}]}",
        state: "output-available",
      },
    });
    message = appendProviderEventToAssistant({
      message,
      event: { type: "text", text: "## Result\n\nFinal answer.", segmentId: "msg-2" },
    });

    const textParts = message.parts.filter((part): part is TextPart => part.type === "text");
    expect(textParts).toEqual([
      { type: "text", text: "Inspecting the layout.", segmentId: "msg-1" },
      { type: "text", text: "## Result\n\nFinal answer.", segmentId: "msg-2" },
    ]);
  });

  test("marks a matching approval as responded once the tool starts", () => {
    const updated = appendProviderEventToAssistant({
      message: createMessage({
        parts: [{
          type: "approval",
          toolName: "Bash",
          description: "Run npm test",
          requestId: "tool-1",
          state: "approval-requested",
        }],
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
        parts: [{
          type: "approval",
          toolName: "Read",
          description: "Inspect file",
          requestId: "tool-1",
          state: "approval-requested",
        }],
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
        { type: "text", text: "Analyzing the codebase.\n\n<proposed_plan>\n## Plan\n- Step 1\n</proposed_plan>" },
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
        { type: "text", text: "<proposed_plan>\n## Plan\n- Fix it\n</proposed_plan>" },
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
        { type: "plan_ready", planText: "## Plan\n- Step 1\n- Step 2", sourceSegmentId: "plan-stream-1" },
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
        { type: "text", text: "Analyzing the codebase.\n\n", segmentId: "commentary-1" },
        { type: "text", text: "## Plan\n- Step 1", segmentId: "plan-stream-1" },
        { type: "plan_ready", planText: "## Plan\n- Step 1\n- Step 2", sourceSegmentId: "plan-stream-1" },
        { type: "done" },
      ],
      provider: "codex",
      model: "o3",
    });

    expect(replayed.messages).toHaveLength(2);
    expect(replayed.messages[0]?.content.trim()).toBe("Analyzing the codebase.");
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
        { type: "text", text: "Analysis done.\n\n<proposed_plan>\n## Plan\n- Do X" },
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

  test("normalizes commentary out of plan_ready content", () => {
    const replayed = replayProviderEventsToTaskState({
      taskId: "task-1",
      messages: [],
      events: [
        {
          type: "plan_ready",
          planText: "...\n\n## Plan\n- Strip commentary\n- Keep steps only\n\nLet me know if you want changes.",
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
      events: [
        { type: "plan_ready", planText: "..." },
        { type: "done" },
      ],
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

describe("subagent progress integration", () => {
  test("appends progress to matching Agent tool_use by toolUseId", () => {
    const message = createMessage({
      parts: [
        { type: "tool_use", toolUseId: "toolu_1", toolName: "agent", input: "{}", state: "input-streaming" },
        { type: "tool_use", toolUseId: "toolu_2", toolName: "agent", input: "{}", state: "input-streaming" },
      ],
    });
    const updated = appendProviderEventToAssistant({
      message,
      event: { type: "subagent_progress", toolUseId: "toolu_1", content: "Reading files" },
    });
    const part1 = updated.parts[0] as import("@/types/chat").ToolUsePart;
    const part2 = updated.parts[1] as import("@/types/chat").ToolUsePart;
    expect(part1.progressMessages).toEqual(["Reading files"]);
    expect(part2.progressMessages).toBeUndefined();
  });

  test("appends to last active Agent when toolUseId is not provided", () => {
    const message = createMessage({
      parts: [
        { type: "tool_use", toolUseId: "toolu_1", toolName: "agent", input: "{}", state: "output-available" },
        { type: "tool_use", toolUseId: "toolu_2", toolName: "agent", input: "{}", state: "input-streaming" },
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
        { type: "tool_use", toolUseId: "toolu_1", toolName: "agent", input: "{}", state: "input-streaming" },
      ],
    });
    message = appendProviderEventToAssistant({
      message,
      event: { type: "subagent_progress", toolUseId: "toolu_1", content: "Step 1" },
    });
    message = appendProviderEventToAssistant({
      message,
      event: { type: "subagent_progress", toolUseId: "toolu_1", content: "Step 2" },
    });
    const part = message.parts[0] as import("@/types/chat").ToolUsePart;
    expect(part.progressMessages).toEqual(["Step 1", "Step 2"]);
  });

  test("degrades to system_event when no Agent tool_use exists", () => {
    const message = createMessage({
      parts: [
        { type: "tool_use", toolUseId: "toolu_bash", toolName: "Bash", input: "ls", state: "input-streaming" },
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
        { type: "tool_use", toolUseId: "toolu_1", toolName: "agent", input: "{}", state: "input-streaming" },
      ],
    });
    const updated = appendProviderEventToAssistant({
      message,
      event: { type: "system", content: "Subagent progress: Reading CONVENTIONS.md" },
    });
    const part = updated.parts[0] as import("@/types/chat").ToolUsePart;
    expect(part.progressMessages).toEqual(["Reading CONVENTIONS.md"]);
  });
});
