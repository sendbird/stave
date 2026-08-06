import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { replayProviderEventsToTaskState } from "@/lib/session/provider-event-replay";
import type { ChatMessage } from "@/types/chat";

function createAssistantMessage(
  args: Partial<
    Pick<
      ChatMessage,
      "content" | "parts" | "displayContent" | "displayParts" | "isStreaming"
    >
  >,
): Pick<
  ChatMessage,
  "content" | "parts" | "displayContent" | "displayParts" | "isStreaming"
> {
  return {
    content: args.content ?? "",
    parts: args.parts ?? [],
    displayContent: args.displayContent,
    displayParts: args.displayParts,
    isStreaming: args.isStreaming,
  };
}

async function loadAssistantMessageBodies() {
  const localStorageStub = {
    getItem: (_key: string) => null,
    setItem: (_key: string, _value: string) => {},
    removeItem: (_key: string) => {},
    clear: () => {},
    key: (_index: number) => null,
    length: 0,
  };

  Object.defineProperty(globalThis, "localStorage", {
    value: localStorageStub,
    configurable: true,
  });

  Object.defineProperty(globalThis, "window", {
    value: {
      api: {
        fs: {
          pickRoot: async () => ({ ok: false }),
          readFile: async () => ({ ok: false }),
          writeFile: async () => ({ ok: false }),
        },
      },
    },
    configurable: true,
  });

  const standardModule = await import("@/components/session/message/assistant-trace");
  return {
    AssistantMessageBody: standardModule.AssistantMessageBody,
    splitSystemEventContent: standardModule.splitSystemEventContent,
  };
}

