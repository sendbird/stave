import { describe, expect, test } from "bun:test";
import { parseNormalizedEvent } from "@/lib/providers/runtime";

describe("parseNormalizedEvent", () => {
  test("accepts legacy assistant text payloads", () => {
    const parsed = parseNormalizedEvent({
      payload: {
        kind: "assistant_text",
        text: "hello from legacy runtime",
      },
    });

    expect(parsed).toEqual({
      type: "text",
      text: "hello from legacy runtime",
    });
  });

  test("accepts legacy agent message payloads", () => {
    const parsed = parseNormalizedEvent({
      payload: {
        eventType: "AGENT_MESSAGE",
        text: "legacy agent message",
      },
    });

    expect(parsed).toEqual({
      type: "text",
      text: "legacy agent message",
    });
  });

  test("accepts legacy MCP tool lifecycle payloads", () => {
    const started = parseNormalizedEvent({
      payload: {
        eventType: "MCP_TOOL_CALL_BEGIN",
        requestId: "tool-123",
        toolName: "web_search",
        input: "latest docs",
      },
    });
    const completed = parseNormalizedEvent({
      payload: {
        eventType: "MCP_TOOL_CALL_END",
        requestId: "tool-123",
        output: "done",
        failed: false,
      },
    });

    expect(started).toEqual({
      type: "tool",
      toolUseId: "tool-123",
      toolName: "web_search",
      input: "latest docs",
      state: "input-available",
    });
    expect(completed).toEqual({
      type: "tool_result",
      tool_use_id: "tool-123",
      output: "done",
    });
  });

  test("accepts legacy task completion payloads", () => {
    const parsed = parseNormalizedEvent({
      payload: {
        eventType: "TASK_COMPLETE",
      },
    });

    expect(parsed).toEqual({
      type: "done",
    });
  });

  test("accepts valid tool event", () => {
    const parsed = parseNormalizedEvent({
      payload: {
        type: "tool",
        toolName: "bash",
        input: "ls",
        state: "input-available",
      },
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.type).toBe("tool");
  });

  test("accepts valid plan_ready event", () => {
    const parsed = parseNormalizedEvent({
      payload: {
        type: "plan_ready",
        planText: "Ship it.",
        sourceSegmentId: "plan-segment-1",
      },
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.type).toBe("plan_ready");
  });

  test("accepts valid usage event", () => {
    const parsed = parseNormalizedEvent({
      payload: {
        type: "usage",
        inputTokens: 123,
        outputTokens: 45,
        cacheReadTokens: 12,
        totalCostUsd: 0.01,
      },
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.type).toBe("usage");
  });

  test("accepts valid provider conversation event", () => {
    const parsed = parseNormalizedEvent({
      payload: {
        type: "provider_session",
        providerId: "claude-code",
        nativeSessionId: "session-123",
      },
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.type).toBe("provider_session");
  });

  test("accepts stave provider conversation metadata", () => {
    const parsed = parseNormalizedEvent({
      payload: {
        type: "provider_session",
        providerId: "stave",
        nativeSessionId: "session-stave-123",
      },
    });

    expect(parsed).toEqual({
      type: "provider_session",
      providerId: "stave",
      nativeSessionId: "session-stave-123",
    });
  });

  test("accepts valid prompt suggestions event", () => {
    const parsed = parseNormalizedEvent({
      payload: {
        type: "prompt_suggestions",
        suggestions: ["Refactor that function next"],
      },
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.type).toBe("prompt_suggestions");
  });

  test("accepts valid partial tool result event", () => {
    const parsed = parseNormalizedEvent({
      payload: {
        type: "tool_result",
        tool_use_id: "tool-1",
        output: "running",
        isPartial: true,
      },
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.type).toBe("tool_result");
  });

  test("accepts valid tool_progress event", () => {
    const parsed = parseNormalizedEvent({
      payload: {
        type: "tool_progress",
        toolUseId: "tool-abc",
        toolName: "Bash",
        elapsedSeconds: 15,
      },
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.type).toBe("tool_progress");
  });

  test("rejects invalid event", () => {
    const parsed = parseNormalizedEvent({ payload: { type: "tool", state: "bad" } });
    expect(parsed).toBeNull();
  });
});
