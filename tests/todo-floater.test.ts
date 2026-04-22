import { describe, expect, test } from "bun:test";
import {
  findLatestTodoPart,
  resolveTodoFloaterVisibility,
} from "@/components/session/todo-floater.utils";
import type { ChatMessage } from "@/types/chat";

function makeUserMessage(id: string): ChatMessage {
  return {
    id,
    role: "user",
    model: "user",
    providerId: "user",
    content: "hello",
    parts: [],
  };
}

function makeAssistantWithTodos(id: string, todos: Array<{ content: string; status: "pending" | "in_progress" | "completed" }>): ChatMessage {
  return {
    id,
    role: "assistant",
    model: "claude-opus",
    providerId: "claude-code",
    content: "",
    parts: [
      {
        type: "tool_use",
        toolUseId: `${id}-todo`,
        toolName: "TodoWrite",
        input: JSON.stringify({ todos }),
        state: "output-available",
      },
    ],
  };
}

describe("resolveTodoFloaterVisibility", () => {
  const baseProgress = {
    todos: [
      { content: "Review overlap handling", status: "in_progress" as const },
    ],
    totalCount: 1,
    completedCount: 0,
    hasPendingTodos: false,
    hasInProgressTodos: true,
  };

  test("shows the todo floater above the chat input when work is active", () => {
    expect(resolveTodoFloaterVisibility({
      progress: baseProgress,
      todoState: "input-streaming",
      isTurnActive: true,
      lingering: false,
      planViewerVisible: false,
    })).toBe(true);
  });

  test("hides the todo floater whenever the plan viewer owns that slot", () => {
    expect(resolveTodoFloaterVisibility({
      progress: baseProgress,
      todoState: "input-streaming",
      isTurnActive: true,
      lingering: false,
      planViewerVisible: true,
    })).toBe(false);
  });
});

describe("findLatestTodoPart", () => {
  test("returns the TodoWrite tool_use part from the current turn", () => {
    const messages: ChatMessage[] = [
      makeUserMessage("user-1"),
      makeAssistantWithTodos("assistant-1", [
        { content: "Investigate bug", status: "in_progress" },
      ]),
    ];

    const part = findLatestTodoPart(messages);
    expect(part).not.toBeNull();
    expect(part?.toolName).toBe("TodoWrite");
  });

  test("does not surface todos from a previous turn once a new user prompt arrives", () => {
    // Turn 1 produced TodoWrite output, turn 2 has only a fresh user prompt and
    // no new TodoWrite yet. The floater must not resurrect turn 1's todos.
    const messages: ChatMessage[] = [
      makeUserMessage("user-1"),
      makeAssistantWithTodos("assistant-1", [
        { content: "Old pending task", status: "pending" },
        { content: "Completed task", status: "completed" },
      ]),
      makeUserMessage("user-2"),
    ];

    expect(findLatestTodoPart(messages)).toBeNull();
  });

  test("returns the newer TodoWrite when the current turn emits its own", () => {
    const messages: ChatMessage[] = [
      makeUserMessage("user-1"),
      makeAssistantWithTodos("assistant-1", [
        { content: "Old task", status: "completed" },
      ]),
      makeUserMessage("user-2"),
      makeAssistantWithTodos("assistant-2", [
        { content: "New task", status: "in_progress" },
      ]),
    ];

    const part = findLatestTodoPart(messages);
    expect(part).not.toBeNull();
    const parsed = JSON.parse(part?.input ?? "{}") as {
      todos: Array<{ content: string }>;
    };
    expect(parsed.todos[0]?.content).toBe("New task");
  });
});
