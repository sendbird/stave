import { describe, expect, test } from "bun:test";
import { buildAssistantTrace, joinReasoningText } from "@/components/session/message/assistant-trace-builder";
import type { ChatMessage } from "@/types/chat";

function createAssistantMessage(args: Partial<Pick<ChatMessage, "content" | "parts" | "isStreaming">>): Pick<ChatMessage, "content" | "parts" | "isStreaming"> {
  return {
    content: args.content ?? "",
    parts: args.parts ?? [],
    isStreaming: args.isStreaming,
  };
}

describe("buildAssistantTrace", () => {
  test("groups consecutive thinking into a single reasoning entry and keeps trailing text as response", () => {
    const trace = buildAssistantTrace({
      message: createAssistantMessage({
        parts: [
          { type: "thinking", text: "Inspecting files. ", isStreaming: true },
          { type: "thinking", text: "Checking providers.", isStreaming: false },
          { type: "text", text: "Patched the renderer." },
        ],
      }),
    });

    expect(trace.entries).toHaveLength(1);
    expect(trace.entries[0]?.kind).toBe("reasoning");
    expect(trace.entries[0]?.kind === "reasoning" ? joinReasoningText(trace.entries[0].parts) : "").toBe(
      "Inspecting files. Checking providers."
    );
    expect(trace.responseParts.map((part) => part.text)).toEqual(["Patched the renderer."]);
  });

  test("keeps pre-final assistant text inside chain of thought and reserves trailing text for final response", () => {
    const trace = buildAssistantTrace({
      message: createAssistantMessage({
        parts: [
          { type: "text", text: "I will inspect the repo first." },
          { type: "tool_use", toolName: "bash", input: "rg Message src", output: "src/App.tsx", state: "output-available" },
          { type: "text", text: "The refactor is complete." },
        ],
      }),
    });

    expect(trace.entries.map((entry) => entry.kind)).toEqual(["assistant_text", "tool"]);
    expect(
      trace.entries[0]?.kind === "assistant_text"
        ? trace.entries[0].parts.map((part) => part.text)
        : []
    ).toEqual(["I will inspect the repo first."]);
    expect(trace.responseParts.map((part) => part.text)).toEqual(["The refactor is complete."]);
  });

  test("classifies tools, filters replay-only system noise, and groups diffs", () => {
    const trace = buildAssistantTrace({
      message: createAssistantMessage({
        parts: [
          {
            type: "tool_use",
            toolName: "Agent",
            input: "{\"description\":\"Review IPC\",\"prompt\":\"Check schemas\"}",
            output: "Done",
            state: "output-available",
            progressMessages: ["Reading schemas"],
          },
          {
            type: "tool_use",
            toolName: "TodoWrite",
            input: "{\"todos\":[{\"content\":\"Ship UI\",\"status\":\"completed\"}]}",
            state: "output-available",
          },
          { type: "system_event", content: "Modifying: src/components/session/ChatPanel.tsx" },
          { type: "system_event", content: "Subagent progress: Reading schemas" },
          { type: "system_event", content: "Context compacted (auto)." },
          { type: "code_diff", filePath: "src/a.ts", oldContent: "", newContent: "a", status: "pending" },
          { type: "code_diff", filePath: "src/b.ts", oldContent: "", newContent: "b", status: "accepted" },
        ],
      }),
    });

    expect(trace.entries.map((entry) => entry.kind)).toEqual(["subagent", "todo", "system", "diff"]);
    expect(trace.entries[0]?.kind === "subagent" ? trace.entries[0].part.progressMessages : undefined).toEqual(["Reading schemas"]);
    expect(trace.entries[3]?.kind === "diff" ? trace.entries[3].parts.map((part) => part.filePath) : []).toEqual([
      "src/a.ts",
      "src/b.ts",
    ]);
  });

  test("surfaces interim text parts (non-noise) outside the chain of thought", () => {
    const trace = buildAssistantTrace({
      message: createAssistantMessage({
        parts: [
          { type: "text", text: "I will inspect the repo first." },
          { type: "tool_use", toolName: "bash", input: "ls", output: "ok", state: "output-available" },
          { type: "text", text: "The file structure looks clean." },
          { type: "tool_use", toolName: "read", input: "src/a.ts", output: "code", state: "output-available" },
          { type: "text", text: "Done!" },
        ],
      }),
    });

    expect(trace.interimTextParts.map((p) => p.text)).toEqual([
      "I will inspect the repo first.",
      "The file structure looks clean.",
    ]);
    expect(trace.responseParts.map((p) => p.text)).toEqual(["Done!"]);
  });

  test("uses the final provider text segment as the response for Codex-style interim messages", () => {
    const trace = buildAssistantTrace({
      message: createAssistantMessage({
        parts: [
          { type: "text", text: "Inspecting the repo.", segmentId: "commentary-1" },
          { type: "text", text: "Patched the issue.", segmentId: "final-1" },
        ],
      }),
    });

    expect(trace.interimTextParts.map((part) => part.text)).toEqual(["Inspecting the repo."]);
    expect(trace.responseParts.map((part) => part.text)).toEqual(["Patched the issue."]);
  });

  test("filters noise phrases from interim text parts", () => {
    const trace = buildAssistantTrace({
      message: createAssistantMessage({
        parts: [
          { type: "text", text: "Now I have full context about the codebase." },
          { type: "tool_use", toolName: "bash", input: "rg foo", output: "bar", state: "output-available" },
          { type: "text", text: "Let me check the runtime." },
          { type: "tool_use", toolName: "read", input: "src/a.ts", output: "code", state: "output-available" },
          { type: "text", text: "Perfect! I see the issue." },
          { type: "tool_use", toolName: "write", input: "src/a.ts", output: "ok", state: "output-available" },
          { type: "text", text: "Fixed the bug." },
        ],
      }),
    });

    // Noise phrases are excluded from interimTextParts
    expect(trace.interimTextParts).toEqual([]);
    // But they still appear inside trace entries (assistant_text)
    expect(trace.entries.filter((e) => e.kind === "assistant_text")).toHaveLength(3);
    expect(trace.responseParts.map((p) => p.text)).toEqual(["Fixed the bug."]);
  });

  test("shows a streaming placeholder when nothing renderable has arrived yet", () => {
    const trace = buildAssistantTrace({
      message: createAssistantMessage({
        isStreaming: true,
        parts: [],
      }),
    });

    expect(trace.entries).toEqual([]);
    expect(trace.responseParts).toEqual([]);
    expect(trace.showStreamingPlaceholder).toBe(true);
  });

  test("hides the transient model-request system step from Claude trace UI", () => {
    const trace = buildAssistantTrace({
      message: createAssistantMessage({
        isStreaming: true,
        parts: [{ type: "system_event", content: "Sending request to model..." }],
      }),
    });

    expect(trace.entries).toEqual([]);
    expect(trace.responseParts).toEqual([]);
    expect(trace.showStreamingPlaceholder).toBe(true);
  });
});
