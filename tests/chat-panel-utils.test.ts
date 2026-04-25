import { describe, expect, test } from "bun:test";
import {
  getLatestRenderableAssistantMessage,
  getReasoningTraceExpansionMode,
  getVisibleMessageParts,
  getLatestUserMessageId,
  getMessageBodyFallbackState,
  getMessageScrollFingerprint,
  getRenderableMessageParts,
  hasRenderableMessageBody,
  groupMessageParts,
  hasVisibleMessagePartContent,
  isCodeDiffSummarySystemEvent,
  parseFileChangeToolInput,
  isPendingDiffStatus,
  isSubagentProgressSystemEvent,
  shouldRenderInlineToolPart,
  shouldRenderInlineSystemEvent,
  shouldAutoOpenToolGroup,
  shouldAutoOpenToolPart,
  summarizeReplayOnlyToolParts,
  summarizeDiffLineChanges,
} from "@/components/session/chat-panel.utils";

describe("isPendingDiffStatus", () => {
  test("returns true only for pending diffs", () => {
    expect(isPendingDiffStatus("pending")).toBe(true);
    expect(isPendingDiffStatus("accepted")).toBe(false);
    expect(isPendingDiffStatus("rejected")).toBe(false);
  });
});

describe("getRenderableMessageParts", () => {
  test("falls back to content when assistant parts are empty", () => {
    expect(getRenderableMessageParts({
      content: "Non-streamed response",
      parts: [],
    })).toEqual([{ type: "text", text: "Non-streamed response" }]);
  });

  test("preserves existing parts when present", () => {
    expect(getRenderableMessageParts({
      content: "Ignored content",
      parts: [{ type: "text", text: "Structured part" }],
    })).toEqual([{ type: "text", text: "Structured part" }]);
  });
});

describe("hasRenderableMessageBody", () => {
  test("treats tool-only completed turns as renderable content", () => {
    expect(hasRenderableMessageBody({
      content: "",
      isStreaming: false,
      parts: [{ type: "tool_use", toolName: "bash", input: "ls", output: "file.txt", state: "output-available" }],
    })).toBe(true);
  });

  test("treats truly empty completed turns as non-renderable", () => {
    expect(hasRenderableMessageBody({
      content: "",
      isStreaming: false,
      parts: [],
    })).toBe(false);
  });
});

describe("getLatestRenderableAssistantMessage", () => {
  test("returns the latest completed assistant with visible content", () => {
    const latest = getLatestRenderableAssistantMessage([
      { role: "assistant", content: "", isStreaming: false, parts: [] },
      { role: "assistant", content: "final answer", isStreaming: false, parts: [] },
    ]);

    expect(latest).toEqual({
      role: "assistant",
      content: "final answer",
      isStreaming: false,
      parts: [],
    });
  });

  test("falls back to the latest streaming assistant when no renderable assistant exists yet", () => {
    const latest = getLatestRenderableAssistantMessage([
      { role: "assistant", content: "", isStreaming: false, parts: [] },
      { role: "assistant", content: "", isStreaming: true, parts: [] },
    ]);

    expect(latest).toEqual({
      role: "assistant",
      content: "",
      isStreaming: true,
      parts: [],
    });
  });

  test("ignores user messages while scanning for the latest assistant", () => {
    const latest = getLatestRenderableAssistantMessage([
      { role: "assistant", content: "branch answer", isStreaming: false, parts: [] },
      { role: "user", content: "follow-up", isStreaming: false, parts: [{ type: "text", text: "follow-up" }] },
    ]);

    expect(latest).toEqual({
      role: "assistant",
      content: "branch answer",
      isStreaming: false,
      parts: [],
    });
  });
});

describe("getVisibleMessageParts", () => {
  test("hides modifying system events when inline code diffs are present", () => {
    expect(getVisibleMessageParts([
      { type: "system_event", content: "Modifying: src/a.ts, src/b.ts" },
      { type: "code_diff", filePath: "src/a.ts", oldContent: "a", newContent: "b", status: "accepted" },
    ])).toEqual([
      { type: "code_diff", filePath: "src/a.ts", oldContent: "a", newContent: "b", status: "accepted" },
    ]);
  });

  test("hides modifying system events even when there is no inline diff", () => {
    expect(getVisibleMessageParts([
      { type: "system_event", content: "Modifying: src/a.ts" },
    ])).toEqual([]);
  });
});

