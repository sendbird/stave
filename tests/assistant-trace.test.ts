import { describe, expect, test } from "bun:test";
import { getTodoProgress } from "@/components/ai-elements/todo";
import {
  deriveTodoTraceStatus,
  deriveTraceToolSummary,
  normalizeTraceToolName,
} from "@/components/session/message/assistant-trace.utils";

describe("getTodoProgress", () => {
  test("summarizes todo counts from tool input", () => {
    expect(getTodoProgress({
      input: JSON.stringify({
        todos: [
          { content: "Inspect renderer", status: "completed" },
          { content: "Patch todo trace", status: "pending" },
          { content: "Verify tests", status: "pending" },
        ],
      }),
    })).toEqual({
      todos: [
        { content: "Inspect renderer", status: "completed" },
        { content: "Patch todo trace", status: "pending" },
        { content: "Verify tests", status: "pending" },
      ],
      totalCount: 3,
      completedCount: 1,
      hasPendingTodos: true,
      hasInProgressTodos: false,
    });
  });
});

describe("deriveTodoTraceStatus", () => {
  test("marks the todo step done when tool state is output-available, even with pending todos", () => {
    expect(deriveTodoTraceStatus({
      state: "output-available",
      input: JSON.stringify({
        todos: [
          { content: "Inspect renderer", status: "completed" },
          { content: "Patch todo trace", status: "pending" },
        ],
      }),
    })).toBe("done");
  });

  test("marks the todo step done once every todo is completed", () => {
    expect(deriveTodoTraceStatus({
      state: "output-available",
      input: JSON.stringify({
        todos: [
          { content: "Inspect renderer", status: "completed" },
          { content: "Patch todo trace", status: "completed" },
        ],
      }),
    })).toBe("done");
  });

  test("keeps the todo step active while streaming with unfinished todos", () => {
    expect(deriveTodoTraceStatus({
      state: "input-streaming",
      input: JSON.stringify({
        todos: [
          { content: "Inspect renderer", status: "completed" },
          { content: "Patch todo trace", status: "in_progress" },
        ],
      }),
    })).toBe("active");
  });
});

describe("deriveTraceToolSummary", () => {
  test("supports raw Codex bash command strings", () => {
    expect(deriveTraceToolSummary({
      toolName: "bash",
      input: "rg -n \"summary chip\" src/components/session/message/assistant-trace.tsx",
    })).toEqual({
      kind: "command",
      text: "rg -n \"summary chip\" src/components/session/message/assistant-trace.tsx",
    });
  });

  test("uses a longer preview limit for bash summary chips", () => {
    expect(deriveTraceToolSummary({
      toolName: "bash",
      input: "x".repeat(240),
    })).toEqual({
      kind: "command",
      text: "x".repeat(200),
    });
  });

  test("normalizes Codex web_search aliases", () => {
    expect(normalizeTraceToolName("web_search")).toBe("websearch");
    expect(deriveTraceToolSummary({
      toolName: "web_search",
      input: "step summary chip codex",
    })).toEqual({
      kind: "web",
      text: "step summary chip codex",
    });
  });

  test("uses a longer preview limit for search and web summary chips", () => {
    expect(deriveTraceToolSummary({
      toolName: "web_search",
      input: "q".repeat(190),
    })).toEqual({
      kind: "web",
      text: "q".repeat(160),
    });
  });

  test("extracts file names from generic MCP-style JSON payloads", () => {
    expect(deriveTraceToolSummary({
      toolName: "mcp:filesystem/read_text_file",
      input: JSON.stringify({ path: "/tmp/project/src/App.tsx" }),
    })).toEqual({
      kind: "file",
      text: "App.tsx",
    });
  });
});