describe("AssistantMessageBody", () => {
  test("renders display parts instead of raw provider prompt content", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({
        content: "Selector: body > div\nHTML:\n<div>raw</div>",
        parts: [
          {
            type: "text",
            text: "Selector: body > div\nHTML:\n<div>raw</div>",
          },
        ],
        displayParts: [
          {
            type: "text",
            text: "이게 왜이래",
          },
        ],
      }),
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: false,
    }));

    expect(html).toContain("이게 왜이래");
    expect(html).not.toContain("Comment:");
    expect(html).not.toContain("Selector:");
    expect(html).not.toContain("body &gt; div");
    expect(html).not.toContain("HTML:");
  });

  test("preserves visual comment display part order", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({
        content: "raw prompt",
        parts: [{ type: "text", text: "raw prompt" }],
        displayParts: [
          {
            type: "image_context",
            dataUrl: "data:image/png;base64,abc",
            label: "야호",
            mimeType: "image/png",
          },
        ],
      }),
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: false,
    }));

    expect(html).toContain('alt="야호"');
    expect(html).toContain(">야호</p>");
    expect(html).not.toContain("Visual comment 1");
    expect(html).not.toContain("Comment:");
    expect(html).not.toContain("raw prompt");
  });

  test("shows only the CoT trigger before the first streaming trace entry arrives", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({
        isStreaming: true,
        parts: [],
      }),
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: true,
    }));

    expect(html).not.toContain("Thinking...</p>");
    expect(html).not.toContain("No response.");
    expect(html.match(/<button/g)?.length ?? 0).toBe(1);
  });

  test("renders the reasoning step once thinking content arrives", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({
        isStreaming: true,
        parts: [{ type: "thinking", text: "Inspecting files.", isStreaming: true }],
      }),
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: true,
    }));

    expect(html).toContain("Inspecting files.");
    expect(html.match(/<button/g)?.length ?? 0).toBe(2);
  });

  test("does not repeat a one-line system event inside its accordion", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const contextWindowNotice = "Context window at 62% — compaction not required.";
    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({
        isStreaming: true,
        parts: [{ type: "system_event", content: contextWindowNotice }],
      }),
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: true,
    }));

    expect(html.match(/Context window at 62%/g)?.length ?? 0).toBe(1);
    expect(html.match(/<button/g)?.length ?? 0).toBe(1);
  });

  test("does not repeat other one-line provider notices inside their accordions", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const notices = [
      "Compacting conversation context…",
      "Approaching rate limit (72% used). Consider pacing requests.",
      "Plugin installed: image-tools",
    ];

    for (const notice of notices) {
      const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
        message: createAssistantMessage({
          isStreaming: true,
          parts: [{ type: "system_event", content: notice }],
        }),
        taskId: "task-1",
        messageId: "message-1",
        streamingEnabled: true,
      }));

      expect(html.split(notice).length - 1).toBe(1);
    }
  });

  test("keeps the heading out of a multi-line provider notice body", async () => {
    const { splitSystemEventContent } = await loadAssistantMessageBodies();
    expect(splitSystemEventContent(
      "Provider warning\nThe provider returned a recoverable warning. Expand for the detailed reason.",
    )).toEqual({
      title: "Provider warning",
      detail: "The provider returned a recoverable warning. Expand for the detailed reason.",
    });
  });

  test("does not repeat a Codex turn checkpoint inside its accordion", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const checkpointNotice = "Checkpoint captured before Codex turn.";
    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({
        isStreaming: true,
        parts: [{
          type: "system_event",
          content: checkpointNotice,
          compactBoundary: { trigger: "turn_start", gitRef: "abc123" },
        }],
      }),
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: true,
    }));

    expect(html.split(checkpointNotice).length - 1).toBe(1);
    expect(html).toContain("Workspace checkpoint");
    expect(html).toContain("Restore");
  });

  test("uses Stave-specific copy and icon without rewriting external MCP names", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({
        isStreaming: true,
        parts: [
          {
            type: "tool_use",
            toolName: "stave-local:stave_lens_evaluate",
            input: JSON.stringify({ expression: "document.title" }),
            output: "Agent trace preview",
            state: "output-available",
          },
          {
            type: "tool_use",
            toolName: "mcp__github__get_file_contents",
            input: JSON.stringify({ owner: "sendbird", repo: "stave" }),
            output: "file contents",
            state: "output-available",
          },
          {
            type: "tool_use",
            toolName: "mcp__stave-docs__search",
            input: JSON.stringify({ query: "agent messages" }),
            output: "external search results",
            state: "output-available",
          },
        ],
      }),
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: true,
    }));

    expect(html).toContain("Check page state");
    expect(html).not.toContain("stave-local:stave_lens_evaluate");
    expect(html).toContain("stave-logo.svg");
    expect(html.match(/stave-logo\.svg/g)).toHaveLength(1);
    expect(html).toContain("mcp__github__get_file_contents");
    expect(html).not.toContain("Get file contents");
    expect(html).toContain("mcp__stave-docs__search");
    expect(html).not.toContain(">Search<");
  });

  test("keeps streaming reasoning text plain for hot-path performance", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({
        isStreaming: true,
        parts: [{ type: "thinking", text: "Open https://example.com/docs.", isStreaming: true }],
      }),
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: true,
    }));

    expect(html).toContain("https://example.com/docs");
    expect(html).not.toContain("<a");
  });

  test("keeps assistant trace collapsed in manual expansion mode", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({
        isStreaming: true,
        parts: [{ type: "thinking", text: "Inspecting files.", isStreaming: true }],
      }),
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: true,
      traceExpansionMode: "manual",
    }));

    expect(html).not.toContain("Inspecting files.");
    expect(html.match(/<button/g)?.length ?? 0).toBe(1);
  });

  test("keeps markdown rendering for the pre-plan assistant message after plan splitting", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const replayed = replayProviderEventsToTaskState({
      taskId: "task-1",
      messages: [],
      events: [
        { type: "text", text: "## Review\n\n- Keep markdown\n- Preserve bullets" },
        { type: "plan_ready", planText: "1. Inspect\n2. Patch" },
        { type: "done" },
      ],
      provider: "codex",
      model: "gpt-5.4",
    });

    const priorAssistantMessage = replayed.messages[0];
    if (!priorAssistantMessage) {
      throw new Error("expected prior assistant message");
    }

    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: priorAssistantMessage,
      taskId: "task-1",
      messageId: priorAssistantMessage.id,
      streamingEnabled: true,
    }));

    expect(html).toContain("<h2");
    expect(html).toContain("<ul");
    expect(html).toContain("Keep markdown");
  });

  test("hides interim assistant messages by default", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({
        parts: [
          { type: "text", text: "Inspecting the repo.", segmentId: "commentary-1" },
          { type: "text", text: "Patched the issue.", segmentId: "final-1" },
        ],
      }),
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: true,
    }));

    expect(html).not.toContain("Inspecting the repo.");
    expect(html).toContain("Patched the issue.");
  });

  test("renders interim assistant messages when enabled", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({
        parts: [
          { type: "text", text: "Inspecting the repo.", segmentId: "commentary-1" },
          { type: "text", text: "Patched the issue.", segmentId: "final-1" },
        ],
      }),
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: true,
      showInterimMessages: true,
    }));

    expect(html).toContain("Inspecting the repo.");
    expect(html).toContain("Patched the issue.");
  });

});
