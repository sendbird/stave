import { describe, expect, test } from "bun:test";
import {
  mergeLocalMcpTaskTurnUpdates,
  projectLocalMcpTaskTurnActivityEvent,
  type LocalMcpTaskTurnUpdate,
} from "@/lib/local-mcp/task-turn-update";

function update(
  patch: Partial<LocalMcpTaskTurnUpdate>,
): LocalMcpTaskTurnUpdate {
  return {
    workspaceId: "workspace-1",
    taskId: "task-1",
    turnId: "turn-1",
    providerId: "codex",
    model: "gpt-5.6",
    sequence: 1,
    eventType: "tool",
    done: false,
    ...patch,
  };
}

describe("local MCP task turn activity projection", () => {
  test("keeps UI-relevant tool fields bounded and drops transcript chunks", () => {
    const tool = projectLocalMcpTaskTurnActivityEvent({
      type: "tool",
      toolUseId: "tool-1",
      toolName: "stave-local:stave_lens_evaluate",
      input: JSON.stringify({
        command: "x".repeat(10_000),
        expression: "document.body.innerHTML",
      }),
      state: "input-available",
    });
    const text = projectLocalMcpTaskTurnActivityEvent({
      type: "text",
      text: "streamed transcript content",
    });

    expect(tool?.type).toBe("tool");
    if (tool?.type !== "tool") {
      throw new Error("Expected projected tool event");
    }
    expect(tool.input.length).toBeLessThan(4_200);
    expect(tool.input).toContain("command");
    expect(tool.input).not.toContain("expression");
    expect(text).toBeUndefined();
  });

  test("preserves projected events while renderer reloads are coalesced", () => {
    const advisor = projectLocalMcpTaskTurnActivityEvent({
      type: "advisor_activity",
      phase: "started",
      primaryProviderId: "codex",
      advisorProviderId: "claude-code",
      at: 1_700_000_000_000,
    });
    const tool = projectLocalMcpTaskTurnActivityEvent({
      type: "tool",
      toolUseId: "tool-1",
      toolName: "Bash",
      input: JSON.stringify({ command: "bun test" }),
      state: "input-available",
    });

    const merged = mergeLocalMcpTaskTurnUpdates(
      update({
        activityEvents: advisor ? [advisor] : [],
        eventType: "advisor_activity",
      }),
      update({
        sequence: 2,
        activityEvents: tool ? [tool] : [],
      }),
    );

    expect(merged.sequence).toBe(2);
    expect(merged.activityEvents?.map((event) => event.type)).toEqual([
      "advisor_activity",
      "tool",
    ]);
  });
});
