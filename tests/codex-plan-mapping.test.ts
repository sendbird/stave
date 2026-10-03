import { describe, expect, test } from "bun:test";
import { mapCodexTurnPlanToTodoEvent } from "../electron/providers/codex-plan-mapping";
import { extractLatestPlan } from "@/lib/missions/facts";

describe("agent plan", () => {
  test("Codex plan updates become one TodoWrite list per turn", () => {
    const event = mapCodexTurnPlanToTodoEvent({
      threadId: "t", turnId: "turn-1",
      plan: [{ step: "Read the code", status: "completed" }, { step: "Fix it", status: "inProgress" }, { step: "Verify", status: "pending" }, { step: " " }],
    });
    expect(event).toEqual({
      type: "tool",
      toolUseId: "plan:turn-1",
      toolName: "TodoWrite",
      input: JSON.stringify({ todos: [
        { content: "Read the code", status: "completed" },
        { content: "Fix it", status: "in_progress" },
        { content: "Verify", status: "pending" },
      ] }),
      state: "output-available",
    });
    expect(mapCodexTurnPlanToTodoEvent({ plan: [] })).toBeNull();
    expect(mapCodexTurnPlanToTodoEvent({})).toBeNull();
  });

  test("the run's plan is the newest lead to-do list in its turns, across user rows", () => {
    const todo = (items: Array<[string, string]>, extra: Record<string, unknown> = {}) => ({
      type: "tool_use", toolUseId: "x", toolName: "TodoWrite", state: "input-available",
      input: JSON.stringify({ todos: items.map(([content, status]) => ({ content, status })) }), ...extra,
    });
    const messages = [
      { turnId: "t1", parts: [todo([["A", "in_progress"], ["B", "pending"]])] },
      { turnId: "t2", parts: [{ type: "text", text: "Report the stage." }] },
      { turnId: "t2", parts: [todo([["A", "completed"], ["B", "in_progress"]])] },
      { turnId: "t2", parts: [todo([["sub", "pending"]], { ownerAgentId: "child" })] },
      { turnId: "other", parts: [todo([["Z", "pending"]])] },
    ];
    expect(extractLatestPlan({ messages, turnIds: new Set(["t1", "t2"]) })).toEqual({
      items: [{ content: "A", status: "completed" }, { content: "B", status: "in_progress" }],
      turnId: "t2",
    });
    expect(extractLatestPlan({ messages, turnIds: new Set(["missing"]) })).toBeNull();
  });
});