describe("getLatestUserMessageId", () => {
  test("returns the newest user message id", () => {
    expect(getLatestUserMessageId([
      { id: "assistant-1", role: "assistant" },
      { id: "user-1", role: "user" },
      { id: "assistant-2", role: "assistant" },
      { id: "user-2", role: "user" },
    ])).toBe("user-2");
  });

  test("returns undefined when there is no user message", () => {
    expect(getLatestUserMessageId([
      { id: "assistant-1", role: "assistant" },
    ])).toBeUndefined();
  });
});

describe("getMessageScrollFingerprint", () => {
  test("changes when streaming text grows", () => {
    const initial = getMessageScrollFingerprint({
      id: "assistant-1",
      content: "hello",
      isStreaming: true,
      parts: [{ type: "text", text: "hello" }],
    });
    const updated = getMessageScrollFingerprint({
      id: "assistant-1",
      content: "hello world",
      isStreaming: true,
      parts: [{ type: "text", text: "hello world" }],
    });

    expect(updated).not.toBe(initial);
  });

  test("changes when tool output or state changes", () => {
    const initial = getMessageScrollFingerprint({
      id: "assistant-1",
      content: "",
      isStreaming: true,
      parts: [{ type: "tool_use", toolName: "bash", input: "ls", output: "a", state: "input-streaming" }],
    });
    const updated = getMessageScrollFingerprint({
      id: "assistant-1",
      content: "",
      isStreaming: true,
      parts: [{ type: "tool_use", toolName: "bash", input: "ls", output: "a\nb", state: "output-available" }],
    });

    expect(updated).not.toBe(initial);
  });
});

describe("summarizeDiffLineChanges", () => {
  test("counts inserted and removed lines", () => {
    expect(summarizeDiffLineChanges({
      oldContent: ["alpha", "beta", "gamma"].join("\n"),
      newContent: ["alpha", "beta 2", "gamma", "delta"].join("\n"),
    })).toEqual({
      added: 2,
      removed: 1,
    });
  });

  test("ignores unchanged prefix and suffix lines", () => {
    expect(summarizeDiffLineChanges({
      oldContent: ["same", "old", "tail"].join("\n"),
      newContent: ["same", "new", "tail"].join("\n"),
    })).toEqual({
      added: 1,
      removed: 1,
    });
  });
});

describe("parseFileChangeToolInput", () => {
  test("extracts applied, skipped, and failed file rows", () => {
    expect(parseFileChangeToolInput(JSON.stringify({
      appliedPaths: ["src/a.ts"],
      skippedPaths: ["dist/bundle.js"],
      failedPaths: [{ path: "src/c.ts", error: "permission denied" }],
    }))).toEqual([
      { filePath: "src/a.ts", status: "applied" },
      { filePath: "dist/bundle.js", status: "skipped" },
      { filePath: "src/c.ts", status: "failed", error: "permission denied" },
    ]);
  });

  test("deduplicates duplicate paths by keeping the highest-priority status", () => {
    expect(parseFileChangeToolInput(JSON.stringify({
      appliedPaths: ["src/a.ts"],
      skippedPaths: ["src/a.ts"],
      failedPaths: [{ path: "src/a.ts", error: "boom" }],
    }))).toEqual([
      { filePath: "src/a.ts", status: "failed", error: "boom" },
    ]);
  });
});

describe("groupMessageParts", () => {
  test("groups consecutive code_diff and file_context parts", () => {
    const segments = groupMessageParts([
      { type: "text", text: "Before" },
      { type: "code_diff", filePath: "src/a.ts", oldContent: "a", newContent: "b", status: "accepted" },
      { type: "code_diff", filePath: "src/b.ts", oldContent: "x", newContent: "y", status: "pending" },
      { type: "file_context", filePath: "src/c.ts", content: "export {};", language: "ts" },
      { type: "file_context", filePath: "README.md", content: "# title", language: "md" },
      { type: "text", text: "After" },
    ]);

    expect(segments.map((segment) => segment.kind)).toEqual([
      "other",
      "diffs",
      "file_contexts",
      "other",
    ]);
    expect(segments[1]).toMatchObject({
      kind: "diffs",
      startIndex: 1,
      parts: [
        { filePath: "src/a.ts" },
        { filePath: "src/b.ts" },
      ],
    });
    expect(segments[2]).toMatchObject({
      kind: "file_contexts",
      startIndex: 3,
      parts: [
        { filePath: "src/c.ts" },
        { filePath: "README.md" },
      ],
    });
  });

  test("keeps subagent and todo tool parts outside tool groups", () => {
    const segments = groupMessageParts([
      { type: "tool_use", toolName: "Read", input: "", state: "output-available", output: "ok" },
      { type: "tool_use", toolName: "agent", input: "", state: "output-available", output: "ok" },
      { type: "tool_use", toolName: "TodoWrite", input: "", state: "output-available", output: "ok" },
    ]);

    expect(segments.map((segment) => segment.kind)).toEqual([
      "tools",
      "other",
      "other",
    ]);
  });
});

describe("tool auto-open behavior", () => {
  test("returns the configured reasoning expansion mode", () => {
    expect(getReasoningTraceExpansionMode({ reasoningExpansionMode: "auto" })).toBe("auto");
    expect(getReasoningTraceExpansionMode({ reasoningExpansionMode: "manual" })).toBe("manual");
  });

  test("auto-opens individual tool cards only while streaming", () => {
    expect(shouldAutoOpenToolPart("input-streaming")).toBe(true);
    expect(shouldAutoOpenToolPart("input-available")).toBe(false);
    expect(shouldAutoOpenToolPart("output-available")).toBe(false);
    expect(shouldAutoOpenToolPart("output-error")).toBe(false);
  });

  test("auto-opens grouped tools only when at least one tool is streaming", () => {
    expect(shouldAutoOpenToolGroup(["output-error"])).toBe(false);
    expect(shouldAutoOpenToolGroup(["output-available", "output-error"])).toBe(false);
    expect(shouldAutoOpenToolGroup(["output-error", "input-streaming"])).toBe(true);
  });
});

describe("getMessageBodyFallbackState", () => {
  test("shows streaming placeholder only for actively streaming empty turns", () => {
    expect(getMessageBodyFallbackState({
      isActivelyStreaming: true,
      renderableParts: [],
    })).toBe("streaming-placeholder");
  });

  test("treats reasoning-only turns as content", () => {
    expect(getMessageBodyFallbackState({
      isActivelyStreaming: true,
      renderableParts: [{ type: "thinking", text: "step", isStreaming: true }],
    })).toBe("content");
  });

  test("treats tool-only turns as content", () => {
    expect(getMessageBodyFallbackState({
      isActivelyStreaming: true,
      renderableParts: [{ type: "tool_use", toolName: "bash", input: "ls", state: "input-streaming", output: "file.txt" }],
    })).toBe("content");
  });

  test("treats replay-only tool turns as content after completion", () => {
    expect(getMessageBodyFallbackState({
      isActivelyStreaming: false,
      renderableParts: [{ type: "tool_use", toolName: "bash", input: "ls", state: "output-available", output: "file.txt" }],
    })).toBe("content");
  });

  test("shows empty completed fallback only for truly empty completed turns", () => {
    expect(getMessageBodyFallbackState({
      isActivelyStreaming: false,
      renderableParts: [],
    })).toBe("empty-completed");
  });

  test("treats hidden system events as content so chain of thought can surface them", () => {
    expect(getMessageBodyFallbackState({
      isActivelyStreaming: false,
      renderableParts: [{ type: "system_event", content: "[error] provider failed" }],
    })).toBe("content");
  });
});

describe("system event visibility", () => {
  test("identifies codex file-change summary notices", () => {
    expect(isCodeDiffSummarySystemEvent("Modifying: src/a.ts")).toBe(true);
    expect(isCodeDiffSummarySystemEvent("  modifying: src/a.ts, src/b.ts")).toBe(true);
    expect(isCodeDiffSummarySystemEvent("Applied file change(s): src/a.ts")).toBe(true);
    expect(isCodeDiffSummarySystemEvent("Skipped inline diff for file(s): src/a.ts")).toBe(true);
  });

  test("hides inline error-like system events", () => {
    expect(shouldRenderInlineSystemEvent({ content: "[error] provider unavailable" })).toBe(false);
    expect(shouldRenderInlineSystemEvent({ content: "Approval delivery failed: timeout" })).toBe(false);
    expect(hasVisibleMessagePartContent({ type: "system_event", content: "Rollback failed." })).toBe(false);
  });

  test("keeps useful non-error notices visible inline", () => {
    expect(shouldRenderInlineSystemEvent({
      content: "Generation was stopped locally before completion.",
    })).toBe(true);
    expect(shouldRenderInlineSystemEvent({ content: "No response returned." })).toBe(true);
    expect(hasVisibleMessagePartContent({
      type: "system_event",
      content: "Response was cut off because the output limit was reached.",
    })).toBe(true);
  });

  test("treats hidden file-change summary notices as empty when no other content exists", () => {
    expect(getMessageBodyFallbackState({
      isActivelyStreaming: false,
      renderableParts: [{ type: "system_event", content: "Applied file change(s): src/a.ts" }],
    })).toBe("empty-completed");
  });

  test("hides subagent progress events from standalone inline rendering", () => {
    expect(shouldRenderInlineSystemEvent({ content: "Subagent progress: Reading CONVENTIONS.md" })).toBe(false);
    expect(shouldRenderInlineSystemEvent({ content: "Subagent progress: Compiling docs..." })).toBe(false);
    expect(hasVisibleMessagePartContent({
      type: "system_event",
      content: "Subagent progress: Finding session data directories",
    })).toBe(false);
  });
});

describe("isSubagentProgressSystemEvent", () => {
  test("identifies subagent progress content", () => {
    expect(isSubagentProgressSystemEvent("Subagent progress: Reading files")).toBe(true);
    expect(isSubagentProgressSystemEvent("  Subagent progress: leading space")).toBe(true);
  });

  test("rejects non-progress content", () => {
    expect(isSubagentProgressSystemEvent("Context compacted (auto).")).toBe(false);
    expect(isSubagentProgressSystemEvent("[Stave] General task")).toBe(false);
    expect(isSubagentProgressSystemEvent("")).toBe(false);
  });
});

describe("tool visibility", () => {
  test("keeps only user-facing tool parts inline", () => {
    expect(shouldRenderInlineToolPart({ toolName: "Read" })).toBe(false);
    expect(shouldRenderInlineToolPart({ toolName: "agent" })).toBe(true);
    expect(shouldRenderInlineToolPart({ toolName: "TodoWrite" })).toBe(true);
    expect(hasVisibleMessagePartContent({ type: "tool_use", toolName: "bash", input: "ls", state: "output-available", output: "ok" })).toBe(false);
    expect(hasVisibleMessagePartContent({ type: "tool_use", toolName: "agent", input: "{}", state: "output-available", output: "ok" })).toBe(true);
  });

  test("summarizes replay-only tool activity for compact chat rendering", () => {
    expect(summarizeReplayOnlyToolParts([
      { type: "tool_use", toolName: "Read", input: "a", state: "output-available", output: "ok" },
      { type: "tool_use", toolName: "Read", input: "b", state: "output-error", output: "boom" },
      { type: "tool_use", toolName: "Bash", input: "ls", state: "input-streaming", output: "file.txt" },
      { type: "tool_use", toolName: "agent", input: "{}", state: "output-available", output: "skip" },
    ])).toEqual({
      totalActions: 3,
      activeActions: 1,
      failedActions: 1,
      byTool: [
        { toolName: "Read", count: 2 },
        { toolName: "Bash", count: 1 },
      ],
    });
  });
});
